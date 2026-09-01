/// <mls fileReference="_102033_/l2/studio/studioClassEdit.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANIMATION_GROUPS,
  CASCADE_MAX_CHILDREN,
  MISSING_IN_SOURCE,
  NO_OPTIONS,
  applyAnimationCustom,
  applyCascade,
  readAnimationCustom,
  readCascade,
  removeAnimationCustom,
  removeCascade,
  MOTION_SAFE_HINT,
  activeAnimationGroups,
  activeAnimations,
  addUtility,
  animationScreen,
  applyAnimationGroup,
  applyAnimationOption,
  applyAnimationState,
  buildAnimationClass,
  hasUtility,
  readAnimationState,
  removeUtility,
  type IAnimationState,
  scanTemplateTree,
  NOT_LOCATED,
  chipAvailability,
  colorOf,
  composeUtility,
  repeatedRenderWarning,
  resolveStructuralAnchor,
  scanTemplateElements,
  parseVarValue,
  readDesignSystemRoles,
  roleLabel,
  roleOptions,
  roleVar,
  describeMissingLiteral,
  editScope,
  findClassAttrs,
  parseClassAttr,
  replaceUtility,
  resolveAnchor,
  splitUtilities,
  utilityLabel,
  utilityOptions,
  STYLE_CATEGORIES,
  diffLiterals,
  pasteCategories,
  pasteStyle,
  styleCategories,
} from '/_102033_/l2/studio/studioClassEdit.js';

/** A page shaped like the generator's own output (the real 102046 page uses exactly these patterns). */
const PAGE = [
  `import { html } from 'lit';`,
  ``,
  `class ApproveChangeOrder {`,
  `  render() {`,
  `    return html\``,
  `      <div class="max-w-6xl mx-auto px-4 py-6 space-y-6">`,
  `        <p class="rounded-md bg-[var(--surface-subtle,#f8fafc)] text-[var(--text-muted,#64748b)] p-3">Ok</p>`,
  `        <span class="px-3 py-2">a</span>`,
  `        <span class="px-3 py-2">b</span>`,
  `        <button data-class="px-9 py-9" panelClass="px-8 py-8" class="text-sm font-medium">go</button>`,
  `      </div>\`;`,
  `  }`,
  `}`,
].join('\n');

function tokenOf(literal: string, raw: string) {
  const token = splitUtilities(literal).find((candidate) => candidate.raw === raw);
  assert.ok(token, `token ${raw} not found in "${literal}"`);
  return token;
}

// --- splitUtilities ---

test('a class literal is split into tokens with family, value and variants', () => {
  const tokens = splitUtilities('rounded-md bg-[var(--surface-subtle,#f8fafc)] p-3 dark:hover:text-gray-300 -mt-2 flex');

  assert.deepEqual(tokens.map((t) => t.raw), [
    'rounded-md', 'bg-[var(--surface-subtle,#f8fafc)]', 'p-3', 'dark:hover:text-gray-300', '-mt-2', 'flex',
  ]);

  assert.deepEqual(
    tokens.map((t) => [t.family, t.value]),
    [['rounded', 'md'], ['bg', '[var(--surface-subtle,#f8fafc)]'], ['p', '3'], ['text', 'gray-300'], ['mt', '2'], ['', 'flex']],
  );

  const dark = tokenOf('dark:hover:text-gray-300', 'dark:hover:text-gray-300');
  assert.deepEqual(dark.variants, ['dark', 'hover']);
  assert.equal(dark.base, 'text-gray-300');

  const negative = tokens.find((t) => t.raw === '-mt-2');
  assert.equal(negative?.negative, true, 'the leading minus is not part of the family');

  assert.equal(tokens[1].arbitrary, true, 'a [..] value is arbitrary');
  assert.equal(tokens[5].family, '', 'a family with no vocabulary stays empty instead of being guessed');
});

test('the family is the longest known prefix, not the text before the last dash', () => {
  // `space-y-1` as `space` + `y-1`, or `max-w-6xl` as `max-w-6` + `xl`, would both be wrong.
  assert.deepEqual(
    splitUtilities('space-y-1 max-w-6xl gap-x-2 rounded-tl-lg mt-4 min-h-full').map((t) => [t.family, t.value]),
    [['space-y', '1'], ['max-w', '6xl'], ['gap-x', '2'], ['rounded-tl', 'lg'], ['mt', '4'], ['min-h', 'full']],
  );
});

test('a bare utility has an empty value, and composing it back drops the dash', () => {
  const [rounded, border] = splitUtilities('rounded border');
  assert.deepEqual([rounded.family, rounded.value], ['rounded', '']);
  assert.deepEqual([border.family, border.value], ['border', '']);
  assert.equal(composeUtility(rounded, ''), 'rounded');
  assert.equal(composeUtility(rounded, 'lg'), 'rounded-lg');
  assert.equal(composeUtility(tokenOf('dark:text-gray-300', 'dark:text-gray-300'), 'gray-500'), 'dark:text-gray-500');
  assert.equal(composeUtility(tokenOf('-mt-2', '-mt-2'), '4'), '-mt-4');
});

// --- utilityOptions ---

test('a scale family offers the current step plus its neighbours', () => {
  const options = utilityOptions(tokenOf('p-3', 'p-3'));
  assert.equal(options.kind, 'scale');
  assert.deepEqual(options.options, ['p-1', 'p-2', 'p-3', 'p-4', 'p-5']);
  assert.ok(options.options.includes('p-3'), 'the current one is always in the list, to be marked');
});

test('the window slides at the edges instead of shrinking', () => {
  assert.deepEqual(utilityOptions(tokenOf('p-0', 'p-0')).options, ['p-0', 'p-px', 'p-1', 'p-2', 'p-3']);
  assert.deepEqual(utilityOptions(tokenOf('p-24', 'p-24')).options, ['p-10', 'p-12', 'p-16', 'p-20', 'p-24']);
});

test('a value outside the curated scale is kept, in its numeric place', () => {
  // Half-steps exist but do not deserve a chip of their own for everyone; the current one does.
  const options = utilityOptions(tokenOf('p-1.5', 'p-1.5'));
  assert.deepEqual(options.options, ['p-px', 'p-1', 'p-1.5', 'p-2', 'p-3'], 'centred on the current value');
});

test('a colour family offers the shades of the SAME palette', () => {
  const options = utilityOptions(tokenOf('text-gray-400', 'text-gray-400'));
  assert.equal(options.kind, 'color');
  assert.deepEqual(options.options, ['text-gray-200', 'text-gray-300', 'text-gray-400', 'text-gray-500', 'text-gray-600']);

  // Variants survive, or the dark-mode chip would silently edit the light-mode class.
  assert.deepEqual(
    utilityOptions(tokenOf('dark:text-gray-300', 'dark:text-gray-300'), 1).options,
    ['dark:text-gray-200', 'dark:text-gray-300', 'dark:text-gray-400'],
  );
});

test('the same family serves size and colour, decided by the value', () => {
  assert.equal(utilityOptions(tokenOf('text-sm', 'text-sm')).kind, 'scale');
  assert.equal(utilityOptions(tokenOf('text-gray-400', 'text-gray-400')).kind, 'color');
  assert.deepEqual(utilityOptions(tokenOf('border', 'border')).options, ['border-0', 'border', 'border-2', 'border-4', 'border-8']);
  assert.equal(utilityOptions(tokenOf('border-gray-200', 'border-gray-200')).kind, 'color');
});

test('what has no honest vocabulary is offered nothing, with ONE reason', () => {
  // `isolate` and friends: no family, no list. The sentence is the same for every such case — the
  // differences between them are about what MY tables know, not about anything the user can act on.
  for (const raw of ['isolate', 'antialiased', 'mix-blend-multiply', 'font-sans']) {
    const options = utilityOptions(tokenOf(raw, raw));
    assert.equal(options.kind, 'none', raw);
    assert.deepEqual(options.options, [], raw);
    assert.deepEqual(options.reason, NO_OPTIONS, raw);
  }
  assert.equal(NO_OPTIONS.id, 'reason.noOptions');
  // The arbitrary value is where the design-system roles go — never a hex or a raw step.
  assert.equal(
    utilityOptions(tokenOf('bg-[var(--x,#fff)]', 'bg-[var(--x,#fff)]')).reason?.id,
    'reason.noDsTokens',
  );
});

// --- Enumerated families ---

test('a whole class offers the other members of its list', () => {
  // `flex` has no neighbours to window: its alternatives are `block`, `grid`, `hidden`. Measured on the
  // 102 real pages, these were 16% of every token and the panel had nothing to say about them.
  const display = utilityOptions(tokenOf('flex', 'flex'));
  assert.equal(display.kind, 'list');
  assert.deepEqual(display.options, ['block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'inline-grid', 'hidden']);
  assert.ok(display.options.includes('flex'), 'the current one is in the list, to be marked');

  assert.deepEqual(utilityOptions(tokenOf('italic', 'italic')).options, ['italic', 'not-italic']);
  assert.deepEqual(utilityOptions(tokenOf('relative', 'relative')).options, ['static', 'relative', 'absolute', 'fixed', 'sticky']);
  // The variant survives, like everywhere else.
  assert.deepEqual(
    utilityOptions(tokenOf('md:hidden', 'md:hidden')).options.slice(0, 2),
    ['md:block', 'md:inline-block'],
  );
});

test('an enumerated VALUE is shown in full, not as a window', () => {
  assert.deepEqual(
    utilityOptions(tokenOf('justify-between', 'justify-between')).options,
    ['justify-start', 'justify-center', 'justify-end', 'justify-between', 'justify-around', 'justify-evenly'],
  );
  assert.deepEqual(
    utilityOptions(tokenOf('overflow-x-auto', 'overflow-x-auto')).options,
    ['overflow-x-auto', 'overflow-x-hidden', 'overflow-x-visible', 'overflow-x-scroll', 'overflow-x-clip'],
  );
  assert.equal(utilityOptions(tokenOf('grid-cols-2', 'grid-cols-2')).kind, 'list');
  assert.equal(utilityOptions(tokenOf('animate-pulse', 'animate-pulse')).options.includes('animate-spin'), true);
});

test('a size is both a keyword and a step — the value decides', () => {
  // `h-full` is a keyword; `h-24` is a step of the spacing scale. Same family, two vocabularies.
  assert.equal(utilityOptions(tokenOf('h-full', 'h-full')).kind, 'list');
  assert.deepEqual(utilityOptions(tokenOf('h-full', 'h-full')).options, ['h-auto', 'h-full', 'h-screen', 'h-fit', 'h-min', 'h-max']);
  const numeric = utilityOptions(tokenOf('h-24', 'h-24'));
  assert.equal(numeric.kind, 'scale');
  assert.ok(numeric.options.includes('h-24'));
  assert.ok(numeric.options.includes('h-20'));
});

test('the dual families keep their third meaning: alignment and sides', () => {
  assert.deepEqual(
    utilityOptions(tokenOf('text-left', 'text-left')).options,
    ['text-left', 'text-center', 'text-right', 'text-justify', 'text-start', 'text-end'],
  );
  assert.deepEqual(utilityOptions(tokenOf('border-b', 'border-b')).options, ['border-t', 'border-r', 'border-b', 'border-l', 'border-x', 'border-y']);
  assert.deepEqual(utilityOptions(tokenOf('divide-y', 'divide-y')).options, ['divide-x', 'divide-y']);
  // And the other meanings still work.
  assert.equal(utilityOptions(tokenOf('text-sm', 'text-sm')).kind, 'scale');
  assert.equal(utilityOptions(tokenOf('text-gray-400', 'text-gray-400')).kind, 'color');
  assert.equal(utilityOptions(tokenOf('border-gray-200', 'border-gray-200')).kind, 'color');
  assert.equal(utilityOptions(tokenOf('border', 'border')).kind, 'scale');
});

test('a margin takes auto, a padding does not', () => {
  // `mx-auto` is 57x in the real pages; `p-auto` is not a thing.
  const margin = utilityOptions(tokenOf('mx-auto', 'mx-auto'));
  assert.equal(margin.kind, 'scale');
  assert.ok(margin.options.includes('mx-auto'));
  assert.equal(utilityOptions(tokenOf('p-auto', 'p-auto')).kind, 'none');
});

// --- replaceUtility ---

test('replacing a token keeps every other character of the literal', () => {
  const literal = 'rounded-md bg-[var(--surface-subtle,#f8fafc)]  p-3';
  assert.equal(
    replaceUtility(literal, 'p-3', 'p-4'),
    'rounded-md bg-[var(--surface-subtle,#f8fafc)]  p-4',
    'the double space is not normalised — that diff noise would land in the source',
  );
  assert.equal(replaceUtility(literal, 'rounded-md', 'rounded-lg'), 'rounded-lg bg-[var(--surface-subtle,#f8fafc)]  p-3');
  assert.equal(replaceUtility(literal, 'nope', 'p-9'), literal, 'an absent token changes nothing');
});

test('a repeated token is disambiguated by index', () => {
  const literal = 'p-3 mx-auto p-3';
  assert.equal(replaceUtility(literal, 'p-3', 'p-4', 2), 'p-3 mx-auto p-4');
  assert.equal(replaceUtility(literal, 'p-3', 'p-4', 0), 'p-4 mx-auto p-3');
  assert.equal(replaceUtility(literal, 'p-3', 'p-4'), 'p-4 mx-auto p-3', 'without the index, the first match wins');
});

// --- findClassAttrs / parseClassAttr ---

test('class literals are found in source order, and the offsets bracket the literal exactly', () => {
  const matches = findClassAttrs(PAGE, 'px-3 py-2');
  assert.equal(matches.length, 2);
  for (const match of matches) {
    assert.equal(PAGE.slice(match.startOffset, match.endOffset), 'px-3 py-2');
    assert.equal(PAGE[match.startOffset - 1], '"', 'startOffset sits right after the opening quote');
    assert.equal(PAGE[match.endOffset], '"', 'endOffset sits on the closing quote');
  }
  assert.ok(matches[0].startOffset < matches[1].startOffset);

  const second = parseClassAttr(PAGE, 'px-3 py-2', 1);
  assert.equal(second?.startOffset, matches[1].startOffset);
  assert.equal(parseClassAttr(PAGE, 'px-3 py-2', 2), null, 'a nonexistent occurrence is null, not a guess');
});

test('an attribute merely ENDING in class is not a class attribute', () => {
  // Rewriting `data-class` or `panelClass` would corrupt a component's props.
  assert.deepEqual(findClassAttrs(PAGE, 'px-9 py-9'), []);
  assert.deepEqual(findClassAttrs(PAGE, 'px-8 py-8'), []);
  assert.equal(findClassAttrs(PAGE, 'text-sm font-medium').length, 1);
});

test('arbitrary values with regex metacharacters are matched literally', () => {
  const literal = 'rounded-md bg-[var(--surface-subtle,#f8fafc)] text-[var(--text-muted,#64748b)] p-3';
  const matches = findClassAttrs(PAGE, literal);
  assert.equal(matches.length, 1);
  assert.equal(PAGE.slice(matches[0].startOffset, matches[0].endOffset), literal);
});

test('single quotes are supported and the quote is reported', () => {
  const source = `<div class='p-3 flex'></div>`;
  const [match] = findClassAttrs(source, 'p-3 flex');
  assert.equal(match.quote, "'");
  assert.equal(source.slice(match.startOffset, match.endOffset), 'p-3 flex');
});

// --- describeMissingLiteral ---

test('a computed class attribute is named as such, not reported as "not found"', () => {
  // Ids, not sentences: the words live in studioMessages, and asserting them here would only make the
  // tests break every time the copy is polished.
  assert.equal(describeMissingLiteral('<div class=${this.cls}>').id, 'reason.computedClass');
  assert.equal(describeMissingLiteral('<div class="${classMap(this.cls)}">').id, 'reason.computedClass');
  assert.equal(describeMissingLiteral('<div class="p-3 ${this.extra}">').id, 'reason.mixedClass');
  assert.deepEqual(describeMissingLiteral(PAGE), MISSING_IN_SOURCE);
});

// --- resolveAnchor ---

test('M = 1 and N = 1: the only occurrence, no warning', () => {
  assert.deepEqual(resolveAnchor({ sourceCount: 1, domCount: 1, domIndex: 0 }), { ok: true, occurrence: 0 });
});

test('M = 1 and N > 1: edits, and warns that it renders N times', () => {
  const result = resolveAnchor({ sourceCount: 1, domCount: 12, domIndex: 7 });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.occurrence, 0);
  assert.deepEqual(result.ok ? result.warning : undefined, repeatedRenderWarning(12));
  // The count travels as a PARAM: the sentence around it is the catalog's business, and pt and en put
  // the number in different places.
  assert.deepEqual(repeatedRenderWarning(12), { id: 'reason.repeatedRender', params: { count: 12 } });
});

test('M = N: the DOM index maps straight to the occurrence', () => {
  assert.deepEqual(resolveAnchor({ sourceCount: 3, domCount: 3, domIndex: 2 }), { ok: true, occurrence: 2 });
  assert.deepEqual(resolveAnchor({ sourceCount: 2, domCount: 2, domIndex: 0 }), { ok: true, occurrence: 0 });
  // An index outside the range is a refusal, never a clamp onto occurrence 0.
  assert.equal(resolveAnchor({ sourceCount: 2, domCount: 2, domIndex: 5 }).ok, false);
});

test('1 < M < N and M > N are refused, never guessed — and the refusal says what to DO', () => {
  for (const input of [
    { sourceCount: 2, domCount: 12, domIndex: 3 },
    { sourceCount: 5, domCount: 2, domIndex: 1 },
  ]) {
    const result = resolveAnchor(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.deepEqual(!result.ok ? result.reason : undefined, NOT_LOCATED);
  }
  // One id for every "I cannot place this element": the differences between the old four
  // sentences were about what the code knows, not about anything the user can act on.
  assert.equal(NOT_LOCATED.id, 'reason.notLocated');
  assert.equal(NOT_LOCATED.params, undefined, 'no counts in the refusal');
});

test('M = 0 has nothing to edit', () => {
  assert.equal(resolveAnchor({ sourceCount: 0, domCount: 1, domIndex: 0 }).ok, false);
});

// --- editScope ---

test('a molecule element is refused with the shared-scope reason', () => {
  const scope = editScope('_102040_/l2/mlAlertModal', 102040);
  assert.equal(scope.shared, true);
  // The project travels as a param: which one it is matters, and only the catalog knows how to say it.
  assert.deepEqual(scope.refusal, { id: 'reason.moleculeShared', params: { project: 102040 } });
});

test('a page element carries no refusal, and names the file that will change', () => {
  const scope = editScope('_102046_buildFlowFsm/web/desktop/page11/approveChangeOrder', null);
  assert.equal(scope.shared, false);
  assert.equal(scope.refusal, undefined);
  assert.match(scope.file, /approveChangeOrder/u);
});

// --- chipAvailability (the JIT dependency) ---

test('a class absent from the built css is offered only while the JIT is live', () => {
  // In the built css: safe everywhere.
  assert.equal(chipAvailability(false, true, true), 'offer');
  assert.equal(chipAvailability(false, true, false), 'offer');
  // Absent + JIT: works on screen now, only reaches the client after the next publish.
  assert.equal(chipAvailability(false, false, true), 'jit-only');
  // Absent + no JIT: hidden. A chip that drops the utility silently is worse than no chip.
  assert.equal(chipAvailability(false, false, false), 'hidden');
  // The current class is always shown — it is what the element already has.
  assert.equal(chipAvailability(true, false, false), 'offer');
});

// --- Design system roles ---

const DS_CSS = [
  ':root{',
  '\t--page-bg: #eef1f5;',
  '\t--surface-bg: #ffffff;',
  '\t--surface-subtle: #f8fafc;',
  '\t--text-default: #0f172a;',
  '\t--text-muted: #64748b;',
  '\t--border-default: #e2e8f0;',
  '\t--button-primary-bg: #2563eb;',
  '\t--button-primary-text: #ffffff;',
  '\t--shadow-soft: rgb(0 0 0 / 0.1);',
  '\t--ml-alert-bg: var(--surface-bg);',
  '}',
  '[data-theme="dark"], :root.dark {',
  '\t--page-bg: #0b1220;',
  '\t--text-muted: #94a3b8;',
  '}',
].join('\n');

test('the design system roles come from the LIGHT block, without the molecule tokens', () => {
  const roles = readDesignSystemRoles(DS_CSS);
  assert.deepEqual(roles, [
    '--page-bg', '--surface-bg', '--surface-subtle', '--text-default', '--text-muted',
    '--border-default', '--button-primary-bg', '--button-primary-text', '--shadow-soft',
  ]);
  assert.equal(roles.includes('--ml-alert-bg'), false, 'molecule reconciliation tokens are not page roles');
  // The dark block repeats the same names — taking both would duplicate every role.
  assert.equal(roles.filter((role) => role === '--page-bg').length, 1);
});

test('an arbitrary var() value is parsed into role and fallback', () => {
  assert.deepEqual(parseVarValue('[var(--surface-subtle,#f8fafc)]'), { cssVar: '--surface-subtle', fallback: '#f8fafc' });
  assert.deepEqual(parseVarValue('[var(--surface-bg)]'), { cssVar: '--surface-bg', fallback: '' });
  assert.equal(parseVarValue('[12px]'), null, 'not every arbitrary value is a token');
  assert.equal(parseVarValue('gray-400'), null);
});

test('the roles offered match the FAMILY, current first', () => {
  const roles = readDesignSystemRoles(DS_CSS);
  const resolve = (cssVar: string) => ({
    '--page-bg': '#eef1f5',
    '--surface-bg': '#ffffff',
    '--surface-subtle': '#f8fafc',
    '--button-primary-bg': '#2563eb',
    '--text-default': '#0f172a',
    '--text-muted': '#64748b',
    '--border-default': '#e2e8f0',
    '--button-primary-text': '#ffffff',
  } as Record<string, string>)[cssVar] ?? '';

  const bg = utilityOptions(tokenOf('bg-[var(--surface-subtle,#f8fafc)]', 'bg-[var(--surface-subtle,#f8fafc)]'), 2, roles, resolve);
  assert.equal(bg.kind, 'role');
  assert.equal(bg.options[0], 'bg-[var(--surface-subtle,#f8fafc)]', 'the current role leads the list');
  assert.ok(bg.options.includes('bg-[var(--page-bg,#eef1f5)]'));
  assert.ok(bg.options.includes('bg-[var(--button-primary-bg,#2563eb)]'));
  // A text role has no business in a background picker — the DS naming rule is what makes this safe.
  assert.equal(bg.options.some((option) => option.includes('--text-')), false);
  // `--surface-subtle` does not end in `-bg`, so it only shows up because it is the CURRENT one.
  assert.equal(bg.options.filter((option) => option.includes('--surface-subtle')).length, 1);

  const text = utilityOptions(tokenOf('text-[var(--text-muted,#64748b)]', 'text-[var(--text-muted,#64748b)]'), 2, roles, resolve);
  assert.ok(text.options.includes('text-[var(--text-default,#0f172a)]'));
  assert.ok(text.options.includes('text-[var(--button-primary-text,#ffffff)]'));
  assert.equal(text.options.some((option) => option.endsWith('-bg,#eef1f5)]')), false);

  const border = utilityOptions(tokenOf('border-[var(--border-default,#e2e8f0)]', 'border-[var(--border-default,#e2e8f0)]'), 2, roles, resolve);
  assert.deepEqual(border.options, ['border-[var(--border-default,#e2e8f0)]']);
});

test('the fallback is re-resolved from the NEW role, never carried over', () => {
  const roles = ['--surface-subtle', '--surface-bg'];
  const options = roleOptions(
    tokenOf('bg-[var(--surface-subtle,#f8fafc)]', 'bg-[var(--surface-subtle,#f8fafc)]'),
    roles,
    (cssVar) => (cssVar === '--surface-bg' ? '#ffffff' : '#f8fafc'),
  );
  // Keeping `#f8fafc` under `--surface-bg` would render the OLD colour whenever the DS fails to load.
  assert.ok(options.includes('bg-[var(--surface-bg,#ffffff)]'));
  assert.equal(options.some((option) => option === 'bg-[var(--surface-bg,#f8fafc)]'), false);
});

test('a value with whitespace is offered WITHOUT a fallback instead of a broken class', () => {
  const options = roleOptions(
    tokenOf('bg-[var(--surface-bg,#fff)]', 'bg-[var(--surface-bg,#fff)]'),
    ['--surface-bg', '--overlay-backdrop-bg'],
    (cssVar) => (cssVar === '--overlay-backdrop-bg' ? 'rgb(0 0 0 / 0.4)' : '#ffffff'),
  );
  assert.equal(options.includes('bg-[var(--overlay-backdrop-bg)]'), true, 'no fallback beats an unparseable one');
  assert.equal(options.some((option) => option.includes('rgb(')), false);
});

test('with no design system loaded, an arbitrary value stays read-only with a reason', () => {
  const options = utilityOptions(tokenOf('bg-[var(--surface-bg,#fff)]', 'bg-[var(--surface-bg,#fff)]'), 2, []);
  assert.equal(options.kind, 'none');
  assert.equal(options.reason?.id, 'reason.noDsTokens');
});

test('the role label is what the user reads', () => {
  assert.equal(roleLabel('bg-[var(--surface-subtle,#f8fafc)]'), 'surface-subtle');
  assert.equal(roleLabel('dark:text-[var(--text-muted)]'), 'text-muted');
});

// --- scanTemplateElements / resolveStructuralAnchor ---

// The two shapes that matter, both taken from the real pages: a header row with identical `<th>`s (the
// case counting called "ambiguous"), and a body row inside `${rows.map(...)}` with an event binding
// whose arrow contains a `>` and whose class mixes a literal with an expression.
const TABLE = [
  `class Catalogue {`,
  `  render() {`,
  `    return html\`<section class="p-4">`,
  `      <table class="min-w-full text-sm">`,
  `        <thead><tr class="border-b">`,
  `          <th class="px-3 py-2">a</th><th class="px-3 py-2">b</th><th class="px-3 py-2">c</th>`,
  `        </tr></thead>`,
  `        <tbody>\${rows.map((item: Array<string>) => html\`<tr class="border-b \${item.sel ? 'bg-x' : ''}">`,
  `          <td class="px-3 py-2"><button class="p-2" @click=\${() => { if (window.confirm(\\\`\${item.name}\\\`)) { this.go(item); } }}>x</button></td>`,
  `          <td class="px-3 py-2">\${item.qty}</td>`,
  `        </tr>\`)}</tbody>`,
  `      </table>`,
  `    </section>\`;`,
  `  }`,
  `}`,
].join('\n');

function elementsOf(source: string) {
  return scanTemplateElements(source);
}

function treeOf(source: string) {
  return scanTemplateTree(source);
}

test('the scanner reads tags, nesting and the class literal — and nothing from the TypeScript', () => {
  const elements = elementsOf(TABLE);

  // `Array<string>` inside a ${...} is NOT an element: a phantom sibling shifts every index after it.
  assert.equal(elements.some((element) => element.tag === 'string'), false);

  assert.deepEqual(
    elements.map((element) => element.tag),
    ['section', 'table', 'thead', 'tr', 'th', 'th', 'th', 'tbody', 'tr', 'td', 'button', 'td'],
  );

  // Offsets slice the literal back out, quotes excluded.
  for (const element of elements) {
    if (element.literal === null) continue;
    assert.equal(TABLE.slice(element.literalStart, element.literalEnd), element.literal);
    assert.equal(TABLE[element.literalStart - 1], '"');
    assert.equal(TABLE[element.literalEnd], '"');
  }

  // Nesting: every child sits inside its parent's span.
  for (const element of elements) {
    if (element.parent < 0) continue;
    const parent = elements[element.parent];
    assert.ok(element.openStart > parent.openStart, `${element.tag} starts after ${parent.tag}`);
    assert.ok(element.end <= parent.end, `${element.tag} ends inside ${parent.tag}`);
  }

  const [, , thead, headRow] = elements;
  assert.equal(elements[thead.parent].tag, 'table');
  assert.equal(headRow.tag, 'tr');
  assert.equal(elements.filter((element) => element.tag === 'th').every((th) => th.inExpression), false);

  // What lives inside ${...} is flagged: one source node, many rendered elements.
  const bodyRow = elements.find((element) => element.tag === 'tr' && element.inExpression);
  assert.ok(bodyRow, 'the mapped row is flagged as being inside an expression');
  assert.equal(elements[bodyRow.parent].tag, 'tbody', 'and its parent is still the tbody');
});

test('an arrow function in a binding does not end the open tag early', () => {
  // `@click=${() => { … }}`: the `>` of the arrow used to close the tag several lines too soon, and
  // everything after it was scanned as markup with corrupted nesting.
  const elements = elementsOf(TABLE);
  const button = elements.find((element) => element.tag === 'button');
  assert.ok(button);
  assert.equal(button.literal, 'p-2');
  assert.equal(elements[button.parent].tag, 'td');
  // The `<td>` after the button's one is still a sibling of it, not a descendant.
  const tds = elements.filter((element) => element.tag === 'td');
  assert.equal(tds.length, 2);
  assert.equal(tds[0].parent, tds[1].parent);
});

test('a class attribute that mixes literal and expression is read as the literal it contains', () => {
  const elements = elementsOf(TABLE);
  const bodyRow = elements.find((element) => element.tag === 'tr' && element.inExpression);
  assert.equal(bodyRow?.literal, "border-b ${item.sel ? 'bg-x' : ''}");
});

test('the walk resolves identical siblings by POSITION, which counting could not', () => {
  const elements = elementsOf(TABLE);
  const path = [
    { tag: 'section', index: 0, count: 1 },
    { tag: 'table', index: 0, count: 1 },
    { tag: 'thead', index: 0, count: 1 },
    { tag: 'tr', index: 0, count: 1 },
    { tag: 'th', index: 2, count: 3 },
  ];
  const anchor = resolveStructuralAnchor({ elements, links: [] }, path);
  assert.equal(anchor.ok, true);
  // Three `<th class="px-3 py-2">` in the file plus two `<td>` with the same string: counting refuses.
  const ths = elements.filter((element) => element.tag === 'th');
  assert.equal(anchor.ok && anchor.element, ths[2]);
  assert.equal(anchor.ok && anchor.renders, 1);
  assert.equal(findClassAttrs(TABLE, 'px-3 py-2').length, 5, 'the same literal appears 5x in the file');
});

test('one source node rendering N rows resolves, and reports how many', () => {
  const elements = elementsOf(TABLE);
  // The DOM has 12 `<tr>` under the tbody; the template has one, inside the ${...}.
  const anchor = resolveStructuralAnchor({ elements, links: [] }, [
    { tag: 'section', index: 0, count: 1 },
    { tag: 'table', index: 0, count: 1 },
    { tag: 'tbody', index: 0, count: 1 },
    { tag: 'tr', index: 6, count: 12 },
    { tag: 'td', index: 1, count: 2 },
  ]);
  assert.equal(anchor.ok, true);
  assert.equal(anchor.ok && anchor.element.tag, 'td');
  assert.equal(anchor.ok && anchor.renders, 12, 'so the panel can warn that the change hits 12 rows');
});

test('the walk refuses instead of guessing when the counts do not line up', () => {
  const elements = elementsOf(TABLE);
  // Two source `<td>` against three on screen: a conditional added one, and there is no way to know
  // which is which.
  const anchor = resolveStructuralAnchor({ elements, links: [] }, [
    { tag: 'section', index: 0, count: 1 },
    { tag: 'table', index: 0, count: 1 },
    { tag: 'tbody', index: 0, count: 1 },
    { tag: 'tr', index: 0, count: 1 },
    { tag: 'td', index: 2, count: 3 },
  ]);
  assert.equal(anchor.ok, false);

  // A tag that is not there at all.
  assert.equal(resolveStructuralAnchor({ elements, links: [] }, [{ tag: 'nav', index: 0, count: 1 }]).ok, false);
  // And an empty path is not "the first element".
  assert.equal(resolveStructuralAnchor({ elements, links: [] }, []).ok, false);
});

test('a helper template is LINKED where it is called — without that, 87% of the page is unreachable', () => {
  // Measured on the 102 real pages: 92% split render() into helpers and 87% of all elements live
  // outside the first template. The raw scan sees a forest; the tree links it back together.
  const source = [
    'render() { return html`<section class="p-4">${this.renderForm()}<footer class="mt-4">x</footer></section>`; }',
    'renderForm() { return html`<form class="grid gap-6"><input class="px-3 py-2"></form>`; }',
  ].join('\n');

  const elements = elementsOf(source);
  const rawForm = elements.find((element) => element.tag === 'form');
  assert.equal(rawForm?.parent, -1, 'the raw scan still has the helper as a root of its own');

  const tree = treeOf(source);
  assert.equal(tree.links.length, 1);
  assert.equal(tree.elements[tree.links[0].root].tag, 'form');
  assert.equal(tree.elements[tree.links[0].parent].tag, 'section');

  const anchor = resolveStructuralAnchor(tree, [
    { tag: 'section', index: 0, count: 1 },
    { tag: 'form', index: 0, count: 1 },
    { tag: 'input', index: 0, count: 1 },
  ]);
  assert.equal(anchor.ok, true);
  assert.equal(anchor.ok && anchor.element.literal, 'px-3 py-2');

  // The helper is mounted where it is CALLED, so it comes before the footer even though its source
  // sits after the whole render().
  const footer = resolveStructuralAnchor(tree, [
    { tag: 'section', index: 0, count: 1 },
    { tag: 'footer', index: 0, count: 1 },
  ]);
  assert.equal(footer.ok && footer.element.literal, 'mt-4');
});

test('a helper called twice is one source node rendering twice, and says so', () => {
  const source = [
    'render() { return html`<div class="grid">${this.card(a)}${this.card(b)}</div>`; }',
    'card(item) { return html`<article class="rounded-md p-4">${item}</article>`; }',
  ].join('\n');
  const tree = treeOf(source);
  assert.equal(tree.links.length, 2, 'two mounts of the same root');
  assert.equal(tree.links[0].root, tree.links[1].root);

  const anchor = resolveStructuralAnchor(tree, [
    { tag: 'div', index: 0, count: 1 },
    { tag: 'article', index: 1, count: 2 },
  ]);
  assert.equal(anchor.ok, true);
  assert.equal(anchor.ok && anchor.element.literal, 'rounded-md p-4');
  // Both chips edit the same line, so the panel warns instead of pretending it is only this one.
  assert.equal(anchor.ok && anchor.renders, 2);
});

test('a method with no template, and a template no one calls, are simply not linked', () => {
  const source = [
    'render() { return html`<div class="a">${this.label()}</div>`; }',
    'label() { return this.msg.title; }',
    'renderUnused() { return html`<span class="b">x</span>`; }',
  ].join('\n');
  const tree = treeOf(source);
  assert.deepEqual(tree.links, []);
  // The orphan template stays a root: reachable only if the DOM path happens to start there.
  assert.equal(tree.elements.filter((element) => element.parent === -1).length, 2);
});

test('void and self-closing elements do not swallow their siblings', () => {
  const elements = elementsOf('html`<div class="a"><input class="b"><br><img class="c"/><span class="d">x</span></div>`');
  assert.deepEqual(elements.map((element) => element.tag), ['div', 'input', 'br', 'img', 'span']);
  for (const element of elements.slice(1)) {
    assert.equal(element.parent, 0, `${element.tag} is a child of the div`);
  }
});

// --- Adding / removing (the animation tab's gesture) ---

test('adding and removing a class keeps the rest of the literal untouched', () => {
  assert.equal(addUtility('rounded-md  p-3', 'animate-pulse'), 'rounded-md  p-3 animate-pulse');
  assert.equal(addUtility('', 'animate-pulse'), 'animate-pulse', 'an element with no class starts one');
  assert.equal(addUtility('p-3 animate-pulse', 'animate-pulse'), 'p-3 animate-pulse', 'adding twice is a no-op');

  assert.equal(removeUtility('rounded-md  p-3 animate-pulse', 'animate-pulse'), 'rounded-md  p-3');
  assert.equal(removeUtility('animate-pulse p-3', 'animate-pulse'), 'p-3');
  assert.equal(removeUtility('p-3 animate-pulse rounded', 'animate-pulse'), 'p-3 rounded');
  assert.equal(removeUtility('animate-pulse', 'animate-pulse'), '');
  assert.equal(removeUtility('p-3', 'animate-spin'), 'p-3', 'removing what is not there changes nothing');
});

test('a class counts as present with or without its variant prefix', () => {
  assert.equal(hasUtility('p-3 animate-pulse', 'animate-pulse'), true);
  assert.equal(hasUtility('p-3 motion-safe:animate-pulse', 'animate-pulse'), true);
  assert.equal(hasUtility('p-3', 'animate-pulse'), false);
});

// --- Animation vocabulary ---

test('the vocabulary is only what really exists', () => {
  const classes = ANIMATION_GROUPS.flatMap((group) => group.options).flatMap((option) => option.classes);
  // Tailwind's four keyframes — already the house standard (animate-pulse is used 51x by the client
  // pages, animate-spin 51x by the molecules). Anything invented would be a DEAD class: there are no
  // keyframes for it anywhere, and the JIT does not invent them.
  assert.deepEqual(
    classes.filter((cls) => cls.startsWith('animate-')).sort(),
    ['animate-bounce', 'animate-ping', 'animate-pulse', 'animate-spin'],
  );
  assert.equal(classes.some((cls) => /animate-(fade|slide|zoom)/u.test(cls)), false, 'no invented keyframes');
  // Duration comes from Tailwind's scale: the design system's transition-* tokens are inverted in the
  // real projects (fast: 0.5s, slow: 0.2s) and the picker must not spread that silently.
  assert.equal(classes.some((cls) => cls.includes('transition-fast') || cls.includes('transition-slow')), false);
  for (const option of ANIMATION_GROUPS.flatMap((group) => group.options)) {
    assert.match(option.hint, /^anim\.\w+\.hint$/u, `${option.id} needs a hint id — a label cannot describe motion`);
    assert.match(option.label, /^anim\.\w+\.label$/u, option.id);
  }
  // Every group with a root chip has to know what that chip turns on.
  for (const group of ANIMATION_GROUPS) {
    if (group.kind !== 'hover') continue;
    assert.ok(group.defaultOptionId, `${group.id} needs a default for the root screen`);
    assert.ok(group.options.some((option) => option.id === group.defaultOptionId));
  }
});

// --- Screens ---

test('the root screen is short: the families and a way into each', () => {
  const root = animationScreen('root');
  assert.equal(root.back, undefined, 'the root has nowhere to go back to');
  assert.equal(root.advanced, 'advanced', 'tuning lives behind Avançado, not on the first screen');
  assert.notEqual(root.motionSwitch, true, 'the switch is a setting: it lives in Avançado, not here');
  assert.deepEqual(root.rows.map((row) => row.more), ['entrance', 'continuous', 'hover']);

  // Duration and curve are NOT on the first screen any more.
  const titles = root.rows.map((row) => row.title);
  assert.equal(titles.includes('anim.group.duration'), false);
  assert.equal(titles.includes('anim.group.easing'), false);

  // The hover row is one chip per EFFECT (its intensities are alternatives, shown in the full screen).
  const hoverRow = root.rows.find((row) => row.more === 'hover');
  assert.equal(hoverRow?.mode, 'groups');
  assert.deepEqual(hoverRow?.groups?.map((group) => group.id), ['scale', 'lift', 'fade', 'shadow', 'rotate', 'bright']);
});

test('each full screen configures its family and can come back', () => {
  const continuous = animationScreen('continuous');
  assert.equal(continuous.back, 'root');
  assert.deepEqual(continuous.rows.map((row) => row.title), [
    'anim.group.continuous', 'anim.group.speed', 'anim.group.repeat',
    'anim.state.trigger.title', 'anim.group.pause',
  ]);
  // There are only four keyframes in Tailwind, so the full screen is CONFIGURATION, not more of them.
  assert.equal(continuous.rows[0].group?.options.length, 4);

  const hover = animationScreen('hover');
  assert.equal(hover.back, 'root');
  assert.deepEqual(hover.rows.map((row) => row.title), [
    'anim.group.scale', 'anim.group.lift', 'anim.group.fade', 'anim.group.shadow',
    'anim.group.rotate', 'anim.group.bright', 'anim.state.when.title',
  ]);

  const advanced = animationScreen('advanced');
  assert.equal(advanced.back, 'root');
  assert.deepEqual(advanced.rows.map((row) => row.title), [
    'anim.group.scope', 'anim.group.duration', 'anim.group.easing', 'anim.group.delay',
  ]);
  // The switch is on the screen where movement gets tuned, not only on the root.
  assert.equal(advanced.motionSwitch, true);
});

// --- Applying ---

test('the motion-safe switch explains itself, and says what BOTH states do', () => {
  // The label names the switch; the hint says what happens and WHERE the preference lives — nobody can
  // infer that from a checkbox. The words themselves are asserted in the catalog test.
  assert.equal(MOTION_SAFE_HINT.id, 'panel.motionSafeHint');
  // Exactly one screen offers the switch, and the explanation goes with it.
  assert.equal(animationScreen('advanced').motionSwitch, true);
  for (const screen of ['root', 'continuous', 'hover'] as const) {
    assert.notEqual(animationScreen(screen).motionSwitch, true, screen);
  }
});

test('the continuous animations are exclusive: picking one drops the other', () => {
  const withSpin = applyAnimationOption('p-3', 'spin');
  assert.equal(withSpin, 'p-3 animate-spin');

  const swapped = applyAnimationOption(withSpin, 'pulse');
  assert.equal(swapped, 'p-3 animate-pulse', 'two keyframes at once would fight each other');
  assert.deepEqual(activeAnimations(swapped), ['pulse']);
});

test('clicking the active chip turns it off', () => {
  const on = applyAnimationOption('p-3', 'bounce');
  assert.equal(applyAnimationOption(on, 'bounce'), 'p-3');
});

test('speed and repetitions are arbitrary properties, exclusive within themselves', () => {
  // `duration-*` drives TRANSITIONS, not keyframes: retiming an animation needs the arbitrary property.
  let literal = applyAnimationOption('p-3 animate-spin', 'sp2');
  assert.equal(literal, 'p-3 animate-spin [animation-duration:2s]');
  literal = applyAnimationOption(literal, 'sp05');
  assert.equal(literal, 'p-3 animate-spin [animation-duration:0.5s]');

  literal = applyAnimationOption(literal, 'rp2');
  assert.deepEqual(activeAnimations(literal).sort(), ['rp2', 'sp05', 'spin']);
  assert.equal(literal.includes('[animation-iteration-count:2]'), true);
});

test('a hover effect brings `transition` with it, and never takes it away', () => {
  const withScale = applyAnimationOption('p-3', 'scale105');
  assert.equal(withScale, 'p-3 hover:scale-105 transition');

  // Different effects stack; intensities of the SAME effect replace each other.
  const both = applyAnimationOption(withScale, 'lift05');
  assert.deepEqual(activeAnimations(both).sort(), ['lift05', 'scale105']);
  assert.equal(both.split(' ').filter((cls) => cls === 'transition').length, 1, 'transition is not added twice');

  const stronger = applyAnimationOption(both, 'scale110');
  assert.deepEqual(activeAnimations(stronger).sort(), ['lift05', 'scale110']);
  assert.equal(stronger.includes('scale-105'), false);

  // Turning the effects off leaves `transition` alone: it may have been the user's own.
  const off = applyAnimationOption(applyAnimationOption(stronger, 'lift05'), 'scale110');
  assert.equal(off, 'p-3 transition');
});

test('an existing scoped transition counts — the pair is not added on top of it', () => {
  const literal = applyAnimationOption('p-3 transition-colors', 'fade80');
  assert.equal(literal, 'p-3 transition-colors hover:opacity-80');
});

test('the root chip toggles the whole effect, whatever intensity is on', () => {
  const strong = applyAnimationOption('p-3', 'shadowXl');
  assert.deepEqual(activeAnimationGroups(strong).sort(), ['shadow']);

  // Clicking the root chip while ANY intensity is on turns the effect off — not "adds the default".
  const off = applyAnimationGroup(strong, 'shadow');
  assert.deepEqual(activeAnimationGroups(off), []);

  // And from off, it turns on the group's default.
  const on = applyAnimationGroup(off, 'shadow');
  assert.deepEqual(activeAnimations(on), ['shadowLg']);
});

// --- State switches ---

test('the motion-safe guard wraps what MOVES, and only that', () => {
  const state: IAnimationState = { motionSafe: true, animationTrigger: 'always', hoverTrigger: 'hover' };
  assert.equal(buildAnimationClass('animate-spin', 'animation', state), 'motion-safe:animate-spin');
  assert.equal(buildAnimationClass('scale-105', 'hover', state), 'motion-safe:hover:scale-105');
  // A duration says HOW something moves; guarding it would leave a motion-reduce user with a
  // transition of the wrong length instead of no movement at all.
  assert.equal(buildAnimationClass('duration-300', 'duration', state), 'duration-300');

  const guarded = applyAnimationState(applyAnimationOption('p-3 animate-spin duration-300', 'scale105'), 'motionSafe', 'true');
  assert.equal(guarded, 'p-3 motion-safe:animate-spin duration-300 motion-safe:hover:scale-105 transition');
  assert.equal(readAnimationState(guarded).motionSafe, true);
  assert.deepEqual(activeAnimations(guarded).sort(), ['d300', 'scale105', 'spin'], 'the guard does not hide what is on');

  // The switch rewrites in place, both ways: no reshuffling of the file.
  const plain = applyAnimationState(guarded, 'motionSafe', 'false');
  assert.equal(plain, 'p-3 animate-spin duration-300 hover:scale-105 transition');
  assert.equal(readAnimationState(plain).motionSafe, false);
});

test('a continuous animation can be told to run only under the mouse', () => {
  const always = applyAnimationOption('p-3', 'pulse');
  assert.equal(readAnimationState(always).animationTrigger, 'always');

  const onHover = applyAnimationState(always, 'animationTrigger', 'hover');
  assert.equal(onHover, 'p-3 hover:animate-pulse');
  assert.equal(readAnimationState(onHover).animationTrigger, 'hover');
  assert.deepEqual(activeAnimations(onHover), ['pulse'], 'still the same option, just triggered differently');

  // A new option written while the trigger is `hover` is written with it.
  const swapped = applyAnimationOption(onHover, 'spin');
  assert.equal(swapped, 'p-3 hover:animate-spin');
});

test('the hover effects can answer focus or click instead of the mouse', () => {
  const onHover = applyAnimationOption('p-3', 'lift1');
  assert.equal(onHover, 'p-3 hover:-translate-y-1 transition');

  const onFocus = applyAnimationState(onHover, 'hoverTrigger', 'focus');
  assert.equal(onFocus, 'p-3 focus:-translate-y-1 transition', 'keyboard users get the same affordance');
  assert.equal(readAnimationState(onFocus).hoverTrigger, 'focus');

  // And a second effect follows the chosen trigger.
  const withShadow = applyAnimationOption(onFocus, 'shadowLg');
  assert.equal(withShadow.includes('focus:shadow-lg'), true);

  const onActive = applyAnimationState(withShadow, 'hoverTrigger', 'active');
  assert.equal(onActive.includes('active:-translate-y-1'), true);
  assert.equal(onActive.includes('active:shadow-lg'), true);
});

test('an arbitrary-property class survives the variant rewrites (its value holds a colon)', () => {
  const literal = applyAnimationState(applyAnimationOption('p-3 animate-spin', 'sp2'), 'motionSafe', 'true');
  assert.equal(literal, 'p-3 motion-safe:animate-spin [animation-duration:2s]');
  assert.deepEqual(activeAnimations(literal).sort(), ['sp2', 'spin']);
});

test('an element with no animation reports none, and nothing is invented for it', () => {
  assert.deepEqual(activeAnimations('p-3 rounded-md text-gray-400'), []);
  assert.deepEqual(activeAnimationGroups('p-3 rounded-md'), []);
  assert.deepEqual(readAnimationState('p-3 rounded-md'), { motionSafe: false, animationTrigger: 'always', hoverTrigger: 'hover' });
});

// --- Friendly names ---

/** The label as the panel composes it, so the tests can read one string. */
function labelOf(raw: string): string {
  const label = utilityLabel(tokenOf(raw, raw));
  if (!label.property) return '';
  return [label.property, ...label.variants.map((part) => part.id ?? part.raw ?? '')].join(' · ');
}

test('the row label says what the class DOES, not what it is written as', () => {
  // The examples the user gave, in their own order — as ids, since the words live in the catalog.
  assert.equal(labelOf('rounded-md'), 'prop.radius');
  assert.equal(labelOf('border-[var(--button-secondary-border,#cbd5e1)]'), 'prop.borderColor');
  assert.equal(labelOf('bg-[var(--button-secondary-bg,#f8fafc)]'), 'prop.bgColor');
  assert.equal(labelOf('px-3'), 'prop.paddingX');
  assert.equal(labelOf('space-y-4'), 'prop.spaceY');
  assert.equal(labelOf('max-w-6xl'), 'prop.maxWidth');
});

test('a family that means two things is named by its VALUE', () => {
  assert.equal(labelOf('text-sm'), 'prop.textSize');
  assert.equal(labelOf('text-gray-400'), 'prop.textColor');
  assert.equal(labelOf('text-[var(--text-muted,#64748b)]'), 'prop.textColor');
  assert.equal(labelOf('border'), 'prop.borderWidth');
  assert.equal(labelOf('border-gray-200'), 'prop.borderColor');
});

test('the variant is part of the label — two rows must not read the same', () => {
  // `text-gray-400` and `dark:text-gray-300` are different rows; without the variant both would read
  // the same and the user would have to guess which one is which.
  assert.equal(labelOf('dark:text-gray-300'), 'prop.textColor · variant.dark');
  assert.equal(labelOf('hover:bg-gray-100'), 'prop.bgColor · variant.hover');
  assert.equal(labelOf('dark:hover:text-gray-300'), 'prop.textColor · variant.dark · variant.hover');
  assert.notEqual(labelOf('text-gray-400'), labelOf('dark:text-gray-300'));

  // A breakpoint carries its name as a param, because pt and en word it differently.
  const responsive = utilityLabel(tokenOf('md:p-6', 'md:p-6'));
  assert.deepEqual(responsive.variants, [{ id: 'variant.breakpointFrom', params: { name: 'md' } }]);
});

test('a value that is neither a step nor a colour is not named as one', () => {
  // `text-left` used to be labelled as a text SIZE — a wrong name, which is worse than no name.
  assert.equal(labelOf('text-left'), 'prop.textAlign');
  assert.equal(labelOf('text-nowrap'), 'prop.textWrap');
  assert.equal(labelOf('border-b'), 'prop.borderSideBottom');
  assert.equal(labelOf('border-dashed'), 'prop.borderStyle');
});

test('layout classes with no family here are still named — they are 16% of every token', () => {
  // Read-only rows, but `w-full` alone appears 462 times in the real pages: a panel where a sixth of
  // the rows shows raw classes reads worse for no reason.
  assert.equal(labelOf('w-full'), 'prop.width');
  assert.equal(labelOf('block'), 'prop.display');
  assert.equal(labelOf('grid-cols-2'), 'prop.gridCols');
  assert.equal(labelOf('justify-between'), 'prop.justify');
  assert.equal(labelOf('items-center'), 'prop.items');
  assert.equal(labelOf('overflow-x-auto'), 'prop.overflowX');
  assert.equal(labelOf('min-h-full'), 'prop.minHeight');
  // And what the animation tab writes is nameable by the classes tab.
  assert.equal(labelOf('animate-pulse'), 'prop.animation');
  assert.equal(labelOf('motion-safe:animate-spin'), 'prop.animation · variant.motionSafe');
});

test('with no honest name the label is empty, and the panel falls back to the class', () => {
  // Inventing a description would be worse than showing the truth.
  for (const raw of ['isolate', 'antialiased', 'mix-blend-multiply', 'will-change-transform']) {
    assert.equal(utilityLabel(tokenOf(raw, raw)).property, undefined, raw);
  }
  // An unknown variant is shown as itself rather than dropped — as a raw word, with no id.
  const unknown = utilityLabel(tokenOf('supports-grid:p-4', 'supports-grid:p-4'));
  assert.equal(unknown.property, 'prop.padding');
  assert.deepEqual(unknown.variants, [{ raw: 'supports-grid' }]);
});

// --- Entrance ---

test('the entrance screen is reachable from the root and says what it does NOT do yet', () => {
  const root = animationScreen('root');
  assert.deepEqual(root.rows.map((row) => row.title),
    ['anim.root.entrance', 'anim.group.continuous', 'anim.root.hover']);
  assert.equal(root.rows[0].more, 'entrance');
  assert.equal(root.rows[0].mode, 'groups', 'one chip per effect; the intensities live in the full screen');
  assert.deepEqual(
    root.rows[0].groups?.map((group) => group.rootLabel),
    ['anim.root.fade', 'anim.root.slideY', 'anim.root.slideX', 'anim.root.zoom'],
  );

  const entrance = animationScreen('entrance');
  assert.equal(entrance.back, 'root');
  assert.deepEqual(entrance.rows.map((row) => row.title), [
    'anim.group.entFade', 'anim.group.entSlideY', 'anim.group.entSlideX', 'anim.group.entZoom',
    'anim.group.duration', 'anim.group.delay', 'panel.cascadeTitle',
  ]);
  assert.equal(entrance.rows.at(-1)?.cascade, true);
  assert.equal(entrance.note, 'anim.screen.entranceNote');
});

test('an entrance writes the permanent state AND the first frame, plus a transition', () => {
  const literal = applyAnimationOption('p-4', 'fadeIn');
  // Without `transition` there is nothing to interpolate and the entrance is invisible.
  assert.equal(literal, 'p-4 opacity-100 starting:opacity-0 transition');
  assert.deepEqual(activeAnimations(literal), ['fadeIn']);

  // Effects on different axes stack; `transition` is not added twice.
  const both = applyAnimationOption(literal, 'yUp4');
  assert.equal(both, 'p-4 opacity-100 starting:opacity-0 transition translate-y-0 starting:translate-y-4');
  assert.deepEqual(activeAnimations(both).sort(), ['fadeIn', 'yUp4']);
  assert.equal(both.split(' ').filter((cls) => cls === 'transition').length, 1);
});

test('the vertical entrance is one exclusive group: coming from above replaces coming from below', () => {
  const up = applyAnimationOption('p-4', 'yUp4');
  const down = applyAnimationOption(up, 'yDown4');
  assert.deepEqual(activeAnimations(down), ['yDown4'], 'two translate-y entrances would fight');
  assert.equal(down.includes('starting:translate-y-4'), false);
  assert.equal(down.includes('starting:-translate-y-4'), true);

  // And a horizontal one lives alongside it: different axis, no conflict.
  const sideways = applyAnimationOption(down, 'xLeft4');
  assert.deepEqual(activeAnimations(sideways).sort(), ['xLeft4', 'yDown4']);
});

test('clicking the active entrance chip removes both of its classes', () => {
  const on = applyAnimationOption('p-4', 'zoom95');
  assert.equal(on, 'p-4 scale-100 starting:scale-95 transition');
  const off = applyAnimationOption(on, 'zoom95');
  // `transition` stays: it may have been the user's own (same rule as the hover effects).
  assert.equal(off, 'p-4 transition');
});

test('the motion guard wraps the first frame, not the permanent state', () => {
  const guarded = applyAnimationState(applyAnimationOption('p-4', 'yUp4'), 'motionSafe', 'true');
  // `translate-y-0` guarded would be pointless — its absence already means "just sit still".
  assert.equal(guarded, 'p-4 translate-y-0 motion-safe:starting:translate-y-4 transition');
  assert.equal(readAnimationState(guarded).motionSafe, true);
  assert.deepEqual(activeAnimations(guarded), ['yUp4'], 'the guard does not hide what is on');
});

// --- Cascade ---

test('a cascade staggers the children from the CONTAINER, with the container effects', () => {
  const container = applyAnimationOption('grid gap-6', 'fadeIn');
  const { literal, applied, dropped } = applyCascade(container, 150, 3);

  assert.equal(applied, 3);
  assert.equal(dropped, 0);
  // The children get the transition, the container's own effect, and one delay each after the first.
  assert.equal(literal.includes('[&>*]:transition'), true);
  assert.equal(literal.includes('[&>*]:opacity-100'), true);
  assert.equal(literal.includes('[&>*]:starting:opacity-0'), true);
  assert.equal(literal.includes('[&>*:nth-child(2)]:delay-[150ms]'), true);
  assert.equal(literal.includes('[&>*:nth-child(3)]:delay-[300ms]'), true);
  assert.equal(literal.includes('[&>*:nth-child(1)]'), false, 'the first child does not wait');

  assert.deepEqual(readCascade(literal), { step: 150, children: 3 });
});

test('with no effect on the container the children get fade + subir', () => {
  const { literal } = applyCascade('grid gap-6', 200, 2);
  assert.equal(literal.includes('[&>*]:starting:opacity-0'), true);
  assert.equal(literal.includes('[&>*]:starting:translate-y-4'), true);
  assert.equal(literal.includes('[&>*:nth-child(2)]:delay-[200ms]'), true);
});

test('the child-scoped classes are NOT read as the container own animation', () => {
  // `[&>*]:starting:opacity-0` means the CHILDREN fade. Lighting the container's chip for it would be
  // a lie, and removing that chip would silently break the cascade.
  const { literal } = applyCascade('grid gap-6', 150, 3);
  assert.deepEqual(activeAnimations(literal), []);
  assert.deepEqual(activeAnimationGroups(literal), []);
});

test('the cascade cap is applied and REPORTED, never a silent truncation', () => {
  const { literal, applied, dropped } = applyCascade('grid', 100, 20);
  assert.equal(applied, CASCADE_MAX_CHILDREN);
  assert.equal(dropped, 20 - CASCADE_MAX_CHILDREN);
  assert.equal(literal.includes(`[&>*:nth-child(${CASCADE_MAX_CHILDREN})]:delay-[${(CASCADE_MAX_CHILDREN - 1) * 100}ms]`), true);
  assert.equal(literal.includes(`[&>*:nth-child(${CASCADE_MAX_CHILDREN + 1})]`), false);
});

test('removing the cascade takes only what the cascade wrote', () => {
  const container = applyAnimationOption('grid gap-6 p-4', 'fadeIn');
  const { literal } = applyCascade(container, 150, 4);
  const back = removeCascade(literal);
  assert.equal(back, container, 'the container keeps its own classes and its own entrance');
  assert.deepEqual(readCascade(back), { step: null, children: 0 });
});

test('changing the step rewrites the cascade instead of stacking a second one', () => {
  const first = applyCascade('grid', 100, 4).literal;
  const second = applyCascade(first, 200, 4).literal;
  assert.deepEqual(readCascade(second), { step: 200, children: 4 });
  assert.equal(second.includes('delay-[100ms]'), false);
  assert.equal(second.split(' ').filter((cls) => cls.includes('nth-child')).length, 3);
});

test('the motion guard reaches the children of a cascade', () => {
  const { literal } = applyCascade('grid', 150, 3);
  const guarded = applyAnimationState(literal, 'motionSafe', 'true');
  // Guarding the container and leaving the children unguarded would be the worst of both.
  assert.equal(guarded.includes('[&>*]:motion-safe:starting:opacity-0'), true);
  assert.equal(guarded.includes('[&>*]:opacity-100'), true, 'the permanent state is not guarded');
  assert.equal(readAnimationState(guarded).motionSafe, true);
});

// --- Custom values ---

test('every numeric group accepts a typed value, and only those', () => {
  const withCustom = ANIMATION_GROUPS.filter((group) => group.custom).map((group) => group.id);
  assert.deepEqual(withCustom.sort(), [
    'bright', 'delay', 'duration', 'entFade', 'entSlideX', 'entSlideY', 'entZoom',
    'fade', 'lift', 'repeat', 'rotate', 'scale', 'speed',
  ].sort());
  // A keyframe or an easing curve is not a number: there is nothing to type there.
  for (const id of ['continuous', 'easing', 'scope', 'shadow', 'pause']) {
    assert.equal(ANIMATION_GROUPS.find((group) => group.id === id)?.custom, undefined, id);
  }
  for (const group of ANIMATION_GROUPS) {
    if (!group.custom) continue;
    assert.ok(group.custom.min < group.custom.max, group.id);
    assert.ok(group.custom.templates.some((template) => template.includes('{v}')), group.id);
    assert.match(group.custom.hint, /^custom\.\w+$/u, group.id);
  }
});

test('a typed value replaces the curated one of the same group', () => {
  const fixed = applyAnimationOption('p-4', 'd300');
  assert.equal(fixed, 'p-4 duration-300');

  const custom = applyAnimationCustom(fixed, 'duration', 850);
  assert.equal(custom?.literal, 'p-4 duration-[850ms]');
  assert.equal(custom?.value, 850);
  assert.equal(readAnimationCustom(custom?.literal ?? '', 'duration'), 850);
  assert.deepEqual(activeAnimations(custom?.literal ?? ''), [], 'no curated chip is active any more');

  // And a curated chip replaces the typed value back.
  const back = applyAnimationOption(custom?.literal ?? '', 'd300');
  assert.equal(back, 'p-4 duration-300');
  assert.equal(readAnimationCustom(back, 'duration'), null);
});

test('an out-of-range value is clamped, and the applied value is reported', () => {
  const tooBig = applyAnimationCustom('p-4', 'duration', 999999);
  assert.equal(tooBig?.value, 10000);
  assert.equal(tooBig?.literal.includes('duration-[10000ms]'), true);

  const tooSmall = applyAnimationCustom('p-4', 'speed', 1);
  assert.equal(tooSmall?.value, 100, 'an animation of 1ms is not an animation');

  assert.equal(applyAnimationCustom('p-4', 'duration', Number.NaN), null);
  assert.equal(applyAnimationCustom('p-4', 'nope', 100), null);
});

test('a typed entrance writes the permanent state, the first frame and the transition', () => {
  const custom = applyAnimationCustom('p-4', 'entSlideY', 22);
  assert.equal(custom?.literal, 'p-4 translate-y-0 starting:translate-y-[22px] transition');
  assert.equal(readAnimationCustom(custom?.literal ?? '', 'entSlideY'), 22);
});

test('the typed distance follows the DIRECTION already chosen', () => {
  // Coming from above is `-translate-y`: typing 30 must not silently flip it downwards.
  const fromAbove = applyAnimationOption('p-4', 'yDown4');
  const custom = applyAnimationCustom(fromAbove, 'entSlideY', 30);
  assert.equal(custom?.literal.includes('starting:-translate-y-[30px]'), true);
  assert.equal(custom?.literal.includes('starting:translate-y-[30px]'), false);

  // With nothing chosen, the group's default direction is used (de baixo).
  const fresh = applyAnimationCustom('p-4', 'entSlideY', 30);
  assert.equal(fresh?.literal.includes('starting:translate-y-[30px]'), true);
});

test('two groups sharing a base do not read each other value', () => {
  // `starting:scale-[87%]` is the entrance; `hover:scale-[103%]` is the hover effect. Same base.
  const entrance = applyAnimationCustom('p-4', 'entZoom', 87)?.literal ?? '';
  const both = applyAnimationCustom(entrance, 'scale', 103)?.literal ?? '';

  assert.equal(readAnimationCustom(both, 'entZoom'), 87);
  assert.equal(readAnimationCustom(both, 'scale'), 103);
  assert.equal(both.includes('starting:scale-[87%]'), true);
  assert.equal(both.includes('hover:scale-[103%]'), true);
});

test('the typed value carries the variants the state asks for', () => {
  const guarded = applyAnimationCustom('p-4', 'entFade', 20, {
    motionSafe: true, animationTrigger: 'always', hoverTrigger: 'hover',
  });
  assert.equal(guarded?.literal, 'p-4 opacity-100 motion-safe:starting:opacity-[20%] transition');
  assert.equal(readAnimationCustom(guarded?.literal ?? '', 'entFade'), 20, 'read through the guard');

  const onFocus = applyAnimationCustom('p-4', 'lift', 3, {
    motionSafe: false, animationTrigger: 'always', hoverTrigger: 'focus',
  });
  assert.equal(onFocus?.literal.includes('focus:-translate-y-[3px]'), true);
});

test('clearing a typed value takes the permanent state with it', () => {
  const custom = applyAnimationCustom('p-4', 'entZoom', 87)?.literal ?? '';
  assert.equal(custom, 'p-4 scale-100 starting:scale-[87%] transition');
  const cleared = removeAnimationCustom(custom, 'entZoom');
  // `scale-100` alone would be a leftover nobody asked for; `transition` stays (it may be the user's).
  assert.equal(cleared, 'p-4 transition');
  assert.equal(readAnimationCustom(cleared, 'entZoom'), null);
});

test('the cascade of a container is not mistaken for a typed value of its own', () => {
  const { literal } = applyCascade('grid', 150, 3);
  for (const group of ANIMATION_GROUPS) {
    if (!group.custom) continue;
    assert.equal(readAnimationCustom(literal, group.id), null, group.id);
  }
});

// --- Colour of a role ---

test('a token value that IS a colour comes back as one', () => {
  for (const value of ['#ffffff', '#0f172a', '#fff', '#000f', 'rgb(15, 23, 42)', 'rgb(255 255 255 / 0.9)',
    'oklch(0.7 0.1 200)', 'hsl(210 40% 96%)', 'white', 'transparent']) {
    assert.equal(colorOf(value), value, value);
  }
});

test('what is NOT a colour comes back null', () => {
  // A design system also carries durations, sizes and font stacks — and that null is what keeps them
  // out of a COLOUR picker, before it is what keeps a swatch from lying.
  for (const value of ['0.3s', '0.25rem', '16px', 'Inter, sans-serif', '600', '', '   ', '#zzz', '#12345',
    'calc(var(--font-base-unit) * 4)']) {
    assert.equal(colorOf(value), null, JSON.stringify(value));
  }
});

test('the role of an option is readable back, with and without the -- prefix', () => {
  assert.equal(roleVar('bg-[var(--surface-subtle,#f8fafc)]'), '--surface-subtle');
  assert.equal(roleLabel('bg-[var(--surface-subtle,#f8fafc)]'), 'surface-subtle');
  assert.equal(roleVar('dark:text-[var(--text-muted)]'), '--text-muted');
  assert.equal(roleVar('p-4'), '', 'not a role at all');
  assert.equal(roleLabel('p-4'), 'p-4', 'and then the label is the class itself');
});

test('only roles that ARE colours are offered as colours', () => {
  // Measured on the real 102046 design system: the families with no name rule (`fill`, `from`, …) fell
  // back to every role and offered `fill-[var(--font-size-16)]` — nonsense wearing a valid class shape.
  const roles = ['--surface-bg', '--font-size-16', '--font-family-primary', '--transition-fast', '--page-bg'];
  const resolve = (cssVar: string) => ({
    '--surface-bg': '#ffffff',
    '--font-size-16': 'calc(var(--font-base-unit) * 4)',
    '--font-family-primary': '"Playwrite BR Guides", cursive',
    '--transition-fast': '0.5s',
    '--page-bg': '#eef1f5',
  } as Record<string, string>)[cssVar] ?? '';

  const options = roleOptions(tokenOf('fill-[var(--page-bg,#eef1f5)]', 'fill-[var(--page-bg,#eef1f5)]'), roles, resolve);
  assert.deepEqual(options, ['fill-[var(--page-bg,#eef1f5)]', 'fill-[var(--surface-bg,#ffffff)]']);

  // With no resolver there is no way to tell, so nothing is dropped — guessing would hide real roles.
  const blind = roleOptions(tokenOf('fill-[var(--page-bg,#eef1f5)]', 'fill-[var(--page-bg,#eef1f5)]'), roles);
  assert.equal(blind.length, roles.length);
});

test('the classes tab knows every class the animations tab can write', () => {
  // A class the picker itself produced coming back as "sem opções prontas" is the worst version of
  // having no vocabulary — and it is exactly what happened with `translate-x-0`, `transition`,
  // `duration-*` and the typed `starting:-translate-x-[400px]`.
  const written = new Set<string>();
  const STATE: IAnimationState = { motionSafe: false, animationTrigger: 'always', hoverTrigger: 'hover' };

  for (const group of ANIMATION_GROUPS) {
    for (const option of group.options) {
      for (const token of splitUtilities(applyAnimationOption('', option.id, STATE))) written.add(token.raw);
    }
    if (!group.custom) continue;
    const typed = applyAnimationCustom('', group.id, Math.round((group.custom.min + group.custom.max) / 2), STATE);
    for (const token of splitUtilities(typed?.literal ?? '')) written.add(token.raw);
  }
  for (const token of splitUtilities(applyCascade('', 150, 3, STATE).literal)) written.add(token.raw);

  const orphans: string[] = [];
  for (const cls of written) {
    // The cascade writes into the CHILDREN (`[&>*]:…`); those are the container's markup, not a row of
    // its own, and the panel never offers them as the element's own classes.
    if (cls.startsWith('[&>')) continue;
    const token = splitUtilities(cls)[0];
    const options = utilityOptions(token);
    if (options.kind === 'none' || !options.options.includes(cls)) orphans.push(cls);
  }

  assert.deepEqual(orphans, [], 'every class the animations tab writes must be editable in the classes tab');
});

test('a typed value is a current value, not a dead end', () => {
  const typed = utilityOptions(tokenOf('starting:-translate-x-[400px]', 'starting:-translate-x-[400px]'));
  assert.equal(typed.kind, 'scale');
  assert.equal(typed.options[0], 'starting:-translate-x-[400px]', 'the current value leads');
  assert.ok(typed.options.includes('starting:-translate-x-4'), 'and the family is the way back');

  const spacing = utilityOptions(tokenOf('p-[13px]', 'p-[13px]'));
  assert.equal(spacing.options[0], 'p-[13px]');
  assert.ok(spacing.options.includes('p-3'));

  // An arbitrary value of a family with no vocabulary at all is still a dead end, honestly reported.
  const unknown = utilityOptions(tokenOf('mask-[url(x.svg)]', 'mask-[url(x.svg)]'));
  assert.equal(unknown.kind, 'none');
  assert.deepEqual(unknown.reason, NO_OPTIONS);
});

test('the motion families answer like any other', () => {
  assert.deepEqual(utilityOptions(tokenOf('transition', 'transition')).options,
    ['transition', 'transition-all', 'transition-colors', 'transition-opacity', 'transition-shadow', 'transition-transform', 'transition-none']);
  assert.deepEqual(utilityOptions(tokenOf('ease-out', 'ease-out')).options,
    ['ease-linear', 'ease-in', 'ease-out', 'ease-in-out', 'ease-initial']);
  assert.equal(utilityOptions(tokenOf('translate-x-0', 'translate-x-0')).kind, 'scale');
  assert.ok(utilityOptions(tokenOf('duration-500', 'duration-500')).options.includes('duration-300'));
  assert.ok(utilityOptions(tokenOf('delay-450', 'delay-450')).options.includes('delay-450'), 'a step off the list is kept');
  assert.ok(utilityOptions(tokenOf('scale-105', 'scale-105')).options.includes('scale-110'));
  assert.ok(utilityOptions(tokenOf('rotate-3', 'rotate-3')).options.includes('rotate-6'));
});

// --- Copying a style from one element onto another ---

/** Two literals shaped like the generator's real output. */
const SOURCE_BUTTON = 'inline-flex items-center gap-2 rounded-md bg-[var(--button-primary-bg,#2563eb)]'
  + ' px-4 py-2 text-sm font-semibold text-[var(--button-primary-text,#ffffff)] shadow-sm';
const TARGET_BUTTON = 'rounded border border-[var(--border-default,#e2e8f0)] px-3 py-1 text-xs italic w-full';

test('pasting with nothing held back makes the target IDENTICAL to the source', () => {
  // The decision, in one assertion: the result IS the source's literal. Anything else is "parecido".
  assert.equal(pasteStyle(TARGET_BUTTON, SOURCE_BUTTON), SOURCE_BUTTON);

  // Which means the replace also REMOVES what the target had and the source has not.
  const diff = diffLiterals(TARGET_BUTTON, pasteStyle(TARGET_BUTTON, SOURCE_BUTTON));
  assert.ok(diff.removed.includes('italic'), 'a merge would have left the target italic');
  assert.ok(diff.removed.includes('w-full'));
  assert.ok(diff.added.includes('shadow-sm'));
});

test('what the user asks to keep survives, and beats the source for the same property', () => {
  const kept = pasteStyle(TARGET_BUTTON, SOURCE_BUTTON, ['w-full', 'px-3']);
  const classes = splitUtilities(kept).map((token) => token.raw);

  assert.ok(classes.includes('w-full'), 'the target keeps its width');
  assert.ok(classes.includes('px-3'), 'and its own horizontal padding');
  assert.equal(classes.includes('px-4'), false, "the source's px-4 gave way to it");
  // Everything not held back still came.
  assert.ok(classes.includes('shadow-sm'));
  assert.ok(classes.includes('bg-[var(--button-primary-bg,#2563eb)]'));
  assert.equal(classes.includes('italic'), false, 'keeping one class is not keeping everything');
});

test('the source can be told to leave something behind — the container case', () => {
  // `keep` alone cannot express this: a `max-w-6xl` coming from a container has nothing to collide
  // with on a target that has no width at all.
  const source = 'max-w-6xl mx-auto rounded-lg bg-white p-6 shadow';
  const pasted = pasteStyle('rounded p-2', source, [], ['max-w-6xl']);
  const classes = splitUtilities(pasted).map((token) => token.raw);

  assert.equal(classes.includes('max-w-6xl'), false);
  assert.ok(classes.includes('shadow'));
  assert.ok(classes.includes('p-6'), 'the source still decides the padding');
});

test('a variant is a layer of its own: it travels whole and does not collide with the base', () => {
  const source = 'p-2 md:p-8 hover:bg-blue-700';
  const pasted = pasteStyle('p-3 md:p-4', source, ['p-3']);
  const classes = splitUtilities(pasted).map((token) => token.raw);

  assert.ok(classes.includes('md:p-8'), 'the responsive layer arrives as written');
  assert.ok(classes.includes('hover:bg-blue-700'));
  assert.ok(classes.includes('p-3'), 'the kept base value wins over the base of the source');
  assert.equal(classes.includes('p-2'), false);
  // The kept BASE padding must not delete the source's `md:` padding — different layers.
  assert.equal(classes.filter((cls) => cls.endsWith('p-8')).length, 1);
});

test('no property is written twice by a paste', () => {
  const literal = pasteStyle('p-3 w-full text-xs', SOURCE_BUTTON, ['p-3', 'w-full', 'text-xs']);
  const seen = new Map<string, string>();
  for (const token of splitUtilities(literal)) {
    const label = utilityLabel(token);
    if (!label.property) continue;
    const key = `${token.variants.join(':')}|${label.property}`;
    assert.equal(seen.has(key), false, `${key} written twice: ${seen.get(key)} and ${token.raw}`);
    seen.set(key, token.raw);
  }
});

test('a class is filed by what it is FOR', () => {
  const groups = styleCategories(
    'w-full absolute top-0 z-10 col-span-2 p-4 gap-2 rounded-md bg-white text-sm shadow'
    + ' animate-pulse duration-300 flex grid-cols-2 items-center cursor-pointer',
  );

  assert.deepEqual(groups.place, ['w-full', 'absolute', 'top-0', 'z-10', 'col-span-2']);
  assert.deepEqual(groups.spacing, ['p-4', 'gap-2']);
  assert.deepEqual(groups.appearance, ['rounded-md', 'bg-white', 'text-sm', 'shadow']);
  assert.deepEqual(groups.animation, ['animate-pulse', 'duration-300']);
  // The internal layout of a container is how it arranges its CHILDREN — part of the look being
  // copied, not of where the element sits. Keeping "my position" must not also keep "your columns".
  assert.deepEqual(groups.other, ['flex', 'grid-cols-2', 'items-center', 'cursor-pointer']);
});

test('an entrance and its cascade are motion, wherever they are written', () => {
  const groups = styleCategories('starting:opacity-0 starting:-translate-y-4 [&>*:nth-child(2)]:delay-150 opacity-100');
  assert.deepEqual(groups.animation, ['starting:opacity-0', 'starting:-translate-y-4', '[&>*:nth-child(2)]:delay-150']);
  assert.deepEqual(groups.appearance, ['opacity-100']);
});

test('“only the looks” brings colour and border and leaves size, spacing and layout alone', () => {
  const target = 'flex w-full p-2 rounded border border-gray-200 text-xs';
  const looks = pasteCategories(target, SOURCE_BUTTON, ['appearance']);
  const classes = splitUtilities(looks).map((token) => token.raw);

  assert.ok(classes.includes('bg-[var(--button-primary-bg,#2563eb)]'), 'the colour came');
  assert.ok(classes.includes('rounded-md'), 'and replaced the target rounding');
  assert.ok(classes.includes('font-semibold'));
  assert.equal(classes.includes('rounded'), false);
  assert.ok(classes.includes('w-full'), 'the place stayed');
  assert.ok(classes.includes('p-2'), 'the spacing stayed');
  assert.ok(classes.includes('flex'), 'and so did the layout');
  assert.equal(classes.includes('px-4'), false, 'the source spacing did not travel');
  assert.equal(classes.includes('items-center'), false);
});

test('keeping the place is the same primitive, spelled as categories', () => {
  const target = 'w-full max-w-sm p-2 text-xs';
  const source = 'max-w-6xl p-6 text-lg bg-white';
  const byCategory = pasteCategories(target, source, ['appearance', 'spacing', 'animation', 'other']);
  const byHand = pasteStyle(target, source, ['w-full', 'max-w-sm'], ['max-w-6xl']);

  assert.equal(splitUtilities(byCategory).map((t) => t.raw).sort().join(' '),
    splitUtilities(byHand).map((t) => t.raw).sort().join(' '));
  const classes = splitUtilities(byCategory).map((token) => token.raw);
  assert.ok(classes.includes('w-full') && classes.includes('max-w-sm'), 'the element stays where it is');
  assert.equal(classes.includes('max-w-6xl'), false, "and does not inherit the container's width");
  assert.ok(classes.includes('p-6') && classes.includes('text-lg') && classes.includes('bg-white'));
});

test('every category travels when all of them are asked for', () => {
  assert.equal(pasteCategories(TARGET_BUTTON, SOURCE_BUTTON, STYLE_CATEGORIES), SOURCE_BUTTON);
});

test('the summary reads both directions, and says nothing when there is nothing to say', () => {
  const diff = diffLiterals('p-2 text-xs italic', 'p-4 text-xs');
  assert.deepEqual(diff.added, ['p-4']);
  assert.deepEqual(diff.removed, ['p-2', 'italic']);
  assert.deepEqual(diffLiterals('p-2 text-xs', 'p-2 text-xs'), { added: [], removed: [] });
});

test('an empty side is not a crash', () => {
  assert.equal(pasteStyle('', SOURCE_BUTTON), SOURCE_BUTTON);
  assert.equal(pasteStyle(TARGET_BUTTON, ''), '');
  assert.equal(pasteStyle(TARGET_BUTTON, '', ['w-full']), 'w-full', 'what is kept is still kept');
  assert.deepEqual(styleCategories('').place, []);
});

test('an unknown class is its own identity — two of them coexist, the same one never doubles', () => {
  // No property label, so the fallback key is the class itself.
  const pasted = pasteStyle('isolate mix-blend-multiply', 'isolate p-4', ['mix-blend-multiply', 'isolate']);
  const classes = splitUtilities(pasted).map((token) => token.raw);
  assert.deepEqual(classes.filter((cls) => cls === 'isolate'), ['isolate'], 'not written twice');
  assert.ok(classes.includes('mix-blend-multiply'));
  assert.ok(classes.includes('p-4'));
});

test('a family whose value means two unrelated things gets two names', () => {
  // Found by pasting every real button onto every other one: `ring-1` and `ring-[var(--…)]` were both
  // called "focus ring", so holding one back deleted the other. 8 elements in the 102046 pages carry
  // the pair, and 9 carry the `divide-y` + `divide-[…]` one.
  const label = (cls: string) => utilityLabel(tokenOf(cls, cls)).property;

  assert.equal(label('ring-1'), 'prop.ringWidth');
  assert.equal(label('ring'), 'prop.ringWidth', 'a bare ring is a 1px ring');
  assert.equal(label('ring-[var(--button-secondary-border,#cbd5e1)]'), 'prop.ringColor');
  assert.equal(label('divide-y'), 'prop.divideAxis');
  assert.equal(label('divide-[var(--border-subtle,#e2e8f0)]'), 'prop.divideColor');

  // And the consequence for the paste: keeping the width does not take the colour with it.
  const kept = pasteStyle('ring-1 ring-[var(--a,#111111)]', 'ring-2 ring-[var(--b,#222222)]', ['ring-1']);
  const classes = splitUtilities(kept).map((token) => token.raw);
  assert.ok(classes.includes('ring-1'));
  assert.ok(classes.includes('ring-[var(--b,#222222)]'), 'the colour still came from the source');
  assert.equal(classes.includes('ring-2'), false);
});

test('an arbitrary value that is a LENGTH is a size, not a colour', () => {
  // The generator writes every colour as `[var(--role,#hex)]` — and sizes in the very same shape.
  const label = (cls: string) => utilityLabel(tokenOf(cls, cls)).property;

  assert.equal(label('text-[var(--font-size-24,1.5rem)]'), 'prop.textSize');
  assert.equal(label('text-[var(--text-strong,#0f172a)]'), 'prop.textColor');
  assert.equal(label('text-[13px]'), 'prop.textSize');
  assert.equal(label('border-[var(--border-default,#e2e8f0)]'), 'prop.borderColor');

  // Which is what lets both live on the same element without one deleting the other.
  const both = 'text-[var(--font-size-24,1.5rem)] text-[var(--text-strong,#0f172a)]';
  assert.equal(pasteStyle('text-sm', both), both);
  const kept = pasteStyle(both, 'text-lg text-[var(--text-muted,#64748b)]', ['text-[var(--font-size-24,1.5rem)]']);
  const classes = splitUtilities(kept).map((token) => token.raw);
  assert.ok(classes.includes('text-[var(--font-size-24,1.5rem)]'), 'the kept size survived');
  assert.ok(classes.includes('text-[var(--text-muted,#64748b)]'), 'and the colour came from the source');
  assert.equal(classes.includes('text-lg'), false, 'the source size gave way to the kept one');
});
