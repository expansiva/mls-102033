/// <mls fileReference="_102033_/l2/cbe/cbeAuth.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { pathToFileURL } from 'node:url';

type CbeAuth = typeof import('/_102033_/l2/cbe/cbeAuth.js');

const authSource = readFileSync(new URL('./cbeAuth.ts', import.meta.url), 'utf8');
const authCopies = mkdtempSync(join(tmpdir(), 'cbe-auth-'));
let loadSeq = 0;

/**
 * One evaluation per page load. The runner caches a module by path and drops
 * the query string, so each load is a copy: the callback snapshot is taken at import.
 */
async function loadAuth(): Promise<CbeAuth> {
  loadSeq += 1;
  const dest = join(authCopies, `cbeAuth-${loadSeq}.ts`);
  writeFileSync(dest, authSource);
  return import(pathToFileURL(dest).href) as Promise<CbeAuth>;
}

type MemStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function installBrowser(search: string, pathname = '/'): { storage: Map<string, string>; replaced: string[]; notices: string[]; fetchCalls: Array<{ url: string; body: string }> } {
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
      location: { search, origin: 'https://102047.collabcodes.com', pathname, hash: '' },
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
    const { completeProviderConnection } = await loadAuth();
    const connected: string[] = [];
    const errors: unknown[][] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => { errors.push(args); };
    try {
      await completeProviderConnection(connected);
    } finally {
      console.error = orig;
    }
    assert.equal(env.storage.has('keyGitHub'), false);
    assert.equal(JSON.parse(env.storage.get('studio_defs') ?? '{}').github.token, 'token-github');
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
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
    const { completeProviderConnection } = await loadAuth();
    const connected: string[] = [];
    try {
      await completeProviderConnection(connected);
    } finally {
      console.error = originalError;
    }
    assert.equal(errors.join('\n').includes('[cbeAuth] provider callback gitlab: rejected (state)'), true);
    assert.equal(errors.join('\n').includes('abc'), false);
    assert.equal(env.fetchCalls.length, 0);
    assert.equal(env.storage.has('keyGitLab'), false);
    assert.equal(JSON.parse(env.storage.get('studio_defs') ?? '{}').gitlab.token, 'kept');
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
        const { completeProviderConnection } = await loadAuth();
        Object.assign(globalThis, {
          fetch: async () => {
            if (fail === 'throw') throw new TypeError('network down code=secret-code');
            return { ok: false, status: 502, json: async () => ({ error: 'PROVIDER_EXCHANGE_FAILED' }) };
          },
        });
        const connected: string[] = [];
        await completeProviderConnection(connected);
        assert.equal(env.storage.has('keyGitHub'), false);
        assert.equal(env.storage.has('studio_defs'), false);
        assert.deepEqual(env.replaced, ['/'], 'a spent code must not be retried on reload');
        assert.equal(env.notices[0], 'The provider connection failed. Start it again from the studio.');
        assert.deepEqual(connected, []);
      }
      const log = errors.join('\n');
      assert.ok(log.includes('provider callback github: exchange failed (HTTP 502)'));
      assert.ok(log.includes('provider callback github: exchange failed (TypeError)'));
      assert.equal(log.includes('secret-code'), false);
    } finally {
      console.error = originalError;
    }
  });

  test('removes the provider key on disconnect', async () => {
    const env = installBrowser('?source=github&function=disconnect');
    env.storage.set('studio_defs', JSON.stringify({ github: { token: 'token-github' }, gitlab: { token: 'keep-me' } }));
    env.storage.set('keyGitHub', 'token-github');
    const { completeProviderConnection } = await loadAuth();
    const connected: string[] = ['github', 'gitlab'];
    await completeProviderConnection(connected);
    assert.equal(env.storage.has('keyGitHub'), false);
    assert.equal(JSON.parse(env.storage.get('studio_defs') ?? '{}').github, undefined);
    assert.equal(JSON.parse(env.storage.get('studio_defs') ?? '{}').gitlab.token, 'keep-me');
    assert.deepEqual(env.replaced, ['/']);
    assert.equal(env.fetchCalls.length, 0);
    assert.deepEqual(connected, ['github', 'gitlab']);
  });

  test('adds a provider that already has a stored key', async () => {
    const env = installBrowser('');
    env.storage.set('studio_defs', JSON.stringify({ gitlab: { token: 'token-gitlab' } }));
    const { completeProviderConnection } = await loadAuth();
    const connected: string[] = ['github'];
    await completeProviderConnection(connected);
    assert.deepEqual(connected, ['github', 'gitlab']);
    assert.equal(env.fetchCalls.length, 0);
    assert.deepEqual(env.replaced, []);
  });

  test('uses the import snapshot after the shell replaceState', async () => {
    const env = installBrowser('?source=github&code=abc&state=expected&iss=1', '/comandaRestaurante/index.html');
    env.storage.set('pluginCollabLogin', 'expected');
    const logs: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
    try {
      const { completeProviderConnection } = await loadAuth();
      assert.deepEqual(env.replaced, ['/comandaRestaurante/index.html?iss=1']);
      const location = (globalThis as { window: { location: { search: string; pathname: string } } }).window.location;
      location.search = '';
      location.pathname = '/comandaRestaurante/index.html';
      globalThis.history.replaceState(null, '', '/comandaRestaurante/index.html');
      const connected: string[] = [];
      await completeProviderConnection(connected);
      assert.equal(JSON.parse(env.storage.get('studio_defs') ?? '{}').github.token, 'token-github');
      assert.deepEqual(connected, ['github']);
      assert.deepEqual(env.replaced, ['/comandaRestaurante/index.html?iss=1', '/comandaRestaurante/index.html']);
      const log = logs.join('\n');
      assert.equal(log.includes('[cbeAuth] provider callback github: connected'), true);
      assert.equal(log.includes('abc'), false);
      assert.equal(log.includes('token-github'), false);
    } finally {
      console.info = originalInfo;
    }
  });

  test('logs nothing and calls nothing when the page has no provider callback', async () => {
    const env = installBrowser('');
    const lines: string[] = [];
    const originalError = console.error;
    const originalInfo = console.info;
    console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
    console.info = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
    try {
      const { completeProviderConnection } = await loadAuth();
      await completeProviderConnection([]);
    } finally {
      console.error = originalError;
      console.info = originalInfo;
    }
    assert.equal(env.fetchCalls.length, 0);
    assert.equal(lines.some((line) => line.includes('[cbeAuth] provider callback')), false);
    assert.deepEqual(env.replaced, []);
  });

  test('logs the reason when a captured callback is not handled', async () => {
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
    try {
      const bare = installBrowser('?source=github');
      const bareAuth = await loadAuth();
      await bareAuth.completeProviderConnection([]);
      assert.equal(bare.fetchCalls.length, 0);
      const foreign = installBrowser('?source=bitbucket&code=secret-code');
      const foreignAuth = await loadAuth();
      await foreignAuth.completeProviderConnection([]);
      assert.equal(foreign.fetchCalls.length, 0);
    } finally {
      console.error = originalError;
    }
    const log = errors.join('\n');
    assert.equal(log.includes('[cbeAuth] provider callback github: unused (no code, state or disconnect)'), true);
    assert.equal(log.includes('[cbeAuth] provider callback unused (not a git provider)'), true);
    assert.equal(log.includes('secret-code'), false);
  });
});
