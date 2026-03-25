/// <mls fileReference="_102033_/l2/core/bff-client.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { execBff } from '/_102033_/l2/core/bff-client.js';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
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
