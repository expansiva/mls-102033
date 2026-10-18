/// <mls fileReference="_102033_/l2/cbe/studioDraft.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDraftCookie,
  defaultDraftFor,
  draftNotice,
  ensureDefaultDraftCookie,
  isVmDriver,
  readDraftCookie,
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
