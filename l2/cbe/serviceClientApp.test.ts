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

interface IPreviewCoverChrome {
  inert: boolean;
  blockScroll: boolean;
  pointerEvents: string;
  reservedPx: number;
}

interface IPreviewCoverRegionEl {
  removeAttribute(name: string): void;
  setAttribute(name: string, value: string): void;
  style: { pointerEvents: string; height: string };
}

function loadPreviewCoverFooter(): {
  previewCoverChrome: (stripPx: number) => IPreviewCoverChrome;
  applyPreviewCoverChrome: (
    region: IPreviewCoverRegionEl,
    chrome: IPreviewCoverChrome | null,
    heightPx: number | null,
  ) => void;
} {
  const source = readFileSync(new URL('./serviceClientApp.ts', import.meta.url), 'utf8');
  const start = source.indexOf('// preview-cover-footer:start');
  const end = source.indexOf('// preview-cover-footer:end');
  if (start < 0 || end < 0) throw new Error('preview cover footer block is missing');
  const chunk = source.slice(start, end)
    .replace(/export interface[\s\S]*?\n\}\n/gu, '')
    .replace(/: IPreviewCoverRegionEl/gu, '')
    .replace(/: IPreviewCoverChrome \| null/gu, '')
    .replace(/: IPreviewCoverChrome/gu, '')
    .replace(/: number \| null/gu, '')
    .replace(/: number/gu, '')
    .replace(/: void/gu, '')
    .replace(/export /gu, '');
  return new Function(`${chunk}\nreturn { previewCoverChrome, applyPreviewCoverChrome };`)() as {
    previewCoverChrome: (stripPx: number) => IPreviewCoverChrome;
    applyPreviewCoverChrome: (
      region: IPreviewCoverRegionEl,
      chrome: IPreviewCoverChrome | null,
      heightPx: number | null,
    ) => void;
  };
}

const { previewCoverChrome, applyPreviewCoverChrome } = loadPreviewCoverFooter();

interface IPreviewReloadState {
  studio: boolean;
  site: number | null;
  hold: number | null;
  updates: number;
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

interface IPreviewUpdatePlan {
  previewChangedFiles: (kind: string, saved: readonly string[], before: readonly string[], after: readonly string[]) => string[];
  previewUpdateFailureText: (phrase: string, cause: string) => string;
  deliverPreviewUpdate: (
    ask: (project: number, files: readonly string[]) => Promise<void>,
    project: number,
    files: readonly string[],
  ) => Promise<string | null>;
}

function loadPreviewUpdatePlan(): IPreviewUpdatePlan {
  const source = readFileSync(new URL('./serviceClientApp.ts', import.meta.url), 'utf8');
  const start = source.indexOf('// preview-update-plan:start');
  const end = source.indexOf('// preview-update-plan:end');
  if (start < 0 || end < 0) throw new Error('preview update plan block is missing');
  const chunk = source.slice(start, end)
    .replace(/: \(project: number, files: readonly string\[\]\) => Promise<void>/gu, '')
    .replace(/: Promise<string \| null>/gu, '')
    .replace(/: readonly string\[\]/gu, '')
    .replace(/: string\[\]/gu, '')
    .replace(/export /gu, '')
    .replace(/: string/gu, '')
    .replace(/: number/gu, '');
  return new Function(`${chunk}\nreturn { previewChangedFiles, previewUpdateFailureText, deliverPreviewUpdate };`)() as IPreviewUpdatePlan;
}

const { previewChangedFiles, previewUpdateFailureText, deliverPreviewUpdate } = loadPreviewUpdatePlan();
const UPDATE_FAILED = 'The open preview could not be updated.';

test('preview cover: studio level 4 with unsaved work shows', () => {
  assert.equal(previewCoverVisible({ studio: true, level: 4, count: 2 }), true);
});

test('preview cover: studio page level shows the footer', () => {
  assert.equal(previewCoverVisible({ studio: true, level: 3, count: 2 }), true);
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

test('st62 s2: an accepted discard updates the preview once; a failed discard does not', () => {
  const open = { studio: true, site: 102047, hold: null, updates: 0 };
  const failed = applyPreviewDraftNotice(
    applyPreviewDraftNotice(
      applyPreviewDraftNotice(open, { kind: 'hold', project: 102047, hold: true }),
      { kind: 'saved', project: 102047 },
    ),
    { kind: 'hold', project: 102047, hold: false },
  );
  assert.equal(failed.updates, 0);
  assert.equal(failed.hold, null);

  const accepted = applyPreviewDraftNotice(
    applyPreviewDraftNotice(
      applyPreviewDraftNotice(open, { kind: 'hold', project: 102047, hold: true }),
      { kind: 'saved', project: 102047 },
    ),
    { kind: 'discarded', project: 102047 },
  );
  assert.equal(accepted.updates, 1);
  assert.equal(accepted.hold, null);

  const again = applyPreviewDraftNotice(accepted, { kind: 'saved', project: 102047 });
  assert.equal(again.updates, 2);
  const otherProject = applyPreviewDraftNotice(open, { kind: 'discarded', project: 102099 });
  assert.equal(otherProject.updates, 0);
  const outside = applyPreviewDraftNotice(
    { studio: false, site: 102047, hold: null, updates: 0 },
    { kind: 'discarded', project: 102047 },
  );
  assert.equal(outside.updates, 0);
});

test('st66 s4: Save asks for an update with the saved paths', async () => {
  const open = { studio: true, site: 102047, hold: null, updates: 0 };
  const saved = applyPreviewDraftNotice(open, { kind: 'saved', project: 102047 });
  assert.equal(saved.updates, 1);
  const files = previewChangedFiles('saved', ['l2/agenda/page.ts', 'l2/agenda/page.ts'], [], []);
  assert.deepEqual(files, ['l2/agenda/page.ts']);
  const seen: string[][] = [];
  const cause = await deliverPreviewUpdate(async (_project, next) => { seen.push([...next]); }, 102047, files);
  assert.equal(cause, null);
  assert.deepEqual(seen, [['l2/agenda/page.ts']]);
});

test('st66 s4: Discard all asks for an update with the diff before and after', () => {
  const open = { studio: true, site: 102047, hold: null, updates: 0 };
  const discarded = applyPreviewDraftNotice(open, { kind: 'discarded', project: 102047 });
  assert.equal(discarded.updates, 1);
  assert.equal(discarded.hold, null);
  assert.deepEqual(
    previewChangedFiles('discarded', [], ['l2/a.ts', 'l2/b.ts'], []),
    ['l2/a.ts', 'l2/b.ts'],
  );
});

test('st66 s4: Discard module keeps the hold and then updates with that module diff', () => {
  const open = { studio: true, site: 102047, hold: null, updates: 0 };
  const held = applyPreviewDraftNotice(open, { kind: 'hold', project: 102047, hold: true });
  const during = applyPreviewDraftNotice(held, { kind: 'saved', project: 102047 });
  assert.equal(during.updates, 0);
  assert.equal(during.hold, 102047);
  const released = applyPreviewDraftNotice(during, { kind: 'hold', project: 102047, hold: false });
  const discarded = applyPreviewDraftNotice(released, { kind: 'discarded', project: 102047 });
  assert.equal(discarded.updates, 1);
  assert.equal(discarded.hold, null);
  assert.deepEqual(
    previewChangedFiles('discarded', [], ['l2/mod/page.ts', 'l5/config.json'], ['l5/config.json']),
    ['l2/mod/page.ts', 'l5/config.json'],
  );
});

test('st68 s1: a preview failure keeps the footer after Studio is off', () => {
  const line = previewUpdateFailureText(UPDATE_FAILED, 'production compile failed');
  assert.equal(previewCoverVisible({ studio: false, level: 5, count: 0, failure: line }), true);
  assert.equal(previewCoverSecondLine({ count: 0, failure: line }, BLOCKED_LINE), line);
  assert.equal(previewCoverVisible({ studio: false, level: 5, count: 5 }), false);
  const source = readFileSync(new URL('./serviceClientApp.ts', import.meta.url), 'utf8');
  assert.match(source, /registerPreviewTabsFailure/);
  assert.match(source, /previewTabsFailureLine/);
  assert.match(source, /coverButton\.hidden = !studio/);
});

test('st66 s4: a failed tab update is the footer line and the page is not reloaded', async () => {
  const errors: unknown[][] = [];
  const previous = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    const cause = await deliverPreviewUpdate(async () => { throw new Error('the file was not compiled'); }, 102047, ['l2/a.ts']);
    assert.equal(cause, 'the file was not compiled');
  } finally {
    console.error = previous;
  }
  const line = previewUpdateFailureText(UPDATE_FAILED, 'the file was not compiled');
  assert.equal(previewCoverSecondLine({ count: 0, blocked: 0, failure: line }, BLOCKED_LINE), line);
  const source = readFileSync(new URL('./serviceClientApp.ts', import.meta.url), 'utf8');
  assert.equal(source.includes('location.reload'), false);
  assert.match(source, /askPreviewTabsUpdate/);
  assert.match(source, /detail\.before/);
  assert.match(source, /detail\.after/);
  assert.match(source, /collabPreviewUpdateFailed/);
});

test('st65 s3b: a visible footer does not lock the preview', () => {
  assert.equal(previewCoverVisible({ studio: true, level: 4, count: 2 }), true);
  assert.equal(previewCoverVisible({ studio: true, level: 3, count: 2 }), true);
  const chrome = previewCoverChrome(36);
  assert.equal(chrome.inert, false);
  assert.equal(chrome.blockScroll, false);
  assert.equal(chrome.pointerEvents, 'auto');
  assert.equal(chrome.reservedPx, 36);
  const style = { pointerEvents: 'none', height: '400px' };
  let inert = true;
  const region: IPreviewCoverRegionEl = {
    removeAttribute(name: string) { if (name === 'inert') inert = false; },
    setAttribute(name: string) { if (name === 'inert') inert = true; },
    style,
  };
  applyPreviewCoverChrome(region, chrome, 400);
  assert.equal(inert, false);
  assert.equal(style.pointerEvents, 'auto');
  assert.equal(style.height, '364px');

  const hidden = { pointerEvents: 'none', height: '400px' };
  let hiddenInert = true;
  applyPreviewCoverChrome({
    removeAttribute(name: string) { if (name === 'inert') hiddenInert = false; },
    setAttribute(name: string) { if (name === 'inert') hiddenInert = true; },
    style: hidden,
  }, null, 400);
  assert.equal(hiddenInert, false);
  assert.equal(hidden.pointerEvents, '');
  assert.equal(hidden.height, '400px');

  const source = readFileSync(new URL('./serviceClientApp.ts', import.meta.url), 'utf8');
  assert.equal(source.includes('blockPreviewScroll'), false);
  assert.equal(source.includes("addEventListener('wheel'"), false);
  assert.equal(source.includes("addEventListener('touchmove'"), false);
  const less = readFileSync(new URL('./serviceClientApp.less', import.meta.url), 'utf8');
  assert.equal(/pointer-events\s*:\s*none/.test(less), false);
  assert.equal(/overflow\s*:\s*hidden/.test(less), false);
  assert.equal(/position\s*:\s*absolute/.test(less), false);
  assert.equal(/z-index/.test(less), false);
  assert.equal(/inset\s*:\s*0/.test(less), false);
  assert.match(less, /position:\s*static/);
  assert.match(less, /background:\s*var\(--bg-primary-color/);
  assert.match(source, /This page may be out of date: there are unsaved changes\./);
  assert.match(source, /Esta página pode estar desatualizada: há alterações não salvas\./);
  assert.match(source, /Esta página puede estar desactualizada: hay cambios sin guardar\./);
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
