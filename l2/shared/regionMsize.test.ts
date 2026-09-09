/// <mls fileReference="_102033_/l2/shared/regionMsize.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  attachViewportMsizeListeners,
  createCoalescedRunner,
  formatMsize,
  msizeForRect,
  parseMsizeHeight,
  writeMsizeForRect,
} from '/_102033_/l2/shared/regionMsize.js';

const SHELL = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'shell.ts'), 'utf8');

test('T1: a height change without a device change still produces a new msize', () => {
  const desktop = msizeForRect({ width: 1400, height: 813, top: 0, left: 0 });
  const shorter = msizeForRect({ width: 1400, height: 433, top: 0, left: 0 });
  assert.equal(desktop, '1400.00,813.00,0.00,0.00');
  assert.equal(shorter, '1400.00,433.00,0.00,0.00');
  assert.notEqual(desktop, shorter);
  assert.match(SHELL, /handleViewportChange = \(\) => \{[\s\S]*?syncResolvedDevice\(\);[\s\S]*?scheduleRegionMsizeSync\(\);/u);
});

test('T2: hosted region gets the measured height; a resize burst coalesces to one run', () => {
  const writes: string[] = [];
  const el = { setAttribute(_n: string, v: string) { writes.push(v); } };
  assert.equal(writeMsizeForRect(el, { width: 375, height: 707, top: 106, left: 0 }), true);
  assert.equal(writes[0], formatMsize({ width: 375, height: 707, top: 106, left: 0 }));
  assert.match(writes[0], /,707\.00,/u);

  const queued: Array<() => void> = [];
  let runs = 0;
  const coalesced = createCoalescedRunner(
    () => { runs += 1; },
    (cb) => { queued.push(cb); return queued.length; },
    () => { queued.length = 0; },
  );
  coalesced.trigger();
  coalesced.trigger();
  coalesced.trigger();
  assert.equal(runs, 0);
  assert.equal(queued.length, 1);
  queued[0]();
  assert.equal(runs, 1);
});

test('T3: host with rect.height === 0 writes no msize', () => {
  const writes: string[] = [];
  const el = { setAttribute(_n: string, v: string) { writes.push(v); } };
  assert.equal(writeMsizeForRect(el, { width: 375, height: 0, top: 106, left: 0 }), false);
  assert.equal(writeMsizeForRect(el, { width: 0, height: 707, top: 106, left: 0 }), false);
  assert.equal(msizeForRect({ width: 375, height: 0, top: 0, left: 0 }), null);
  assert.equal(writes.length, 0);
});

test('T4: detach removes window.resize and visualViewport.resize', () => {
  const added: string[] = [];
  const removed: string[] = [];
  const track = (side: string[]) => (type: string) => { side.push(type); };
  const viewport = {
    addEventListener: track(added),
    removeEventListener: track(removed),
  };
  const env = {
    addEventListener: track(added),
    removeEventListener: track(removed),
    visualViewport: viewport,
  };
  const detach = attachViewportMsizeListeners(env, () => undefined);
  assert.deepEqual(added, ['resize', 'resize']);
  detach();
  assert.deepEqual(removed, ['resize', 'resize']);
  assert.match(SHELL, /detachViewportMsizeListeners\?\.\(\)/u);
  assert.match(SHELL, /regionMsizeCoalesce\.cancel\(\)/u);
});

test('parseMsizeHeight prefers the attribute over a stale inline style', () => {
  assert.equal(parseMsizeHeight('375,707.00,106.00,0', '327px'), 707);
  assert.equal(parseMsizeHeight(null, '327px'), 327);
  assert.equal(parseMsizeHeight('', ''), null);
  assert.equal(parseMsizeHeight('375,0,106,0', ''), null);
});
