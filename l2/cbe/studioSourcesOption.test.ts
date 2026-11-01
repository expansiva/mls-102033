/// <mls fileReference="_102033_/l2/cbe/studioSourcesOption.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGitSlotVmDriver,
  readSourcesFromGitHub,
  writeSourcesFromGitHub,
} from '/_102033_/l2/cbe/studioSourcesOption.js';

type MemStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function installStorage(initial?: Record<string, string>): { storage: Map<string, string>; restore: () => void } {
  const storage = new Map<string, string>(Object.entries(initial ?? {}));
  const previous = (globalThis as { localStorage?: unknown }).localStorage;
  const localStorage: MemStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value); },
  };
  (globalThis as { localStorage: unknown }).localStorage = localStorage;
  return {
    storage,
    restore() {
      if (previous === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
      else (globalThis as { localStorage: unknown }).localStorage = previous;
    },
  };
}

test('st38: sem chave a opção está desligada; 1 liga; desligar grava vazio', () => {
  const env = installStorage();
  try {
    assert.equal(readSourcesFromGitHub(), false);
    writeSourcesFromGitHub(true);
    assert.equal(env.storage.get('collabStudioSourcesFromGitHub'), '1');
    assert.equal(readSourcesFromGitHub(), true);
    writeSourcesFromGitHub(false);
    assert.equal(env.storage.get('collabStudioSourcesFromGitHub'), '');
    assert.equal(readSourcesFromGitHub(), false);
  } finally {
    env.restore();
  }
});

test('st38: localStorage que lança na leitura devolve desligada e console.error', () => {
  const previous = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage: unknown }).localStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const origError = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    assert.equal(readSourcesFromGitHub(), false);
    writeSourcesFromGitHub(true);
    assert.equal(JSON.stringify(errors).includes('collabStudioSourcesFromGitHub'), true);
  } finally {
    console.error = origError;
    if (previous === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage: unknown }).localStorage = previous;
  }
});

test('st38: o envoltório recusa setContents sem chamar /exec', async () => {
  class DriverIOBase {}
  const previousMls = (globalThis as { mls?: unknown }).mls;
  const previousFetch = globalThis.fetch;
  const origError = console.error;
  (globalThis as { mls: unknown }).mls = { istrace: false, stor: { others: { DriverIOBase } } };
  globalThis.fetch = (async () => {
    throw new Error('fetch must not run');
  }) as typeof fetch;
  console.error = () => undefined;
  try {
    const driver = await createGitSlotVmDriver();
    await assert.rejects(
      () => driver.setContents(102033, [], null),
      (err: unknown) => err instanceof Error && err.message.includes('Fetch sources from GitHub'),
    );
  } finally {
    console.error = origError;
    globalThis.fetch = previousFetch;
    if (previousMls === undefined) delete (globalThis as { mls?: unknown }).mls;
    else (globalThis as { mls: unknown }).mls = previousMls;
  }
});
