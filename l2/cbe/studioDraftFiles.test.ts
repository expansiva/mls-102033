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
  const host = globalThis as { mls?: { editor?: unknown; common?: unknown; stor?: unknown } };
  const previousEditor = host.mls?.editor;
  const previousCommon = host.mls?.common;
  const previousStor = host.mls?.stor;
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
  const draftByName: { [name: string]: string } = {
    changed: draftTs,
    next: 'renamed-body',
    panel: draftLess,
  };
  const publishedByName: { [name: string]: string } = {
    changed: publishedTs,
    prev: 'old-body',
    panel: publishedLess,
  };
  let historyReads = 0;
  const readHistory = async (ref: string, text: string): Promise<string | null> => {
    historyReads += 1;
    return ref === 'main1' ? text : null;
  };
  stored[changedKey].getHistoryContent = (ref) => readHistory(ref, publishedTs);
  stored[prevKey].getHistoryContent = (ref) => readHistory(ref, 'old-body');
  stored[panelKey].getHistoryContent = (ref) => readHistory(ref, publishedLess);
  host.mls.stor = {
    others: {
      getDefaultDriver: () => ({
        getContents: async (_project: number, fileInfos: Array<{ shortName: string }>, ref?: string) =>
          fileInfos.map((info) => ({
            fileInfo: info,
            content: ref ? (publishedByName[info.shortName] ?? null) : (draftByName[info.shortName] ?? null),
          })),
      }),
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
    assert.equal(historyReads, 0);
    assert.deepEqual(errors, []);
  } finally {
    console.error = previousError;
    if (host.mls) {
      host.mls.editor = previousEditor;
      host.mls.common = previousCommon;
      host.mls.stor = previousStor;
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
  const host = globalThis as { mls?: { editor?: unknown; common?: unknown; stor?: unknown } };
  const previousEditor = host.mls?.editor;
  const previousCommon = host.mls?.common;
  const previousStor = host.mls?.stor;
  if (!host.mls) host.mls = {};
  host.mls.common = { crc: { crc32: () => 7 } };
  host.mls.editor = { getKeyModel: () => 'k', models: {} };
  host.mls.stor = {
    others: {
      getDefaultDriver: () => ({
        getContents: async (_project: number, fileInfos: Array<{ shortName: string }>, ref?: string) =>
          fileInfos.map((info) => ({ fileInfo: info, content: ref ? 'published-body' : 'draft-body' })),
      }),
    },
  };
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
      host.mls.stor = previousStor;
    }
  }
});

test('applyDraftFiles reads draft and published content in batches of 100', async () => {
  interface Row {
    versionRef: string;
    inLocalStorage?: boolean;
    getContent?: () => Promise<string | null>;
    getHistoryContent?: (ref: string) => Promise<string | null>;
  }
  interface ContentInfo { project: number; shortName: string; folder: string; extension: string }
  const host = globalThis as { mls?: { editor?: unknown; common?: unknown; stor?: unknown } };
  const previousEditor = host.mls?.editor;
  const previousCommon = host.mls?.common;
  const previousStor = host.mls?.stor;
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
  host.mls.editor = { getKeyModel: () => 'k', models: {} };
  const calls: Array<{ ref?: string; fileInfos: ContentInfo[] }> = [];
  const bodies = new Map<string, string | null>();
  let contentReads = 0;
  let historyReads = 0;
  host.mls.stor = {
    others: {
      getDefaultDriver: () => ({
        getContents: async (_project: number, fileInfos: ContentInfo[], ref?: string) => {
          calls.push({ ref, fileInfos });
          if (!ref && fileInfos.some((info) => info.project === 53150 && info.shortName === 'n100')) {
            throw new Error('batch failed');
          }
          if (ref && fileInfos.some((info) => info.project === 53151 && info.shortName === 'n100')) {
            throw new Error('published batch failed');
          }
          if (ref) return fileInfos.map((info) => ({ fileInfo: info, content: 'pub' }));
          return fileInfos.map((info) => ({
            fileInfo: info,
            content: bodies.get(`${info.project}/${info.shortName}`) ?? null,
          }));
        },
      }),
    },
  };

  function history(): () => Promise<string> {
    return async () => {
      historyReads += 1;
      return 'pub';
    };
  }

  function rowText(text: string | null): () => Promise<string | null> {
    return async () => {
      contentReads += 1;
      return text;
    };
  }

  /** What the per-file getContent path used to store. */
  async function oldSentCrc(row: Row | undefined, extension: string): Promise<string | undefined> {
    if (!row || row.inLocalStorage === true || !row.getContent) return undefined;
    const loaded = await row.getContent.call(row);
    if (typeof loaded !== 'string') return undefined;
    return draftContentCrc(loaded, extension);
  }

  const errors: string[] = [];
  const previousError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };

  try {
    const smallProject = 53003;
    const stored: { [key: string]: Row } = {};
    const alpha = { project: smallProject, level: 2, folder: '', shortName: 'alpha', extension: '.ts' };
    const beta = { project: smallProject, level: 2, folder: '', shortName: 'beta', extension: '.ts' };
    const panel = { project: smallProject, level: 2, folder: '', shortName: 'panel', extension: '.less' };
    const defs = { project: smallProject, level: 1, folder: 'src', shortName: 'a', extension: '.defs.ts' };
    const local = { project: smallProject, level: 2, folder: '', shortName: 'local', extension: '.ts' };
    const missing = { project: smallProject, level: 2, folder: '', shortName: 'missing', extension: '.ts' };
    const plain = { project: smallProject, level: 2, folder: '', shortName: 'plain', extension: '.ts' };
    const alphaText = 'alpha-body';
    const betaText = 'beta-body';
    const panelText = 'b{}\n//Start Less Tokens\n.t{}\n//End Less Tokens';
    const defsText = 'export {}';
    const batchOnly = 'from-batch';
    bodies.set(`${smallProject}/alpha`, alphaText);
    bodies.set(`${smallProject}/beta`, betaText);
    bodies.set(`${smallProject}/panel`, panelText);
    bodies.set(`${smallProject}/a`, defsText);
    bodies.set(`${smallProject}/plain`, batchOnly);
    bodies.set(`${smallProject}/local`, 'local-body');
    bodies.set(`${smallProject}/missing`, null);
    stored[fileKey(alpha)] = { versionRef: 'o', getHistoryContent: history(), getContent: rowText(alphaText) };
    stored[fileKey(beta)] = { versionRef: 'o', getHistoryContent: history(), getContent: rowText(betaText) };
    stored[fileKey(panel)] = { versionRef: 'o', getHistoryContent: history(), getContent: rowText(panelText) };
    stored[fileKey(defs)] = { versionRef: 'o', getHistoryContent: history(), getContent: rowText(defsText) };
    stored[fileKey(local)] = { versionRef: 'o', inLocalStorage: true, getHistoryContent: history(), getContent: rowText('local-body') };
    stored[fileKey(missing)] = { versionRef: 'o', getHistoryContent: history(), getContent: rowText(null) };
    stored[fileKey(plain)] = { versionRef: 'o', getHistoryContent: history(), getContent: rowText('from-row') };
    const oldAlpha = await oldSentCrc(stored[fileKey(alpha)], '.ts');
    const oldBeta = await oldSentCrc(stored[fileKey(beta)], '.ts');
    const oldPanel = await oldSentCrc(stored[fileKey(panel)], '.less');
    const oldDefs = await oldSentCrc(stored[fileKey(defs)], '.defs.ts');
    const oldMissing = await oldSentCrc(stored[fileKey(missing)], '.ts');
    const oldLocal = await oldSentCrc(stored[fileKey(local)], '.ts');
    contentReads = 0;
    calls.length = 0;
    await applyDraftFiles(smallProject, 'team-small', {
      draftDiff: async () => ({
        head: 'abc',
        main: 'main1',
        files: [
          { status: 'M', path: 'l2/alpha.ts', sha: 's' },
          { status: 'M', path: 'l2/beta.ts', sha: 's' },
          { status: 'M', path: 'l2/panel.less', sha: 's' },
          { status: 'M', path: 'l1/src/a.defs.ts', sha: 's' },
          { status: 'M', path: 'l2/local.ts', sha: 's' },
          { status: 'M', path: 'l2/missing.ts', sha: 's' },
          { status: 'M', path: 'l2/plain.ts', sha: 's' },
          { status: 'M', path: 'l2/absent.ts', sha: 's' },
        ],
      }),
      hasLocalEdit: () => false,
      addOrUpdateFile: async (info) => ({ versionRef: info.versionRef }),
      fileKey,
      files: () => stored,
    });
    assert.equal(contentReads, 0);
    assert.equal(historyReads, 0);
    const publishedOf = (list: Array<{ ref?: string; fileInfos: ContentInfo[] }>) => list.filter((call) => call.ref === 'main1');
    const draftOf = (list: Array<{ ref?: string; fileInfos: ContentInfo[] }>) => list.filter((call) => call.ref === undefined);
    assert.equal(publishedOf(calls).length, 1);
    assert.equal(draftOf(calls).length, 1);
    assert.deepEqual(publishedOf(calls)[0].fileInfos.map((info) => info.shortName), ['alpha', 'beta', 'panel', 'a', 'local', 'missing', 'plain', 'absent']);
    assert.deepEqual(draftOf(calls)[0].fileInfos.map((info) => info.shortName), ['alpha', 'beta', 'panel', 'a', 'local', 'missing', 'plain']);
    assert.equal(draftOf(calls)[0].fileInfos.some((info) => info.folder === 'src' && info.extension === '.defs.ts' && info.shortName === 'a'), true);
    assert.equal(sentCrcOf(alpha), oldAlpha);
    assert.equal(sentCrcOf(beta), oldBeta);
    assert.equal(sentCrcOf(panel), oldPanel);
    assert.equal(sentCrcOf(defs), oldDefs);
    assert.equal(oldMissing, undefined);
    assert.equal(sentCrcOf(missing), undefined);
    assert.equal(oldLocal, undefined);
    assert.equal(sentCrcOf(local), draftContentCrc('local-body', '.ts'));
    assert.equal(sentCrcOf(plain), draftContentCrc(batchOnly, '.ts'));
    assert.notEqual(sentCrcOf(plain), draftContentCrc('from-row', '.ts'));
    assert.equal(errors.some((line) => line.includes('l2/missing.ts') && line.includes('draft text is not a string')), true);

    async function runCount(project: number, count: number): Promise<number[]> {
      const bag: { [key: string]: Row } = {};
      const files: DraftDiffFile[] = [];
      for (let i = 0; i < count; i++) {
        const ident = { project, level: 2, folder: '', shortName: `n${i}`, extension: '.ts' };
        bodies.set(`${project}/n${i}`, `body-${project}-${i}`);
        bag[fileKey(ident)] = {
          versionRef: 'o',
          getHistoryContent: history(),
          getContent: rowText(`row-${project}-${i}`),
        };
        files.push({ status: 'M', path: `l2/n${i}.ts`, sha: 's' });
      }
      const before = calls.length;
      contentReads = 0;
      historyReads = 0;
      await applyDraftFiles(project, `team-${project}`, {
        draftDiff: async () => ({ head: 'abc', main: 'main1', files }),
        hasLocalEdit: () => false,
        addOrUpdateFile: async (info) => ({ versionRef: info.versionRef }),
        fileKey,
        files: () => bag,
      });
      assert.equal(contentReads, 0);
      assert.equal(historyReads, 0);
      const seen = calls.slice(before);
      assert.equal(publishedOf(seen).length, Math.ceil(count / 100));
      assert.equal(draftOf(seen).length, Math.ceil(count / 100));
      assert.equal(sentCrcOf({ project, level: 2, folder: '', shortName: 'n0', extension: '.ts' }), draftContentCrc(`body-${project}-0`, '.ts'));
      const last = count - 1;
      assert.equal(
        sentCrcOf({ project, level: 2, folder: '', shortName: `n${last}`, extension: '.ts' }),
        draftContentCrc(`body-${project}-${last}`, '.ts'),
      );
      return {
        published: publishedOf(seen).map((batch) => batch.fileInfos.length),
        draft: draftOf(seen).map((batch) => batch.fileInfos.length),
      };
    }

    assert.deepEqual(await runCount(53078, 78), { published: [78], draft: [78] });
    assert.deepEqual(await runCount(53457, 457), {
      published: [100, 100, 100, 100, 57],
      draft: [100, 100, 100, 100, 57],
    });

    const failedProject = 53150;
    const failedCount = 150;
    const failedBag: { [key: string]: Row } = {};
    const failedFiles: DraftDiffFile[] = [];
    for (let i = 0; i < failedCount; i++) {
      const ident = { project: failedProject, level: 2, folder: '', shortName: `n${i}`, extension: '.ts' };
      bodies.set(`${failedProject}/n${i}`, `body-${failedProject}-${i}`);
      failedBag[fileKey(ident)] = {
        versionRef: 'o',
        getHistoryContent: history(),
        getContent: rowText(`row-${failedProject}-${i}`),
      };
      failedFiles.push({ status: 'M', path: `l2/n${i}.ts`, sha: 's' });
    }
    const failedBefore = errors.length;
    const callsBefore = calls.length;
    contentReads = 0;
    historyReads = 0;
    const failedResult = await applyDraftFiles(failedProject, 'team-failed', {
      draftDiff: async () => ({ head: 'abc', main: 'main1', files: failedFiles }),
      hasLocalEdit: () => false,
      addOrUpdateFile: async (info) => ({ versionRef: info.versionRef }),
      fileKey,
      files: () => failedBag,
    });
    assert.deepEqual(failedResult, { added: 0, changed: failedCount, removed: 0 });
    assert.equal(contentReads, 0);
    assert.equal(historyReads, 0);
    const failedCalls = calls.slice(callsBefore);
    assert.deepEqual(publishedOf(failedCalls).map((batch) => batch.fileInfos.length), [100, 50]);
    assert.deepEqual(draftOf(failedCalls).map((batch) => batch.fileInfos.length), [100, 50]);
    assert.equal(sentCrcOf({ project: failedProject, level: 2, folder: '', shortName: 'n0', extension: '.ts' }), draftContentCrc(`body-${failedProject}-0`, '.ts'));
    assert.equal(sentCrcOf({ project: failedProject, level: 2, folder: '', shortName: 'n99', extension: '.ts' }), draftContentCrc(`body-${failedProject}-99`, '.ts'));
    assert.equal(sentCrcOf({ project: failedProject, level: 2, folder: '', shortName: 'n100', extension: '.ts' }), undefined);
    assert.equal(sentCrcOf({ project: failedProject, level: 2, folder: '', shortName: 'n149', extension: '.ts' }), undefined);
    const failure = errors.slice(failedBefore).join('\n');
    assert.equal(failure.includes('l2/n100.ts') && failure.includes('l2/n149.ts') && failure.includes('batch failed'), true);

    const publishedFail = 53151;
    const publishedFiles: DraftDiffFile[] = [];
    const publishedBag: { [key: string]: Row } = {};
    for (let i = 0; i < 101; i++) {
      const ident = { project: publishedFail, level: 2, folder: '', shortName: `n${i}`, extension: '.ts' };
      bodies.set(`${publishedFail}/n${i}`, `body-${publishedFail}-${i}`);
      publishedBag[fileKey(ident)] = {
        versionRef: 'o',
        getHistoryContent: history(),
        getContent: rowText(`row-${publishedFail}-${i}`),
      };
      publishedFiles.push({ status: 'M', path: `l2/n${i}.ts`, sha: 's' });
    }
    const publishedBefore = errors.length;
    const publishedCallsBefore = calls.length;
    historyReads = 0;
    const publishedResult = await applyDraftFiles(publishedFail, 'team-published-failed', {
      draftDiff: async () => ({ head: 'abc', main: 'main1', files: publishedFiles }),
      hasLocalEdit: () => false,
      addOrUpdateFile: async (info) => ({ versionRef: info.versionRef }),
      fileKey,
      files: () => publishedBag,
    });
    assert.deepEqual(publishedResult, { added: 0, changed: 101, removed: 0 });
    assert.equal(historyReads, 0);
    const publishedFailCalls = calls.slice(publishedCallsBefore);
    assert.deepEqual(publishedOf(publishedFailCalls).map((batch) => batch.fileInfos.length), [100, 1]);
    assert.deepEqual(draftOf(publishedFailCalls).map((batch) => batch.fileInfos.length), [100]);
    assert.equal(sentCrcOf({ project: publishedFail, level: 2, folder: '', shortName: 'n0', extension: '.ts' }), draftContentCrc(`body-${publishedFail}-0`, '.ts'));
    assert.equal(sentCrcOf({ project: publishedFail, level: 2, folder: '', shortName: 'n100', extension: '.ts' }), undefined);
    const publishedFailure = errors.slice(publishedBefore).join('\n');
    assert.equal(publishedFailure.includes('l2/n100.ts') && publishedFailure.includes('published batch failed'), true);
  } finally {
    console.error = previousError;
    if (host.mls) {
      host.mls.editor = previousEditor;
      host.mls.common = previousCommon;
      host.mls.stor = previousStor;
    }
  }
});
