/// <mls fileReference="_102033_/l2/cbe/studioDraftL2.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { compileDraftForWorker, draftL2Targets, draftReloadDecision, forgetDraftL2, forgetStaleDraftL2, importToL2File, publishDraftL2, reloadDraftCompiled, syncDraftL2, type DraftL2Deps, type DraftReloadStore, type DraftWorkerAdd, type PublishDraftL2Deps } from '/_102033_/l2/cbe/studioDraftL2.js';

const S1_FILES = [
  { status: 'M', path: 'l2/a.ts' },
  { status: 'A', path: 'l2/b.ts' },
  { status: 'D', path: 'l1/c.ts' },
  { status: 'R', path: 'l2/new.ts' },
  { status: 'A', path: 'l2/x.test.ts' },
  { status: 'M', path: 'l2/types.d.ts' },
];

test('draftL2Targets keeps added, modified and renamed l2 sources', () => {
  assert.deepEqual(draftL2Targets(S1_FILES), ['l2/a.ts', 'l2/b.ts', 'l2/new.ts']);
});

test('syncDraftL2 skips read and compile when the marker is slug@head', async () => {
  const calls: string[] = [];
  const deps: DraftL2Deps = {
    readMarker: () => 'team-102047@abc',
    writeMarker: () => { calls.push('write'); },
    draftDiff: async () => {
      calls.push('diff');
      return { head: 'abc', files: S1_FILES };
    },
    readDraftText: async () => { calls.push('read'); return 'text'; },
    apply: async () => { calls.push('apply'); },
    compile: async () => { calls.push('compile'); return 'cached'; },
    inDraftCache: async () => true,
    hasLocalEdit: () => false,
  };
  const result = await syncDraftL2(102047, 'team-102047', deps);
  assert.deepEqual(result, { compiled: 0, head: 'abc', forgotten: 0, mark: '' });
  // head is only known after draftDiff; read and compile stay idle.
  assert.deepEqual(calls, ['diff']);
});

test('a failed target compiles the others and does not store the marker', async () => {
  const applied: string[] = [];
  const compiled: string[] = [];
  let marker: string | null = null;
  const errors: string[] = [];
  const previous = console.error;
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
  const deps: DraftL2Deps = {
    readMarker: () => marker,
    writeMarker: (value) => { marker = value; },
    draftDiff: async () => ({ head: 'def', files: S1_FILES }),
    readDraftText: async (_project, path) => {
      if (path === 'l2/b.ts') throw new Error('boom');
      return `text ${path}`;
    },
    apply: async (_project, path, text) => {
      applied.push(`${path}:${text}`);
    },
    compile: async (_project, path) => {
      compiled.push(path);
      return 'cached';
    },
    inDraftCache: async () => true,
    hasLocalEdit: () => false,
  };
  try {
    const result = await syncDraftL2(102047, 'team-102047', deps);
    assert.deepEqual(result, { compiled: 2, head: 'def', forgotten: 0, mark: '' });
    assert.equal(marker, null);
    assert.deepEqual(applied, ['l2/a.ts:text l2/a.ts', 'l2/new.ts:text l2/new.ts']);
    assert.deepEqual(compiled, ['l2/a.ts', 'l2/new.ts']);
    assert.deepEqual(errors, ['[studioDraftL2] l2/b.ts: boom']);
  } finally {
    console.error = previous;
  }
});

test('syncDraftL2 stores slug@head when every target compiles', async () => {
  let marker: string | null = null;
  const deps: DraftL2Deps = {
    readMarker: () => marker,
    writeMarker: (value) => { marker = value; },
    draftDiff: async () => ({ head: 'fff', files: [{ status: 'M', path: 'l2/cbe/studioDraft.ts' }] }),
    readDraftText: async () => 'export {}',
    apply: async () => {},
    compile: async () => 'cached',
    inDraftCache: async () => true,
    hasLocalEdit: () => false,
  };
  const result = await syncDraftL2(7, 'user-7', deps);
  assert.deepEqual(result, { compiled: 1, head: 'fff', forgotten: 0, mark: '' });
  assert.equal(marker, 'user-7@fff');
});

test('a target with a local edit is left alone and the marker is stored', async () => {
  const calls: string[] = [];
  const infos: string[] = [];
  let marker: string | null = null;
  const previous = console.info;
  console.info = (...args: unknown[]) => { infos.push(args.map(String).join(' ')); };
  const deps: DraftL2Deps = {
    readMarker: () => marker,
    writeMarker: (value) => { marker = value; },
    draftDiff: async () => ({ head: 'abc', files: S1_FILES }),
    readDraftText: async (_project, path) => {
      calls.push(`read:${path}`);
      return `text ${path}`;
    },
    apply: async (_project, path) => {
      calls.push(`apply:${path}`);
    },
    compile: async (_project, path) => {
      calls.push(`compile:${path}`);
      return 'cached';
    },
    inDraftCache: async () => true,
    hasLocalEdit: (_project, path) => path === 'l2/b.ts',
  };
  try {
    const result = await syncDraftL2(102047, 'team-102047', deps);
    assert.deepEqual(result, { compiled: 2, head: 'abc', forgotten: 0, mark: '' });
    assert.equal(marker, 'team-102047@abc');
    assert.deepEqual(calls, [
      'read:l2/a.ts', 'apply:l2/a.ts',
      'read:l2/new.ts', 'apply:l2/new.ts',
      'compile:l2/a.ts', 'compile:l2/new.ts',
    ]);
    assert.deepEqual(infos, [
      '[studioDraftL2] forgot 0 compiled l2 entries',
      '[studioDraftL2] l2/b.ts: local edit kept',
    ]);
  } finally {
    console.info = previous;
  }
});

test('syncDraftL2 applies every target before the first compile', async () => {
  const calls: string[] = [];
  const deps: DraftL2Deps = {
    readMarker: () => null,
    writeMarker: () => {},
    draftDiff: async () => ({ head: 'abc', files: S1_FILES }),
    readDraftText: async () => 'text',
    apply: async (_project, path) => { calls.push(`apply:${path}`); },
    compile: async (_project, path) => { calls.push(`compile:${path}`); return 'cached'; },
    inDraftCache: async () => true,
    hasLocalEdit: () => false,
  };
  const result = await syncDraftL2(102047, 'team-102047', deps);
  assert.deepEqual(result, { compiled: 3, head: 'abc', forgotten: 0, mark: '' });
  assert.deepEqual(calls, [
    'apply:l2/a.ts',
    'apply:l2/b.ts',
    'apply:l2/new.ts',
    'compile:l2/a.ts',
    'compile:l2/b.ts',
    'compile:l2/new.ts',
  ]);
});

test('syncDraftL2 does not store the marker when the compile misses the draft cache', async () => {
  let marker: string | null = null;
  const deps: DraftL2Deps = {
    readMarker: () => marker,
    writeMarker: (value) => { marker = value; },
    draftDiff: async () => ({ head: 'abc', files: [{ status: 'M', path: 'l2/a.ts' }] }),
    readDraftText: async () => 'export {}',
    apply: async () => {},
    compile: async () => '/local/_102047_a.js?v=1',
    inDraftCache: async () => false,
    hasLocalEdit: () => false,
  };
  const result = await syncDraftL2(102047, 'team-102047', deps);
  assert.deepEqual(result, { compiled: 0, head: 'abc', forgotten: 0, mark: '' });
  assert.equal(marker, null);
});

test('syncDraftL2 stores the marker when the compile is in the draft cache', async () => {
  let marker: string | null = null;
  const deps: DraftL2Deps = {
    readMarker: () => marker,
    writeMarker: (value) => { marker = value; },
    draftDiff: async () => ({ head: 'fff', files: [{ status: 'M', path: 'l2/cbe/studioDraft.ts' }] }),
    readDraftText: async () => 'export {}',
    apply: async () => {},
    compile: async () => '/local/_7_studioDraft.js?v=1',
    inDraftCache: async () => true,
    hasLocalEdit: () => false,
  };
  const result = await syncDraftL2(7, 'user-7', deps);
  assert.deepEqual(result, { compiled: 1, head: 'fff', forgotten: 0, mark: '' });
  assert.equal(marker, 'user-7@fff');
});

test('syncDraftL2 counts a confirmed file and still withholds the marker when another misses the draft cache', async () => {
  let marker: string | null = null;
  const deps: DraftL2Deps = {
    readMarker: () => marker,
    writeMarker: (value) => { marker = value; },
    draftDiff: async () => ({
      head: 'abc',
      files: [
        { status: 'M', path: 'l2/a.ts' },
        { status: 'M', path: 'l2/b.ts' },
      ],
    }),
    readDraftText: async () => 'export {}',
    apply: async () => {},
    compile: async (_project, path) => `/local/${path}?v=1`,
    inDraftCache: async (_slug, url) => url.includes('l2/a.ts'),
    hasLocalEdit: () => false,
  };
  const result = await syncDraftL2(102047, 'team-102047', deps);
  assert.deepEqual(result, { compiled: 1, head: 'abc', forgotten: 0, mark: '' });
  assert.equal(marker, null);
});

test('importToL2File reads an l2 import and rejects the rest', () => {
  assert.deepEqual(importToL2File('/_102047_/l2/a/b/c.js'), { project: 102047, folder: 'a/b', shortName: 'c' });
  assert.equal(importToL2File('lit'), null);
});

test('forgetDraftL2 drops only the draft cache and both markers', async () => {
  const removed: string[] = [];
  const deleted: string[] = [];
  await forgetDraftL2('team-1', {
    session: { removeItem: (key) => { removed.push(key); } },
    caches: {
      keys: async () => ['mls-v2', 'mls-v2-dteam-1', 'mls-v2-dother'],
      delete: async (name) => {
        deleted.push(name);
        return true;
      },
    },
  });
  assert.deepEqual(deleted, ['mls-v2-dteam-1']);
  assert.deepEqual(removed, ['collabDraftL2Synced', 'collabDraftL2Reloaded']);
});

const COMPILED = '20261019123456789';
const RELEASE = '20261019090059';

test('forgetStaleDraftL2 drops only compiled l2 that left the diff', async () => {
  const dropped = `/local/_102047_inicio.js?v=${COMPILED}`;
  const absolute = `https://app.example/local/_102047_panel.js?v=${COMPILED}`;
  const entries = [
    { url: `/local/_102047_a.js?v=${COMPILED}` },
    { url: dropped },
    { url: `/local/_102047_z.js?v=${RELEASE}` },
    { url: `/local/_999_inicio.js?v=${COMPILED}` },
    { url: `/local/_102047_local.js?v=${COMPILED}` },
    { url: absolute },
  ];
  const untouched = { url: `/local/_102047_inicio.js?v=${COMPILED}` };
  const deleted: string[] = [];
  const infos: string[] = [];
  const previous = console.info;
  console.info = (...args: unknown[]) => { infos.push(args.map(String).join(' ')); };
  try {
    const count = await forgetStaleDraftL2(102047, 'user-st26', new Set(['l2/a.ts']), {
      hasLocalEdit: (_project, path) => path === 'l2/local.ts',
      caches: {
        keys: async () => ['app-duser-st26', 'app', 'app-dother'],
        open: async (name) => ({
          keys: async () => (name === 'app-duser-st26' ? entries : [untouched]),
          delete: async (request) => {
            deleted.push(request.url);
            return true;
          },
        }),
      },
    });
    assert.equal(count, 2);
    assert.deepEqual(deleted, [dropped, absolute]);
    assert.deepEqual(infos, ['[studioDraftL2] forgot 2 compiled l2 entries']);
  } finally {
    console.info = previous;
  }
});

test('syncDraftL2 forgets compiled l2 outside the diff even when the marker matches', async () => {
  const gone = `/local/_102047_gone.js?v=${COMPILED}`;
  const deleted: string[] = [];
  const deps: DraftL2Deps = {
    readMarker: () => 'team-102047@abc',
    writeMarker: () => { throw new Error('marker should stay'); },
    draftDiff: async () => ({ head: 'abc', files: [{ status: 'M', path: 'l2/a.ts' }] }),
    readDraftText: async () => { throw new Error('no read'); },
    apply: async () => { throw new Error('no apply'); },
    compile: async () => { throw new Error('no compile'); },
    inDraftCache: async () => true,
    hasLocalEdit: () => false,
    caches: {
      keys: async () => ['cache-dteam-102047'],
      open: async () => ({
        keys: async () => [
          { url: `/local/_102047_a.js?v=${COMPILED}` },
          { url: gone },
        ],
        delete: async (request) => {
          deleted.push(request.url);
          return true;
        },
      }),
    },
  };
  const result = await syncDraftL2(102047, 'team-102047', deps);
  assert.deepEqual(result, { compiled: 0, head: 'abc', forgotten: 1, mark: '' });
  assert.deepEqual(deleted, [gone]);
});

test('reload follows the compiled body, once per mark', async () => {
  const cached = new Map<string, string[]>([['l2/a.ts', ['same']]]);
  const produced = new Map<string, string>([['/local/a.js?v=1', 'same']]);
  const deps: DraftL2Deps = {
    readMarker: () => null,
    writeMarker: () => {},
    draftDiff: async () => ({ head: 'abc', files: [{ status: 'M', path: 'l2/a.ts' }] }),
    readDraftText: async () => 'export {}',
    apply: async () => {},
    compile: async () => '/local/a.js?v=1',
    inDraftCache: async () => true,
    hasLocalEdit: () => false,
    previousCompiled: async (_project, _slug, path) => cached.get(path) ?? [],
    compiledBody: async (_slug, url) => produced.get(url) ?? null,
  };
  const store = new Map<string, string>();
  const memory: DraftReloadStore = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
  };
  const reloads: string[] = [];
  const reload = () => { reloads.push('reload'); };
  const warns: string[] = [];
  const previous = console.warn;
  console.warn = (...args: unknown[]) => { warns.push(args.map(String).join(' ')); };
  try {
    const same = await syncDraftL2(102047, 'team-102047', deps);
    assert.equal(same.compiled, 0);
    assert.equal(same.mark, '');
    assert.equal(reloadDraftCompiled(same.compiled > 0, same.mark, memory, reload), false);

    cached.set('l2/a.ts', ['old']);
    produced.set('/local/a.js?v=1', 'new');
    const changed = await syncDraftL2(102047, 'team-102047', deps);
    assert.equal(changed.compiled, 1);
    assert.notEqual(changed.mark, '');
    assert.equal(reloadDraftCompiled(changed.compiled > 0, changed.mark, memory, reload), true);
    assert.deepEqual(reloads, ['reload']);

    const again = await syncDraftL2(102047, 'team-102047', deps);
    assert.equal(again.mark, changed.mark);
    assert.equal(reloadDraftCompiled(true, again.mark, memory, reload), false);
    assert.deepEqual(reloads, ['reload']);
    assert.equal(store.get('collabDraftL2Reloaded'), changed.mark);
    assert.equal(warns.some((line) => line.includes('already reloaded')), true);
  } finally {
    console.warn = previous;
  }
});

test('stale l2 dropped from the draft cache reloads once, with its own mark', () => {
  assert.deepEqual(
    draftReloadDecision('team-1', { compiled: 0, head: 'abc', forgotten: 1, mark: '' }),
    { changed: true, mark: 'team-1@abc:dropped' },
  );
  assert.deepEqual(
    draftReloadDecision('team-1', { compiled: 1, head: 'abc', forgotten: 1, mark: 'team-1@f00' }),
    { changed: true, mark: 'team-1@f00' },
  );
  assert.deepEqual(
    draftReloadDecision('team-1', { compiled: 0, head: 'abc', forgotten: 0, mark: '' }),
    { changed: false, mark: '' },
  );
  const reloads: string[] = [];
  const decision = draftReloadDecision('team-1', { compiled: 0, head: 'abc', forgotten: 2, mark: '' });
  const store = new Map<string, string>();
  const memory: DraftReloadStore = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
  };
  assert.equal(reloadDraftCompiled(decision.changed, decision.mark, memory, () => { reloads.push('reload'); }), true);
  assert.equal(reloadDraftCompiled(decision.changed, decision.mark, memory, () => { reloads.push('reload'); }), false);
  assert.equal(reloads.length, 1);
});

test('publishDraftL2 sends add with the draft slug and does not reload', async () => {
  const adds: DraftWorkerAdd[] = [];
  const reloads: string[] = [];
  const previous = (globalThis as { location?: { reload?: () => void } }).location;
  (globalThis as { location: { reload: () => void } }).location = {
    reload: () => { reloads.push('reload'); },
  };
  const deps: PublishDraftL2Deps = {
    draftDiff: async () => ({
      head: 'abc',
      files: [
        { status: 'M', path: 'l2/a.ts' },
        { status: 'A', path: 'l2/pasta/nome.ts' },
        { status: 'M', path: 'l2/local.ts' },
        { status: 'M', path: 'l2/bad.ts' },
        { status: 'D', path: 'l2/gone.ts' },
      ],
    }),
    readDraftText: async (_project, path) => `text ${path}`,
    apply: async () => {},
    compile: async (_project, path) => {
      if (path === 'l2/bad.ts') return null;
      const short = path.slice(3, -3);
      return { path: `_102047_${short}.js`, version: `v-${short}`, content: `js-${short}` };
    },
    postAdd: async (message) => { adds.push(message); },
    hasLocalEdit: (_project, path) => path === 'l2/local.ts',
  };
  try {
    const result = await publishDraftL2(102047, 'team-102047', deps);
    assert.equal(result.sent, 2);
    assert.deepEqual(reloads, []);
    assert.deepEqual(adds, [
      {
        action: 'add',
        path: '_102047_a.js',
        version: 'v-a',
        content: 'js-a',
        contentType: 'application/javascript',
        draft: 'team-102047',
      },
      {
        action: 'add',
        path: '_102047_pasta/nome.js',
        version: 'v-pasta/nome',
        content: 'js-pasta/nome',
        contentType: 'application/javascript',
        draft: 'team-102047',
      },
    ]);
    assert.equal(adds.every((message) => message.action === 'add' && message.draft === 'team-102047'), true);
  } finally {
    (globalThis as { location?: { reload?: () => void } }).location = previous;
  }
});

test('compileDraftForWorker compiles with saveCache false', async () => {
  const saveCacheFlags: boolean[] = [];
  const model = {
    storFile: { project: 7, folder: 'pasta', shortName: 'nome', extension: '.ts' },
    compilerResults: {
      modelNeedCompile: false,
      imports: [] as string[],
      cacheVersion: '',
      prodJS: '',
    },
  };
  const previous = (globalThis as { mls?: unknown }).mls;
  (globalThis as { mls: unknown }).mls = {
    editor: { getModels: () => ({ ts: model }) },
    l2: {
      typescript: {
        compileAndPostProcess: async (
          _model: typeof model,
          _runAfterCompile: boolean,
          saveCache: boolean,
        ) => {
          saveCacheFlags.push(saveCache);
          model.compilerResults.cacheVersion = '20260101120000000';
          model.compilerResults.prodJS = 'compiled';
          model.compilerResults.imports = [];
          return true;
        },
      },
    },
  };
  try {
    const compiled = await compileDraftForWorker(7, 'l2/pasta/nome.ts');
    assert.equal(saveCacheFlags.includes(true), false);
    assert.deepEqual(saveCacheFlags, [false, false]);
    assert.deepEqual(compiled, {
      path: '_7_pasta/nome.js',
      version: '20260101120000000',
      content: 'compiled',
    });
  } finally {
    (globalThis as { mls?: unknown }).mls = previous;
  }
});
