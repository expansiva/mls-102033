/// <mls fileReference="_102033_/l2/studio/studioMessages.test.ts" enhancement="_blank" />
// The two guards that keep the rule executable: no Portuguese outside the catalog, and no id without
// words. Both are cheap and both fail with the exact name of what is missing.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  ADD_GROUPS,
  ANIMATION_GROUPS,
  MISSING_IN_SOURCE,
  MOTION_SAFE_HINT,
  NOT_LOCATED,
  NO_OPTIONS,
  addableProperties,
  animationScreen,
  describeMissingLiteral,
  editScope,
  repeatedRenderWarning,
  resolveAnchor,
  splitUtilities,
  utilityLabel,
  utilityOptions,
  type AnimationScreen,
} from '/_102033_/l2/studio/studioClassEdit.js';
import { messageIds, t } from '/_102033_/l2/studio/studioMessages.js';

const STUDIO_DIR = fileURLToPath(new URL('.', import.meta.url));
/** The studio chrome lives next door and is part of the same rule. */
const CBE_DIR = fileURLToPath(new URL('../cbe/', import.meta.url));
const CATALOG = new Set(messageIds());

/** Every id the CORE can hand to whoever renders. */
function idsFromCore(): string[] {
  const ids = new Set<string>();
  const add = (id: string | undefined) => { if (id) ids.add(id); };

  for (const ref of [NO_OPTIONS, NOT_LOCATED, MISSING_IN_SOURCE, MOTION_SAFE_HINT, repeatedRenderWarning(2)]) {
    add(ref.id);
  }
  add(describeMissingLiteral('<div class=${x}>').id);
  add(describeMissingLiteral('<div class="a ${x}">').id);
  add(describeMissingLiteral('<div class="a">').id);
  add(editScope('x', 102040).refusal?.id);
  const ambiguous = resolveAnchor({ sourceCount: 3, domCount: 5, domIndex: 1 });
  if (!ambiguous.ok) add(ambiguous.reason.id);

  // The animation catalog: groups, options, custom hints and every screen.
  for (const group of ANIMATION_GROUPS) {
    add(group.title);
    add(group.rootLabel);
    add(group.custom?.hint);
    for (const option of group.options) {
      add(option.label);
      add(option.hint);
    }
  }
  for (const screen of ['root', 'continuous', 'hover', 'entrance', 'advanced'] as AnimationScreen[]) {
    const spec = animationScreen(screen);
    add(spec.title);
    add(spec.note);
    for (const row of spec.rows) {
      add(row.title);
      for (const option of row.state?.options ?? []) {
        add(option.label);
        add(option.hint);
      }
    }
  }

  // The "+" catalog: there a property id is a CHIP, so every entry needs words of its own. Two
  // contexts because the catalog is filtered by what the element is — a `grid` hides the display
  // entry, a plain element hides the ones that need a flex or a grid.
  for (const context of ['grid', 'span']) {
    for (const entry of addableProperties(context, { childCount: 4 })) add(entry.property);
  }
  for (const group of ADD_GROUPS) add(`group.${group}`);

  // Row labels: every family and variant this module can name.
  const samples = [
    'p-3', 'px-3', 'mx-auto', 'space-y-4', 'rounded-md', 'text-sm', 'text-gray-400', 'text-left',
    'border', 'border-b', 'border-gray-200', 'divide-y', 'bg-[var(--x,#fff)]', 'w-full', 'block',
    'grid-cols-2', 'justify-between', 'items-center', 'overflow-x-auto', 'min-h-full', 'animate-pulse',
    'transition', 'duration-500', 'delay-150', 'ease-out', 'translate-x-0', 'scale-105', 'rotate-3',
    'brightness-110', 'blur-sm', '[animation-duration:2s]', '[animation-iteration-count:3]',
    'hover:[animation-play-state:paused]', 'dark:text-gray-300', 'md:p-6', 'motion-safe:animate-spin',
    'italic', 'uppercase', 'truncate', 'tabular-nums', 'relative', 'cursor-pointer', 'z-10',
  ];
  for (const raw of samples) {
    const token = splitUtilities(raw)[0];
    const label = utilityLabel(token);
    add(label.property);
    for (const part of label.variants) add(part.id);
    add(utilityOptions(token).reason?.id);
  }

  return [...ids];
}

test('every id the core can produce has words in the catalog', () => {
  // The compiler already guarantees pt and en carry the SAME keys (message_en is typed as typeof
  // message_pt). What it cannot see is an id the code invents and the catalog never heard of — that
  // one would render as `prop.whatever` on screen.
  const missing = idsFromCore().filter((id) => !CATALOG.has(id));
  assert.deepEqual(missing, [], 'ids with no entry in the catalog');
});

test('every id the PANEL asks for has words too', () => {
  // The core is not the only source of ids: most of the panel's own words are written as `t('...')`
  // right in the markup, and a typo there renders the id on screen. The dynamic ones (`group.${…}`,
  // the property of a "+" chip) come through the core list above.
  const panel = readFileSync(`${STUDIO_DIR}classPickerPanel.ts`, 'utf8');
  const asked = [...panel.matchAll(/\bt\('([a-zA-Z][\w.]*)'/gu)].map((match) => match[1]);
  assert.ok(asked.length > 40, 'the scan found the calls');
  assert.deepEqual([...new Set(asked.filter((id) => !CATALOG.has(id)))], []);
});

test('the catalog answers in both languages, and the params land', () => {
  document.documentElement.lang = 'pt-br';
  assert.equal(t('prop.bgColor'), 'cor de fundo');
  assert.match(t('reason.repeatedRender', { count: 12 }), /12/u);
  assert.match(t('status.onFile', { file: 'page', folder: 'web' }), /page.*web/u);

  document.documentElement.lang = 'en';
  assert.equal(t('prop.bgColor'), 'background colour');
  assert.match(t('reason.repeatedRender', { count: 12 }), /12/u);

  // A language nobody wrote falls back instead of blanking the panel.
  document.documentElement.lang = 'fr';
  assert.ok(t('prop.bgColor').length > 0);

  // An unknown id shows itself: a visible `panel.whatever` is a bug report, an empty string is a
  // rendering glitch nobody can act on.
  assert.equal(t('panel.doesNotExist'), 'panel.doesNotExist');
  document.documentElement.lang = 'en';
});

test('the entrance note still says what the feature does NOT do', () => {
  // It was the note's whole job before the ids: the scroll trigger is a later phase, and a class edit
  // only shows for real after a reload.
  document.documentElement.lang = 'pt-br';
  const pt = t('anim.screen.entranceNote');
  assert.match(pt, /rolar/u);
  assert.match(pt, /F5|recarregar/u);

  document.documentElement.lang = 'en';
  const en = t('anim.screen.entranceNote');
  assert.match(en, /scroll/u);
  assert.match(en, /F5|reload/u);
});

test('the motion-safe hint explains BOTH states and where the preference lives', () => {
  for (const [lang, both, system] of [['pt-br', /Desmarcado/u, /sistema/u], ['en', /Unchecked/u, /system/u]] as const) {
    document.documentElement.lang = lang;
    const hint = t('panel.motionSafeHint');
    assert.match(hint, both, lang);
    assert.match(hint, system, lang);
    assert.doesNotMatch(hint, /motion-safe|prefers-reduced-motion/u, `${lang}: no jargon`);
  }
  document.documentElement.lang = 'en';
});

test('no Portuguese is left in the studio modules outside the catalog', () => {
  // The rule, as a test: fixed copy goes through i18n; a `throw` or a `console.*` is a developer
  // diagnostic and stays in English. Anything else in Portuguese is a string that escaped the catalog.
  const accented = /[ãõçáéíóúâêôàÃÕÇÁÉÍÓÚÂÊÔÀ]/u;
  const words = /\b(não|para|uma|este|esta|nesta|sem|ainda|deste|pelo|pela|aqui|elemento|classe|arquivo|tela|fonte|erro|falha|aguarde|clique|selecione|nenhum|nenhuma|todos|salvo)\b/iu;
  const offenders: string[] = [];

  const files = [
    ...readdirSync(STUDIO_DIR).map((file) => ({ file, dir: STUDIO_DIR })),
    ...readdirSync(CBE_DIR).map((file) => ({ file, dir: CBE_DIR })),
  ];

  for (const { file, dir } of files) {
    if (!file.endsWith('.ts') || file.startsWith('studioMessages')) continue;
    // Tests are exempt on purpose: they carry Portuguese needles (asserting that an old sentence is
    // GONE) and fixtures that imitate a page's own i18n. The rule is about copy that ships.
    if (file.endsWith('.test.ts')) continue;
    const source = readFileSync(`${dir}${file}`, 'utf8');
    source.split('\n').forEach((line, index) => {
      const code = line.trim();
      if (!code || code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
      for (const match of code.matchAll(/'([^'\n]{3,})'|"([^"\n]{3,})"/gu)) {
        const text = match[1] ?? match[2] ?? '';
        if (!accented.test(text) && !words.test(text)) continue;
        offenders.push(`${file}:${index + 1}: ${text.slice(0, 60)}`);
      }
    });
  }

  assert.deepEqual(offenders, [], 'strings in Portuguese outside the catalog');
});
