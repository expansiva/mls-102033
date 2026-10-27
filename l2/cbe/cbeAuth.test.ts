/// <mls fileReference="_102033_/l2/cbe/cbeAuth.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { completeProviderConnection } from '/_102033_/l2/cbe/cbeAuth.js';

type MemStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function installBrowser(search: string): { storage: Map<string, string>; replaced: string[]; notices: string[]; fetchCalls: Array<{ url: string; body: string }> } {
  const storage = new Map<string, string>();
  const replaced: string[] = [];
  const notices: string[] = [];
  const fetchCalls: Array<{ url: string; body: string }> = [];
  const localStorage: MemStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value); },
    removeItem: (key) => { storage.delete(key); },
  };
  const notice = { textContent: '', id: '', style: {}, isConnected: false, setAttribute: () => undefined };
  Object.assign(globalThis, {
    localStorage,
    history: { replaceState: (_data: null, _title: string, url: string) => { replaced.push(url); } },
    fetch: async (url: string, init: { body: string }) => {
      fetchCalls.push({ url, body: init.body });
      const asked = JSON.parse(init.body) as { source: string };
      return { ok: true, status: 200, json: async () => ({ token: `token-${asked.source}` }) };
    },
    window: {
      location: { search, origin: 'https://102047.collabcodes.com', pathname: '/', hash: '' },
    },
    document: {
      documentElement: { lang: 'en' },
      getElementById: () => null,
      createElement: () => notice,
      body: { appendChild: (el: { textContent: string }) => { notices.push(el.textContent); } },
    },
  });
  return { storage, replaced, notices, fetchCalls };
}

describe('provider connection on boot', { concurrency: false }, () => {
  const original = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: (globalThis as { localStorage?: unknown }).localStorage,
    history: (globalThis as { history?: unknown }).history,
    fetch: globalThis.fetch,
  };

  afterEach(() => {
    Object.assign(globalThis, original);
  });

  test('stores the raw token and clears the url when the state matches', async () => {
    const env = installBrowser('?source=github&code=abc&state=expected');
    env.storage.set('pluginCollabLogin', 'expected');
    const connected: string[] = [];
    const errors: unknown[][] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => { errors.push(args); };
    try {
      await completeProviderConnection(connected);
    } finally {
      console.error = orig;
    }
    assert.equal(env.storage.get('keyGitHub'), 'token-github');
    assert.equal(env.storage.has('pluginCollabLogin'), false);
    assert.deepEqual(env.replaced, ['/']);
    assert.deepEqual(connected, ['github']);
    const sent = JSON.parse(env.fetchCalls[0].body) as { redirectUri: string; code: string; source: string };
    assert.equal(sent.source, 'github');
    assert.equal(sent.code, 'abc');
    assert.equal(sent.redirectUri, 'https://102047.collabcodes.com?source=github');
    assert.equal(JSON.stringify(errors).includes('token-github'), false);
  });

  test('does not call the exchange when the state does not match', async () => {
    const env = installBrowser('?source=gitlab&code=abc&state=other');
    env.storage.set('pluginCollabLogin', 'expected');
    env.storage.set('keyGitLab', 'kept');
    const connected: string[] = [];
    await completeProviderConnection(connected);
    assert.equal(env.fetchCalls.length, 0);
    assert.equal(env.storage.get('keyGitLab'), 'kept');
    assert.equal(env.storage.get('pluginCollabLogin'), 'expected');
    assert.deepEqual(env.replaced, ['/'], 'the code must not stay in the address bar');
    assert.equal(env.notices[0], 'The provider connection could not be confirmed. Start it again from the studio.');
    assert.deepEqual(connected, ['gitlab']);
  });

  test('a failed exchange keeps no key, warns the user, cleans the url and logs no code or message', async () => {
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
    try {
      for (const fail of ['status', 'throw'] as const) {
        const env = installBrowser('?source=github&code=secret-code&state=s1');
        env.storage.set('pluginCollabLogin', 's1');
        Object.assign(globalThis, {
          fetch: async () => {
            if (fail === 'throw') throw new TypeError('network down code=secret-code');
            return { ok: false, status: 502, json: async () => ({ error: 'PROVIDER_EXCHANGE_FAILED' }) };
          },
        });
        const connected: string[] = [];
        await completeProviderConnection(connected);
        assert.equal(env.storage.has('keyGitHub'), false);
        assert.deepEqual(env.replaced, ['/'], 'a spent code must not be retried on reload');
        assert.equal(env.notices[0], 'The provider connection failed. Start it again from the studio.');
        assert.deepEqual(connected, []);
      }
      const log = errors.join('\n');
      assert.ok(log.includes('provider token exchange failed (HTTP 502)'));
      assert.ok(log.includes('provider token exchange failed (TypeError)'));
      assert.equal(log.includes('secret-code'), false);
    } finally {
      console.error = originalError;
    }
  });

  test('removes the provider key on disconnect', async () => {
    const env = installBrowser('?source=github&function=disconnect');
    env.storage.set('keyGitHub', 'token-github');
    const connected: string[] = ['github'];
    await completeProviderConnection(connected);
    assert.equal(env.storage.has('keyGitHub'), false);
    assert.deepEqual(env.replaced, ['/']);
    assert.equal(env.fetchCalls.length, 0);
    assert.deepEqual(connected, ['github']);
  });

  test('adds a provider that already has a stored key', async () => {
    const env = installBrowser('');
    env.storage.set('keyGitLab', 'token-gitlab');
    const connected: string[] = ['github'];
    await completeProviderConnection(connected);
    assert.deepEqual(connected, ['github', 'gitlab']);
    assert.equal(env.fetchCalls.length, 0);
  });
});
