/// <mls fileReference="_102033_/l2/cbe/studioDraft.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCollabModeNotice,
  buildDraftCookie,
  defaultDraftFor,
  draftNotice,
  enterDraft,
  ensureDefaultDraftCookie,
  isVmDriver,
  readDraftCookie,
  requestModeChange,
  resolveDefaultDraft,
  sendServiceWorkerMode,
  type RequestModeChangeDeps,
} from '/_102033_/l2/cbe/studioDraft.js';

const PROJECT = 102056;

type FetchCall = { url: string; init?: RequestInit };

type Host = {
  written: string[];
  warns: unknown[][];
  fetches: FetchCall[];
  confCalls: number;
  restore: () => void;
};

function install(opts: {
  cookie?: string;
  protocol?: string;
  driver?: { driverVersion?: string } | null;
  getDefaultDriver?: (project: number) => Promise<unknown>;
  getProjectConf?: (project: number) => Promise<unknown>;
  fetch?: (url: string, init?: RequestInit) => Promise<{ type?: string; status: number }>;
}): Host {
  const written: string[] = [];
  const warns: unknown[][] = [];
  const fetches: FetchCall[] = [];
  const previous = {
    document: (globalThis as { document?: unknown }).document,
    location: (globalThis as { location?: unknown }).location,
    mls: (globalThis as { mls?: unknown }).mls,
    fetch: (globalThis as { fetch?: unknown }).fetch,
    warn: console.warn,
  };
  let cookie = opts.cookie ?? '';
  const doc = previous.document as { documentElement?: unknown } | undefined;
  (globalThis as { document: unknown }).document = {
    documentElement: doc?.documentElement,
    get cookie() { return cookie; },
    set cookie(value: string) {
      written.push(value);
      cookie = value;
    },
  };
  (globalThis as { location: unknown }).location = { protocol: opts.protocol ?? 'http:' };
  let confCalls = 0;
  (globalThis as { mls: unknown }).mls = {
    stor: {
      others: {
        getDefaultDriver: opts.getDefaultDriver ?? (async () => opts.driver),
      },
    },
    l5: {
      getProjectConf: async (project: number) => {
        confCalls += 1;
        if (opts.getProjectConf) return opts.getProjectConf(project);
        return {};
      },
    },
  };
  (globalThis as { fetch: unknown }).fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    fetches.push({ url, init });
    if (opts.fetch) return opts.fetch(url, init);
    const draft = new URL(url, 'http://local').searchParams.get('draft');
    if (url.startsWith('/desenv?') && draft) {
      cookie = `collab-draft=${draft}`;
      return { type: 'opaqueredirect', status: 0 };
    }
    if (url.startsWith('/desenv/sair')) {
      cookie = '';
      return { type: 'opaqueredirect', status: 0 };
    }
    return { type: 'basic', status: 500 };
  };
  console.warn = (...args: unknown[]) => { warns.push(args); };
  return {
    written,
    warns,
    fetches,
    get confCalls() { return confCalls; },
    restore() {
      console.warn = previous.warn;
      const g = globalThis as { document?: unknown; location?: unknown; mls?: unknown; fetch?: unknown };
      if (previous.document === undefined) delete g.document;
      else g.document = previous.document;
      if (previous.location === undefined) delete g.location;
      else g.location = previous.location;
      if (previous.mls === undefined) delete g.mls;
      else g.mls = previous.mls;
      if (previous.fetch === undefined) delete g.fetch;
      else g.fetch = previous.fetch;
    },
  };
}

test('draftNotice names the draft and the exit link only outside Studio', () => {
  assert.deepEqual(draftNotice('collab-draft=team-102047', false, '/a'), {
    slug: 'team-102047',
    href: '/desenv/sair?to=%2Fa',
  });
  assert.equal(draftNotice('collab-draft=team-102047', true, '/a'), null);
  assert.equal(draftNotice('', false, '/a'), null);
});

test('readDraftCookie returns only the collab-draft value', () => {
  assert.equal(readDraftCookie(''), undefined);
  assert.equal(readDraftCookie('other=1'), undefined);
  assert.equal(readDraftCookie('other=1; collab-draft=user-ana; x=2'), 'user-ana');
  assert.equal(readDraftCookie('collab-draft-extra=no; collab-draft='), undefined);
});

test('buildDraftCookie adds Secure only when asked', () => {
  assert.equal(buildDraftCookie('team-1', false), 'collab-draft=team-1; Path=/; SameSite=Lax');
  assert.equal(buildDraftCookie('team-1', true), 'collab-draft=team-1; Path=/; SameSite=Lax; Secure');
});

test('defaultDraftFor keeps a valid slug and falls back otherwise', () => {
  assert.equal(defaultDraftFor(PROJECT, 'user-ana_1'), 'user-ana_1');
  assert.equal(defaultDraftFor(PROJECT, 'team-' + 'a'.repeat(64)), 'team-' + 'a'.repeat(64));
  assert.equal(defaultDraftFor(PROJECT, undefined), `team-${PROJECT}`);
  assert.equal(defaultDraftFor(PROJECT, 'Team-Ana'), `team-${PROJECT}`);
  assert.equal(defaultDraftFor(PROJECT, 'team-' + 'a'.repeat(65)), `team-${PROJECT}`);
  assert.equal(defaultDraftFor(PROJECT, 'other-ana'), `team-${PROJECT}`);
});

test('isVmDriver accepts only a 1.0.0-vm driverVersion prefix', () => {
  assert.equal(isVmDriver({ driverVersion: '1.0.0-vm' }), true);
  assert.equal(isVmDriver({ driverVersion: '1.0.0-vm.2' }), true);
  assert.equal(isVmDriver({ driverVersion: '1.0.0' }), false);
  assert.equal(isVmDriver({ driverVersion: 'github' }), false);
  assert.equal(isVmDriver(null), false);
  assert.equal(isVmDriver({}), false);
});

test('without a cookie, /desenv opaqueredirect sets team-<id> and does not warn', async () => {
  const host = install({ driver: { driverVersion: '1.0.0-vm' } });
  try {
    const result = await ensureDefaultDraftCookie(102047);
    assert.deepEqual(result, { slug: 'team-102047', changed: true });
    assert.equal(host.fetches.length, 1);
    assert.equal(host.fetches[0]?.url, '/desenv?draft=team-102047&to=/');
    assert.deepEqual(host.fetches[0]?.init, { redirect: 'manual', credentials: 'same-origin' });
    assert.equal(host.warns.length, 0);
    assert.deepEqual(host.written, []);
  } finally {
    host.restore();
  }
});

test('an existing collab-draft cookie is sent to /desenv', async () => {
  const host = install({
    cookie: 'collab-draft=team-x',
    driver: { driverVersion: '1.0.0-vm' },
  });
  try {
    const result = await ensureDefaultDraftCookie(PROJECT);
    assert.deepEqual(result, { slug: 'team-x', changed: false });
    assert.equal(host.fetches.length, 1);
    assert.equal(host.fetches[0]?.url, '/desenv?draft=team-x&to=/');
    assert.equal(host.confCalls, 0);
    assert.equal(host.warns.length, 0);
    assert.deepEqual(host.written, []);
  } finally {
    host.restore();
  }
});

test('503 warns and leaves via /desenv/sair when a cookie was present', async () => {
  const host = install({
    cookie: 'collab-draft=team-x',
    driver: { driverVersion: '1.0.0-vm' },
    fetch: async () => ({ type: 'basic', status: 503 }),
  });
  try {
    const result = await ensureDefaultDraftCookie(PROJECT);
    assert.deepEqual(result, { slug: null, changed: false });
    assert.equal(host.fetches.length, 2);
    assert.equal(host.fetches[0]?.url, '/desenv?draft=team-x&to=/');
    assert.equal(host.fetches[1]?.url, '/desenv/sair');
    assert.deepEqual(host.fetches[1]?.init, { redirect: 'manual', credentials: 'same-origin' });
    assert.equal(host.warns.length, 1);
    assert.equal(host.warns[0]?.[0], '[studio] rascunho indisponível: 503');
    assert.deepEqual(host.written, []);
  } finally {
    host.restore();
  }
});

test('a throwing fetch warns and does not throw', async () => {
  const host = install({
    driver: { driverVersion: '1.0.0-vm' },
    fetch: async () => { throw new Error('network down'); },
  });
  try {
    const result = await ensureDefaultDraftCookie(PROJECT);
    assert.deepEqual(result, { slug: null, changed: false });
    assert.equal(host.fetches.length, 1);
    assert.equal(host.warns.length, 1);
    assert.equal(host.warns[0]?.[0], '[studio] rascunho indisponível: network down');
    assert.deepEqual(host.written, []);
  } finally {
    host.restore();
  }
});

test('a non-vm driver does not fetch', async () => {
  const host = install({ driver: { driverVersion: '1.0.0-github' } });
  try {
    const result = await ensureDefaultDraftCookie(PROJECT);
    assert.deepEqual(result, { slug: null, changed: false });
    assert.deepEqual(host.fetches, []);
    assert.equal(host.confCalls, 0);
    assert.equal(host.warns.length, 0);
    assert.deepEqual(host.written, []);
  } finally {
    host.restore();
  }
});

test('no path writes document.cookie', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('./studioDraft.ts', import.meta.url), 'utf8'),
  );
  assert.equal(/document\.cookie\s*=/.test(source), false);
});

function modeDeps(overrides: Partial<RequestModeChangeDeps> = {}): RequestModeChangeDeps & { calls: string[]; errors: string[] } {
  const calls: string[] = [];
  const errors: string[] = [];
  return {
    calls,
    errors,
    project: 102056,
    resolveDraft: async (project) => {
      calls.push('resolveDraft');
      return `team-${project}`;
    },
    enterDraft: async (_project, slug) => {
      calls.push('draftEnter');
      return { statusCode: 200, ok: true, slug };
    },
    sendToServiceWorker: async (message) => {
      calls.push(`setMode:${message.mode}`);
      if (message.mode === 'studio') return { mode: 'studio', project: message.project, draft: message.draft };
      return { mode: 'production' };
    },
    reportError: (message) => {
      errors.push(message);
    },
    ...overrides,
  };
}

test('studio mode calls draftEnter and then the service worker setMode', async () => {
  const deps = modeDeps();
  const result = await requestModeChange('production', 'studio', deps);
  assert.deepEqual(result, { mode: 'studio' });
  assert.deepEqual(deps.calls, ['resolveDraft', 'draftEnter', 'setMode:studio']);
  assert.deepEqual(deps.errors, []);
});

test('production mode calls only the service worker setMode', async () => {
  const deps = modeDeps({
    resolveDraft: async () => { throw new Error('resolveDraft'); },
    enterDraft: async () => { throw new Error('draftEnter'); },
  });
  const result = await requestModeChange('studio', 'production', deps);
  assert.deepEqual(result, { mode: 'production' });
  assert.deepEqual(deps.calls, ['setMode:production']);
  assert.deepEqual(deps.errors, []);
});

test('an Error reply from the service worker undoes the mode and is logged', async () => {
  const deps = modeDeps({
    sendToServiceWorker: async (message) => {
      deps.calls.push(`setMode:${message.mode}`);
      return 'Error: draft cache';
    },
  });
  const entered = await requestModeChange('production', 'studio', deps);
  assert.deepEqual(entered, { mode: 'production' });
  assert.deepEqual(deps.errors, ['Error: draft cache']);
  assert.deepEqual(deps.calls, ['resolveDraft', 'draftEnter', 'setMode:studio']);

  const left = await requestModeChange('studio', 'production', modeDeps({
    sendToServiceWorker: async () => 'Error: busy',
    reportError: (message) => { deps.errors.push(message); },
  }));
  assert.deepEqual(left, { mode: 'studio' });
  assert.deepEqual(deps.errors, ['Error: draft cache', 'Error: busy']);
});

test('a failed draftEnter does not call the service worker', async () => {
  const deps = modeDeps({
    enterDraft: async () => {
      deps.calls.push('draftEnter');
      return { statusCode: 401, ok: false };
    },
  });
  const result = await requestModeChange('production', 'studio', deps);
  assert.deepEqual(result, { mode: 'production' });
  assert.deepEqual(deps.calls, ['resolveDraft', 'draftEnter']);
  assert.deepEqual(deps.errors, ['[shell] draftEnter failed: 401']);
});

test('collab-mode gives the mode to show and ignores other messages', () => {
  assert.equal(applyCollabModeNotice('production', { type: 'collab-mode', mode: 'studio', project: 102056, draft: 'team-102056' }), 'studio');
  assert.equal(applyCollabModeNotice('studio', { type: 'collab-mode', mode: 'production' }), 'production');
  assert.equal(applyCollabModeNotice('studio', { type: 'collab-mode', mode: 'studio' }), 'studio');
  assert.equal(applyCollabModeNotice('production', { type: 'other', mode: 'studio' }), 'production');
});

test('enterDraft posts draftEnter and keeps a non-ok status', async () => {
  const bodies: unknown[] = [];
  const ok = await enterDraft(102056, 'team-102056', {
    postExec: async (body) => {
      bodies.push(body);
      return { statusCode: 200, ok: true, slug: 'user-ada', head: 'abc' };
    },
  });
  assert.deepEqual(bodies, [{ action: 'draftEnter', project: 102056, draft: 'team-102056' }]);
  assert.deepEqual(ok, { statusCode: 200, ok: true, slug: 'user-ada', head: 'abc' });

  const missing = await enterDraft(102056, 'nope', {
    postExec: async () => { throw new Error('should not post'); },
  });
  assert.deepEqual(missing, { statusCode: 400, ok: false });

  const rejected = await enterDraft(102056, 'team-102056', {
    postExec: async () => ({ statusCode: 503, ok: false }),
  });
  assert.deepEqual(rejected, { statusCode: 503, ok: false });
});

test('resolveDefaultDraft reads studio.defaultDraft and falls back to the team slug', async () => {
  assert.equal(
    await resolveDefaultDraft(102056, { getProjectConf: async () => ({ studio: { defaultDraft: 'user-ada' } }) }),
    'user-ada',
  );
  assert.equal(
    await resolveDefaultDraft(102056, { getProjectConf: async () => { throw new Error('missing'); } }),
    'team-102056',
  );
});

test('sendServiceWorkerMode posts setMode through a MessageChannel port', async () => {
  let posted: unknown;
  const result = await sendServiceWorkerMode(
    { action: 'setMode', mode: 'studio', project: 102056, draft: 'team-102056' },
    {
      controller: {
        postMessage(message, transfer) {
          posted = message;
          const port = transfer[0] as MessagePort;
          port.postMessage({ mode: 'studio', project: 102056, draft: 'team-102056' });
        },
      },
      MessageChannel,
    },
  );
  assert.deepEqual(posted, { action: 'setMode', mode: 'studio', project: 102056, draft: 'team-102056' });
  assert.deepEqual(result, { mode: 'studio', project: 102056, draft: 'team-102056' });
});

test('sendServiceWorkerMode rejects when the service worker does not answer', async () => {
  await assert.rejects(
    () => sendServiceWorkerMode(
      { action: 'setMode', mode: 'production' },
      { controller: { postMessage() { /* stays silent */ } }, MessageChannel, timeoutMs: 30 },
    ),
    /timed out/,
  );
});

test('getDefaultDriver throwing does not fetch', async () => {
  const host = install({
    getDefaultDriver: async () => { throw new Error('Driver _102056_github not found'); },
  });
  try {
    const result = await ensureDefaultDraftCookie(PROJECT);
    assert.deepEqual(result, { slug: null, changed: false });
    assert.deepEqual(host.fetches, []);
    assert.deepEqual(host.written, []);
    assert.equal(host.warns.length, 1);
    assert.match(String(host.warns[0]?.[0]), /getDefaultDriver failed/);
  } finally {
    host.restore();
  }
});
