/// <mls fileReference="_102033_/l2/cbe/serviceClientApp.test.ts" enhancement="_blank" />
// The cover decision is pure. The service module loads Lit decorators, which this runner rejects,
// so the test runs the marked block from serviceClientApp.ts instead of importing it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

interface IPreviewCoverDecisionFns {
  previewCoverVisible: (input: { studio: boolean; level: number; count: number; blocked?: number; failure?: string }) => boolean;
  previewCoverBlockedDecision: (input: { count: number; blocked?: number }) => { show: boolean; line: number | null };
  previewCoverBlockedText: (template: string, line: number) => string;
  previewCoverSecondLine: (input: { count: number; blocked?: number; failure?: string }, blockedTemplate: string) => string | null;
}

function loadPreviewCoverVisible(): IPreviewCoverDecisionFns {
  const source = readFileSync(new URL('./serviceClientApp.ts', import.meta.url), 'utf8');
  const start = source.indexOf('// preview-cover-decision:start');
  const end = source.indexOf('// preview-cover-decision:end');
  if (start < 0 || end < 0) throw new Error('preview cover decision block is missing');
  const chunk = source.slice(start, end)
    .replace(/export interface[\s\S]*?\n\}\n/gu, '')
    .replace(/export /gu, '')
    .replace(/: IPreviewCoverInput/gu, '')
    .replace(/: IPreviewCoverBlockedInput/gu, '')
    .replace(/: IPreviewCoverBlockedDecision/gu, '')
    .replace(/: IPreviewCoverLineInput/gu, '')
    .replace(/: string \| null/gu, '')
    .replace(/: boolean/gu, '')
    .replace(/: string/gu, '')
    .replace(/: number/gu, '');
  return new Function(`${chunk}\nreturn { previewCoverVisible, previewCoverBlockedDecision, previewCoverBlockedText, previewCoverSecondLine };`)() as IPreviewCoverDecisionFns;
}

const { previewCoverVisible, previewCoverBlockedDecision, previewCoverBlockedText, previewCoverSecondLine } = loadPreviewCoverVisible();
const BLOCKED_LINE = '{n} file(s) with errors were not saved: fix them.';

interface IPaintNodes {
  before?: { data: string };
  after?: { data: string };
  button?: { textContent: string | null };
  blocked?: { data: string };
  blockedBreak?: { hidden: boolean };
}

function loadFillPreviewCoverOnFirstSync(): (
  create: () => IPaintNodes,
  copy: { before: string; save: string; after: string; blocked?: string },
) => IPaintNodes {
  const source = readFileSync(new URL('./serviceClientApp.ts', import.meta.url), 'utf8');
  const start = source.indexOf('// preview-cover-paint:start');
  const end = source.indexOf('// preview-cover-paint:end');
  if (start < 0 || end < 0) throw new Error('preview cover paint block is missing');
  const chunk = source.slice(start, end)
    .replace(/: \(\) => IPreviewCoverNodes/gu, '')
    .replace(/: IPreviewCoverNodes/gu, '')
    .replace(/: IPreviewCoverCopy/gu, '')
    .replace(/: void/gu, '')
    .replace(/export /gu, '');
  return new Function(`${chunk}\nreturn fillPreviewCoverOnFirstSync;`)() as (
    create: () => IPaintNodes,
    copy: { before: string; save: string; after: string; blocked?: string },
  ) => IPaintNodes;
}

const fillPreviewCoverOnFirstSync = loadFillPreviewCoverOnFirstSync();

interface IPreviewReloadState {
  studio: boolean;
  site: number | null;
  hold: number | null;
  reloads: number;
}

type PreviewDraftNotice =
  | { kind: 'saved'; project: number | null }
  | { kind: 'hold'; project: number | null; hold: boolean }
  | { kind: 'discarded'; project: number | null };

function loadApplyPreviewDraftNotice(): (state: IPreviewReloadState, notice: PreviewDraftNotice) => IPreviewReloadState {
  const source = readFileSync(new URL('./serviceClientApp.ts', import.meta.url), 'utf8');
  const start = source.indexOf('// preview-reload-decision:start');
  const end = source.indexOf('// preview-reload-decision:end');
  if (start < 0 || end < 0) throw new Error('preview reload decision block is missing');
  const chunk = source.slice(start, end)
    .replace(/export interface[\s\S]*?\n\}\n/u, '')
    .replace(/export type[\s\S]*?;\n/u, '')
    .replace(/export /gu, '')
    .replace(/: IPreviewReloadState/gu, '')
    .replace(/: PreviewDraftNotice/gu, '');
  return new Function(`${chunk}\nreturn applyPreviewDraftNotice;`)() as (
    state: IPreviewReloadState,
    notice: PreviewDraftNotice,
  ) => IPreviewReloadState;
}

const applyPreviewDraftNotice = loadApplyPreviewDraftNotice();

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

test('preview cover: one blocked file names it on the second line', () => {
  const decision = previewCoverBlockedDecision({ count: 2, blocked: 1 });
  assert.equal(decision.show, true);
  assert.equal(decision.line, 1);
  assert.equal(
    previewCoverBlockedText('{n} file(s) with errors were not saved: fix them.', decision.line ?? 0),
    '1 file(s) with errors were not saved: fix them.',
  );
});

test('preview cover: no blocked files leaves the second line off', () => {
  const decision = previewCoverBlockedDecision({ count: 2, blocked: 0 });
  assert.equal(decision.show, true);
  assert.equal(decision.line, null);
});

test('preview cover: nothing pending hides the cover', () => {
  const decision = previewCoverBlockedDecision({ count: 0 });
  assert.equal(decision.show, false);
  assert.equal(decision.line, null);
});

test('preview cover: only blocked files keep the cover and the line', () => {
  const decision = previewCoverBlockedDecision({ count: 0, blocked: 2 });
  assert.equal(decision.show, true);
  assert.equal(decision.line, 2);
});

test('preview cover: a refused save names its message on the second line', () => {
  const message = 'Nothing to save.';
  assert.equal(previewCoverSecondLine({ count: 0, blocked: 0, failure: message }, BLOCKED_LINE), message);
});

test('preview cover: blocked files own the second line', () => {
  assert.equal(
    previewCoverSecondLine({ count: 2, blocked: 2 }, BLOCKED_LINE),
    '2 file(s) with errors were not saved: fix them.',
  );
});

test('preview cover: nothing to report leaves the second line off', () => {
  assert.equal(previewCoverSecondLine({ count: 0, blocked: 0 }, BLOCKED_LINE), null);
});

test('st62 s2: an accepted discard reloads the preview once; a failed discard does not', () => {
  const open = { studio: true, site: 102047, hold: null, reloads: 0 };
  const failed = applyPreviewDraftNotice(
    applyPreviewDraftNotice(
      applyPreviewDraftNotice(open, { kind: 'hold', project: 102047, hold: true }),
      { kind: 'saved', project: 102047 },
    ),
    { kind: 'hold', project: 102047, hold: false },
  );
  assert.equal(failed.reloads, 0);
  assert.equal(failed.hold, null);

  const accepted = applyPreviewDraftNotice(
    applyPreviewDraftNotice(
      applyPreviewDraftNotice(open, { kind: 'hold', project: 102047, hold: true }),
      { kind: 'saved', project: 102047 },
    ),
    { kind: 'discarded', project: 102047 },
  );
  assert.equal(accepted.reloads, 1);
  assert.equal(accepted.hold, null);

  const again = applyPreviewDraftNotice(accepted, { kind: 'saved', project: 102047 });
  assert.equal(again.reloads, 2);
  const otherProject = applyPreviewDraftNotice(open, { kind: 'discarded', project: 102099 });
  assert.equal(otherProject.reloads, 0);
  const outside = applyPreviewDraftNotice(
    { studio: false, site: 102047, hold: null, reloads: 0 },
    { kind: 'discarded', project: 102047 },
  );
  assert.equal(outside.reloads, 0);
});

test('preview cover: first sync paints the text and the save button', () => {
  const copy = {
    before: 'There are unsaved draft changes. Use ',
    save: 'Save',
    after: ' to update this preview.',
  };
  const nodes = fillPreviewCoverOnFirstSync(() => ({
    before: { data: '' },
    after: { data: '' },
    button: { textContent: '' },
  }), copy);
  assert.equal(nodes.before?.data, copy.before);
  assert.equal(nodes.button?.textContent, copy.save);
  assert.equal(nodes.after?.data, copy.after);
});

test('preview cover: first sync paints the blocked line after the nodes exist', () => {
  const line = '1 file(s) with errors were not saved: fix them.';
  const nodes = fillPreviewCoverOnFirstSync(() => ({
    before: { data: '' },
    after: { data: '' },
    button: { textContent: '' },
    blocked: { data: '' },
    blockedBreak: { hidden: true },
  }), {
    before: 'There are unsaved draft changes. Use ',
    save: 'Save',
    after: ' to update this preview.',
    blocked: line,
  });
  assert.equal(nodes.blocked?.data, line);
  assert.equal(nodes.blockedBreak?.hidden, false);
});
