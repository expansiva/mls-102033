/// <mls fileReference="_102033_/l2/cbe/studioDraftL2.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDraft, compileDraftForWorker, draftL2Targets, forgetStaleDraftL2, importToL2File, publishDraftL2, type DraftWorkerAdd, type PublishDraftL2Deps } from '/_102033_/l2/cbe/studioDraftL2.js';

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

test('importToL2File reads an l2 import and rejects the rest', () => {
  assert.deepEqual(importToL2File('/_102047_/l2/a/b/c.js'), { project: 102047, folder: 'a/b', shortName: 'c' });
  assert.equal(importToL2File('lit'), null);
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
        { status: 'M', path: 'l2/a.ts', sha: 'sha-a' },
        { status: 'A', path: 'l2/pasta/nome.ts', sha: 'sha-nome' },
        { status: 'M', path: 'l2/local.ts', sha: 'sha-local' },
        { status: 'M', path: 'l2/bad.ts', sha: 'sha-bad' },
        { status: 'D', path: 'l2/gone.ts', sha: 'sha-gone' },
      ],
    }),
    readDraftTexts: async (_project, paths) => new Map(paths.map((path) => [path, `text ${path}`])),
    apply: async () => {},
    compile: async (_project, path) => {
      if (path === 'l2/bad.ts') return null;
      const short = path.slice(3, -3);
      return { path: `_102047_${short}.js`, version: `v-${short}`, content: `js-${short}` };
    },
    postAdd: async (message) => { adds.push(message); },
    hasLocalEdit: (_project, path) => path === 'l2/local.ts',
    cachedDraft: async () => null,
  };
  try {
    const result = await publishDraftL2(102047, 'team-102047', deps);
    assert.equal(result.sent, 2);
    assert.deepEqual(reloads, []);
    assert.deepEqual(adds, [
      {
        action: 'add',
        path: '_102047_a.js',
        version: 'sha-a',
        content: 'js-a',
        contentType: 'application/javascript',
        draft: 'team-102047',
      },
      {
        action: 'add',
        path: '_102047_pasta/nome.js',
        version: 'sha-nome',
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

test('applyDraft binds one listener and one edit fires that listener once', async () => {
  const listeners: Array<(event: { changes: Array<{ range: { startLineNumber: number; endLineNumber: number; endColumn: number } }> }) => void> = [];
  let value = '';
  const actions: string[] = [];
  const host = globalThis as typeof globalThis & {
    mls: {
      events?: { addEventListener?: (...args: unknown[]) => void; fireFileAction?: (action: string) => void };
      stor?: {
        files?: Record<string, unknown>;
        getKeyToFile?: (file: unknown) => string;
        localStor?: { setContent: () => Promise<void> };
      };
      common?: { crc: { crc32: (value: string) => number } };
      editor?: {
        editors?: Record<string, unknown>;
        models?: Record<string, unknown>;
        getModels?: () => undefined;
        getKeyModel?: () => string;
        createModelTS?: (storFile: mls.stor.IFileInfo, content: string) => Promise<mls.editor.IModelTS>;
      };
      l2?: { typescript: { compileAndPostProcess: (model: mls.editor.IModelTS) => Promise<boolean> } };
    };
    window?: typeof globalThis;
    monaco?: { editor: { setModelMarkers: () => void } };
  };
  const previous = {
    events: host.mls.events,
    stor: host.mls.stor,
    common: host.mls.common,
    editor: host.mls.editor,
    l2: host.mls.l2,
    window: host.window,
    monaco: host.monaco,
  };
  host.mls.events = {
    addEventListener: () => { },
    fireFileAction: (action: string) => { actions.push(action); },
  };
  host.mls.stor = {
    files: {},
    getKeyToFile: () => 'missing',
    localStor: { setContent: async () => { } },
  };
  host.mls.common = { crc: { crc32: () => 1 } };
  host.mls.editor = {
    editors: {},
    models: {},
    getModels: () => undefined,
    getKeyModel: () => 'missing',
    createModelTS: async (storFile) => ({
      model: {
        id: 'inicio',
        isDisposed: () => false,
        getValue: () => value,
        setValue: (next: string) => { value = next; },
        getLineCount: () => 1,
        getLineContent: () => value,
        onDidChangeContent: (listener: (event: { changes: Array<{ range: { startLineNumber: number; endLineNumber: number; endColumn: number } }> }) => void) => {
          listeners.push(listener);
          return { dispose() { } };
        },
      },
      storFile,
      codeLens: {},
    }) as unknown as mls.editor.IModelTS,
  };
  host.mls.l2 = {
    typescript: {
      compileAndPostProcess: async (model) => {
        model.compilerResults = { errors: [] } as mls.editor.IModelTS['compilerResults'];
        return true;
      },
    },
  };
  host.window = globalThis;
  host.monaco = { editor: { setModelMarkers: () => { } } };
  try {
    await applyDraft(102047, 'l2/inicio.ts', 'export const n = 1;\n');
    assert.equal(listeners.length, 1);
    value = 'export const n = 2;\n';
    listeners[0]({
      changes: [{ range: { startLineNumber: 1, endLineNumber: 2, endColumn: 8 } }],
    });
    await new Promise((resolve) => { setTimeout(resolve, 450); });
    assert.deepEqual(actions, ['editorEvents', 'statusOrErrorChanged']);
  } finally {
    host.mls.events = previous.events;
    host.mls.stor = previous.stor;
    host.mls.common = previous.common;
    host.mls.editor = previous.editor;
    host.mls.l2 = previous.l2;
    host.window = previous.window;
    host.monaco = previous.monaco;
  }
});

test('compileDraftForWorker compiles with saveCache false', async () => {
  const saveCacheFlags: boolean[] = [];
  const modelCreates: string[] = [];
  const model = {
    storFile: { project: 7, folder: 'pasta', shortName: 'nome', extension: '.ts' },
    compilerResults: {
      modelNeedCompile: false,
      imports: ['/_7_/l2/dep.js'] as string[],
      cacheVersion: '',
      prodJS: '',
    },
  };
  const previous = (globalThis as { mls?: unknown }).mls;
  (globalThis as { mls: unknown }).mls = {
    editor: {
      getModels: (_project: number, shortName: string) => (shortName === 'nome' ? { ts: model } : undefined),
    },
    stor: {
      files: {
        dep: {
          getOrCreateModel: async () => {
            modelCreates.push('import');
            return model;
          },
        },
      },
      getKeyToFile: () => 'dep',
    },
    l2: {
      typescript: {
        compileAndPostProcess: async (
          _model: typeof model,
          runAfterCompile: boolean,
          saveCache: boolean,
        ) => {
          saveCacheFlags.push(saveCache);
          if (!runAfterCompile) model.compilerResults.imports = ['/_7_/l2/dep.js'];
          model.compilerResults.cacheVersion = '20260101120000000';
          model.compilerResults.prodJS = 'compiled';
          return true;
        },
      },
    },
  };
  try {
    const compiled = await compileDraftForWorker(7, 'l2/pasta/nome.ts');
    assert.equal(saveCacheFlags.includes(true), false);
    assert.deepEqual(saveCacheFlags, [false]);
    assert.deepEqual(modelCreates, []);
    assert.deepEqual(compiled, {
      path: '_7_pasta/nome.js',
      version: '20260101120000000',
      content: 'compiled',
    });
  } finally {
    (globalThis as { mls?: unknown }).mls = previous;
  }
});

test('publishDraftL2 reads and compiles only a sha the worker does not have', async () => {
  const reads: string[][] = [];
  const compiled: string[] = [];
  const adds: DraftWorkerAdd[] = [];
  const modelCreates: string[] = [];
  const cached = new Set<string>();
  let bSha = 'sha-b';
  const previous = (globalThis as { mls?: unknown }).mls;
  (globalThis as { mls: unknown }).mls = {
    editor: { getModels: () => undefined },
    stor: {
      files: {
        dep: {
          getOrCreateModel: async () => {
            modelCreates.push('import');
            return {};
          },
        },
      },
      getKeyToFile: () => 'dep',
    },
  };
  const deps: PublishDraftL2Deps = {
    draftDiff: async () => ({
      head: 'abc',
      files: [
        { status: 'M', path: 'l2/a.ts', sha: 'sha-a' },
        { status: 'M', path: 'l2/b.ts', sha: bSha },
        { status: 'M', path: 'l2/local.ts', sha: 'sha-local' },
      ],
    }),
    readDraftTexts: async (_project, paths) => {
      reads.push([...paths]);
      return new Map(paths.map((path) => [path, `text ${path}`]));
    },
    apply: async () => {},
    compile: async (_project, path) => {
      compiled.push(path);
      const short = path.slice(3, -3);
      return { path: `_102047_${short}.js`, version: 'compiled-version', content: `js-${short}` };
    },
    postAdd: async (message) => {
      adds.push(message);
      cached.add(`${message.path}@${message.version}`);
    },
    hasLocalEdit: (_project, path) => path === 'l2/local.ts',
    cachedDraft: async (project, path, sha) => {
      const short = path.slice(3, -3);
      const key = `_${project}_${short}.js@${sha}`;
      return cached.has(key) ? `/local/${key.split('@')[0]}?v=${sha}` : null;
    },
  };
  try {
    const first = await publishDraftL2(102047, 'team-102047', deps);
    assert.equal(first.sent, 2);
    assert.deepEqual(reads, [['l2/a.ts', 'l2/b.ts']]);
    assert.deepEqual(compiled, ['l2/a.ts', 'l2/b.ts']);

    reads.length = 0;
    compiled.length = 0;
    const second = await publishDraftL2(102047, 'team-102047', deps);
    assert.equal(second.sent, 0);
    assert.deepEqual(reads, []);
    assert.deepEqual(compiled, []);

    bSha = 'sha-b-next';
    const third = await publishDraftL2(102047, 'team-102047', deps);
    assert.equal(third.sent, 1);
    assert.deepEqual(reads, [['l2/b.ts']]);
    assert.deepEqual(compiled, ['l2/b.ts']);
    assert.equal(adds.at(-1)?.version, 'sha-b-next');
    assert.equal(adds.at(-1)?.content, 'js-b');
    assert.deepEqual(modelCreates, []);
  } finally {
    (globalThis as { mls?: unknown }).mls = previous;
  }
});
