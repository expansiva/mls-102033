/// <mls fileReference="_102033_/l2/studio/studioTextEdit.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTextEdit,
  buildTemplateMap,
  findAllI18nMatches,
  findTextOrigin,
  findTextOriginByKey,
  findTextOriginByOccurrence,
} from '/_102033_/l2/studio/studioTextEdit.js';

// A page shaped like the ones the generator emits: an i18n block with two languages, two keys
// sharing the same value ('OK') to exercise the disambiguation, and static text in the template.
const PAGE = [
  `/// <mls fileReference="_102051_/l2/cafeFlow/web/desktop/page11/posWorkspace.ts" enhancement="_blank" />`,
  `import { html } from 'lit';`,
  ``,
  `/// **collab_i18n_start**`,
  `const message_en = {`,
  `  title: 'Orders',`,
  `  save: 'OK',`,
  `  confirm: 'OK',`,
  `  quoted: 'It\\'s fine',`,
  `}`,
  ``,
  `const message_pt: MessageType = {`,
  `  title: 'Pedidos',`,
  `  save: 'OK',`,
  `  confirm: 'OK',`,
  `  quoted: 'Tudo certo',`,
  `}`,
  `/// **collab_i18n_end**`,
  ``,
  `class PosWorkspace {`,
  `  render() {`,
  `    return html\`<section>`,
  `      <h1>\${this.msg.title}</h1>`,
  `      <p>Total do turno</p>`,
  `      <button>\${this.msg.save}</button>`,
  `      <button>\${this.msg.confirm}</button>`,
  `      <span>\${this.total}</span>`,
  `    </section>\`;`,
  `  }`,
  `}`,
].join('\n');

test('findTextOriginByKey resolves the key across every language', () => {
  const origin = findTextOriginByKey('title', PAGE);

  assert.equal(origin.type, 'i18n');
  if (origin.type !== 'i18n') return;
  assert.equal(origin.key, 'title');
  assert.deepEqual(origin.languages.map((l) => l.lang), ['en', 'pt']);
  assert.deepEqual(origin.languages.map((l) => l.value), ['Orders', 'Pedidos']);
  assert.equal(origin.templateExpression, 'this.msg.title');
});

test('findTextOriginByKey reports an unknown key as dynamic', () => {
  const origin = findTextOriginByKey('doesNotExist', PAGE);

  assert.equal(origin.type, 'dynamic');
});

test('i18n offsets point at the string literal, quotes included', () => {
  const origin = findTextOriginByKey('title', PAGE);
  assert.equal(origin.type, 'i18n');
  if (origin.type !== 'i18n') return;

  const en = origin.languages.find((l) => l.lang === 'en');
  assert.ok(en);
  assert.equal(PAGE.substring(en.startOffset, en.endOffset), `'Orders'`);
});

test('applyTextEdit with a lang edits ONLY that language', () => {
  const origin = findTextOriginByKey('title', PAGE);
  const result = applyTextEdit(origin, 'Comandas', PAGE, 'pt');

  assert.equal(result.success, true);
  assert.ok(result.newSource);
  assert.match(result.newSource, /title: 'Comandas',/);
  assert.match(result.newSource, /title: 'Orders',/);
});

test('applyTextEdit without a lang edits every language, offsets intact', () => {
  const origin = findTextOriginByKey('title', PAGE);
  const result = applyTextEdit(origin, 'Comandas', PAGE);

  assert.equal(result.success, true);
  assert.ok(result.newSource);
  // Back-to-front editing: BOTH entries land correctly and nothing else is corrupted.
  assert.equal(result.newSource.match(/title: 'Comandas',/gu)?.length, 2);
  assert.match(result.newSource, /save: 'OK',/);
  assert.match(result.newSource, /<p>Total do turno<\/p>/);
});

test('applyTextEdit escapes the new text for the quote style in use', () => {
  const origin = findTextOriginByKey('title', PAGE);
  const result = applyTextEdit(origin, "It's ready", PAGE, 'en');

  assert.ok(result.newSource);
  assert.match(result.newSource, /title: 'It\\'s ready',/);
});

test('a value carrying an escaped quote is unescaped when read back', () => {
  const origin = findTextOriginByKey('quoted', PAGE);
  assert.equal(origin.type, 'i18n');
  if (origin.type !== 'i18n') return;

  const en = origin.languages.find((l) => l.lang === 'en');
  assert.equal(en?.value, "It's fine");
});

test('editing a value with an escaped quote does not corrupt the source', () => {
  // Regression for the entry-regex bug: a wrong endOffset left the tail of the literal dangling.
  const origin = findTextOriginByKey('quoted', PAGE);
  const result = applyTextEdit(origin, 'Ready', PAGE, 'en');

  assert.equal(result.success, true);
  assert.ok(result.newSource);
  assert.match(result.newSource, /quoted: 'Ready',/);
  assert.doesNotMatch(result.newSource, /s fine/);
  // The pt entry is untouched and the object still closes correctly.
  assert.match(result.newSource, /quoted: 'Tudo certo',/);
});

test('findAllI18nMatches finds every key sharing a value', () => {
  const matches = findAllI18nMatches('OK', PAGE, 'en');

  assert.deepEqual(matches.map((m) => m.key), ['save', 'confirm']);
});

test('findTextOriginByOccurrence disambiguates same-value keys by template order', () => {
  const first = findTextOriginByOccurrence('OK', PAGE, 0, 'en');
  const second = findTextOriginByOccurrence('OK', PAGE, 1, 'en');

  assert.equal(first.type, 'i18n');
  assert.equal(second.type, 'i18n');
  if (first.type !== 'i18n' || second.type !== 'i18n') return;
  assert.equal(first.key, 'save');
  assert.equal(second.key, 'confirm');
});

test('findTextOriginByOccurrence falls back to the first match past the last occurrence', () => {
  const origin = findTextOriginByOccurrence('OK', PAGE, 99, 'en');

  assert.equal(origin.type, 'i18n');
  if (origin.type !== 'i18n') return;
  assert.equal(origin.key, 'save');
});

test('findTextOrigin locates static template text', () => {
  const origin = findTextOrigin('Total do turno', PAGE);

  assert.equal(origin.type, 'static');
  if (origin.type !== 'static') return;
  assert.equal(PAGE.substring(origin.startOffset, origin.endOffset), 'Total do turno');
});

test('applyTextEdit replaces static text in place', () => {
  const origin = findTextOrigin('Total do turno', PAGE);
  const result = applyTextEdit(origin, 'Total do dia', PAGE);

  assert.equal(result.success, true);
  assert.ok(result.newSource);
  assert.match(result.newSource, /<p>Total do dia<\/p>/);
  assert.doesNotMatch(result.newSource, /Total do turno/);
});

test('text that is not in the source is dynamic and not editable', () => {
  const origin = findTextOrigin('R$ 42,00', PAGE);

  assert.equal(origin.type, 'dynamic');

  const result = applyTextEdit(origin, 'R$ 43,00', PAGE);
  assert.equal(result.success, false);
  assert.equal(result.newSource, undefined);
});

test('text inside ${...} is never treated as static', () => {
  // 'this.total' lives in an expression: it must not be found as static text.
  const origin = findTextOrigin('this.total', PAGE);

  assert.equal(origin.type, 'dynamic');
});

test('buildTemplateMap keeps DOM order and classifies the expressions', () => {
  const map = buildTemplateMap(PAGE);

  assert.deepEqual(map.map((e) => e.expression), [
    'this.msg.title',
    'this.msg.save',
    'this.msg.confirm',
    'this.total',
  ]);
  assert.deepEqual(map.map((e) => e.i18nKey), ['title', 'save', 'confirm', null]);
  assert.deepEqual(map.map((e) => e.type), ['i18n', 'i18n', 'i18n', 'dynamic']);
});

test('the t() helper is recognized as an i18n expression', () => {
  const source = [
    `/// **collab_i18n_start**`,
    `const message_en = { greet: 'Hi' }`,
    `/// **collab_i18n_end**`,
    `class X {`,
    `  render() {`,
    `    return html\`<p>\${t('greet')}</p>\`;`,
    `  }`,
    `}`,
  ].join('\n');

  const map = buildTemplateMap(source);
  assert.deepEqual(map.map((e) => e.i18nKey), ['greet']);
  assert.equal(map[0].type, 'i18n');
});

test('a source with no i18n block still resolves static text', () => {
  const source = [
    `class X {`,
    `  render() {`,
    `    return html\`<p>Plain label</p>\`;`,
    `  }`,
    `}`,
  ].join('\n');

  assert.equal(findTextOrigin('Plain label', source).type, 'static');
  assert.equal(findTextOriginByKey('anything', source).type, 'dynamic');
});

test('empty text is dynamic', () => {
  assert.equal(findTextOrigin('   ', PAGE).type, 'dynamic');
  assert.equal(findTextOriginByOccurrence('   ', PAGE, 0).type, 'dynamic');
});

// ── Generated pages: dotted keys, and i18n in the SHARED base class ─────────────────────────────
// Shape taken from mls-102051 cafeFlow: the shared file is the base class and owns the catalog with
// DOUBLE-QUOTED DOTTED keys; the page file only has render(), referencing this.msg['dotted.key'].

const SHARED = [
  `/// <mls fileReference="_102051_/l2/cafeFlow/web/shared/dashboardWorkspace.ts" enhancement="_102020_/l2/enhancementAura"/>`,
  `import { CollabLitElement } from '/_102029_/l2/collabLitElement.js';`,
  ``,
  `/// **collab_i18n_start**`,
  `const message_pt = {`,
  `  "section.dashboardWorkspace.sec-kpi-overview.title": "Indicadores do Turno",`,
  `  "organism.dashboardWorkspace.getDashboard.title": "Ver dashboard operacional",`,
  `  "intent.dashboardWorkspace.getDashboard.list.empty": "Nenhum registro encontrado",`,
  `}`,
  `/// **collab_i18n_end**`,
  ``,
  `export class CafeFlowDashboardWorkspaceBase extends CollabLitElement {}`,
].join('\n');

const PAGE_OF_SHARED = [
  `/// <mls fileReference="_102051_/l2/cafeFlow/web/desktop/page11/dashboardWorkspace.ts" enhancement="_102020_/l2/enhancementAura"/>`,
  `export class Page extends CafeFlowDashboardWorkspaceBase {`,
  `  render() {`,
  `    return html\`<section>`,
  `      <h2>\${this.msg['section.dashboardWorkspace.sec-kpi-overview.title']}</h2>`,
  `      <button>\${this.msg['organism.dashboardWorkspace.getDashboard.title']}</button>`,
  `      <span>\${this.getDashboardData?.total}</span>`,
  `    </section>\`;`,
  `  }`,
  `}`,
].join('\n');

test('dotted double-quoted keys are parsed whole, not collapsed to the last segment', () => {
  const origin = findTextOriginByKey('section.dashboardWorkspace.sec-kpi-overview.title', SHARED);

  assert.equal(origin.type, 'i18n');
  if (origin.type !== 'i18n') return;
  assert.equal(origin.languages[0].value, 'Indicadores do Turno');
});

test('the offset of a dotted key points at the VALUE, never at the key', () => {
  const origin = findTextOriginByKey('organism.dashboardWorkspace.getDashboard.title', SHARED);
  assert.equal(origin.type, 'i18n');
  if (origin.type !== 'i18n') return;

  const entry = origin.languages[0];
  // Regression for the offset bug: key and value share the quote style, so searching for the first
  // quote in the match landed inside the KEY and saving would have overwritten it.
  assert.equal(SHARED.substring(entry.startOffset, entry.endOffset), '"Ver dashboard operacional"');
});

test('editing a dotted key rewrites only its value', () => {
  const origin = findTextOriginByKey('section.dashboardWorkspace.sec-kpi-overview.title', SHARED);
  const result = applyTextEdit(origin, 'Indicadores do Dia', SHARED, 'pt');

  assert.equal(result.success, true);
  assert.ok(result.newSource);
  assert.match(result.newSource, /"section\.dashboardWorkspace\.sec-kpi-overview\.title": "Indicadores do Dia",/);
  // The neighbours are intact.
  assert.match(result.newSource, /"organism\.dashboardWorkspace\.getDashboard\.title": "Ver dashboard operacional",/);
});

test('keys of distinct entries do not collide (the 54-into-3 bug)', () => {
  // All three keys end in a different last segment except the two `.title` ones — collapsing on the
  // last segment would make them the same entry.
  const kpi = findTextOriginByKey('section.dashboardWorkspace.sec-kpi-overview.title', SHARED);
  const organism = findTextOriginByKey('organism.dashboardWorkspace.getDashboard.title', SHARED);

  assert.equal(kpi.type, 'i18n');
  assert.equal(organism.type, 'i18n');
  if (kpi.type !== 'i18n' || organism.type !== 'i18n') return;
  assert.notEqual(kpi.languages[0].startOffset, organism.languages[0].startOffset);
  assert.equal(kpi.languages[0].value, 'Indicadores do Turno');
  assert.equal(organism.languages[0].value, 'Ver dashboard operacional');
});

test('the page source alone resolves i18n text as dynamic — the shared file is required', () => {
  // This is the failure the user hit: the catalog is not in the page file.
  const fromPage = findTextOriginByOccurrence('Indicadores do Turno', PAGE_OF_SHARED, 0, 'pt');
  assert.equal(fromPage.type, 'dynamic');

  const fromShared = findTextOriginByOccurrence('Indicadores do Turno', SHARED, 0, 'pt', PAGE_OF_SHARED);
  assert.equal(fromShared.type, 'i18n');
});

test('buildTemplateMap reads dotted bracket access from the page template', () => {
  const map = buildTemplateMap(PAGE_OF_SHARED);

  assert.deepEqual(map.map((e) => e.i18nKey), [
    'section.dashboardWorkspace.sec-kpi-overview.title',
    'organism.dashboardWorkspace.getDashboard.title',
    null,
  ]);
  assert.deepEqual(map.map((e) => e.type), ['i18n', 'i18n', 'dynamic']);
});

test('occurrence ordering uses the page template while messages come from the shared file', () => {
  // Two keys, same value, ordered by their position in the PAGE template.
  const shared = SHARED.replace('"Ver dashboard operacional"', '"Indicadores do Turno"');

  const first = findTextOriginByOccurrence('Indicadores do Turno', shared, 0, 'pt', PAGE_OF_SHARED);
  const second = findTextOriginByOccurrence('Indicadores do Turno', shared, 1, 'pt', PAGE_OF_SHARED);

  assert.equal(first.type, 'i18n');
  assert.equal(second.type, 'i18n');
  if (first.type !== 'i18n' || second.type !== 'i18n') return;
  assert.equal(first.key, 'section.dashboardWorkspace.sec-kpi-overview.title');
  assert.equal(second.key, 'organism.dashboardWorkspace.getDashboard.title');
});

test('findTemplateExpression survives dots in the key (regex escaping)', () => {
  const origin = findTextOriginByKey('section.dashboardWorkspace.sec-kpi-overview.title', SHARED);
  assert.equal(origin.type, 'i18n');
  if (origin.type !== 'i18n') return;
  // No template in the shared file, so it falls back to the synthesized expression — the point is
  // that building the regex with an unescaped dotted key does not throw.
  assert.ok(origin.templateExpression.includes('section.dashboardWorkspace.sec-kpi-overview.title'));
});
