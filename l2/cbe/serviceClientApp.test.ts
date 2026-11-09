/// <mls fileReference="_102033_/l2/cbe/serviceClientApp.test.ts" enhancement="_blank" />
// The cover decision is pure. The service module loads Lit decorators, which this runner rejects,
// so the test runs the marked block from serviceClientApp.ts instead of importing it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function loadPreviewCoverVisible(): (input: { studio: boolean; level: number; count: number }) => boolean {
  const source = readFileSync(new URL('./serviceClientApp.ts', import.meta.url), 'utf8');
  const start = source.indexOf('// preview-cover-decision:start');
  const end = source.indexOf('// preview-cover-decision:end');
  if (start < 0 || end < 0) throw new Error('preview cover decision block is missing');
  const chunk = source.slice(start, end)
    .replace(/export interface[\s\S]*?\n\}\n/u, '')
    .replace(/export /gu, '')
    .replace(/: IPreviewCoverInput/gu, '')
    .replace(/: boolean/gu, '');
  return new Function(`${chunk}\nreturn previewCoverVisible;`)() as (input: {
    studio: boolean;
    level: number;
    count: number;
  }) => boolean;
}

const previewCoverVisible = loadPreviewCoverVisible();

test('preview cover: studio level 4 with unsaved work shows', () => {
  assert.equal(previewCoverVisible({ studio: true, level: 4, count: 2 }), true);
});

test('preview cover: studio page level stays open', () => {
  assert.equal(previewCoverVisible({ studio: true, level: 3, count: 2 }), false);
});

test('preview cover: studio with nothing to save stays open', () => {
  assert.equal(previewCoverVisible({ studio: true, level: 4, count: 0 }), false);
});

test('preview cover: outside studio stays open', () => {
  assert.equal(previewCoverVisible({ studio: false, level: 5, count: 5 }), false);
});
