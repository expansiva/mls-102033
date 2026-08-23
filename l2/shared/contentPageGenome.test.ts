/// <mls fileReference="_102033_/l2/shared/contentPageGenome.test.ts" enhancement="_blank" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeContentPageGenomeChange } from '/_102033_/l2/shared/contentPageGenome.js';

const consistent = {
  tag: 'pet-shop--web--desktop--page11--business-hours-catalogue-102047',
  entrypoint: '/_102047_/l2/petShop/web/desktop/page11/businessHoursCatalogue.js',
};

test('setPage 21 derives the sibling tag when variants share the project suffix', () => {
  const change = describeContentPageGenomeChange(consistent, 21);
  assert.equal(change.ok, true);
  assert.equal(change.nextTag, 'pet-shop--web--desktop--page21--business-hours-catalogue-102047');
  assert.match(change.nextEntrypoint, /\/page21\//u);
  assert.equal(change.reason, '');
});

test('setPage keeps the current suffix — a drifted variant then fails at customElements.get', () => {
  const fromPage11 = describeContentPageGenomeChange(consistent, 21);
  assert.equal(fromPage11.ok, true);
  assert.equal(fromPage11.nextTag, 'pet-shop--web--desktop--page21--business-hours-catalogue-102047');
  const noPageSegment = describeContentPageGenomeChange({
    tag: 'pet-shop--web--desktop--business-hours-catalogue-petShop',
    entrypoint: '/_102047_/l2/petShop/web/desktop/page31/businessHoursCatalogue.js',
  }, 21);
  assert.equal(noPageSegment.ok, false);
  assert.match(noPageSegment.reason, /no --pageNN-- segment/u);
});

test('already on the requested genome is a no-op success', () => {
  const change = describeContentPageGenomeChange(consistent, 11);
  assert.equal(change.ok, true);
  assert.equal(change.nextTag, consistent.tag);
});

test('missing renderer is named, not silent', () => {
  const change = describeContentPageGenomeChange(undefined, 21);
  assert.equal(change.ok, false);
  assert.match(change.reason, /no active content renderer/u);
});
