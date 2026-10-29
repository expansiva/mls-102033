/// <mls fileReference="_102033_/l2/cbe/studioDraftFiles.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDraftFiles,
  draftContentCrc,
  draftFileOps,
  draftPublishedCommit,
  rememberDraftMain,
  sentCrcOf,
  type DraftDiffFile,
  type DraftFileIdentity,
  type DraftFilesDeps,
} from '/_102033_/l2/cbe/studioDraftFiles.js';

const DIFF_FILES: DraftDiffFile[] = [
  { status: 'M', path: 'l1/src/a.ts', sha: 'shaM' },
  { status: 'A', path: 'l2/b.ts', sha: 'shaA' },
  { status: 'D', path: 'l3/c/old.less', sha: null },
  { status: 'R', path: 'l2/new.ts', sha: 'shaR', from: 'l1/old.ts' },
  { status: 'M', path: 'l4/x.ts', sha: 'sha4' },
];

function fileKey(info: DraftFileIdentity): string {
  return `${info.project}|${info.level}|${info.folder}|${info.shortName}|${info.extension}`;
}

test('draftFileOps maps l1, l2 and l3 and drops l4', () => {
  assert.deepEqual(draftFileOps(DIFF_FILES), [
    { action: 'modify', path: 'l1/src/a.ts', level: 1, folder: 'src', shortName: 'a', extension: '.ts', sha: 'shaM' },
    { action: 'add', path: 'l2/b.ts', level: 2, folder: '', shortName: 'b', extension: '.ts', sha: 'shaA' },
    { action: 'delete', path: 'l3/c/old.less', level: 3, folder: 'c', shortName: 'old', extension: '.less', sha: null },
    { action: 'delete', path: 'l1/old.ts', level: 1, folder: '', shortName: 'old', extension: '.ts', sha: null },
    { action: 'add', path: 'l2/new.ts', level: 2, folder: '', shortName: 'new', extension: '.ts', sha: 'shaR' },
  ]);
});

test('draftFileOps splits the extension at the first dot', () => {
  assert.deepEqual(draftFileOps([
    { status: 'M', path: 'l1/a/b.defs.ts', sha: 'shaDefs' },
    { status: 'A', path: 'l2/c.test.ts', sha: 'shaTest' },
    { status: 'M', path: 'l2/d.ts', sha: 'shaD' },
  ]), [
    { action: 'modify', path: 'l1/a/b.defs.ts', level: 1, folder: 'a', shortName: 'b', extension: '.defs.ts', sha: 'shaDefs' },
    { action: 'add', path: 'l2/c.test.ts', level: 2, folder: '', shortName: 'c', extension: '.test.ts', sha: 'shaTest' },
    { action: 'modify', path: 'l2/d.ts', level: 2, folder: '', shortName: 'd', extension: '.ts', sha: 'shaD' },
  ]);
});

test('applyDraftFiles keeps a local edit and continues after one failure', async () => {
  const project = 102047;
  const stored: { [key: string]: { versionRef: string } } = {
    [fileKey({ project, level: 2, folder: '', shortName: 'changed', extension: '.ts' })]: { versionRef: 'oldChanged' },
    [fileKey({ project, level: 1, folder: '', shortName: 'keep', extension: '.ts' })]: { versionRef: 'oldKeep' },
    [fileKey({ project, level: 3, folder: 'c', shortName: 'gone', extension: '.less' })]: { versionRef: 'oldGone' },
    [fileKey({ project, level: 2, folder: '', shortName: 'was', extension: '.ts' })]: { versionRef: 'oldWas' },
  };
  const attempts: Array<DraftFileIdentity & { versionRef: string }> = [];
  const errors: string[] = [];
  const infos: string[] = [];
  const previousError = console.error;
  const previousInfo = console.info;
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
  console.info = (...args: unknown[]) => { infos.push(args.map(String).join(' ')); };
  const files: DraftDiffFile[] = [
    { status: 'M', path: 'l2/changed.ts', sha: 'shaChanged' },
    { status: 'A', path: 'l2/bad.ts', sha: 'shaBad' },
    { status: 'M', path: 'l2/fresh.ts', sha: 'shaFresh' },
    { status: 'A', path: 'l2/ok.ts', sha: 'shaOk' },
    { status: 'M', path: 'l1/keep.ts', sha: 'shaKeep' },
    { status: 'D', path: 'l3/c/gone.less', sha: null },
    { status: 'R', path: 'l2/renamed.ts', sha: 'shaRenamed', from: 'l2/was.ts' },
  ];
  const deps: DraftFilesDeps = {
    draftDiff: async (gotProject, slug) => {
      assert.equal(gotProject, project);
      assert.equal(slug, 'team-102047');
      return { head: 'abc', files };
    },
    hasLocalEdit: (_gotProject, path) => path === 'l1/keep.ts',
    addOrUpdateFile: async (info) => {
      attempts.push(info);
      if (info.shortName === 'bad') throw new Error('boom');
      return { versionRef: info.versionRef };
    },
    fileKey,
    files: () => stored,
  };
  try {
    const result = await applyDraftFiles(project, 'team-102047', deps);
    assert.deepEqual(result, { added: 3, changed: 1, removed: 2 });
    assert.equal(stored[fileKey({ project, level: 2, folder: '', shortName: 'changed', extension: '.ts' })].versionRef, 'shaChanged');
    assert.equal(stored[fileKey({ project, level: 1, folder: '', shortName: 'keep', extension: '.ts' })].versionRef, 'oldKeep');
    assert.equal(fileKey({ project, level: 3, folder: 'c', shortName: 'gone', extension: '.less' }) in stored, false);
    assert.equal(fileKey({ project, level: 2, folder: '', shortName: 'was', extension: '.ts' }) in stored, false);
    assert.deepEqual(attempts.map((info) => info.shortName), ['bad', 'fresh', 'ok', 'renamed']);
    assert.deepEqual(attempts.map((info) => info.versionRef), ['shaBad', 'shaFresh', 'shaOk', 'shaRenamed']);
    assert.equal(attempts.every((info) => !('updatedAt' in info)), true);
    assert.deepEqual(errors, ['[studioDraftFiles] l2/bad.ts: boom']);
    assert.deepEqual(infos, ['[studioDraftFiles] l1/keep.ts: local edit kept']);
  } finally {
    console.error = previousError;
    console.info = previousInfo;
  }
});

test('applyDraftFiles marks M, A and R and still deletes D', async () => {
  const project = 102047;
  const changedKey = fileKey({ project, level: 2, folder: '', shortName: 'changed', extension: '.ts' });
  const addedKey = fileKey({ project, level: 2, folder: '', shortName: 'added', extension: '.ts' });
  const nextKey = fileKey({ project, level: 2, folder: '', shortName: 'next', extension: '.ts' });
  const prevKey = fileKey({ project, level: 2, folder: '', shortName: 'prev', extension: '.ts' });
  const goneKey = fileKey({ project, level: 2, folder: '', shortName: 'gone', extension: '.ts' });
  const stored: { [key: string]: { versionRef: string; status?: string } } = {
    [changedKey]: { versionRef: 'oldChanged' },
    [prevKey]: { versionRef: 'oldPrev' },
    [goneKey]: { versionRef: 'oldGone' },
  };
  const deps: DraftFilesDeps = {
    draftDiff: async () => ({
      head: 'abc',
      files: [
        { status: 'M', path: 'l2/changed.ts', sha: 'shaM' },
        { status: 'A', path: 'l2/added.ts', sha: 'shaA' },
        { status: 'R', path: 'l2/next.ts', sha: 'shaR', from: 'l2/prev.ts' },
        { status: 'D', path: 'l2/gone.ts', sha: null },
      ],
    }),
    hasLocalEdit: () => false,
    addOrUpdateFile: async (info) => {
      const row = { versionRef: info.versionRef, status: undefined as string | undefined };
      stored[fileKey(info)] = row;
      return row;
    },
    fileKey,
    files: () => stored,
  };
  await applyDraftFiles(project, 'team-102047', deps);
  assert.equal(stored[changedKey]?.status, 'changed');
  assert.equal(stored[changedKey]?.versionRef, 'shaM');
  assert.equal(stored[addedKey]?.status, 'new');
  assert.equal(stored[nextKey]?.status, 'renamed');
  assert.equal(prevKey in stored, false);
  assert.equal(goneKey in stored, false);
});

test('applyDraftFiles stores main and a response without main does not wipe it', async () => {
  const errors: string[] = [];
  const previousError = console.error;
  const previousFetch = globalThis.fetch;
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
  rememberDraftMain('keep');
  try {
    await applyDraftFiles(1, 'team-1', {
      draftDiff: async () => ({ head: 'abc', files: [] }),
      hasLocalEdit: () => false,
      addOrUpdateFile: async () => ({ versionRef: '0' }),
      fileKey: () => 'k',
      files: () => ({}),
    });
    assert.equal(draftPublishedCommit(), 'keep');

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ status: 'files', head: 'hhh', main: 'mmm', files: [] }),
    }) as Response;
    await applyDraftFiles(7, 'team-7');
    assert.equal(draftPublishedCommit(), 'mmm');

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ status: 'files', head: 'hhh', files: [] }),
    }) as Response;
    const result = await applyDraftFiles(7, 'team-7');
    assert.deepEqual(result, { added: 0, changed: 0, removed: 0 });
    assert.equal(draftPublishedCommit(), 'mmm');
    assert.equal(errors.some((line) => line.includes('draftDiff response has no main')), true);

    rememberDraftMain('');
    assert.equal(draftPublishedCommit(), 'mmm');
    assert.equal(errors.some((line) => line.includes('draftDiff main is empty')), true);
  } finally {
    console.error = previousError;
    globalThis.fetch = previousFetch;
  }
});

test('published CRC is the history blob, including a model born later', async () => {
  const project = 102047;
  const changed = { project, level: 2, folder: '', shortName: 'changed', extension: '.ts' };
  const added = { project, level: 2, folder: '', shortName: 'added', extension: '.ts' };
  const next = { project, level: 2, folder: '', shortName: 'next', extension: '.ts' };
  const prev = { project, level: 2, folder: '', shortName: 'prev', extension: '.ts' };
  const panel = { project, level: 2, folder: '', shortName: 'panel', extension: '.less' };
  const changedKey = fileKey(changed);
  const addedKey = fileKey(added);
  const nextKey = fileKey(next);
  const prevKey = fileKey(prev);
  const panelKey = fileKey(panel);
  const publishedTs = 'published-body';
  const draftTs = 'draft-body';
  const publishedLess = 'a{}\n//Start Less Tokens\n.t{}\n//End Less Tokens';
  const draftLess = 'b{}';
  const live = { originalCRC: 'sent-crc' };
  const stored: {
    [key: string]: {
      versionRef: string;
      status?: string;
      inLocalStorage?: boolean;
      getHistoryContent?: (ref: string) => Promise<string | null>;
      getContent?: () => Promise<string>;
      getValueInfo?: () => Promise<{ content: string | null; originalCRC?: string }>;
    };
  } = {
    [changedKey]: {
      versionRef: 'old',
      getHistoryContent: async (ref) => (ref === 'main1' ? publishedTs : null),
      getContent: async () => draftTs,
    },
    [prevKey]: {
      versionRef: 'oldPrev',
      getHistoryContent: async (ref) => (ref === 'main1' ? 'old-body' : null),
    },
    [panelKey]: {
      versionRef: 'oldLess',
      getHistoryContent: async (ref) => (ref === 'main1' ? publishedLess : null),
      getContent: async () => draftLess,
    },
  };
  const host = globalThis as { mls?: { editor?: unknown; common?: unknown } };
  const previousEditor = host.mls?.editor;
  const previousCommon = host.mls?.common;
  if (!host.mls) host.mls = {};
  host.mls.common = {
    crc: {
      crc32: (value: string) => {
        let hash = 0;
        for (const ch of value) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
        return hash;
      },
    },
  };
  host.mls.editor = {
    getKeyModel: (_project: number, shortName: string, folder: string, level: number) =>
      `${level}/${folder}/${shortName}`,
    models: { '2//changed': { ts: live } },
  };
  const errors: string[] = [];
  const previousError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
  try {
    await applyDraftFiles(project, 'team-102047', {
      draftDiff: async () => ({
        head: 'abc',
        main: 'main1',
        files: [
          { status: 'M', path: 'l2/changed.ts', sha: 'shaM' },
          { status: 'A', path: 'l2/added.ts', sha: 'shaA' },
          { status: 'R', path: 'l2/next.ts', sha: 'shaR', from: 'l2/prev.ts' },
          { status: 'M', path: 'l2/panel.less', sha: 'shaLess' },
        ],
      }),
      hasLocalEdit: () => false,
      addOrUpdateFile: async (info) => {
        const row = {
          versionRef: info.versionRef,
          getContent: async () => (info.shortName === 'next' ? 'renamed-body' : ''),
        };
        stored[fileKey(info)] = row;
        return row;
      },
      fileKey,
      files: () => stored,
    });

    const publishedCrc = draftContentCrc(publishedTs, '.ts');
    assert.equal(live.originalCRC, publishedCrc);
    const born = await stored[panelKey].getValueInfo?.();
    assert.equal(born?.content, draftLess);
    assert.equal(born?.originalCRC, draftContentCrc(publishedLess, '.less'));
    assert.notEqual(born?.originalCRC, draftContentCrc(publishedLess, '.ts'));
    const haveInfo = !!born && !!born.content;
    const chosen = haveInfo ? born?.originalCRC : draftContentCrc(draftLess, '.less');
    assert.equal(chosen, draftContentCrc(publishedLess, '.less'));
    assert.equal(chosen === draftContentCrc(draftLess, '.less') ? 'nochange' : 'changed', 'changed');
    assert.equal(chosen === draftContentCrc(publishedLess, '.less') ? 'nochange' : 'changed', 'nochange');
    assert.equal(sentCrcOf(changed), draftContentCrc(draftTs, '.ts'));
    assert.equal(sentCrcOf(panel), draftContentCrc(draftLess, '.less'));
    assert.equal(sentCrcOf(next), draftContentCrc('renamed-body', '.ts'));
    assert.equal(sentCrcOf(added), undefined);
    assert.equal(stored[addedKey]?.getValueInfo, undefined);
    const renamedInfo = await stored[nextKey].getValueInfo?.();
    assert.equal(renamedInfo?.originalCRC, draftContentCrc('old-body', '.ts'));
    assert.equal(prevKey in stored, false);
    assert.deepEqual(errors, []);
  } finally {
    console.error = previousError;
    if (host.mls) {
      host.mls.editor = previousEditor;
      host.mls.common = previousCommon;
    }
  }
});

test('a rejecting getValueInfo stays resolved and logs the file', async () => {
  const project = 102047;
  const changed = { project, level: 2, folder: '', shortName: 'inicio', extension: '.ts' };
  const key = fileKey(changed);
  const stored: {
    [key: string]: {
      versionRef: string;
      getHistoryContent?: (ref: string) => Promise<string | null>;
      getContent?: () => Promise<string>;
      getValueInfo?: () => Promise<{ content: string | null; originalCRC?: string } | undefined>;
    };
  } = {
    [key]: {
      versionRef: 'old',
      getHistoryContent: async (ref) => (ref === 'main1' ? 'published-body' : null),
      getContent: async () => 'draft-body',
      getValueInfo: async () => {
        throw new Error('published crc unavailable');
      },
    },
  };
  const host = globalThis as { mls?: { editor?: unknown; common?: unknown } };
  const previousEditor = host.mls?.editor;
  const previousCommon = host.mls?.common;
  if (!host.mls) host.mls = {};
  host.mls.common = { crc: { crc32: () => 7 } };
  host.mls.editor = { getKeyModel: () => 'k', models: {} };
  const errors: string[] = [];
  const previousError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map((item) => (item instanceof Error ? item.message : String(item))).join(' '));
  };
  try {
    await applyDraftFiles(project, 'team-102047', {
      draftDiff: async () => ({
        head: 'abc',
        main: 'main1',
        files: [{ status: 'M', path: 'l2/inicio.ts', sha: 'shaM' }],
      }),
      hasLocalEdit: () => false,
      addOrUpdateFile: async (info) => ({ versionRef: info.versionRef }),
      fileKey,
      files: () => stored,
    });
    const info = await stored[key].getValueInfo?.();
    assert.equal(info, undefined);
    assert.equal(errors.some((line) => line.includes('l2/inicio.ts') && line.includes('published crc unavailable')), true);
  } finally {
    console.error = previousError;
    if (host.mls) {
      host.mls.editor = previousEditor;
      host.mls.common = previousCommon;
    }
  }
});
