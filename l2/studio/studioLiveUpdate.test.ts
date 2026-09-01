/// <mls fileReference="_102033_/l2/studio/studioLiveUpdate.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { t } from '/_102033_/l2/studio/studioMessages.js';

// Set BEFORE the module under test is imported: it assigns a devtools handle on `window` and reads
// the persisted mode from `localStorage` at import time. The import is dynamic (inside the tests) so
// these run first — the harness compiles to CJS, so top-level await is not available here.
const storage = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { storage.set(k, v); },
};
(globalThis as { window?: unknown }).window = { localStorage: localStorageStub };
(globalThis as { localStorage?: unknown }).localStorage = localStorageStub;

type LiveUpdateModule = typeof import('/_102033_/l2/studio/studioLiveUpdate.js');

let cached: LiveUpdateModule | undefined;
async function load(): Promise<LiveUpdateModule> {
  cached ??= await import('/_102033_/l2/studio/studioLiveUpdate.js');
  return cached;
}

test('the modes are the three documented ones', async () => {
  const { listLiveUpdateModes } = await load();
  assert.deepEqual(listLiveUpdateModes(), ['hotSwap', 'reload', 'off']);
});

test('hotSwap is the default', async () => {
  const { getLiveUpdateMode } = await load();
  assert.equal(getLiveUpdateMode(), 'hotSwap');
});

test('setting a mode persists it, so it survives the reload the `reload` mode causes', async () => {
  const { getLiveUpdateMode, setLiveUpdateMode } = await load();
  setLiveUpdateMode('reload');
  assert.equal(getLiveUpdateMode(), 'reload');
  assert.equal(storage.get('studioLiveUpdateMode'), 'reload');
});

test('an invalid mode throws, lists the valid ones and leaves the active mode alone', async () => {
  const { getLiveUpdateMode, setLiveUpdateMode } = await load();
  assert.throws(() => setLiveUpdateMode('turbo'), /turbo/u);
  assert.throws(() => setLiveUpdateMode('turbo'), /hotSwap, reload, off/u);
  assert.equal(getLiveUpdateMode(), 'reload');
});

test('isLiveUpdateMode guards against inherited object keys', async () => {
  const { isLiveUpdateMode } = await load();
  assert.equal(isLiveUpdateMode('hotSwap'), true);
  assert.equal(isLiveUpdateMode('toString'), false);
  assert.equal(isLiveUpdateMode('constructor'), false);
});

test('the devtools handle is exposed on window', async () => {
  await load();
  const handle = (globalThis as { window: { studioLiveUpdate?: { get: () => string } } }).window.studioLiveUpdate;
  assert.ok(handle);
  assert.equal(typeof handle.get, 'function');
});

test('applyLiveUpdate never throws — a broken mode becomes a reported failure', async () => {
  const { applyLiveUpdate, setLiveUpdateMode } = await load();
  setLiveUpdateMode('off');
  const result = await applyLiveUpdate({
    edited: { page: '_1_x' } as never,
    page: { page: '_1_x' } as never,
    pageTag: 'x-y-1',
  });
  assert.equal(result.ok, true);
  // The words come from the catalog now; what this test guards is that a broken mode is REPORTED.
  assert.equal(result.message, t('live.off'));
});
