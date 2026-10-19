/// <mls fileReference="_102033_/l2/cbe/studioDraftFiles.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDraftFiles,
  draftFileOps,
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
