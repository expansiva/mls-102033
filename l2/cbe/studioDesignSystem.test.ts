/// <mls fileReference="_102033_/l2/cbe/studioDesignSystem.test.ts" enhancement="_blank" />
// The studio's DS knob never leaks into the app: whatever DS the app had when the studio first
// painted is what it has when the studio closes, and the studio's DS comes back on the next entry.
// No DOM in the l2 harness, so the document is a fake with the token style bootstrap writes.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_DS_ID,
  DS_TOKENS_ID,
  STUDIO_DS_ID,
  applyStudioDesignSystem,
  enterStudioDesignSystem,
  holdAppDesignSystem,
  isStudioDesignSystemActive,
  leaveStudioDesignSystem,
  type IDsDocument,
  type IDsStyle,
} from './studioDesignSystem.js';

function fakeDoc(app: { css: string; name?: string } | null) {
  const styles = new Map<string, IDsStyle & { attrs: Record<string, string> }>();
  const make = (): IDsStyle & { attrs: Record<string, string> } => {
    const el = {
      id: '',
      textContent: null as string | null,
      dataset: {} as Record<string, string | undefined>,
      attrs: {} as Record<string, string>,
      setAttribute(name: string, value: string) { el.attrs[name] = value; },
      remove() { styles.delete(el.id); },
    };
    return el;
  };
  const doc: IDsDocument = {
    getElementById: (id) => styles.get(id) ?? null,
    createElement: () => make(),
    head: { appendChild: (el) => { styles.set(el.id, el as IDsStyle & { attrs: Record<string, string> }); } },
  };
  if (app) {
    const tokens = make();
    tokens.id = DS_TOKENS_ID;
    tokens.textContent = app.css;
    if (app.name) tokens.dataset.designSystem = app.name;
    styles.set(DS_TOKENS_ID, tokens);
  }
  const shown = () => ({ css: styles.get(DS_TOKENS_ID)?.textContent, name: styles.get(DS_TOKENS_ID)?.dataset.designSystem });
  return { doc, styles, shown };
}

test('the knob paints the studio DS and keeps the app DS aside, inert', () => {
  const { doc, styles, shown } = fakeDoc({ css: 'app', name: 'Default' });
  assert.equal(applyStudioDesignSystem('canteiro', 'Canteiro', doc), true);
  assert.deepEqual(shown(), { css: 'canteiro', name: 'Canteiro' });
  assert.equal(isStudioDesignSystemActive(doc), true);
  assert.equal(styles.get(APP_DS_ID)?.textContent, 'app');
  assert.equal(styles.get(APP_DS_ID)?.dataset.designSystem, 'Default');
  assert.equal(styles.get(APP_DS_ID)?.attrs.media, 'not all');
});

test('switching twice keeps the FIRST app DS, not the one in between', () => {
  const { doc, shown } = fakeDoc({ css: 'app', name: 'Default' });
  applyStudioDesignSystem('canteiro', 'Canteiro', doc);
  applyStudioDesignSystem('natal', 'Natal', doc);
  leaveStudioDesignSystem(doc);
  assert.deepEqual(shown(), { css: 'app', name: 'Default' });
});

test('leave gives the app back; entering again brings the studio DS back', () => {
  const { doc, styles, shown } = fakeDoc({ css: 'app', name: 'Default' });
  applyStudioDesignSystem('canteiro', 'Canteiro', doc);
  leaveStudioDesignSystem(doc);
  assert.deepEqual(shown(), { css: 'app', name: 'Default' });
  assert.equal(isStudioDesignSystemActive(doc), false);
  assert.equal(styles.get(STUDIO_DS_ID)?.textContent, 'canteiro');

  enterStudioDesignSystem(doc);
  assert.deepEqual(shown(), { css: 'canteiro', name: 'Canteiro' });
  assert.equal(styles.has(STUDIO_DS_ID), false);
  leaveStudioDesignSystem(doc);
  assert.deepEqual(shown(), { css: 'app', name: 'Default' });
});

test('a switch made outside the studio is what the studio hands back next time', () => {
  const { doc, styles, shown } = fakeDoc({ css: 'app', name: 'Default' });
  applyStudioDesignSystem('canteiro', 'Canteiro', doc);
  leaveStudioDesignSystem(doc);
  // the app user presses Ctrl+Alt+D outside the studio
  const tokens = styles.get(DS_TOKENS_ID)!;
  tokens.textContent = 'natal';
  tokens.dataset.designSystem = 'Natal';
  enterStudioDesignSystem(doc);
  assert.deepEqual(shown(), { css: 'canteiro', name: 'Canteiro' });
  leaveStudioDesignSystem(doc);
  assert.deepEqual(shown(), { css: 'natal', name: 'Natal' });
});

test('no studio choice, no change: enter/leave without a knob paint touch nothing', () => {
  const { doc, styles, shown } = fakeDoc({ css: 'app', name: 'Default' });
  enterStudioDesignSystem(doc);
  leaveStudioDesignSystem(doc);
  assert.deepEqual(shown(), { css: 'app', name: 'Default' });
  assert.equal(styles.size, 1);
});

test('no token style (no app on screen): the knob paints nothing', () => {
  const { doc, styles } = fakeDoc(null);
  assert.equal(applyStudioDesignSystem('canteiro', 'Canteiro', doc), false);
  assert.equal(styles.size, 0);
  assert.equal(applyStudioDesignSystem('x', 'X', null), false);
});

test('hold keeps the app DS aside without painting; a draft written after it never leaks to the app', () => {
  const { doc, styles, shown } = fakeDoc({ css: 'app', name: 'Default' });
  assert.equal(holdAppDesignSystem(doc), true);
  assert.deepEqual(shown(), { css: 'app', name: 'Default' }, 'nothing painted');
  // the editor's live preview writes the draft into the token style
  styles.get(DS_TOKENS_ID)!.textContent = 'draft';
  leaveStudioDesignSystem(doc);
  assert.deepEqual(shown(), { css: 'app', name: 'Default' });
  enterStudioDesignSystem(doc);
  assert.deepEqual(shown(), { css: 'draft', name: 'Default' }, 'the draft comes back with the studio');
  assert.equal(holdAppDesignSystem(fakeDoc(null).doc), false);
});
