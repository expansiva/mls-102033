/// <mls fileReference="_102033_/l2/cbe/studioDraft.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDraftCookie,
  defaultDraftFor,
  ensureDefaultDraftCookie,
  isVmDriver,
  readDraftCookie,
} from '/_102033_/l2/cbe/studioDraft.js';

const PROJECT = 102056;

type Host = {
  written: string[];
  warns: unknown[][];
  confCalls: number;
  restore: () => void;
};

function install(opts: {
  cookie?: string;
  protocol?: string;
  driver?: { driverVersion?: string } | null;
  getDefaultDriver?: (project: number) => Promise<unknown>;
  getProjectConf?: (project: number) => Promise<unknown>;
}): Host {
  const written: string[] = [];
  const warns: unknown[][] = [];
  const previous = {
    document: (globalThis as { document?: unknown }).document,
    location: (globalThis as { location?: unknown }).location,
    mls: (globalThis as { mls?: unknown }).mls,
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
  console.warn = (...args: unknown[]) => { warns.push(args); };
  return {
    written,
    warns,
    get confCalls() { return confCalls; },
    restore() {
      console.warn = previous.warn;
      const g = globalThis as { document?: unknown; location?: unknown; mls?: unknown };
      if (previous.document === undefined) delete g.document;
      else g.document = previous.document;
      if (previous.location === undefined) delete g.location;
      else g.location = previous.location;
      if (previous.mls === undefined) delete g.mls;
      else g.mls = previous.mls;
    },
  };
}

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

test('no cookie and a vm driver writes team-<id>', async () => {
  const host = install({ driver: { driverVersion: '1.0.0-vm' } });
  try {
    await ensureDefaultDraftCookie(PROJECT);
    assert.deepEqual(host.written, [`collab-draft=team-${PROJECT}; Path=/; SameSite=Lax`]);
    assert.equal(host.warns.length, 0);
  } finally {
    host.restore();
  }
});

test('an existing collab-draft cookie is left untouched', async () => {
  const host = install({
    cookie: 'collab-draft=user-ana',
    driver: { driverVersion: '1.0.0-vm' },
  });
  try {
    await ensureDefaultDraftCookie(PROJECT);
    assert.deepEqual(host.written, []);
    assert.equal(host.confCalls, 0);
  } finally {
    host.restore();
  }
});

test('a valid studio.defaultDraft is the cookie slug', async () => {
  const host = install({
    driver: { driverVersion: '1.0.0-vm' },
    getProjectConf: async () => ({ studio: { defaultDraft: 'user-ana' } }),
  });
  try {
    await ensureDefaultDraftCookie(PROJECT);
    assert.deepEqual(host.written, ['collab-draft=user-ana; Path=/; SameSite=Lax']);
  } finally {
    host.restore();
  }
});

test('an invalid studio.defaultDraft falls back to team-<id>', async () => {
  const host = install({
    driver: { driverVersion: '1.0.0-vm' },
    getProjectConf: async () => ({ studio: { defaultDraft: 'main' } }),
  });
  try {
    await ensureDefaultDraftCookie(PROJECT);
    assert.deepEqual(host.written, [`collab-draft=team-${PROJECT}; Path=/; SameSite=Lax`]);
  } finally {
    host.restore();
  }
});

test('a non-vm driver does not write the cookie', async () => {
  const host = install({ driver: { driverVersion: '1.0.0-github' } });
  try {
    await ensureDefaultDraftCookie(PROJECT);
    assert.deepEqual(host.written, []);
    assert.equal(host.confCalls, 0);
    assert.equal(host.warns.length, 0);
  } finally {
    host.restore();
  }
});

test('getDefaultDriver throwing does not write the cookie', async () => {
  const host = install({
    getDefaultDriver: async () => { throw new Error('Driver _102056_github not found'); },
  });
  try {
    await ensureDefaultDraftCookie(PROJECT);
    assert.deepEqual(host.written, []);
    assert.equal(host.warns.length, 1);
    assert.match(String(host.warns[0]?.[0]), /getDefaultDriver failed/);
  } finally {
    host.restore();
  }
});

test('https adds the Secure attribute', async () => {
  const host = install({ driver: { driverVersion: '1.0.0-vm' }, protocol: 'https:' });
  try {
    await ensureDefaultDraftCookie(PROJECT);
    assert.deepEqual(host.written, [`collab-draft=team-${PROJECT}; Path=/; SameSite=Lax; Secure`]);
  } finally {
    host.restore();
  }
});

test('getProjectConf failing still writes team-<id>', async () => {
  const host = install({
    driver: { driverVersion: '1.0.0-vm' },
    getProjectConf: async () => { throw new Error('config missing'); },
  });
  try {
    await ensureDefaultDraftCookie(PROJECT);
    assert.deepEqual(host.written, [`collab-draft=team-${PROJECT}; Path=/; SameSite=Lax`]);
    assert.equal(host.warns.length, 1);
  } finally {
    host.restore();
  }
});
