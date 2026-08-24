/// <mls fileReference="_102033_/l2/shared/contentPageGenomePreserve.test.ts" enhancement="_blank" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeContentPageGenomeChange } from '/_102033_/l2/shared/contentPageGenome.js';
import { contentPageGenomeToPreserve } from '/_102033_/l2/shared/contentPageGenomePreserve.js';

const monitorTag = 'monitor-web-desktop-home-page';
const page11Tag = 'pet-shop--web--desktop--page11--business-hours-catalogue-102047';
const page21Tag = 'pet-shop--web--desktop--page21--business-hours-catalogue-102047';

function genomeFromTag(tag: string): number | undefined {
  const match = tag.match(/--page(\d\d)--/u);
  return match ? Number(match[1]) : undefined;
}

test('navigating to a tag without --pageNN-- does not request a genome', () => {
  assert.equal(contentPageGenomeToPreserve(undefined, genomeFromTag(monitorTag)), undefined);
  assert.equal(contentPageGenomeToPreserve(genomeFromTag(page21Tag), genomeFromTag(monitorTag)), undefined);
  // If loadActiveRoute still asked for 11, the helper would name a miss — that
  // path stays reserved for an explicit mls.sites.setPage, not for navigation.
  const miss = describeContentPageGenomeChange({
    tag: monitorTag,
    entrypoint: '/_102034_/l2/monitor/web/desktop/page11/home.js',
  }, 11);
  assert.equal(miss.ok, false);
  assert.match(miss.reason, /no --pageNN-- segment/u);
});

test('navigation from --page21-- onto a page11 sibling preserves 21, not 11', () => {
  assert.equal(
    contentPageGenomeToPreserve(genomeFromTag(page21Tag), genomeFromTag(page11Tag)),
    21,
  );
});
