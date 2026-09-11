/// <mls fileReference="_102033_/l2/cbe/l5Save.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { saveL5File } from '/_102033_/l2/cbe/l5Save.js';

type FileStub = {
  project: number;
  level: number;
  shortName: string;
  folder: string;
  extension: string;
  inLocalStorage: boolean;
};

type Call = { name: string; args: unknown[] };

function installStor(opts: {
  file?: FileStub | null;
  setContents?: (...args: unknown[]) => Promise<unknown>;
}): { calls: Call[]; file: FileStub | undefined; restore: () => void } {
  const calls: Call[] = [];
  const file = opts.file === null
    ? undefined
    : opts.file ?? {
      project: 102099,
      level: 5,
      shortName: 'project',
      folder: '',
      extension: '.json',
      inLocalStorage: true,
    };
  const key = '102099_5_project.json';
  const files: Record<string, FileStub> = {};
  if (file) files[key] = file;

  const previous = (globalThis as { mls?: unknown }).mls;
  (globalThis as { mls: unknown }).mls = {
    stor: {
      files,
      getKeyToFile: (info: { project: number; shortName: string }) =>
        `${info.project}_5_${info.shortName}.json`,
      localStor: {
        setContent: async (...args: unknown[]) => {
          calls.push({ name: 'localStor.setContent', args });
        },
      },
      setContents: async (...args: unknown[]) => {
        calls.push({ name: 'setContents', args });
        if (opts.setContents) return opts.setContents(...args);
        return true;
      },
      cache: {
        clearProjectsCache: async (...args: unknown[]) => {
          calls.push({ name: 'cache.clearProjectsCache', args });
        },
      },
    },
  };
  return {
    calls,
    file,
    restore() {
      if (previous === undefined) delete (globalThis as { mls?: unknown }).mls;
      else (globalThis as { mls: unknown }).mls = previous;
    },
  };
}

function names(calls: Call[]): string[] {
  return calls.map((c) => c.name);
}

test('T1: saveL5File with an existing file calls setContents once with inLocalStorage false', async () => {
  const host = installStor({});
  try {
    const ok = await saveL5File(102099, 'project', '{"a":1}', 'c');
    assert.equal(ok, true);
    const setCalls = host.calls.filter((c) => c.name === 'setContents');
    assert.equal(setCalls.length, 1);
    const files = setCalls[0]?.args[0] as FileStub[];
    assert.equal(files.length, 1);
    assert.equal(files[0], host.file);
    assert.equal(files[0]?.inLocalStorage, false);
  } finally {
    host.restore();
  }
});

test('T2: localStor.setContent runs before setContents, clearProjectsCache after', async () => {
  const host = installStor({});
  try {
    await saveL5File(102099, 'project', '{"a":1}', 'c');
    assert.deepEqual(names(host.calls), [
      'localStor.setContent',
      'setContents',
      'cache.clearProjectsCache',
    ]);
    const cacheArgs = host.calls.find((c) => c.name === 'cache.clearProjectsCache')?.args;
    assert.deepEqual(cacheArgs?.[0], [102099]);
  } finally {
    host.restore();
  }
});

test('T3: missing file names project and shortName and does not call setContents', async () => {
  const host = installStor({ file: null });
  try {
    await assert.rejects(
      () => saveL5File(102099, 'project', '{}', 'c'),
      (err: unknown) =>
        err instanceof Error
        && err.message.includes('102099')
        && err.message.includes('project'),
    );
    assert.equal(host.calls.filter((c) => c.name === 'setContents').length, 0);
  } finally {
    host.restore();
  }
});

test('T4: setContents false returns false and does not invalidate the cache', async () => {
  const host = installStor({ setContents: async () => false });
  try {
    const ok = await saveL5File(102099, 'project', '{}', 'c');
    assert.equal(ok, false);
    assert.equal(host.calls.filter((c) => c.name === 'cache.clearProjectsCache').length, 0);
  } finally {
    host.restore();
  }
});

test('T5: setContents throw bubbles and is not swallowed', async () => {
  const host = installStor({
    setContents: async () => {
      throw new Error('driver: GitHub PAT missing');
    },
  });
  try {
    await assert.rejects(
      () => saveL5File(102099, 'project', '{}', 'c'),
      (err: unknown) => err instanceof Error && err.message === 'driver: GitHub PAT missing',
    );
    assert.equal(host.calls.filter((c) => c.name === 'cache.clearProjectsCache').length, 0);
  } finally {
    host.restore();
  }
});
