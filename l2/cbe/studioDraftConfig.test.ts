/// <mls fileReference="_102033_/l2/cbe/studioDraftConfig.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { readDraftModules } from '/_102033_/l2/cbe/studioDraftConfig.js';

const PROJECT = 102047;

type ConfigFile = {
  project: number;
  status: 'nochange' | 'deleted';
  inLocalStorage: boolean;
  getValueInfo?: () => Promise<{ content: string | null }>;
  getContent: () => Promise<string | null>;
};

function configKey(project: number): string {
  return `${project}|5|config||.json`;
}

function install(file: ConfigFile | undefined): { errors: unknown[][]; restore: () => void } {
  const host = globalThis as { mls?: { stor?: unknown } };
  const previous = host.mls;
  const errors: unknown[][] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  const files: Record<string, ConfigFile> = {};
  if (file) files[configKey(file.project)] = file;
  host.mls = {
    ...(previous ?? {}),
    stor: {
      getKeyToFiles: (project: number, level: number, shortName: string, folder: string, extension: string) =>
        `${project}|${level}|${shortName}|${folder}|${extension}`,
      files,
    },
  };
  return {
    errors,
    restore() {
      console.error = origError;
      host.mls = previous;
    },
  };
}

const draftText = JSON.stringify({
  projects: {
    [String(PROJECT)]: {
      modules: [{ moduleId: 'orders', navigation: [{ id: 'new-page', label: 'New page', href: '/orders/new-page' }] }],
    },
  },
});

const localText = JSON.stringify({
  projects: {
    [String(PROJECT)]: {
      modules: [{ moduleId: 'orders', navigation: [{ id: 'local-page', label: 'Local', href: '/orders/local' }] }],
    },
  },
});

test('st39: sem cópia local, lê o texto do rascunho', async () => {
  let valueReads = 0;
  const env = install({
    project: PROJECT,
    status: 'nochange',
    inLocalStorage: false,
    getValueInfo: async () => {
      valueReads += 1;
      return { content: localText };
    },
    getContent: async () => draftText,
  });
  try {
    const modules = await readDraftModules(PROJECT);
    assert.equal(modules?.[0]?.navigation?.[0]?.id, 'new-page');
    assert.equal(valueReads, 0);
    assert.equal(env.errors.length, 0);
  } finally {
    env.restore();
  }
});

test('st39: cópia local editada ganha do rascunho', async () => {
  let draftReads = 0;
  const env = install({
    project: PROJECT,
    status: 'nochange',
    inLocalStorage: true,
    getValueInfo: async () => ({ content: localText }),
    getContent: async () => {
      draftReads += 1;
      return draftText;
    },
  });
  try {
    const modules = await readDraftModules(PROJECT);
    assert.equal(modules?.[0]?.navigation?.[0]?.id, 'local-page');
    assert.equal(draftReads, 0);
  } finally {
    env.restore();
  }
});

test('st39: JSON inválido ou arquivo ausente devolve null e console.error', async () => {
  const missing = install(undefined);
  try {
    assert.equal(await readDraftModules(PROJECT), null);
    assert.equal(JSON.stringify(missing.errors).includes('l5/config.json'), true);
  } finally {
    missing.restore();
  }

  const invalid = install({
    project: PROJECT,
    status: 'nochange',
    inLocalStorage: false,
    getContent: async () => '{',
  });
  try {
    assert.equal(await readDraftModules(PROJECT), null);
    assert.equal(JSON.stringify(invalid.errors).includes('not valid JSON'), true);
  } finally {
    invalid.restore();
  }
});
