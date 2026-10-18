/// <mls fileReference="_102033_/l2/cbe/studioDraftL2.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { draftL2Targets, syncDraftL2, type DraftL2Deps } from '/_102033_/l2/cbe/studioDraftL2.js';

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
    applyAndCompile: async () => { calls.push('compile'); return true; },
    hasLocalEdit: () => false,
  };
  const result = await syncDraftL2(102047, 'team-102047', deps);
  assert.deepEqual(result, { compiled: 0, head: 'abc' });
  // head is only known after draftDiff; read and compile stay idle.
  assert.deepEqual(calls, ['diff']);
});

test('a failed target compiles the others and does not store the marker', async () => {
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
    applyAndCompile: async (_project, path, text) => {
      compiled.push(`${path}:${text}`);
      return true;
    },
    hasLocalEdit: () => false,
  };
  try {
    const result = await syncDraftL2(102047, 'team-102047', deps);
    assert.deepEqual(result, { compiled: 2, head: 'def' });
    assert.equal(marker, null);
    assert.deepEqual(compiled, ['l2/a.ts:text l2/a.ts', 'l2/new.ts:text l2/new.ts']);
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
    applyAndCompile: async () => true,
    hasLocalEdit: () => false,
  };
  const result = await syncDraftL2(7, 'user-7', deps);
  assert.deepEqual(result, { compiled: 1, head: 'fff' });
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
    applyAndCompile: async (_project, path) => {
      calls.push(`compile:${path}`);
      return true;
    },
    hasLocalEdit: (_project, path) => path === 'l2/b.ts',
  };
  try {
    const result = await syncDraftL2(102047, 'team-102047', deps);
    assert.deepEqual(result, { compiled: 2, head: 'abc' });
    assert.equal(marker, 'team-102047@abc');
    assert.deepEqual(calls, ['read:l2/a.ts', 'compile:l2/a.ts', 'read:l2/new.ts', 'compile:l2/new.ts']);
    assert.deepEqual(infos, ['[studioDraftL2] l2/b.ts: local edit kept']);
  } finally {
    console.info = previous;
  }
});
