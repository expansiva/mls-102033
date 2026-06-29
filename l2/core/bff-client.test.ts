/// <mls fileReference="_102033_/l2/core/bff-client.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { execBff } from '/_102033_/l2/core/bff-client.js';

const originalFetch = globalThis.fetch;
const globalWithWindow = globalThis as typeof globalThis & { window?: Window };
const originalWindow = globalWithWindow.window;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) {
    globalWithWindow.window = originalWindow;
  } else {
    delete globalWithWindow.window;
  }
});

test('execBff returns successful envelopes unchanged', async () => {
  globalThis.fetch = ((async () => ({
    json: async () => ({
      ok: true,
      data: {
        id: '123',
      },
      error: null,
    }),
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
      execBff: async (request) => {
        assert.equal(request.routine, 'demo.load');
        assert.deepEqual(request.params, { id: '42' });
        assert.equal(request.meta.source, 'test');
        return {
          ok: true,
          data: {
            id: 'direct',
          },
          error: null,
        };
      },
    },
  } as unknown as Window;

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
  } as unknown as Window;

  const response = await execBff<{ routine: string; source: string }>('demo.imported', {});

  assert.equal(fetchCalled, false);
  assert.equal(response.ok, true);
  assert.equal(response.data?.routine, 'demo.imported');
  assert.equal(response.data?.source, 'test');
});
