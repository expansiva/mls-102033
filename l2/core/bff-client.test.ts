/// <mls fileReference="_102033_/l2/core/bff-client.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { execBff, type BffDirectTransport } from '/_102033_/l2/core/bff-client.js';

const originalFetch = globalThis.fetch;
type BffTestWindow = {
  collabBffTransport?: BffDirectTransport;
  collabBffTransportModule?: string;
};
type TestGlobal = Omit<typeof globalThis, 'window'> & { window?: BffTestWindow };

const globalWithWindow = globalThis as TestGlobal;
const originalWindow = globalWithWindow.window;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) {
    globalWithWindow.window = originalWindow;
  } else {
    delete globalWithWindow.window;
  }
});

function httpFetchResponse(status: number, body: unknown) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  };
}

test('execBff returns successful envelopes unchanged', async () => {
  globalThis.fetch = ((async () => httpFetchResponse(200, {
    ok: true,
    data: {
      id: '123',
    },
    error: null,
  })) as unknown) as typeof fetch;

  const response = await execBff<{ id: string }>('demo.load', {});
  assert.equal(response.ok, true);
  assert.equal(response.data?.id, '123');
});

test('execBff normalizes network failures', async () => {
  globalThis.fetch = ((async () => {
    throw new Error('connect ECONNREFUSED');
  }) as unknown) as typeof fetch;

  const response = await execBff('demo.load', {});
  assert.equal(response.ok, false);
  assert.equal(response.error?.code, 'NETWORK_ERROR');
});

test('execBff normalizes timeout failures', async () => {
  globalThis.fetch = (((_input: URL | RequestInfo, init?: RequestInit) => new Promise((_, reject) => {
    const signal = init?.signal as AbortSignal;
    signal.addEventListener('abort', () => {
      reject(signal.reason ?? new Error('aborted'));
    });
  })) as unknown) as typeof fetch;

  const response = await execBff('demo.load', {}, { timeoutMs: 20 });
  assert.equal(response.ok, false);
  assert.equal(response.error?.code, 'TIMEOUT');
});

test('execBff uses registered Studio transport instead of fetch', async () => {
  let fetchCalled = false;
  globalThis.fetch = ((async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  }) as unknown) as typeof fetch;

  globalWithWindow.window = {
    collabBffTransport: {
     execBff: async <TData = unknown>(request: { routine: unknown; params: unknown; meta: { source: unknown; }; }) => {
        assert.equal(request.routine, 'demo.load');
        assert.deepEqual(request.params, { id: '42' });
        assert.equal(request.meta.source, 'test');
        return {
          ok: true,
          data: {
            id: 'direct',
          } as TData,
          error: null,
        };
      },
    },
  };

  const response = await execBff<{ id: string }>('demo.load', { id: '42' });

  assert.equal(fetchCalled, false);
  assert.equal(response.ok, true);
  assert.equal(response.data?.id, 'direct');
});

test('execBff imports Studio transport module when configured', async () => {
  let fetchCalled = false;
  globalThis.fetch = ((async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  }) as unknown) as typeof fetch;

  const moduleSource = `
    export async function execBff(request) {
      return {
        ok: true,
        data: {
          routine: request.routine,
          source: request.meta.source,
        },
        error: null,
      };
    }
  `;

  globalWithWindow.window = {
    collabBffTransportModule: `data:text/javascript,${encodeURIComponent(moduleSource)}`,
  };

  const response = await execBff<{ routine: string; source: string }>('demo.imported', {});

  assert.equal(fetchCalled, false);
  assert.equal(response.ok, true);
  assert.equal(response.data?.routine, 'demo.imported');
  assert.equal(response.data?.source, 'test');
});

test('execBff keeps a JSON envelope on HTTP 400 — never "Erro do servidor (400)"', async () => {
  globalThis.fetch = ((async () => httpFetchResponse(400, {
    ok: false,
    data: null,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid task status: concluida',
    },
  })) as unknown) as typeof fetch;

  const response = await execBff('todo.changeTaskStatus.cmdDecideNewTaskStatus', { status: 'concluida' });
  assert.equal(response.ok, false);
  assert.equal(response.error?.code, 'VALIDATION_ERROR');
  assert.equal(response.error?.message, 'Invalid task status: concluida');
});

test('execBff synthesizes a transport error only when the body is not an envelope', async () => {
  globalThis.fetch = ((async () => httpFetchResponse(400, '<html>bad gateway</html>')) as unknown) as typeof fetch;
  const badJson = await execBff('demo.load', {});
  assert.equal(badJson.ok, false);
  assert.equal(badJson.error?.code, 'HTTP_400');
  assert.equal(badJson.error?.message, 'Erro do servidor (400).');

  globalThis.fetch = ((async () => httpFetchResponse(404, 'not found')) as unknown) as typeof fetch;
  const notFound = await execBff('demo.missing', {});
  assert.equal(notFound.ok, false);
  assert.equal(notFound.error?.code, 'HTTP_404');
  assert.match(notFound.error?.message || '', /404/);
});
