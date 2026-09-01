/// <mls fileReference="_102033_/l2/studio/studioClassEdit.ts" enhancement="_blank" />
// Maps a Tailwind utility on screen back to the `class="..."` literal in the page SOURCE, and offers
// the neighbours of that utility (TASK-102033-class-picker).
//
// Why this is the easiest edit in the whole flow: changing a class is a `classList.replace` on the
// LIVE element — it shows up immediately, with no compile, no module re-evaluation and no hot swap.
// Only the persistence takes the normal path. Text editing has to fight the private-field wall; this
// does not.
//
// And why the anchoring is cleaner than the text one: no Lit binding heuristics, no i18n catalog, no
// locale. Element clicked -> its own `class` attribute -> count that exact literal in the source. The
// only real question is WHICH occurrence, and that is decided by counting, not by guessing
// (resolveAnchor).
//
// Everything here is pure: no DOM, no stor, no model, and NO PROSE — what the user reads is decided by
// message ids (studioMessages), so this module never carries a sentence in one language.

import type { IMessageRef } from '/_102033_/l2/studio/studioMessages.js';

// --- Utilities ---

/** A single class token of a `class="..."` literal. */
export interface IUtilityToken {
  /** As written, variants included: `dark:hover:text-gray-300`. */
  raw: string;
  /** `['dark','hover']` — everything before the last `:`. */
  variants: string[];
  /** The utility without variants: `text-gray-300`. */
  base: string;
  /** `-mt-2` — the leading minus is not part of the family. */
  negative: boolean;
  /** Known family (`text`, `space-y`, `max-w`), or '' when this module has no vocabulary for it. */
  family: string;
  /** What follows the family: `gray-300`, `3`, or '' for a bare `rounded` / `border`. */
  value: string;
  /** `bg-[var(--surface-subtle,#f8fafc)]` — an arbitrary value, not from a scale. */
  arbitrary: boolean;
  /** `[animation-duration:2s]` — an arbitrary PROPERTY: the css property it sets. */
  property?: string;
  /** Position among the tokens of the literal (whitespace-separated), 0-based. */
  index: number;
  /** Offset of `raw` inside the literal — how replaceUtility keeps the original whitespace. */
  offset: number;
}

/**
 * The scales offered per family.
 *
 * CURATED, not the Tailwind matrix: the point is "the current one plus its neighbours", and a
 * complete list of every step (including every half-step) reads as noise. A current value that is
 * not on the scale is inserted into it (see `withCurrent`), so `p-1.5` is never lost — it just does
 * not put half-steps in front of everyone else.
 *
 * `''` is a real value: `rounded`, `border` and `shadow` all have a default step with no suffix.
 */
const SPACING = ['0', 'px', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16', '20', '24'];
const RADIUS = ['none', 'sm', '', 'md', 'lg', 'xl', '2xl', '3xl', 'full'];
const FONT_SIZE = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'];
const FONT_WEIGHT = ['thin', 'extralight', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black'];
const BORDER_WIDTH = ['0', '', '2', '4', '8'];
const SHADOW = ['none', 'sm', '', 'md', 'lg', 'xl', '2xl', 'inner'];
const OPACITY = ['0', '10', '20', '25', '30', '40', '50', '60', '70', '75', '80', '90', '95', '100'];
const MAX_WIDTH = ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', 'full', 'prose'];
const LEADING = ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose'];
const TRACKING = ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest'];

// Motion families. The Animações tab writes these, so the Classes atuais tab has to be able to change
// them — a class the picker itself produced coming back as "sem opções prontas" is the worst version of
// having no vocabulary. `duration`/`delay` take any number in Tailwind v4 (verified: `delay-450`
// compiles), so they are a scale, not a closed list.
const TIME_SCALE = ['0', '75', '100', '150', '200', '300', '500', '700', '1000'];
const SCALE_PERCENT = ['0', '50', '75', '90', '95', '100', '105', '110', '125', '150'];
const ROTATE = ['0', '1', '2', '3', '6', '12', '45', '90', '180'];
const FILTER_PERCENT = ['0', '50', '75', '90', '95', '100', '105', '110', '125', '150', '200'];
const TRANSITION_SCOPES = ['', 'all', 'colors', 'opacity', 'shadow', 'transform', 'none'];
const EASINGS = ['linear', 'in', 'out', 'in-out', 'initial'];
const BLUR = ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'];

/** Shades of a palette colour, in Tailwind's own order. */
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

const PALETTES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green',
  'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

/**
 * Families whose members are a FIXED LIST, not a scale.
 *
 * `p-3` has neighbours; `flex` does not — its alternatives are `block`, `grid`, `hidden`, and the whole
 * list is short enough to show at once. Measured on the 102 real pages, these were 16% of every token
 * and the panel had nothing to say about them: `w-full` (462×), `block` (326×), `grid` (265×), `flex`
 * (201×), `justify-between` (120×), `items-center` (108×).
 *
 * Two shapes, because Tailwind has two: whole classes with no value (`flex`, `italic`) and the usual
 * family-value pairs whose values are an enumeration (`justify-between`, `w-full`).
 */
interface IWholeClassFamily {
  id: string;
  classes: readonly string[];
}

const WHOLE_CLASS_FAMILIES: readonly IWholeClassFamily[] = [
  { id: 'display', classes: ['block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'inline-grid', 'hidden'] },
  { id: 'position', classes: ['static', 'relative', 'absolute', 'fixed', 'sticky'] },
  { id: 'flexDirection', classes: ['flex-row', 'flex-row-reverse', 'flex-col', 'flex-col-reverse'] },
  { id: 'flexWrap', classes: ['flex-wrap', 'flex-wrap-reverse', 'flex-nowrap'] },
  { id: 'flexGrow', classes: ['flex-1', 'flex-auto', 'flex-initial', 'flex-none'] },
  { id: 'textCase', classes: ['uppercase', 'lowercase', 'capitalize', 'normal-case'] },
  { id: 'fontStyle', classes: ['italic', 'not-italic'] },
  { id: 'decoration', classes: ['underline', 'line-through', 'no-underline'] },
  { id: 'truncate', classes: ['truncate', 'text-ellipsis', 'text-clip'] },
  { id: 'numeric', classes: ['normal-nums', 'tabular-nums', 'proportional-nums'] },
];

/** Enumerated VALUES of a normal family (`justify-between`, `w-full`). */
const LIST_VALUES: Record<string, readonly string[]> = {
  justify: ['start', 'center', 'end', 'between', 'around', 'evenly'],
  items: ['start', 'center', 'end', 'baseline', 'stretch'],
  self: ['auto', 'start', 'center', 'end', 'stretch'],
  content: ['start', 'center', 'end', 'between', 'around', 'evenly'],
  overflow: ['auto', 'hidden', 'visible', 'scroll', 'clip'],
  'overflow-x': ['auto', 'hidden', 'visible', 'scroll', 'clip'],
  'overflow-y': ['auto', 'hidden', 'visible', 'scroll', 'clip'],
  w: ['auto', 'full', 'screen', 'fit', 'min', 'max', '1/2', '1/3', '2/3', '1/4', '3/4'],
  h: ['auto', 'full', 'screen', 'fit', 'min', 'max'],
  'min-w': ['0', 'full', 'fit', 'min', 'max'],
  'min-h': ['0', 'full', 'screen', 'fit'],
  'max-h': ['full', 'screen', 'fit', 'min', 'max'],
  'grid-cols': ['1', '2', '3', '4', '5', '6', '12', 'none'],
  'grid-rows': ['1', '2', '3', '4', '5', '6', 'none'],
  'col-span': ['1', '2', '3', '4', '5', '6', 'full'],
  'row-span': ['1', '2', '3', '4', '5', '6', 'full'],
  z: ['0', '10', '20', '30', '40', '50', 'auto'],
  whitespace: ['normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap'],
  cursor: ['pointer', 'default', 'not-allowed', 'wait', 'text', 'move'],
  object: ['contain', 'cover', 'fill', 'none', 'scale-down'],
  align: ['baseline', 'top', 'middle', 'bottom'],
  // Written by the Animações tab; the classes tab has to be able to change it too.
  animate: ['none', 'spin', 'ping', 'pulse', 'bounce'],
};

/** Values of a DUAL family that are an enumeration: `text-left` is not a size, `border-b` is a side. */
const DUAL_LIST_VALUES: Record<string, readonly string[]> = {
  text: ['left', 'center', 'right', 'justify', 'start', 'end'],
  border: ['t', 'r', 'b', 'l', 'x', 'y'],
  divide: ['x', 'y'],
};

/** The whole-class family a token belongs to, if any. */
function wholeClassFamily(base: string): IWholeClassFamily | undefined {
  return WHOLE_CLASS_FAMILIES.find((family) => family.classes.includes(base));
}

/** Rebuilds a whole class (no family/value split) keeping the variants. */
function composeWhole(token: IUtilityToken, cls: string): string {
  const prefix = token.variants.length ? `${token.variants.join(':')}:` : '';
  return `${prefix}${cls}`;
}

/**
 * What a family can offer. A family may accept BOTH a scale and a colour (`text-sm` and
 * `text-gray-400` are the same family), so the current VALUE is what decides which one applies.
 */
interface IFamilySpec {
  scale?: readonly string[];
  color?: boolean;
  /** Enumerated values: shown IN FULL, because a list of five has no "neighbours" to window. */
  list?: readonly string[];
}

/** `mx-auto` is 57x in the real pages — and `p-auto` does not exist, so only margins get it. */
const MARGIN = ['auto', ...SPACING];

const SPACING_FAMILIES = [
  'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'ps', 'pe',
  'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'ms', 'me',
  'gap', 'gap-x', 'gap-y', 'space-x', 'space-y',
  'top', 'right', 'bottom', 'left', 'inset', 'inset-x', 'inset-y',
];

const RADIUS_FAMILIES = [
  'rounded', 'rounded-t', 'rounded-r', 'rounded-b', 'rounded-l',
  'rounded-tl', 'rounded-tr', 'rounded-br', 'rounded-bl',
];

/** Families that only ever take a colour. `text` and `border` are NOT here — they take both. */
const COLOR_FAMILIES = [
  'bg', 'ring', 'divide', 'outline', 'decoration', 'fill', 'stroke', 'placeholder', 'accent',
  'caret', 'from', 'via', 'to',
];

const FAMILIES: Record<string, IFamilySpec> = {
  // Enumerated families: the resolver has to know them, or `justify-between` would come back with no
  // family at all and the panel would have nothing to offer for a sixth of every page.
  ...Object.fromEntries(Object.entries(LIST_VALUES).map(([family, list]) => [family, {
    list,
    // A size is both: `h-full` is a keyword and `h-24` is a step of the spacing scale. The value
    // decides which vocabulary applies (the list is checked first).
    ...(['w', 'h', 'min-w', 'min-h', 'max-h'].includes(family) ? { scale: SPACING } : {}),
  }])),
  ...Object.fromEntries(SPACING_FAMILIES.map((family) => [family, {
    scale: /^m[xytrbles]?$/u.test(family) ? MARGIN : SPACING,
  }])),
  ...Object.fromEntries(RADIUS_FAMILIES.map((family) => [family, { scale: RADIUS }])),
  ...Object.fromEntries(COLOR_FAMILIES.map((family) => [family, { color: true }])),
  text: { scale: FONT_SIZE, color: true },
  border: { scale: BORDER_WIDTH, color: true },
  transition: { list: TRANSITION_SCOPES },
  duration: { scale: TIME_SCALE },
  delay: { scale: TIME_SCALE },
  ease: { list: EASINGS },
  'translate-x': { scale: SPACING },
  'translate-y': { scale: SPACING },
  scale: { scale: SCALE_PERCENT },
  'scale-x': { scale: SCALE_PERCENT },
  'scale-y': { scale: SCALE_PERCENT },
  rotate: { scale: ROTATE },
  brightness: { scale: FILTER_PERCENT },
  contrast: { scale: FILTER_PERCENT },
  saturate: { scale: FILTER_PERCENT },
  blur: { list: BLUR },
  // Arbitrary properties: the only way to retime a keyframe (`duration-*` drives transitions), so the
  // Animações tab writes them and this tab has to know them.
  '[animation-duration]': { list: ['0.5s', '1s', '2s', '3s', '5s'] },
  '[animation-iteration-count]': { list: ['1', '2', '3', 'infinite'] },
  '[animation-play-state]': { list: ['running', 'paused'] },
  font: { scale: FONT_WEIGHT },
  shadow: { scale: SHADOW },
  opacity: { scale: OPACITY },
  'max-w': { scale: MAX_WIDTH },
  leading: { scale: LEADING },
  tracking: { scale: TRACKING },
};

/** Known families, longest first: `space-y-1` must not be read as the family `space`. */
const FAMILY_NAMES = Object.keys(FAMILIES).sort((a, b) => b.length - a.length);

/**
 * Tokens of a `class` literal, in source order.
 *
 * The family is resolved by longest known prefix instead of "split at the last dash", which would
 * turn `space-y-1` into `space-y` + `1` only by luck and `max-w-6xl` into `max-w-6` + `xl`. An
 * unknown family comes back as `family: ''` — a token this module has no vocabulary for, which the
 * panel shows read-only rather than guessing a scale for it.
 */
export function splitUtilities(literal: string): IUtilityToken[] {
  const tokens: IUtilityToken[] = [];
  const pattern = /\S+/gu;
  let index = 0;

  for (const match of literal.matchAll(pattern)) {
    const raw = match[0];
    // Split variants on the colons OUTSIDE brackets: an arbitrary property carries its own
    // (`hover:[animation-play-state:paused]`), and cutting there turned the class into the nonsense
    // variant `[animation-play-state` with the base `paused]`.
    const parts = splitOutsideBrackets(raw);
    const base = parts.pop() ?? '';
    const variants = parts;
    const negative = base.startsWith('-');
    const bare = negative ? base.slice(1) : base;

    let family = '';
    let value = bare;
    let property: string | undefined;

    // `[animation-duration:2s]` sets a css property directly. It is a family of its own — keyed by the
    // property — and NOT an arbitrary value of some other family.
    const asProperty = /^\[([a-zA-Z-]+):(.+)\]$/u.exec(bare);
    if (asProperty) {
      property = asProperty[1];
      family = `[${property}]`;
      value = asProperty[2];
    }

    for (const candidate of property ? [] : FAMILY_NAMES) {
      if (bare === candidate) { family = candidate; value = ''; break; }
      if (bare.startsWith(`${candidate}-`)) { family = candidate; value = bare.slice(candidate.length + 1); break; }
    }

    tokens.push({
      raw,
      variants,
      base,
      negative,
      family,
      value,
      arbitrary: !property && value.startsWith('['),
      property,
      index,
      offset: match.index ?? 0,
    });
    index += 1;
  }

  return tokens;
}

/** Colons that separate variants — the ones inside `[...]` belong to the value. */
function splitOutsideBrackets(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of raw) {
    if (ch === '[') depth += 1;
    if (ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ':' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/** Rebuilds a class token with another value, keeping variants and the negative sign. */
export function composeUtility(token: IUtilityToken, value: string): string {
  const prefix = token.variants.length ? `${token.variants.join(':')}:` : '';
  // An arbitrary property has its own shape: `[animation-duration:2s]`, not `family-value`.
  if (token.property) return `${prefix}[${token.property}:${value}]`;
  const sign = token.negative ? '-' : '';
  const suffix = value === '' ? '' : `-${value}`;
  return `${prefix}${sign}${token.family}${suffix}`;
}

export type UtilityOptionKind = 'scale' | 'color' | 'role' | 'list' | 'none';

export interface IUtilityOptions {
  kind: UtilityOptionKind;
  /** Full class strings, variants included, the current one among them. */
  options: string[];
  /** Absent when there are options; a message to show otherwise. */
  reason?: IMessageRef;
}

/** The current value, inserted into the scale when it is not one of the curated steps. */
function withCurrent(scale: readonly string[], current: string): string[] {
  if (scale.includes(current)) return [...scale];
  const asNumber = Number(current);
  if (!Number.isFinite(asNumber)) return [...scale, current];
  const merged = [...scale];
  const at = merged.findIndex((step) => Number.isFinite(Number(step)) && Number(step) > asNumber);
  merged.splice(at < 0 ? merged.length : at, 0, current);
  return merged;
}

/** Up to `2 * span + 1` steps centred on the current one, sliding at the edges so the count holds. */
function windowAround(scale: readonly string[], current: string, span: number): string[] {
  const at = scale.indexOf(current);
  if (at < 0) return [...scale].slice(0, span * 2 + 1);
  const size = Math.min(scale.length, span * 2 + 1);
  let start = at - span;
  if (start < 0) start = 0;
  if (start + size > scale.length) start = scale.length - size;
  return [...scale].slice(start, start + size);
}

/** `gray-400` -> `{ palette: 'gray', shade: '400' }`, for a known palette only. */
function splitColor(value: string): { palette: string; shade: string } | null {
  const at = value.lastIndexOf('-');
  if (at < 0) return null;
  const palette = value.slice(0, at);
  const shade = value.slice(at + 1);
  if (!PALETTES.includes(palette) || !SHADES.includes(shade)) return null;
  return { palette, shade };
}

/**
 * What to offer for a token: the neighbours of the current step, or nothing with a reason.
 *
 * An arbitrary value (`bg-[var(--surface-subtle,#f8fafc)]`) is deliberately NOT offered a scale: the
 * right vocabulary there is the design system's ROLES, which is the next step of the task. Offering
 * a hex or a raw step in its place would be a downgrade, so it comes back read-only.
 */
export function utilityOptions(
  token: IUtilityToken,
  span = 2,
  roles: readonly string[] = [],
  resolve?: (cssVar: string) => string,
): IUtilityOptions {
  if (token.arbitrary) {
    // `var(--role, #hex)` is the shape the generator emits: the vocabulary is the design system's
    // ROLES, never a hex and never a palette step (that would throw the token away).
    if (parseVarValue(token.value)) {
      if (!roles.length) {
        return { kind: 'none', options: [], reason: { id: 'reason.noDsTokens' } };
      }
      const options = roleOptions(token, [...roles], resolve);
      return options.length
        ? { kind: 'role', options }
        : { kind: 'none', options: [], reason: { id: 'reason.noRoleForFamily', params: { family: token.family } } };
    }

    // A typed value (`starting:-translate-x-[400px]`, `p-[13px]`) is a legitimate CURRENT value, not a
    // dead end: keep it as the current option and offer the family's own steps as the way back.
    const arbitrarySpec = FAMILIES[token.family];
    const steps = arbitrarySpec?.list ?? arbitrarySpec?.scale;
    if (steps) {
      return {
        kind: arbitrarySpec.list ? 'list' : 'scale',
        options: [token.raw, ...steps.map((value) => composeUtility(token, value))],
      };
    }
    return { kind: 'none', options: [], reason: NO_OPTIONS };
  }
  // A whole class with no value (`flex`, `italic`): its alternatives are the other members of its list.
  const whole = wholeClassFamily(token.base.replace(/^-/u, ''));
  if (whole) {
    return { kind: 'list', options: whole.classes.map((cls) => composeWhole(token, cls)) };
  }

  if (!token.family) {
    return { kind: 'none', options: [], reason: NO_OPTIONS };
  }

  const spec = FAMILIES[token.family];

  // An enumerated family is shown IN FULL: five values have no "neighbours" to window around.
  if (spec.list?.includes(token.value)) {
    return { kind: 'list', options: spec.list.map((value) => composeUtility(token, value)) };
  }

  // A value outside the list is still the CURRENT value — a typed `[animation-duration:10050ms]`, or a
  // step of Tailwind this table does not carry. It leads, and the list is the way back.
  if (spec.list && !spec.scale && !spec.color) {
    return {
      kind: 'list',
      options: [token.raw, ...spec.list.map((value) => composeUtility(token, value))],
    };
  }

  if (spec.scale?.includes(token.value) || (spec.scale && !spec.color)) {
    if (!spec.scale.includes(token.value) && !Number.isFinite(Number(token.value))) {
      return { kind: 'none', options: [], reason: NO_OPTIONS };
    }
    const scale = withCurrent(spec.scale, token.value);
    return {
      kind: 'scale',
      options: windowAround(scale, token.value, span).map((value) => composeUtility(token, value)),
    };
  }

  if (spec.color) {
    const color = splitColor(token.value);
    if (!color) {
        // `text-left` is an alignment and `border-b` is a side: the same family, a different meaning,
      // and each has its own short list.
      const list = DUAL_LIST_VALUES[token.family];
      if (list?.includes(token.value)) {
        return { kind: 'list', options: list.map((value) => composeUtility(token, value)) };
      }
      return { kind: 'none', options: [], reason: NO_OPTIONS };
    }
    return {
      kind: 'color',
      options: windowAround(SHADES, color.shade, span)
        .map((shade) => composeUtility(token, `${color.palette}-${shade}`)),
    };
  }

  return { kind: 'none', options: [], reason: NO_OPTIONS };
}

/**
 * Replaces one token of a literal, keeping every other character — the original whitespace included.
 *
 * Offset-based rather than `split(' ').join(' ')`: normalising the separators would rewrite lines the
 * user never asked to touch, and on a repeated literal that diff noise lands in the source.
 *
 * `tokenIndex` is what makes a literal with the same class twice unambiguous; without it the first
 * match wins.
 */
export function replaceUtility(literal: string, from: string, to: string, tokenIndex?: number): string {
  const tokens = splitUtilities(literal);
  const token = typeof tokenIndex === 'number'
    ? tokens.find((candidate) => candidate.index === tokenIndex && candidate.raw === from)
    : tokens.find((candidate) => candidate.raw === from);
  if (!token) return literal;
  return literal.slice(0, token.offset) + to + literal.slice(token.offset + token.raw.length);
}

// --- Design system roles (the vocabulary for arbitrary values) ---

export interface IVarValue {
  /** `--surface-subtle` */
  cssVar: string;
  /** The fallback after the comma, '' when there is none. */
  fallback: string;
}

/**
 * `[var(--surface-subtle,#f8fafc)]` -> the role and its fallback.
 *
 * This is the shape the page generator emits for every colour, so it is the shape the picker has to
 * speak: the token is the meaning, the hex is only what shows when no design system is loaded.
 */
export function parseVarValue(value: string): IVarValue | null {
  const match = value.match(/^\[var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)\]$/u);
  if (!match) return null;
  return { cssVar: match[1], fallback: (match[2] ?? '').trim() };
}

/**
 * Role tokens declared by the design system css, in declaration order.
 *
 * Read from the LIGHT block only: the dark block repeats the same names
 * ([designSystemBase.ts:264](mls-102029/l2/designSystemBase.ts#L264) strips the `_dark-` prefix), so
 * taking both would just duplicate every role.
 *
 * `--ml-*` are excluded: those are the molecule reconciliation tokens
 * ([getMlTokensCss](mls-102029/l2/designSystemBase.ts#L138)), not roles a page is meant to reference.
 */
export function readDesignSystemRoles(css: string): string[] {
  const rootBlock = css.match(/:root\s*\{([^}]*)\}/u);
  if (!rootBlock) return [];
  const roles: string[] = [];
  for (const match of rootBlock[1].matchAll(/(--[\w-]+)\s*:/gu)) {
    const role = match[1];
    if (role.startsWith('--ml-')) continue;
    if (!roles.includes(role)) roles.push(role);
  }
  return roles;
}

/**
 * Roles that make sense for a family — the DS naming rule is what makes this possible: "o nome diz
 * onde o token é usado" (`*-bg` for surfaces, `*-text` for type, `border-*` for edges), so a
 * background picker never offers a text role.
 */
function rolesForFamily(family: string, roles: string[]): string[] {
  if (family === 'bg') return roles.filter((role) => role.endsWith('-bg'));
  if (['text', 'placeholder', 'caret', 'decoration'].includes(family)) {
    return roles.filter((role) => role.endsWith('-text') || role.startsWith('--text-'));
  }
  if (['border', 'divide', 'outline', 'ring'].includes(family)) {
    return roles.filter((role) => role.includes('border'));
  }
  if (family === 'shadow') return roles.filter((role) => role.includes('shadow'));
  return roles;
}

/**
 * Replacement classes for an arbitrary `var(--role, fallback)` value, current one FIRST.
 *
 * The fallback is re-resolved from the role's own computed value instead of being carried over: the
 * old hex belongs to the old role, and keeping it would leave the page rendering the previous colour
 * whenever the design system fails to load. A value with whitespace (`rgb(0 0 0 / .1)`) is dropped
 * rather than encoded — a broken class would be worse than no fallback.
 *
 * NOT capped by default: measured against the real 102046 design system (215 roles), the per-family
 * filter leaves 17 background / 25 text / 16 border roles — a dropdown's worth. A cap here would
 * silently hide the tail of the list, which is the one thing worse than a long list.
 */
export function roleOptions(
  token: IUtilityToken,
  roles: string[],
  resolve?: (cssVar: string) => string,
  limit = Number.POSITIVE_INFINITY,
): string[] {
  const current = parseVarValue(token.value);
  if (!current) return [];

  const candidates = rolesForFamily(token.family, roles)
    // Only roles that ARE colours. The design system also carries typography and spacing, and the
    // families without a name rule (`fill`, `from`, …) fall back to every role — measured on the real
    // 102046, that offered `fill-[var(--font-size-16)]`, which is nonsense wearing a valid class shape.
    // Without a resolver there is no way to tell, so nothing is dropped.
    .filter((role) => !resolve || Boolean(colorOf(resolve(role))));
  const ordered = [current.cssVar, ...candidates.filter((role) => role !== current.cssVar)];

  return ordered.slice(0, limit).map((role) => {
    const resolved = role === current.cssVar && !resolve
      ? current.fallback
      : (resolve?.(role) ?? '').trim();
    const fallback = resolved && !/\s/u.test(resolved) ? `,${resolved}` : '';
    return composeUtility(token, `[var(${role}${fallback})]`);
  });
}

// --- Friendly names ---
//
// The row label used to be the class itself (`bg-[var(--button-secondary-bg,#f8fafc)]`), which says
// what is written, not what it DOES. The class stays reachable — it is the row's tooltip — but the
// label reads as the property being edited.
//
// The tables map to MESSAGE IDS, not to words: this module is pure and has no business owning prose
// (the words live in studioMessages). Several classes share one id on purpose — `block`, `flex` and
// `grid` are all "display" — so the catalog stays small.
//
// The variant is part of the label and NOT decoration: `text-gray-400` and `dark:text-gray-300` are two
// different rows that would otherwise read the same, leaving the user to guess which is which.

const FAMILY_LABELS: Record<string, string> = {
  p: 'prop.padding',
  px: 'prop.paddingX',
  py: 'prop.paddingY',
  pt: 'prop.paddingTop',
  pr: 'prop.paddingRight',
  pb: 'prop.paddingBottom',
  pl: 'prop.paddingLeft',
  ps: 'prop.paddingStart',
  pe: 'prop.paddingEnd',
  m: 'prop.margin',
  mx: 'prop.marginX',
  my: 'prop.marginY',
  mt: 'prop.marginTop',
  mr: 'prop.marginRight',
  mb: 'prop.marginBottom',
  ml: 'prop.marginLeft',
  ms: 'prop.marginStart',
  me: 'prop.marginEnd',
  gap: 'prop.gap',
  'gap-x': 'prop.gapX',
  'gap-y': 'prop.gapY',
  'space-x': 'prop.spaceX',
  'space-y': 'prop.spaceY',
  rounded: 'prop.radius',
  'rounded-t': 'prop.radiusTop',
  'rounded-r': 'prop.radiusRight',
  'rounded-b': 'prop.radiusBottom',
  'rounded-l': 'prop.radiusLeft',
  'rounded-tl': 'prop.radiusTopLeft',
  'rounded-tr': 'prop.radiusTopRight',
  'rounded-br': 'prop.radiusBottomRight',
  'rounded-bl': 'prop.radiusBottomLeft',
  font: 'prop.fontWeight',
  shadow: 'prop.shadow',
  opacity: 'prop.opacity',
  'max-w': 'prop.maxWidth',
  leading: 'prop.leading',
  tracking: 'prop.tracking',
  bg: 'prop.bgColor',
  ring: 'prop.ringColor',
  divide: 'prop.divideColor',
  outline: 'prop.outline',
  decoration: 'prop.decorationColor',
  fill: 'prop.fill',
  stroke: 'prop.stroke',
  placeholder: 'prop.placeholderColor',
  accent: 'prop.accentColor',
  caret: 'prop.caretColor',
  from: 'prop.gradientFrom',
  via: 'prop.gradientVia',
  to: 'prop.gradientTo',
  top: 'prop.top',
  right: 'prop.right',
  bottom: 'prop.bottom',
  left: 'prop.left',
  inset: 'prop.inset',
  'inset-x': 'prop.insetX',
  'inset-y': 'prop.insetY',
  justify: 'prop.justify',
  items: 'prop.items',
  self: 'prop.self',
  content: 'prop.content',
  overflow: 'prop.overflow',
  'overflow-x': 'prop.overflowX',
  'overflow-y': 'prop.overflowY',
  w: 'prop.width',
  h: 'prop.height',
  'min-w': 'prop.minWidth',
  'min-h': 'prop.minHeight',
  'max-h': 'prop.maxHeight',
  'grid-cols': 'prop.gridCols',
  'grid-rows': 'prop.gridRows',
  'col-span': 'prop.colSpan',
  'row-span': 'prop.rowSpan',
  z: 'prop.zIndex',
  order: 'prop.order',
  whitespace: 'prop.whitespace',
  break: 'prop.wordBreak',
  aspect: 'prop.aspect',
  object: 'prop.objectFit',
  'pointer-events': 'prop.pointerEvents',
  select: 'prop.userSelect',
  align: 'prop.verticalAlign',
  cursor: 'prop.cursor',
  'translate-x': 'prop.translateX',
  'translate-y': 'prop.translateY',
  scale: 'prop.scale',
  'scale-x': 'prop.scaleX',
  'scale-y': 'prop.scaleY',
  rotate: 'prop.rotate',
  brightness: 'prop.brightness',
  contrast: 'prop.contrast',
  saturate: 'prop.saturate',
  blur: 'prop.blur',
  animate: 'prop.animation',
  duration: 'prop.duration',
  delay: 'prop.delay',
  ease: 'prop.easing',
  transition: 'prop.transition',
  '[animation-duration]': 'prop.animationSpeed',
  '[animation-iteration-count]': 'prop.animationRepeat',
  '[animation-play-state]': 'prop.animationPlayState',
};

/** Families whose meaning depends on the VALUE: `text-sm` is a size, `text-gray-400` is a colour. */
const DUAL_FAMILY_LABELS: Record<string, { scale: string; color: string }> = {
  text: { scale: 'prop.textSize', color: 'prop.textColor' },
  border: { scale: 'prop.borderWidth', color: 'prop.borderColor' },
};

/**
 * Values of a dual family that are neither a step nor a colour.
 *
 * Without this, `text-left` fell into the family's scale label and read "text size" — a WRONG name,
 * which is worse than no name at all.
 */
const DUAL_VALUE_LABELS: Record<string, Record<string, string>> = {
  text: {
    left: 'prop.textAlign', center: 'prop.textAlign', right: 'prop.textAlign',
    justify: 'prop.textAlign', start: 'prop.textAlign', end: 'prop.textAlign',
    nowrap: 'prop.textWrap', wrap: 'prop.textWrap', balance: 'prop.textWrap', pretty: 'prop.textWrap',
    ellipsis: 'prop.textOverflow', clip: 'prop.textOverflow',
  },
  border: {
    t: 'prop.borderSideTop', r: 'prop.borderSideRight', b: 'prop.borderSideBottom',
    l: 'prop.borderSideLeft', x: 'prop.borderSideX', y: 'prop.borderSideY',
    solid: 'prop.borderStyle', dashed: 'prop.borderStyle', dotted: 'prop.borderStyle',
    none: 'prop.borderStyle',
  },
  divide: { x: 'prop.divideAxis', y: 'prop.divideAxis' },
};

/**
 * Families where the VALUE decides between two UNRELATED properties — and neither is a step of the
 * other, so `DUAL_FAMILY_LABELS` (which asks what kind of options the family offers) cannot tell them
 * apart: `ring-1` is a width and `ring-[var(--button-secondary-border,#cbd5e1)]` is a colour;
 * `divide-y` is which edge carries the line and `divide-[var(--border-subtle,#e2e8f0)]` is its colour.
 *
 * Measured in the 102046 pages: 8 elements carry `ring-1` next to a `ring-[…]` and 9 carry `divide-y`
 * next to a `divide-[…]`. One name for both is a WRONG label in the panel (the `text-left` bug again)
 * and, for a paste, a silent deletion — holding one back would drop the other as the same property.
 */
const SPLIT_FAMILIES: Record<string, { test: RegExp; match: string; other: string }> = {
  // A bare `ring` is a 1px ring, so the empty value belongs with the numbers.
  ring: { test: /^\d*$/u, match: 'prop.ringWidth', other: 'prop.ringColor' },
  divide: { test: /^[xy](?:-|$)/u, match: 'prop.divideAxis', other: 'prop.divideColor' },
};

/** Classes with no family in this module's vocabulary but a clear meaning — layout, mostly. */
const STANDALONE_LABELS: Record<string, string> = {
  block: 'prop.display', 'inline-block': 'prop.display', inline: 'prop.display', flex: 'prop.display',
  'inline-flex': 'prop.display', grid: 'prop.display', 'inline-grid': 'prop.display',
  hidden: 'prop.display', contents: 'prop.display', table: 'prop.display',
  relative: 'prop.positioning', absolute: 'prop.positioning', fixed: 'prop.positioning',
  sticky: 'prop.positioning', static: 'prop.positioning',
  truncate: 'prop.textOverflow', 'text-ellipsis': 'prop.textOverflow', 'text-clip': 'prop.textOverflow',
  underline: 'prop.underline', 'no-underline': 'prop.underline', 'line-through': 'prop.underline',
  italic: 'prop.fontStyle', 'not-italic': 'prop.fontStyle',
  uppercase: 'prop.textCase', lowercase: 'prop.textCase', capitalize: 'prop.textCase',
  'normal-case': 'prop.textCase',
  'sr-only': 'prop.srOnly',
  'normal-nums': 'prop.numeric', 'tabular-nums': 'prop.numeric', 'proportional-nums': 'prop.numeric',
  'flex-row': 'prop.flexDirection', 'flex-row-reverse': 'prop.flexDirection',
  'flex-col': 'prop.flexDirection', 'flex-col-reverse': 'prop.flexDirection',
  'flex-wrap': 'prop.flexWrap', 'flex-wrap-reverse': 'prop.flexWrap', 'flex-nowrap': 'prop.flexWrap',
  'flex-1': 'prop.flexGrow', 'flex-auto': 'prop.flexGrow', 'flex-initial': 'prop.flexGrow',
  'flex-none': 'prop.flexGrow',
};

/** Prefixes of classes with no family here, matched by longest prefix like the families are. */
const STANDALONE_PREFIX_LABELS: Record<string, string> = {
  'grid-cols': 'prop.gridCols',
  'grid-rows': 'prop.gridRows',
  'col-span': 'prop.colSpan',
  'row-span': 'prop.rowSpan',
  justify: 'prop.justify',
  items: 'prop.items',
  self: 'prop.self',
  content: 'prop.content',
  'overflow-x': 'prop.overflowX', 'overflow-y': 'prop.overflowY', overflow: 'prop.overflow',
  'min-h': 'prop.minHeight', 'min-w': 'prop.minWidth', 'max-h': 'prop.maxHeight',
  w: 'prop.width', h: 'prop.height', z: 'prop.zIndex', order: 'prop.order',
  whitespace: 'prop.whitespace', break: 'prop.wordBreak',
  aspect: 'prop.aspect', object: 'prop.objectFit', 'pointer-events': 'prop.pointerEvents',
  select: 'prop.userSelect', align: 'prop.verticalAlign', cursor: 'prop.cursor',
  animate: 'prop.animation', duration: 'prop.duration', delay: 'prop.delay', ease: 'prop.easing',
  transition: 'prop.transition',
};

const VARIANT_LABELS: Record<string, string> = {
  dark: 'variant.dark',
  hover: 'variant.hover',
  focus: 'variant.focus',
  'focus-visible': 'variant.focusVisible',
  'focus-within': 'variant.focusWithin',
  active: 'variant.active',
  visited: 'variant.visited',
  disabled: 'variant.disabled',
  checked: 'variant.checked',
  required: 'variant.required',
  invalid: 'variant.invalid',
  first: 'variant.first',
  last: 'variant.last',
  odd: 'variant.odd',
  even: 'variant.even',
  empty: 'variant.empty',
  'group-hover': 'variant.groupHover',
  'group-focus': 'variant.groupFocus',
  'peer-checked': 'variant.peerChecked',
  'motion-safe': 'variant.motionSafe',
  'motion-reduce': 'variant.motionReduce',
  print: 'variant.print',
  rtl: 'variant.rtl',
  starting: 'variant.starting',
};

const BREAKPOINTS = new Set(['sm', 'md', 'lg', 'xl', '2xl']);

/** One part of a row label: an id to translate, or a raw word when the variant is unknown. */
export interface ILabelPart {
  id?: string;
  params?: Record<string, string | number>;
  /** Shown as-is when there is no id — an unknown variant is better shown than dropped. */
  raw?: string;
}

export interface IUtilityLabel {
  /** Message id of the property being edited; absent when there is no honest name for it. */
  property?: string;
  /** The variants, in order, each already resolved to an id or a raw word. */
  variants: ILabelPart[];
}

/**
 * A size hiding in the shape the generator uses for colours.
 *
 * Every colour it writes is `[var(--role,#hex)]`, so the arbitrary value of a dual family was read as
 * a colour — but it also writes `text-[var(--font-size-24,1.5rem)]`, and that is a text SIZE. The
 * fallback is what tells them apart (3 elements in the 102046 pages carry both at once).
 */
function arbitraryIsLength(value: string): boolean {
  const parsed = parseVarValue(value);
  const inner = parsed ? parsed.fallback : value.replace(/^\[|\]$/gu, '');
  return /^-?[\d.]+(?:rem|px|em|ch|vw|vh|%)$/u.test(inner.trim());
}

function variantPart(variant: string): ILabelPart {
  if (BREAKPOINTS.has(variant)) return { id: 'variant.breakpointFrom', params: { name: variant } };
  if (variant.startsWith('max-')) return { id: 'variant.breakpointUntil', params: { name: variant.slice(4) } };
  const id = VARIANT_LABELS[variant];
  return id ? { id } : { raw: variant };
}

/**
 * What the row is EDITING — as ids, for whoever renders to translate.
 *
 * No property means there is no honest name (`isolate`, `mix-blend-multiply`): the panel then shows the
 * class itself, which at least is the truth.
 */
export function utilityLabel(token: IUtilityToken): IUtilityLabel {
  const dual = DUAL_FAMILY_LABELS[token.family];
  let property = FAMILY_LABELS[token.family] ?? '';

  if (dual) {
    const options = utilityOptions(token);
    // The value decides: a step of the scale, a palette colour, an arbitrary `var(--role)` (always a
    // colour in the generator's output), or something that is neither — `text-left` is not a size.
    if (options.kind === 'scale') property = dual.scale;
    else if (options.kind === 'color' || options.kind === 'role') property = dual.color;
    else if (token.arbitrary) property = arbitraryIsLength(token.value) ? dual.scale : dual.color;
    else property = DUAL_VALUE_LABELS[token.family]?.[token.value] ?? '';
  }

  const split = SPLIT_FAMILIES[token.family];
  if (split) property = split.test.test(token.value) ? split.match : split.other;

  if (!property) property = STANDALONE_LABELS[token.base.replace(/^-/u, '')] ?? '';
  if (!property) {
    const bare = token.base.replace(/^-/u, '');
    let longest = '';
    for (const prefix of Object.keys(STANDALONE_PREFIX_LABELS)) {
      if ((bare === prefix || bare.startsWith(`${prefix}-`)) && prefix.length > longest.length) longest = prefix;
    }
    if (longest) property = STANDALONE_PREFIX_LABELS[longest];
  }

  if (!property) return { variants: [] };
  return { property, variants: token.variants.map(variantPart) };
}

// --- Colour of a design-system role ---
//
// A dropdown of role NAMES ("surface-alt-bg", "status-warning-bg") says nothing about the colour, and
// finding out meant applying one and looking. The picker shows a swatch next to each name instead.

/**
 * The colour a resolved token value paints, or null when the value is not a colour.
 *
 * Null matters: a design system also carries durations (`0.3s`), sizes (`0.25rem`) and font stacks, and
 * some families fall back to offering every role. A swatch for `0.3s` would be a lie the user has to
 * decode — and, upstream of the swatch, it is what keeps those roles out of a COLOUR picker at all.
 */
export function colorOf(value: string): string | null {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    return [3, 4, 6, 8].includes(hex.length) && /^[0-9a-f]+$/iu.test(hex) ? trimmed : null;
  }
  // Function shapes are colours the browser knows how to paint; the swatch just hands it over.
  if (/^(rgba?|hsla?|oklch|oklab|lab|lch|color|color-mix)\(/iu.test(trimmed)) return trimmed;
  if (['white', 'black', 'transparent', 'currentcolor'].includes(trimmed.toLowerCase())) return trimmed;

  return null;
}

/** The role a class token points at (`bg-[var(--surface-subtle,#f8fafc)]` -> `--surface-subtle`). */
export function roleVar(option: string): string {
  const parsed = parseVarValue(option.slice(option.indexOf('[')));
  return parsed?.cssVar ?? '';
}

/** The role a class token points at, for display (`--surface-subtle` -> `surface-subtle`). */
export function roleLabel(option: string): string {
  return roleVar(option).replace(/^--/u, '') || option;
}

/** What the panel does with one candidate class. */
export type ChipAvailability = 'offer' | 'jit-only' | 'hidden';

/**
 * Whether a candidate class may be offered — the JIT dependency of this whole picker.
 *
 * Without the JIT the vocabulary is whatever the BUILT css happens to contain, and the measurement
 * that motivated the task is brutal: a real generated sheet had a single `p-N` in the entire page.
 * Offering `p-5` there produces an element with NO padding, and no error anywhere. So:
 *
 * - in the built css: offer, it works everywhere;
 * - not in the built css, JIT live: offer MARKED — it works here, and for the client only after the
 *   next publish;
 * - not in the built css, no JIT: hide it. A chip that silently drops the utility is worse than a
 *   chip that is not there.
 *
 * The current class is always shown, whatever the sheets say: it is what the element already has.
 */
export function chipAvailability(
  isCurrent: boolean,
  inBuiltCss: boolean,
  jitLive: boolean,
): ChipAvailability {
  if (isCurrent) return 'offer';
  if (inBuiltCss) return 'offer';
  return jitLive ? 'jit-only' : 'hidden';
}

// --- Adding and removing utilities (the picker's second gesture) ---
//
// Everything above CHANGES a utility the element already has. The animation tab is the first
// vocabulary that ADDS one, which needs its own two operations — and, in the animation case, the
// notion of a group where only one member may be on at a time.

/** Adds a class at the end of the literal, keeping the original spacing. No-op when already there. */
export function addUtility(literal: string, cls: string): string {
  if (!cls.trim()) return literal;
  if (splitUtilities(literal).some((token) => token.raw === cls)) return literal;
  return literal.trim() ? `${literal.trimEnd()} ${cls}` : cls;
}

/**
 * Removes a class, collapsing the space it leaves behind.
 *
 * The whitespace between the SURVIVING tokens is preserved (the source is the user's file, not ours);
 * only the separator of the removed one goes.
 */
export function removeUtility(literal: string, cls: string): string {
  const token = splitUtilities(literal).find((candidate) => candidate.raw === cls);
  if (!token) return literal;
  const before = literal.slice(0, token.offset);
  const after = literal.slice(token.offset + token.raw.length);
  // Only the separator of the removed token goes; the spacing between the survivors is the user's.
  if (!before.trim()) return after.replace(/^\s+/u, '');
  if (!after.trim()) return before.replace(/\s+$/u, '');
  return `${before.replace(/\s+$/u, '')} ${after.replace(/^\s+/u, '')}`;
}

/** True when the literal carries the class, with or without a variant prefix (`motion-safe:`). */
export function hasUtility(literal: string, cls: string): boolean {
  return splitUtilities(literal).some((token) => token.raw === cls || token.base === cls);
}

// --- Animations ---
//
// The tab has SCREENS, not one long list: the panel is 340px wide, and the useful gesture ("põe um
// pulse nisso") must not cost the same scrolling as fine-tuning an easing curve. So the root screen
// carries the short list of each family plus a `...` into the family's full screen, and everything
// that is tuning (what transitions, how long, which curve, delay) lives behind `Avançado`.
//
// The vocabulary is ONLY what exists. Tailwind ships four keyframes (`spin`, `pulse`, `bounce`,
// `ping`) and they are already the house standard: the client pages use `animate-pulse` 51 times for
// loading skeletons and the 102040 molecules use `animate-spin` 51 times. So the full continuous
// screen is not "more keyframes" — there are no more — it is CONFIGURATION of those four: speed,
// repetitions, whether it starts on hover, whether it pauses under the mouse. Inventing
// `animate-fade-in` would produce a dead class (no `@keyframes` anywhere, and the JIT does not invent
// them), exactly what already happened to the `animate-slide-in-top` of ml-toast-notification.
//
// Duration/delay come from Tailwind's own scale, NOT from the design system's `transition-*` tokens:
// in the real projects those are inverted (`transition-fast: 0.5s`, `transition-slow: 0.2s`) and the
// picker must not spread that silently.

export type AnimationKind =
  | 'animation' | 'speed' | 'repeat' | 'pause'
  | 'hover'
  | 'entrance'
  | 'transitionScope' | 'duration' | 'easing' | 'delay';

export type AnimationScreen = 'root' | 'continuous' | 'hover' | 'entrance' | 'advanced';

/**
 * A typed value for a group — the curated scales are the FAST PATH, not a ceiling.
 *
 * Written as a Tailwind arbitrary value (`duration-[850ms]`, `starting:translate-y-[22px]`), so it
 * needs the JIT in the studio and lands in the client's css on the next publish, exactly like every
 * other chip. Every shape offered here was compiled with the `tailwindcss@4.3.0` of the lockfile.
 */
export interface IAnimationCustom {
  /** Shown next to the input, and part of the class the template writes. */
  unit: 'ms' | 'px' | '%' | 'x' | 'deg';
  min: number;
  max: number;
  /** Classes to write. `{v}` is the typed value; `{s}` is the sign of the group's active option. */
  templates: string[];
  /** Matches the token BASE (variants stripped) and captures the number. */
  match: RegExp;
  /**
   * Variant the token must carry to belong to this group.
   *
   * Not decoration: an entrance zoom writes `starting:scale-[87%]` and a hover zoom writes
   * `hover:scale-[103%]` — the same base. Without the variant, one group would read the other's value.
   */
  variant?: string;
  hint: string;
}


export interface IAnimationOption {
  id: string;
  label: string;
  /** BASE classes, without the variants the state decides (`motion-safe:`, the trigger). */
  classes: string[];
  hint: string;
}

export interface IAnimationGroup {
  id: string;
  title: string;
  /** Label for the single chip the ROOT screen shows for this group; falls back to `title`. */
  rootLabel?: string;
  kind: AnimationKind;
  /** Only one member on at a time. */
  exclusive: boolean;
  /** What the root screen's single chip for this group turns on. */
  defaultOptionId?: string;
  options: IAnimationOption[];
  /** Set when the group accepts a typed value — the curated scale is the fast path, not a ceiling. */
  custom?: IAnimationCustom;
}

/** A state switch (not an add/remove): rewrites the variants of what is already on the element. */
export type AnimationStateKey = 'motionSafe' | 'animationTrigger' | 'hoverTrigger';

export interface IAnimationState {
  /** `motion-safe:` on everything that moves. */
  motionSafe: boolean;
  /** A continuous animation running always, or only under the mouse. */
  animationTrigger: 'always' | 'hover';
  /** Which interaction the hover effects answer to. */
  hoverTrigger: 'hover' | 'focus' | 'active';
}

const CONTINUOUS: IAnimationGroup = {
  id: 'continuous',
  title: 'anim.group.continuous',
  kind: 'animation',
  exclusive: true,
  options: [
    { id: 'spin', label: 'anim.spin.label', classes: ['animate-spin'], hint: 'anim.spin.hint' },
    { id: 'pulse', label: 'anim.pulse.label', classes: ['animate-pulse'], hint: 'anim.pulse.hint' },
    { id: 'bounce', label: 'anim.bounce.label', classes: ['animate-bounce'], hint: 'anim.bounce.hint' },
    { id: 'ping', label: 'anim.ping.label', classes: ['animate-ping'], hint: 'anim.ping.hint' },
  ],
};

// Arbitrary properties (`[animation-duration:2s]`): the only way to retime Tailwind's keyframes, since
// `duration-*` drives TRANSITIONS, not animations. The JIT generates them; the built css will only
// have them after the next publish, which the chip marks.
const SPEED: IAnimationGroup = {
  id: 'speed',
  title: 'anim.group.speed',
  kind: 'speed',
  exclusive: true,
  options: [
    { id: 'sp05', label: 'anim.sp05.label', classes: ['[animation-duration:0.5s]'], hint: 'anim.sp05.hint' },
    { id: 'sp1', label: 'anim.sp1.label', classes: ['[animation-duration:1s]'], hint: 'anim.sp1.hint' },
    { id: 'sp2', label: 'anim.sp2.label', classes: ['[animation-duration:2s]'], hint: 'anim.sp2.hint' },
    { id: 'sp3', label: 'anim.sp3.label', classes: ['[animation-duration:3s]'], hint: 'anim.sp3.hint' },
  ],
  custom: {
    unit: 'ms', min: 100, max: 20000,
    templates: ['[animation-duration:{v}ms]'],
    match: /^\[animation-duration:(\d+)ms\]$/u,
    hint: 'custom.speed',
  },
};

const REPEAT: IAnimationGroup = {
  id: 'repeat',
  title: 'anim.group.repeat',
  kind: 'repeat',
  exclusive: true,
  options: [
    { id: 'rp1', label: 'anim.rp1.label', classes: ['[animation-iteration-count:1]'], hint: 'anim.rp1.hint' },
    { id: 'rp2', label: 'anim.rp2.label', classes: ['[animation-iteration-count:2]'], hint: 'anim.rp2.hint' },
    { id: 'rp3', label: 'anim.rp3.label', classes: ['[animation-iteration-count:3]'], hint: 'anim.rp3.hint' },
  ],
  custom: {
    unit: 'x', min: 1, max: 99,
    templates: ['[animation-iteration-count:{v}]'],
    match: /^\[animation-iteration-count:(\d+)\]$/u,
    hint: 'custom.repeat',
  },
};

const PAUSE: IAnimationGroup = {
  id: 'pause',
  title: 'anim.group.pause',
  kind: 'pause',
  exclusive: false,
  options: [
    {
      id: 'pauseHover',
      label: 'anim.pauseHover.label',
      classes: ['hover:[animation-play-state:paused]'],
      hint: 'anim.pauseHover.hint',
    },
  ],
};

/** One group per EFFECT: the intensities of an effect are alternatives, not extras. */
const HOVER_GROUPS: IAnimationGroup[] = [
  {
    id: 'scale',
    title: 'anim.group.scale',
    kind: 'hover',
    exclusive: true,
    defaultOptionId: 'scale105',
    options: [
      { id: 'scale95', label: 'anim.scale95.label', classes: ['scale-95'], hint: 'anim.scale95.hint' },
      { id: 'scale105', label: 'anim.scale105.label', classes: ['scale-105'], hint: 'anim.scale105.hint' },
      { id: 'scale110', label: 'anim.scale110.label', classes: ['scale-110'], hint: 'anim.scale110.hint' },
    ],
    custom: {
      unit: '%', min: 50, max: 200,
      templates: ['scale-[{v}%]'],
      match: /^scale-\[(\d+)%\]$/u,
      hint: 'custom.scale',
    },
  },
  {
    id: 'lift',
    title: 'anim.group.lift',
    kind: 'hover',
    exclusive: true,
    defaultOptionId: 'lift05',
    options: [
      { id: 'lift05', label: 'anim.lift05.label', classes: ['-translate-y-0.5'], hint: 'anim.lift05.hint' },
      { id: 'lift1', label: 'anim.lift1.label', classes: ['-translate-y-1'], hint: 'anim.lift1.hint' },
      { id: 'lift2', label: 'anim.lift2.label', classes: ['-translate-y-2'], hint: 'anim.lift2.hint' },
    ],
    custom: {
      unit: 'px', min: 1, max: 100,
      templates: ['{s}translate-y-[{v}px]'],
      match: /^-?translate-y-\[(\d+)px\]$/u,
      hint: 'custom.lift',
    },
  },
  {
    id: 'fade',
    title: 'anim.group.fade',
    kind: 'hover',
    exclusive: true,
    defaultOptionId: 'fade80',
    options: [
      { id: 'fade90', label: 'anim.fade90.label', classes: ['opacity-90'], hint: 'anim.fade90.hint' },
      { id: 'fade80', label: 'anim.fade80.label', classes: ['opacity-80'], hint: 'anim.fade80.hint' },
      { id: 'fade70', label: 'anim.fade70.label', classes: ['opacity-70'], hint: 'anim.fade70.hint' },
    ],
    custom: {
      unit: '%', min: 5, max: 100,
      templates: ['opacity-[{v}%]'],
      match: /^opacity-\[(\d+)%\]$/u,
      hint: 'custom.fade',
    },
  },
  {
    id: 'shadow',
    title: 'anim.group.shadow',
    kind: 'hover',
    exclusive: true,
    defaultOptionId: 'shadowLg',
    options: [
      { id: 'shadowMd', label: 'anim.shadowMd.label', classes: ['shadow-md'], hint: 'anim.shadowMd.hint' },
      { id: 'shadowLg', label: 'anim.shadowLg.label', classes: ['shadow-lg'], hint: 'anim.shadowLg.hint' },
      { id: 'shadowXl', label: 'anim.shadowXl.label', classes: ['shadow-xl'], hint: 'anim.shadowXl.hint' },
    ],
  },
  {
    id: 'rotate',
    title: 'anim.group.rotate',
    kind: 'hover',
    exclusive: true,
    defaultOptionId: 'rot1',
    options: [
      { id: 'rot1', label: 'anim.rot1.label', classes: ['rotate-1'], hint: 'anim.rot1.hint' },
      { id: 'rot3', label: 'anim.rot3.label', classes: ['rotate-3'], hint: 'anim.rot3.hint' },
    ],
    custom: {
      unit: 'deg', min: 1, max: 45,
      templates: ['rotate-[{v}deg]'],
      match: /^rotate-\[(\d+)deg\]$/u,
      hint: 'custom.rotate',
    },
  },
  {
    id: 'bright',
    title: 'anim.group.bright',
    kind: 'hover',
    exclusive: true,
    defaultOptionId: 'br110',
    options: [
      { id: 'br110', label: 'anim.br110.label', classes: ['brightness-110'], hint: 'anim.br110.hint' },
      { id: 'br125', label: 'anim.br125.label', classes: ['brightness-125'], hint: 'anim.br125.hint' },
    ],
    custom: {
      unit: '%', min: 50, max: 200,
      templates: ['brightness-[{v}%]'],
      match: /^brightness-\[(\d+)%\]$/u,
      hint: 'custom.bright',
    },
  },
];

const TRANSITION_SCOPE: IAnimationGroup = {
  id: 'scope',
  title: 'anim.group.scope',
  kind: 'transitionScope',
  exclusive: true,
  options: [
    { id: 'trAll', label: 'anim.trAll.label', classes: ['transition-all'], hint: 'anim.trAll.hint' },
    { id: 'trColors', label: 'anim.trColors.label', classes: ['transition-colors'], hint: 'anim.trColors.hint' },
    { id: 'trTransform', label: 'anim.trTransform.label', classes: ['transition-transform'], hint: 'anim.trTransform.hint' },
    { id: 'trOpacity', label: 'anim.trOpacity.label', classes: ['transition-opacity'], hint: 'anim.trOpacity.hint' },
  ],
};

const DURATION: IAnimationGroup = {
  id: 'duration',
  title: 'anim.group.duration',
  kind: 'duration',
  exclusive: true,
  options: [
    { id: 'd150', label: 'anim.d150.label', classes: ['duration-150'], hint: 'anim.d150.hint' },
    { id: 'd200', label: 'anim.d200.label', classes: ['duration-200'], hint: 'anim.d200.hint' },
    { id: 'd300', label: 'anim.d300.label', classes: ['duration-300'], hint: 'anim.d300.hint' },
    { id: 'd500', label: 'anim.d500.label', classes: ['duration-500'], hint: 'anim.d500.hint' },
    { id: 'd700', label: 'anim.d700.label', classes: ['duration-700'], hint: 'anim.d700.hint' },
  ],
  custom: {
    unit: 'ms', min: 0, max: 10000,
    templates: ['duration-[{v}ms]'],
    match: /^duration-\[(\d+)ms\]$/u,
    hint: 'custom.duration',
  },
};

const EASING: IAnimationGroup = {
  id: 'easing',
  title: 'anim.group.easing',
  kind: 'easing',
  exclusive: true,
  options: [
    { id: 'linear', label: 'anim.linear.label', classes: ['ease-linear'], hint: 'anim.linear.hint' },
    { id: 'in', label: 'anim.in.label', classes: ['ease-in'], hint: 'anim.in.hint' },
    { id: 'out', label: 'anim.out.label', classes: ['ease-out'], hint: 'anim.out.hint' },
    { id: 'inOut', label: 'anim.inOut.label', classes: ['ease-in-out'], hint: 'anim.inOut.hint' },
  ],
};

const DELAY: IAnimationGroup = {
  id: 'delay',
  title: 'anim.group.delay',
  kind: 'delay',
  exclusive: true,
  options: [
    { id: 'dl75', label: 'anim.dl75.label', classes: ['delay-75'], hint: 'anim.dl75.hint' },
    { id: 'dl150', label: 'anim.dl150.label', classes: ['delay-150'], hint: 'anim.dl150.hint' },
    { id: 'dl300', label: 'anim.dl300.label', classes: ['delay-300'], hint: 'anim.dl300.hint' },
    { id: 'dl450', label: 'anim.dl450.label', classes: ['delay-450'], hint: 'anim.dl450.hint' },
  ],
  custom: {
    unit: 'ms', min: 0, max: 10000,
    templates: ['delay-[{v}ms]'],
    match: /^delay-\[(\d+)ms\]$/u,
    hint: 'custom.delay',
  },
};

// --- Entrance: the animation that happens ONCE, when the element appears ---
//
// A different family from the continuous one, and it needs no JavaScript: the `starting:` variant
// emits `@starting-style`, so `opacity-100 starting:opacity-0 transition duration-500` is a real
// fade-in. It works here because the pages are rendered by Lit in the CLIENT — the element is
// INSERTED after boot, which is exactly when `@starting-style` applies — and it re-runs when the user
// navigates away and back, because the element is created again.
//
// Where the browser has no `@starting-style`, the element simply appears: the permanent state is the
// visible one and `starting:` only describes the first frame. That safety is why this phase ships
// before the scroll trigger, whose base state is `opacity-0` and therefore depends on an event.
//
// Every class below was compiled with the `tailwindcss@4.3.0` of the lockfile before being offered,
// child-scoped variants included (`[&>*]:starting:opacity-0`).

/** Effects, one group per AXIS: two translate-y entrances at once would fight each other. */
const ENTRANCE_FADE: IAnimationGroup = {
  id: 'entFade',
  title: 'anim.group.entFade',
  rootLabel: 'anim.root.fade',
  kind: 'entrance',
  exclusive: true,
  defaultOptionId: 'fadeIn',
  options: [
    { id: 'fadeIn', label: 'anim.fadeIn.label', classes: ['opacity-100', 'starting:opacity-0'], hint: 'anim.fadeIn.hint' },
  ],
  custom: {
    unit: '%', min: 0, max: 95,
    templates: ['opacity-100', 'starting:opacity-[{v}%]'],
    match: /^opacity-\[(\d+)%\]$/u,
    variant: 'starting',
    hint: 'custom.entFade',
  },
};

const ENTRANCE_SLIDE_Y: IAnimationGroup = {
  id: 'entSlideY',
  title: 'anim.group.entSlideY',
  rootLabel: 'anim.root.slideY',
  kind: 'entrance',
  exclusive: true,
  defaultOptionId: 'yUp4',
  options: [
    { id: 'yUp2', label: 'anim.yUp2.label', classes: ['translate-y-0', 'starting:translate-y-2'], hint: 'anim.yUp2.hint' },
    { id: 'yUp4', label: 'anim.yUp4.label', classes: ['translate-y-0', 'starting:translate-y-4'], hint: 'anim.yUp4.hint' },
    { id: 'yUp8', label: 'anim.yUp8.label', classes: ['translate-y-0', 'starting:translate-y-8'], hint: 'anim.yUp8.hint' },
    { id: 'yDown4', label: 'anim.yDown4.label', classes: ['translate-y-0', 'starting:-translate-y-4'], hint: 'anim.yDown4.hint' },
    { id: 'yDown8', label: 'anim.yDown8.label', classes: ['translate-y-0', 'starting:-translate-y-8'], hint: 'anim.yDown8.hint' },
  ],
  custom: {
    unit: 'px', min: 1, max: 400,
    templates: ['translate-y-0', 'starting:{s}translate-y-[{v}px]'],
    match: /^-?translate-y-\[(\d+)px\]$/u,
    variant: 'starting',
    hint: 'custom.entSlide',
  },
};

const ENTRANCE_SLIDE_X: IAnimationGroup = {
  id: 'entSlideX',
  title: 'anim.group.entSlideX',
  rootLabel: 'anim.root.slideX',
  kind: 'entrance',
  exclusive: true,
  defaultOptionId: 'xLeft4',
  options: [
    { id: 'xLeft4', label: 'anim.xLeft4.label', classes: ['translate-x-0', 'starting:-translate-x-4'], hint: 'anim.xLeft4.hint' },
    { id: 'xLeft8', label: 'anim.xLeft8.label', classes: ['translate-x-0', 'starting:-translate-x-8'], hint: 'anim.xLeft8.hint' },
    { id: 'xRight4', label: 'anim.xRight4.label', classes: ['translate-x-0', 'starting:translate-x-4'], hint: 'anim.xRight4.hint' },
    { id: 'xRight8', label: 'anim.xRight8.label', classes: ['translate-x-0', 'starting:translate-x-8'], hint: 'anim.xRight8.hint' },
  ],
  custom: {
    unit: 'px', min: 1, max: 400,
    templates: ['translate-x-0', 'starting:{s}translate-x-[{v}px]'],
    match: /^-?translate-x-\[(\d+)px\]$/u,
    variant: 'starting',
    hint: 'custom.entSlide',
  },
};

const ENTRANCE_ZOOM: IAnimationGroup = {
  id: 'entZoom',
  title: 'anim.group.entZoom',
  rootLabel: 'anim.root.zoom',
  kind: 'entrance',
  exclusive: true,
  defaultOptionId: 'zoom95',
  options: [
    { id: 'zoom95', label: 'anim.zoom95.label', classes: ['scale-100', 'starting:scale-95'], hint: 'anim.zoom95.hint' },
    { id: 'zoom90', label: 'anim.zoom90.label', classes: ['scale-100', 'starting:scale-90'], hint: 'anim.zoom90.hint' },
    { id: 'zoom105', label: 'anim.zoom105.label', classes: ['scale-100', 'starting:scale-105'], hint: 'anim.zoom105.hint' },
  ],
  custom: {
    unit: '%', min: 10, max: 300,
    templates: ['scale-100', 'starting:scale-[{v}%]'],
    match: /^scale-\[(\d+)%\]$/u,
    variant: 'starting',
    hint: 'custom.entZoom',
  },
};

const ENTRANCE_GROUPS: IAnimationGroup[] = [
  ENTRANCE_FADE, ENTRANCE_SLIDE_Y, ENTRANCE_SLIDE_X, ENTRANCE_ZOOM,
];

/** The default entrance a cascade gives the children when the container itself has none. */
const CASCADE_DEFAULT_OPTIONS = ['fadeIn', 'yUp4'];

/** Steps offered for the cascade, in ms. */
export const CASCADE_STEPS = [100, 150, 200] as const;

/**
 * How many children a cascade will address.
 *
 * A cap, because the delay is one class PER CHILD (`[&>*:nth-child(7)]:delay-[900ms]`) — Tailwind
 * cannot compute an index into a delay, so a 40-child list would mean 40 classes on one element. What
 * is dropped is REPORTED (applyCascade returns it), never silently truncated.
 */
export const CASCADE_MAX_CHILDREN = 8;

/** `[&>*]:` — the child scope the cascade writes into. */
const CHILD_SCOPE = '[&>*]:';

function childScoped(cls: string): string {
  return `${CHILD_SCOPE}${cls}`;
}

/** `[&>*:nth-child(3)]:delay-[300ms]` — the second child waits one step, the third two, and so on. */
function nthDelay(index: number, step: number): string {
  return `[&>*:nth-child(${index})]:delay-[${(index - 1) * step}ms]`;
}

export interface ICascadeState {
  /** Step in ms between children, or null when there is no cascade. */
  step: number | null;
  /** How many children the classes address. */
  children: number;
}

/** The cascade currently written on the element. */
export function readCascade(literal: string): ICascadeState {
  let step: number | null = null;
  let children = 0;
  for (const token of splitUtilities(literal)) {
    const match = /^\[&>\*:nth-child\((\d+)\)\]:delay-\[(\d+)ms\]$/u.exec(token.raw);
    if (!match) continue;
    const index = Number(match[1]);
    const delay = Number(match[2]);
    children = Math.max(children, index);
    if (index === 2) step = delay;
  }
  // A cascade of one step (two children) is enough to know the step; with more children the second one
  // still carries it, so `step` is read from index 2 and the count from the highest index.
  return { step, children: children ? children : 0 };
}

/** Removes every class a cascade wrote — the child scope is the marker. */
export function removeCascade(literal: string): string {
  let next = literal;
  for (const token of splitUtilities(literal)) {
    if (token.raw.startsWith(CHILD_SCOPE) || /^\[&>\*:nth-child\(/u.test(token.raw)) {
      next = removeUtility(next, token.raw);
    }
  }
  return next;
}

export interface ICascadeResult {
  literal: string;
  /** Children that got a delay. */
  applied: number;
  /** Children beyond the cap, which will appear together with the last one. */
  dropped: number;
}

/**
 * Writes "the children appear one after another" from the CONTAINER, in one gesture.
 *
 * This is the case that motivated the task ("a seção 1 aparece, o botão dentro dela depois, a seção 2
 * depois") and it is the reason the cascade lives on the container: doing it child by child means one
 * edit per child, each with its own delay to keep straight.
 *
 * The children get the entrance the CONTAINER has selected — so the look is consistent — or fade+subir
 * when the container has none, which is the pair that reads as "appearing" rather than "sliding".
 */
export function applyCascade(
  literal: string,
  step: number,
  childCount: number,
  state?: IAnimationState,
): ICascadeResult {
  const current = state ?? readAnimationState(literal);
  const base = removeCascade(literal);

  const selected = ENTRANCE_GROUPS
    .flatMap((group) => group.options)
    .filter((option) => isOptionActive(base, option))
    .map((option) => option.id);
  const effects = (selected.length ? selected : CASCADE_DEFAULT_OPTIONS)
    .map((id) => animationOption(id))
    .filter((option): option is IAnimationOption => Boolean(option));

  let next = base;
  next = addUtility(next, childScoped('transition'));
  for (const option of effects) {
    for (const cls of option.classes) {
      next = addUtility(next, childScoped(buildAnimationClass(cls, 'entrance', current)));
    }
  }

  const applied = Math.min(childCount, CASCADE_MAX_CHILDREN);
  for (let index = 2; index <= applied; index += 1) {
    next = addUtility(next, nthDelay(index, step));
  }

  return { literal: next, applied, dropped: Math.max(0, childCount - applied) };
}

export const ANIMATION_GROUPS: readonly IAnimationGroup[] = [
  CONTINUOUS, SPEED, REPEAT, PAUSE, ...HOVER_GROUPS, ...ENTRANCE_GROUPS,
  TRANSITION_SCOPE, DURATION, EASING, DELAY,
];

/** A row of the tab: chips for a group's options, or one chip per group (the root's short lists). */
export interface IAnimationRow {
  title: string;
  /** `options`: one chip per option of `group`. `groups`: one chip per group, using its default. */
  mode: 'options' | 'groups';
  group?: IAnimationGroup;
  groups?: IAnimationGroup[];
  /** Screen the trailing `...` leads to. */
  more?: AnimationScreen;
  /** A state switch rendered as exclusive chips. */
  state?: { key: AnimationStateKey; options: { value: string; label: string; hint: string }[] };
  /** The cascade row: rendered only when the selected element actually has children to stagger. */
  cascade?: boolean;
}

export interface IAnimationScreenSpec {
  title: string;
  rows: IAnimationRow[];
  /** Where the back link goes (absent on the root). */
  back?: AnimationScreen;
  /** Where the `Avançado` link goes (root only). */
  advanced?: AnimationScreen;
  /** The screen that carries the `motion-safe` switch (and its explanation). */
  motionSwitch?: boolean;
  /** Sentence shown above the rows — what this family does, and what it does NOT do yet. */
  note?: string;
}

/**
 * What the `motion-safe` switch means, in the user's terms.
 *
 * A checkbox labelled "respeitar reduzir movimento" says what it is called, not what it DOES — and
 * the whole reason it exists is a preference set somewhere else entirely (the operating system), which
 * nobody can be expected to infer from a label.
 */
export const MOTION_SAFE_HINT: IMessageRef = { id: 'panel.motionSafeHint' };

const TRIGGER_ROW: IAnimationRow = {
  title: 'anim.state.trigger.title',
  mode: 'options',
  state: {
    key: 'animationTrigger',
    options: [
      { value: 'always', label: 'anim.state.trigger.always', hint: 'anim.state.trigger.alwaysHint' },
      { value: 'hover', label: 'anim.state.trigger.hover', hint: 'anim.state.trigger.hoverHint' },
    ],
  },
};

const HOVER_TRIGGER_ROW: IAnimationRow = {
  title: 'anim.state.when.title',
  mode: 'options',
  state: {
    key: 'hoverTrigger',
    options: [
      { value: 'hover', label: 'anim.state.when.hover', hint: 'anim.state.when.hoverHint' },
      { value: 'focus', label: 'anim.state.when.focus', hint: 'anim.state.when.focusHint' },
      { value: 'active', label: 'anim.state.when.active', hint: 'anim.state.when.activeHint' },
    ],
  },
};

/** What to render for a screen. */
export function animationScreen(screen: AnimationScreen): IAnimationScreenSpec {
  if (screen === 'continuous') {
    return {
      title: 'anim.screen.continuous',
      back: 'root',
      rows: [
        { title: CONTINUOUS.title, mode: 'options', group: CONTINUOUS },
        { title: SPEED.title, mode: 'options', group: SPEED },
        { title: REPEAT.title, mode: 'options', group: REPEAT },
        TRIGGER_ROW,
        { title: PAUSE.title, mode: 'options', group: PAUSE },
      ],
    };
  }

  if (screen === 'hover') {
    return {
      title: 'anim.screen.hover',
      back: 'root',
      rows: [
        ...HOVER_GROUPS.map((group): IAnimationRow => ({ title: group.title, mode: 'options', group })),
        HOVER_TRIGGER_ROW,
      ],
    };
  }

  if (screen === 'entrance') {
    return {
      title: 'anim.screen.entrance',
      back: 'root',
      note: 'anim.screen.entranceNote',
      rows: [
        ...ENTRANCE_GROUPS.map((group): IAnimationRow => ({ title: group.title, mode: 'options', group })),
        { title: DURATION.title, mode: 'options', group: DURATION },
        { title: DELAY.title, mode: 'options', group: DELAY },
        { title: 'panel.cascadeTitle', mode: 'options', cascade: true },
      ],
    };
  }

  if (screen === 'advanced') {
    return {
      title: 'anim.screen.advanced',
      back: 'root',
      // The switch lives HERE and only here: it is a setting, not a choice, and the root screen is for
      // choosing. "Does everyone get this movement?" belongs with the rest of the tuning.
      motionSwitch: true,
      rows: [
        { title: TRANSITION_SCOPE.title, mode: 'options', group: TRANSITION_SCOPE },
        { title: DURATION.title, mode: 'options', group: DURATION },
        { title: EASING.title, mode: 'options', group: EASING },
        { title: DELAY.title, mode: 'options', group: DELAY },
      ],
    };
  }

  return {
    title: 'anim.screen.root',
    advanced: 'advanced',
    rows: [
      { title: 'anim.root.entrance', mode: 'groups', groups: ENTRANCE_GROUPS, more: 'entrance' },
      { title: CONTINUOUS.title, mode: 'options', group: CONTINUOUS, more: 'continuous' },
      { title: 'anim.root.hover', mode: 'groups', groups: HOVER_GROUPS, more: 'hover' },
    ],
  };
}

function groupOf(optionId: string): IAnimationGroup | undefined {
  return ANIMATION_GROUPS.find((group) => group.options.some((option) => option.id === optionId));
}

export function animationOption(optionId: string): IAnimationOption | undefined {
  return ANIMATION_GROUPS.flatMap((group) => group.options).find((option) => option.id === optionId);
}

/** Every base class the catalog can write — the state switches must not touch anything else. */
const CATALOG_CLASSES = new Set(ANIMATION_GROUPS.flatMap((group) => group.options).flatMap((option) => option.classes));

/**
 * The class as it goes on the element, with the variants the state decides.
 *
 * `motion-safe:` wraps what MOVES (a keyframe animation, a hover transform), never a duration or a
 * curve: guarding the duration would leave someone who asked for reduced motion with a transition of
 * the wrong length instead of no movement at all.
 */
export function buildAnimationClass(cls: string, kind: AnimationKind, state: IAnimationState): string {
  const variants: string[] = [];
  // An entrance is TWO classes: the permanent state (`opacity-100`) and the first frame
  // (`starting:opacity-0`). Only the first frame is movement — guarding the permanent state would be
  // noise, since its absence already means "just be visible".
  const moves = kind === 'animation' || kind === 'hover' || (kind === 'entrance' && cls.startsWith('starting:'));
  if (state.motionSafe && moves) variants.push('motion-safe');
  if (kind === 'animation' && state.animationTrigger === 'hover') variants.push('hover');
  if (kind === 'hover') variants.push(state.hoverTrigger);
  return [...variants, cls].join(':');
}

/**
 * Base class of a token, with every variant stripped — '' when the token is not the ELEMENT's own.
 *
 * `[&>*]:starting:opacity-0` says the CHILDREN fade, not this element: matching it as the container's
 * own fade would light the chip up for something the container does not do (and removing the chip
 * would silently break the cascade). The cascade reads those tokens itself (readCascade).
 */
function bareOf(raw: string): string {
  if (raw.startsWith('[&>')) return '';
  const parts = raw.split(':');
  // An arbitrary value can hold a colon (`[animation-duration:2s]`), and it is always the tail.
  for (let i = 0; i < parts.length; i += 1) {
    const candidate = parts.slice(i).join(':');
    if (CATALOG_CLASSES.has(candidate)) return candidate;
  }
  return parts[parts.length - 1];
}

/** The variants the element currently declares for the catalog classes it carries. */
export function readAnimationState(literal: string): IAnimationState {
  const state: IAnimationState = { motionSafe: false, animationTrigger: 'always', hoverTrigger: 'hover' };

  for (const token of splitUtilities(literal)) {
    // The cascade's classes live under a child scope and carry the same variants: the state has to be
    // readable from them, or flipping the guard on a cascaded container would report itself as off.
    const scoped = token.raw.startsWith(CHILD_SCOPE);
    const inner = scoped ? token.raw.slice(CHILD_SCOPE.length) : token.raw;
    const bare = bareOf(inner);
    if (!CATALOG_CLASSES.has(bare)) continue;
    const variants = inner.slice(0, inner.length - bare.length).split(':').filter(Boolean);
    const kind = groupOf(idOfClass(bare) ?? '')?.kind;

    if (variants.includes('motion-safe')) state.motionSafe = true;
    if (kind === 'animation' && variants.includes('hover')) state.animationTrigger = 'hover';
    if (kind === 'hover') {
      if (variants.includes('focus')) state.hoverTrigger = 'focus';
      else if (variants.includes('active')) state.hoverTrigger = 'active';
    }
  }

  return state;
}

function idOfClass(cls: string): string | undefined {
  for (const group of ANIMATION_GROUPS) {
    for (const option of group.options) if (option.classes.includes(cls)) return option.id;
  }
  return undefined;
}

/** True when every base class of the option is on the element, whatever its variants are. */
export function isOptionActive(literal: string, option: IAnimationOption): boolean {
  const bares = splitUtilities(literal).map((token) => bareOf(token.raw));
  return option.classes.every((cls) => bares.includes(cls));
}

/** Ids of the options currently on the element. */
export function activeAnimations(literal: string): string[] {
  return ANIMATION_GROUPS
    .flatMap((group) => group.options)
    .filter((option) => isOptionActive(literal, option))
    .map((option) => option.id);
}

/** Ids of the groups with any option on — what the root screen's per-group chips reflect. */
export function activeAnimationGroups(literal: string): string[] {
  return ANIMATION_GROUPS
    .filter((group) => group.options.some((option) => isOptionActive(literal, option)))
    .map((group) => group.id);
}

/** Removes every class of an option, whatever variants it was written with. */
function removeOption(literal: string, option: IAnimationOption): string {
  let next = literal;
  for (const token of splitUtilities(literal)) {
    if (!option.classes.includes(bareOf(token.raw))) continue;
    next = removeUtility(next, token.raw);
  }
  return next;
}

/**
 * Turns one option on or off.
 *
 * Three rules, all about producing something that WORKS rather than something that merely carries the
 * class:
 *  - an exclusive group (a keyframe, a speed, an intensity) drops whatever else was on it;
 *  - a hover effect with no `transition` is a jump cut, so `transition` comes with it;
 *  - `transition` is never removed on the way out: it may have been the user's own, and taking away
 *    what someone wrote is worse than leaving one class behind.
 */
export function applyAnimationOption(literal: string, optionId: string, state?: IAnimationState): string {
  const option = animationOption(optionId);
  const group = groupOf(optionId);
  if (!option || !group) return literal;
  const current = state ?? readAnimationState(literal);

  if (isOptionActive(literal, option)) return removeOption(literal, option);

  let next = literal;
  if (group.exclusive) {
    for (const other of group.options) {
      if (other.id !== option.id) next = removeOption(next, other);
    }
    // The typed value is a member of the group like any other: picking a curated step has to replace
    // it, or the element would carry `duration-[850ms] duration-300` and the last one in the file wins.
    if (group.custom) next = removeAnimationCustom(next, group.id);
  }

  for (const cls of option.classes) next = addUtility(next, buildAnimationClass(cls, group.kind, current));
  // Both a hover effect and an entrance are TRANSITIONS: without one the change is a jump cut (and an
  // entrance with no transition is simply invisible — the element is already in its final state).
  if ((group.kind === 'hover' || group.kind === 'entrance') && !hasTransition(next)) {
    next = addUtility(next, 'transition');
  }

  return next;
}

/** Any transition class already present — `transition`, or one of the scoped ones. */
function hasTransition(literal: string): boolean {
  return splitUtilities(literal).some((token) => token.base === 'transition' || token.base.startsWith('transition-'));
}

/** Turns the group's default option on, or the whole group off — the root screen's single chip. */
export function applyAnimationGroup(literal: string, groupId: string, state?: IAnimationState): string {
  const group = ANIMATION_GROUPS.find((candidate) => candidate.id === groupId);
  if (!group) return literal;

  const active = group.options.find((option) => isOptionActive(literal, option));
  if (active) return removeOption(literal, active);

  const target = group.defaultOptionId ?? group.options[0]?.id;
  return target ? applyAnimationOption(literal, target, state) : literal;
}

/**
 * Applies a state switch, rewriting the variants IN PLACE.
 *
 * In place (replaceUtility) and not remove-then-append: rewriting the attribute would reshuffle
 * classes the user never touched, and that noise lands in their file.
 */
export function applyAnimationState(
  literal: string,
  key: AnimationStateKey,
  value: string,
): string {
  const state = readAnimationState(literal);
  const next: IAnimationState = { ...state };
  if (key === 'motionSafe') next.motionSafe = value === 'true' || value === 'on';
  if (key === 'animationTrigger') next.animationTrigger = value === 'hover' ? 'hover' : 'always';
  if (key === 'hoverTrigger') next.hoverTrigger = value === 'focus' ? 'focus' : value === 'active' ? 'active' : 'hover';

  let result = literal;
  for (const token of splitUtilities(literal)) {
    // The cascade's classes are the same catalog classes under a child scope: the switch has to reach
    // them too, or flipping it would guard the container and leave the children unguarded.
    const scoped = token.raw.startsWith(CHILD_SCOPE);
    const inner = scoped ? token.raw.slice(CHILD_SCOPE.length) : token.raw;
    const bare = bareOf(inner);
    if (!CATALOG_CLASSES.has(bare)) continue;
    const kind = groupOf(idOfClass(bare) ?? '')?.kind;
    if (!kind) continue;
    const target = `${scoped ? CHILD_SCOPE : ''}${buildAnimationClass(bare, kind, next)}`;
    if (target !== token.raw) result = replaceUtility(result, token.raw, target, token.index);
  }
  return result;
}

/** '-' when the group's active (or default) option moves in the negative direction. */
function customSign(group: IAnimationGroup, literal: string): string {
  const active = group.options.find((option) => isOptionActive(literal, option))
    ?? group.options.find((option) => option.id === group.defaultOptionId)
    ?? group.options[0];
  return active?.classes.some((cls) => /(?:^|:)-/u.test(cls)) ? '-' : '';
}

/** Classes a template writes for a value. */
function customClasses(spec: IAnimationCustom, value: number, sign: string): string[] {
  return spec.templates.map((template) => template.replace('{s}', sign).replace('{v}', String(value)));
}

/** True when the token belongs to this group's custom shape (variant included). */
function isCustomToken(spec: IAnimationCustom, token: IUtilityToken): boolean {
  // Any child-scoped token belongs to the cascade, not to this element: `[&>*]:…` AND
  // `[&>*:nth-child(2)]:delay-[150ms]`, which is why the test is the prefix and not CHILD_SCOPE.
  if (token.raw.startsWith('[&>')) return false;
  if (spec.variant) {
    if (!token.variants.includes(spec.variant)) return false;
  } else if (token.variants.includes('starting')) {
    // A `starting:` token belongs to the entrance group with the same base, not to this one.
    return false;
  }
  return spec.match.test(token.base);
}

/** The typed value currently on the element for a group, or null. */
export function readAnimationCustom(literal: string, groupId: string): number | null {
  const group = ANIMATION_GROUPS.find((candidate) => candidate.id === groupId);
  const spec = group?.custom;
  if (!spec) return null;
  for (const token of splitUtilities(literal)) {
    if (!isCustomToken(spec, token)) continue;
    const match = spec.match.exec(token.base);
    if (match) return Number(match[1]);
  }
  return null;
}

/** Removes a group's custom value (and the permanent-state classes that came with it). */
export function removeAnimationCustom(literal: string, groupId: string): string {
  const group = ANIMATION_GROUPS.find((candidate) => candidate.id === groupId);
  const spec = group?.custom;
  if (!spec) return literal;

  let next = literal;
  for (const token of splitUtilities(literal)) {
    if (isCustomToken(spec, token)) next = removeUtility(next, token.raw);
  }
  // The fixed half of the template (`translate-y-0`, `opacity-100`) goes too: with no value left, the
  // group is off, and a lone permanent state would be a leftover nobody asked for.
  for (const template of spec.templates) {
    if (template.includes('{v}')) continue;
    for (const token of splitUtilities(next)) {
      if (bareOf(token.raw) === template) next = removeUtility(next, token.raw);
    }
  }
  return next;
}

export interface ICustomResult {
  literal: string;
  /** The value actually written, after clamping to the group's range. */
  value: number;
}

/**
 * Writes a typed value for a group, replacing whatever that group had.
 *
 * Out-of-range input is CLAMPED and the applied value returned, so the panel can show what really
 * landed instead of pretending the typed number was used.
 */
export function applyAnimationCustom(
  literal: string,
  groupId: string,
  value: number,
  state?: IAnimationState,
): ICustomResult | null {
  const group = ANIMATION_GROUPS.find((candidate) => candidate.id === groupId);
  const spec = group?.custom;
  if (!group || !spec || !Number.isFinite(value)) return null;

  const clamped = Math.min(spec.max, Math.max(spec.min, Math.round(value)));
  const current = state ?? readAnimationState(literal);
  const sign = customSign(group, literal);

  let next = removeAnimationCustom(literal, groupId);
  for (const option of group.options) next = removeOption(next, option);

  for (const cls of customClasses(spec, clamped, sign)) {
    next = addUtility(next, buildAnimationClass(cls, group.kind, current));
  }
  if ((group.kind === 'hover' || group.kind === 'entrance') && !hasTransition(next)) {
    next = addUtility(next, 'transition');
  }

  return { literal: next, value: clamped };
}

// --- Anchoring: literal in the source ---

export interface IClassAttrMatch {
  /** Offset of the first character of the literal (past the opening quote). */
  startOffset: number;
  /** Offset of the closing quote. */
  endOffset: number;
  quote: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Every `class="<literal>"` in the source, in source order.
 *
 * The `(?<![\w-])` guard is what keeps `data-class=` and `panelClass=` out — an attribute merely
 * ENDING in `class` is a different attribute, and rewriting it would corrupt a component's props.
 *
 * The whole source is searched, not only the html`` templates: a class literal outside a template is
 * so unlikely in a page file that scanning templates first would only add a way to miss the real one.
 */
export function findClassAttrs(source: string, literal: string): IClassAttrMatch[] {
  const pattern = new RegExp(`(?<![\\w-])class\\s*=\\s*(["'])${escapeRegExp(literal)}\\1`, 'gu');
  const matches: IClassAttrMatch[] = [];
  for (const match of source.matchAll(pattern)) {
    const quote = match[1];
    const startOffset = (match.index ?? 0) + match[0].length - literal.length - 1;
    matches.push({ startOffset, endOffset: startOffset + literal.length, quote });
  }
  return matches;
}

/** The `occurrence`-th (0-based) `class="<literal>"` of the source, or null. */
export function parseClassAttr(source: string, literal: string, occurrence: number): IClassAttrMatch | null {
  const matches = findClassAttrs(source, literal);
  return matches[occurrence] ?? null;
}

/**
 * Why no literal was found, said precisely.
 *
 * A `class=${...}` / `classMap(...)` / `cn(...)` is a computed attribute: there is no literal to
 * rewrite and this module must not try to rewrite an expression (a limit of the task, on purpose).
 * Telling that apart from "this element's classes simply are not in this file" is the difference
 * between a useful message and a shrug.
 */
export function describeMissingLiteral(source: string): IMessageRef {
  if (/(?<![\w-])class\s*=\s*\$\{/u.test(source) || /classMap\s*\(/u.test(source)) {
    return { id: 'reason.computedClass' };
  }
  if (/(?<![\w-])class\s*=\s*(["'])[^"']*\$\{/u.test(source)) {
    return { id: 'reason.mixedClass' };
  }
  return MISSING_IN_SOURCE;
}

// --- Structural anchoring: the DOM position, not the class string ---
//
// Counting the literal cannot work, and it was measured: across the 102 real pages of the 102046,
// 63% of `class="..."` attributes belong to a string that repeats in the same file (`p-2` 26 times in
// one page, `px-3 py-2` 22 times). Narrowing by tag changes nothing (the repeats ARE the same tag) and
// scoping by the nearest unique ancestor resolves only 9% (the repeats are siblings of one container).
//
// What DOES have identity is the POSITION: sibling order in the DOM is sibling order in the template.
// The 3rd `<th>` of the `<thead>` is the 3rd `<th>` of the `<thead>` in the source, even with 22
// identical ones in the file. And a `<tr>` inside `${rows.map(...)}` is ONE source node that rendered
// N times — which is exactly the "edit and warn that it affects the N rows" case.

export interface ITemplateElement {
  tag: string;
  /** The class literal of the open tag; null when absent or computed. */
  literal: string | null;
  /** Offsets of the literal itself (past the opening quote, on the closing one). */
  literalStart: number;
  literalEnd: number;
  /** Offset of the `<`. */
  openStart: number;
  /** Offset just past the element's close tag (or past `>` when void/self-closing). */
  end: number;
  /** Index of the parent in the array; -1 for a template root. */
  parent: number;
  /** Inside a `${...}`: one source node may render many times (a `.map()`), or none (a ternary). */
  inExpression: boolean;
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

/**
 * Index just past the `}` that closes a `${` starting at `at`.
 *
 * Brace-, string- and template-aware, because an event binding is arbitrary code:
 * `@click=${() => { if (window.confirm(`${a} ${b}`)) { … } }}`.
 */
function skipExpression(source: string, at: number): number {
  let i = at + 2;
  let braces = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === '"' || ch === "'") {
      i += 1;
      while (i < source.length && source[i] !== ch) i += source[i] === '\\' ? 2 : 1;
      i += 1;
      continue;
    }
    if (ch === '`') {
      i += 1;
      let nested = 0;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === '$' && source[i + 1] === '{') { nested += 1; i += 2; continue; }
        if (source[i] === '}' && nested > 0) { nested -= 1; i += 1; continue; }
        if (source[i] === '`' && nested === 0) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    if (ch === '{') { braces += 1; i += 1; continue; }
    if (ch === '}') {
      if (braces === 0) return i + 1;
      braces -= 1;
      i += 1;
      continue;
    }
    i += 1;
  }
  return source.length;
}

/**
 * Offset of the `>` that closes an open tag.
 *
 * Both skips matter and both were measured on the real pages: a quoted value can hold `>` and its own
 * `${...}` (`class="border-b ${sel ? 'bg-x' : ''}"`), and an UNQUOTED binding is arbitrary code whose
 * arrow (`@click=${() => …}`) contains a `>` that would end the tag several lines too early — which
 * then corrupted the nesting of everything after it.
 */
function findOpenTagEnd(source: string, from: number): number {
  let i = from;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      i += 1;
      while (i < source.length && source[i] !== ch) i += 1;
      i += 1;
      continue;
    }
    if (ch === '$' && source[i + 1] === '{') { i = skipExpression(source, i); continue; }
    if (ch === '>') return i;
    i += 1;
  }
  return source.length - 1;
}

/**
 * Every element of every html`` template in a source, with nesting.
 *
 * Deliberately NOT a general HTML parser: it only has to be right about tag names, nesting and the
 * `class` literal of the markup the generator emits.
 *
 * The context stack is what keeps TYPESCRIPT out of the tree: tags are only read while the innermost
 * context is a template. Scanning inside `${...}` code as if it were markup turned `Array<string>`
 * into an element named `string` — and a phantom sibling shifts every index after it, which is the one
 * error this walker must never make. A nested html`` inside an expression pushes a template context of
 * its own (that is the `.map()` case, which matters), and everything found under an expression is
 * flagged: one source node, many rendered elements.
 */
export function scanTemplateElements(source: string): ITemplateElement[] {
  const elements: ITemplateElement[] = [];
  /** Open elements, innermost last. Reset per top-level template. */
  const stack: number[] = [];
  /** Nesting of template/expression contexts, innermost last. */
  const contexts: { kind: 'template' | 'expr'; braces: number }[] = [];

  const inTemplate = (): boolean => contexts[contexts.length - 1]?.kind === 'template';
  const underExpression = (): boolean => contexts.some((context) => context.kind === 'expr');

  let i = 0;
  while (i < source.length) {
    if (!contexts.length) {
      const next = source.indexOf('html`', i);
      if (next === -1) break;
      contexts.push({ kind: 'template', braces: 0 });
      stack.length = 0;
      i = next + 'html`'.length;
      continue;
    }

    const ch = source[i];

    if (inTemplate()) {
      if (ch === '$' && source[i + 1] === '{') { contexts.push({ kind: 'expr', braces: 0 }); i += 2; continue; }
      if (ch === '`') { contexts.pop(); i += 1; continue; }
      if (ch !== '<') { i += 1; continue; }

      const closing = /^<\/\s*([a-zA-Z][\w-]*)\s*>/u.exec(source.slice(i, i + 64));
      if (closing) {
        for (let level = stack.length - 1; level >= 0; level -= 1) {
          if (elements[stack[level]].tag === closing[1].toLowerCase()) {
            elements[stack[level]].end = i + closing[0].length;
            stack.length = level;
            break;
          }
        }
        i += closing[0].length;
        continue;
      }

      const opening = /^<([a-zA-Z][\w-]*)/u.exec(source.slice(i, i + 64));
      if (!opening) { i += 1; continue; }

      const j = findOpenTagEnd(source, i + opening[0].length);
      const openTag = source.slice(i, j + 1);
      const classMatch = /(?<![\w-])class\s*=\s*"([^"]*)"/u.exec(openTag);
      const literalStart = classMatch
        ? i + classMatch.index + classMatch[0].length - classMatch[1].length - 1
        : -1;
      const tag = opening[1].toLowerCase();
      const selfClosing = openTag.endsWith('/>') || VOID_TAGS.has(tag);

      elements.push({
        tag,
        literal: classMatch ? classMatch[1] : null,
        literalStart,
        literalEnd: classMatch ? literalStart + classMatch[1].length : -1,
        openStart: i,
        // An element left unclosed at the end of the template still needs an end.
        end: selfClosing ? j + 1 : source.length,
        parent: stack.length ? stack[stack.length - 1] : -1,
        inExpression: underExpression(),
      });
      if (!selfClosing) stack.push(elements.length - 1);
      i = j + 1;
      continue;
    }

    // --- inside a ${...} expression: TypeScript, not markup ---
    const context = contexts[contexts.length - 1];

    if (ch === '"' || ch === "'") {
      // Skip the string whole: it can hold braces and backticks that would unbalance the context.
      i += 1;
      while (i < source.length && source[i] !== ch) i += source[i] === '\\' ? 2 : 1;
      i += 1;
      continue;
    }
    if (source.startsWith('html`', i)) { contexts.push({ kind: 'template', braces: 0 }); i += 'html`'.length; continue; }
    if (ch === '`') {
      // A plain template literal in the expression — skip it, including its own ${...} nesting.
      i += 1;
      let depth = 0;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === '$' && source[i + 1] === '{') { depth += 1; i += 2; continue; }
        if (source[i] === '}' && depth > 0) { depth -= 1; i += 1; continue; }
        if (source[i] === '`' && depth === 0) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    if (ch === '{') { context.braces += 1; i += 1; continue; }
    if (ch === '}') {
      if (context.braces > 0) context.braces -= 1;
      else contexts.pop();
      i += 1;
      continue;
    }
    i += 1;
  }

  return elements;
}

/** A helper template mounted inside another element by a `${this.renderX()}` call. */
export interface ITemplateLink {
  /** Element that contains the call (-1 when the call is at template top level). */
  parent: number;
  /** Root element of the called method's template. */
  root: number;
  /** Offset of the CALL — where the helper's markup appears among its siblings. */
  order: number;
}

export interface ITemplateTree {
  elements: ITemplateElement[];
  links: ITemplateLink[];
}

/** Method declarations of a source, as ranges, so each template knows who returns it. */
function methodRanges(source: string): { name: string; start: number; end: number }[] {
  const ranges: { name: string; start: number; end: number }[] = [];
  const pattern = /(?:^|\n)[ \t]*(?:public |private |protected |static |async |override )*([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{;=]+)?\{/gu;
  for (const match of source.matchAll(pattern)) {
    ranges.push({ name: match[1], start: match.index ?? 0, end: source.length });
  }
  for (let i = 0; i < ranges.length - 1; i += 1) ranges[i].end = ranges[i + 1].start;
  return ranges;
}

function methodAt(ranges: { name: string; start: number; end: number }[], offset: number): string {
  for (const range of ranges) if (offset >= range.start && offset < range.end) return range.name;
  return '';
}

/**
 * The element tree of a page, with the helper templates LINKED where they are rendered.
 *
 * Without this the tree is a forest and the walk is useless in practice: measured over the 102 real
 * pages of the 102046, 92% split `render()` into helper methods and **87% of all elements live outside
 * the first template**. Their DOM path crosses a boundary the raw scan does not have — every one of
 * those clicks fell back to counting, which is ambiguous for 63% of the class attributes. That is the
 * "não consegui identificar este elemento" the user kept seeing.
 *
 * Linking is by METHOD NAME: `${this.renderForm()}` mounts the root(s) of the template returned by
 * `renderForm()`. The mount ORDER is the offset of the call, not of the helper's own source — a
 * helper's markup appears among its siblings where it is CALLED. A method called from two places
 * yields two links to the same root, which is right: both render the same source.
 */
export function scanTemplateTree(source: string): ITemplateTree {
  const elements = scanTemplateElements(source);
  const ranges = methodRanges(source);
  const links: ITemplateLink[] = [];

  const rootsByMethod = new Map<string, number[]>();
  for (const [index, element] of elements.entries()) {
    if (element.parent !== -1) continue;
    const method = methodAt(ranges, element.openStart);
    if (!method) continue;
    const list = rootsByMethod.get(method) ?? [];
    list.push(index);
    rootsByMethod.set(method, list);
  }

  for (const call of findTemplateCalls(source, elements)) {
    for (const root of rootsByMethod.get(call.method) ?? []) {
      if (root === call.parent) continue; // a method rendering itself would be a cycle
      links.push({ parent: call.parent, root, order: call.order });
    }
  }

  return { elements, links };
}

/**
 * `${this.renderX(...)}` calls inside templates, with the element that contains them.
 *
 * The containing element is what the call's markup becomes a child of, so it is resolved the same way
 * the scanner resolves parents: the innermost element still open at that offset.
 */
function findTemplateCalls(
  source: string,
  elements: ITemplateElement[],
): { method: string; parent: number; order: number }[] {
  const calls: { method: string; parent: number; order: number }[] = [];

  for (const match of source.matchAll(/\$\{\s*this\.([a-zA-Z_$][\w$]*)\s*\(/gu)) {
    const at = match.index ?? 0;
    // Innermost element whose span contains the call — the scan produces parents before children, so
    // the last match in array order is the innermost.
    let parent = -1;
    for (const [index, element] of elements.entries()) {
      if (element.openStart < at && at < element.end) parent = index;
    }
    calls.push({ method: match[1], parent, order: at });
  }

  return calls;
}

/** One level of the path from the page element down to the selected one. */
export interface IDomPathStep {
  tag: string;
  /** Index among the siblings WITH THE SAME TAG (0-based) — what survives conditional siblings. */
  index: number;
  /** How many same-tag siblings there are. */
  count: number;
}

export type StructuralAnchor =
  | {
    ok: true;
    /** The matched element of the source tree. */
    element: ITemplateElement;
    /** Set when one source node renders several elements (a `.map()`): how many. */
    renders: number;
  }
  | { ok: false; reason: IMessageRef };

/**
 * Children of `parent` (-1 = the page's own template) with a given tag, in RENDER order.
 *
 * Two sources of children, and both have to be here: the elements nested in the same template, and
 * the helper templates mounted by a `${this.renderX()}` inside this element. They interleave, so the
 * order key is where each one APPEARS — the element's own offset, or the offset of the call that
 * mounts it.
 *
 * A root that is mounted somewhere is not a top-level candidate any more: it is a child of its call
 * site, not of the page.
 */
function childrenWithTag(tree: ITemplateTree, parent: number, tag: string): number[] {
  const mounted = new Set(tree.links.map((link) => link.root));
  const found: { index: number; order: number }[] = [];

  for (const [index, element] of tree.elements.entries()) {
    if (element.parent !== parent || element.tag !== tag) continue;
    if (parent === -1 && mounted.has(index)) continue;
    found.push({ index, order: element.openStart });
  }
  for (const link of tree.links) {
    if (link.parent !== parent) continue;
    if (tree.elements[link.root].tag !== tag) continue;
    found.push({ index: link.root, order: link.order });
  }

  return found.sort((a, b) => a.order - b.order).map((entry) => entry.index);
}

/**
 * Walks a DOM path into the source tree.
 *
 * Per level, in this order:
 *  1. as many source children as DOM siblings -> 1:1, take the index (the `<thead>` row case);
 *  2. exactly one source child -> it is the one, and if the DOM had N siblings it RENDERS N times
 *     (the `${rows.map(...)}` case) — resolvable, with a warning;
 *  3. anything else -> refuse. Conditionals can add or drop siblings, and this is precisely where a
 *     guess would edit a line nobody was looking at.
 *
 * Templates of helper methods are roots of their own here (they are reached through a `${this.x()}`,
 * invisible structurally), so a path crossing into one fails and the caller falls back to counting.
 */
export function resolveStructuralAnchor(
  tree: ITemplateTree,
  path: readonly IDomPathStep[],
): StructuralAnchor {
  if (!path.length) return { ok: false, reason: NOT_LOCATED };

  let parent = -1;
  let current: ITemplateElement | null = null;
  let renders = 1;

  for (const step of path) {
    const candidates = childrenWithTag(tree, parent, step.tag);

    let chosen: number;
    if (candidates.length === step.count && step.index < candidates.length) {
      chosen = candidates[step.index];
      // The counts can match while every candidate is the SAME source node: a helper called N times
      // (`${this.renderCard(a)}` … `${this.renderCard(b)}`) mounts one template N times. Editing it
      // still hits all N, so it has to be reported as such.
      if (new Set(candidates).size === 1 && step.count > 1) renders = Math.max(renders, step.count);
    } else if (candidates.length === 1) {
      chosen = candidates[0];
      if (step.count > 1) renders = Math.max(renders, step.count);
    } else {
      // Both cases mean the same thing to the user, and the counting fallback runs next anyway.
      return { ok: false, reason: NOT_LOCATED };
    }

    current = tree.elements[chosen];
    parent = chosen;
  }

  if (!current) return { ok: false, reason: NOT_LOCATED };
  return { ok: true, element: current, renders };
}

// --- Anchoring: which occurrence ---

export interface IAnchorInput {
  /** Occurrences of the literal in the SOURCE (M). */
  sourceCount: number;
  /** Elements with this exact literal in the DOM (N). */
  domCount: number;
  /** Index of the selected element among those, 0-based. */
  domIndex: number;
}

export type AnchorResult =
  | { ok: true; occurrence: number; warning?: IMessageRef }
  | { ok: false; reason: IMessageRef };

/**
 * Which occurrence of the literal in the source corresponds to the element clicked.
 *
 * | M (source) | N (DOM) | decision |
 * | --- | --- | --- |
 * | 0 | any | nothing to edit |
 * | 1 | 1 | the only one |
 * | 1 | > 1 | the only one, WARNING that it renders N times (it is inside a `.map()`) |
 * | M = N | — | 1:1, the index maps straight through |
 * | 1 < M < N, or M > N | — | ambiguous: REFUSE instead of picking |
 *
 * The refusal is the point. Guessing would edit a line of the file the user never looked at, and
 * there is no undo (DriverVm keeps no history) — a wrong class is easier to produce than a wrong
 * text, so "I don't know which one" has to stay a first-class answer.
 */
export function resolveAnchor({ sourceCount, domCount, domIndex }: IAnchorInput): AnchorResult {
  if (sourceCount <= 0) {
    return { ok: false, reason: MISSING_IN_SOURCE };
  }

  if (sourceCount === 1) {
    if (domCount > 1) {
      return { ok: true, occurrence: 0, warning: repeatedRenderWarning(domCount) };
    }
    return { ok: true, occurrence: 0 };
  }

  if (sourceCount === domCount) {
    if (domIndex < 0 || domIndex >= sourceCount) {
      return { ok: false, reason: NOT_LOCATED };
    }
    return { ok: true, occurrence: domIndex };
  }

  return { ok: false, reason: NOT_LOCATED };
}

/**
 * The user-facing sentences.
 *
 * They used to leak the counting ("o literal aparece 7× na fonte e 9× na tela"), which says nothing to
 * whoever is trying to change a padding: the numbers are an implementation detail of an anchoring
 * strategy, and the strategy failing is not the user's problem to interpret. Since the structural
 * anchor resolves the common case, what is left is rare — and it says what to DO.
 */
/**
 * What a row says when the picker has nothing to offer for it.
 *
 * There used to be four sentences here, differing only in what MY tables know; to whoever is looking
 * at the panel they all mean the same thing, and none of them said what to do.
 */
export const NO_OPTIONS: IMessageRef = { id: 'reason.noOptions' };

export const NOT_LOCATED: IMessageRef = { id: 'reason.notLocated' };

export const MISSING_IN_SOURCE: IMessageRef = { id: 'reason.missingInSource' };

export function repeatedRenderWarning(domCount: number): IMessageRef {
  return { id: 'reason.repeatedRender', params: { count: domCount } };
}

// --- Scope ---

export interface IEditScope {
  /** File that would receive the edit, for display. */
  file: string;
  /** True when the file is shared beyond this page (a molecule of the 102040). */
  shared: boolean;
  /** Set when the edit must be refused. */
  refusal?: IMessageRef;
}

/**
 * Whether an edit may proceed, and what the user has to know BEFORE choosing.
 *
 * A molecule is used by many projects, and there is no undo — so a class edit there is refused while
 * that is true, exactly like the task's scope says. Editing the molecule's own file from a client
 * app would change every project that renders it, and nobody clicking a chip in a page expects that.
 */
export function editScope(file: string, moleculeProject: number | null): IEditScope {
  if (moleculeProject !== null) {
    return {
      file,
      shared: true,
      refusal: { id: 'reason.moleculeShared', params: { project: moleculeProject } },
    };
  }
  return { file, shared: false };
}

// --- Copying the style of one element onto another (TASK-102033-picker-copy-style) ---
//
// "Estilizo um botão, gosto de como ficou, copio e colo no outro." One gesture, and it REPLACES: the
// target ends up identical to the source. A merge would leave behind whatever the target has and the
// source does not (a target with `italic` would stay italic after pasting a button that is not), and
// hunting that leftover by hand is exactly the work this removes.
//
// The one thing that may legitimately stay behind is the target's PLACE. Measured on the 102 real
// pages: a class of place appears in 7% of the buttons and 0% of `p`/`td`/`th`/`h2`, but in 38% of the
// `div`s and 93% of the `input`s (`w-full` is the norm there). So place is not a question asked up
// front — the summary highlights it and offers to hold it back, with one click.

/** What a class is FOR — the grouping the paste summary speaks in. */
export type StyleCategory = 'appearance' | 'spacing' | 'place' | 'animation' | 'other';

/**
 * Where the element SITS and how big it is inside its parent.
 *
 * The line is deliberate: size, position, span, order and stacking belong to the target's layout, so
 * they are what a paste may have to hold back. The INTERNAL layout of a container (`grid-cols-2`,
 * `gap-4`, `items-center`) is not here — it is how the element arranges its own children, which is
 * part of the look being copied. That splits the task's own measurement bucket, which counted
 * `md:grid-cols-2` as place; the bucket existed to argue "copy everything", and for the button the
 * user is about to press, "keep my position" must not silently also mean "keep your columns".
 */
const PLACE_PROPERTIES = new Set([
  'prop.width', 'prop.height', 'prop.minWidth', 'prop.minHeight', 'prop.maxWidth', 'prop.maxHeight',
  'prop.positioning', 'prop.top', 'prop.right', 'prop.bottom', 'prop.left',
  'prop.inset', 'prop.insetX', 'prop.insetY', 'prop.zIndex',
  'prop.colSpan', 'prop.rowSpan', 'prop.order', 'prop.flexGrow', 'prop.self', 'prop.aspect',
]);

const SPACING_PROPERTIES = new Set([
  'prop.padding', 'prop.paddingX', 'prop.paddingY', 'prop.paddingTop', 'prop.paddingRight',
  'prop.paddingBottom', 'prop.paddingLeft', 'prop.paddingStart', 'prop.paddingEnd',
  'prop.margin', 'prop.marginX', 'prop.marginY', 'prop.marginTop', 'prop.marginRight',
  'prop.marginBottom', 'prop.marginLeft', 'prop.marginStart', 'prop.marginEnd',
  'prop.gap', 'prop.gapX', 'prop.gapY', 'prop.spaceX', 'prop.spaceY',
]);

const APPEARANCE_PROPERTIES = new Set([
  'prop.bgColor', 'prop.textColor', 'prop.textSize', 'prop.fontWeight', 'prop.fontStyle',
  'prop.textAlign', 'prop.textCase', 'prop.textWrap', 'prop.textOverflow', 'prop.underline',
  'prop.leading', 'prop.tracking', 'prop.numeric',
  'prop.borderWidth', 'prop.borderColor', 'prop.borderStyle',
  'prop.radius', 'prop.radiusTop', 'prop.radiusRight', 'prop.radiusBottom', 'prop.radiusLeft',
  'prop.radiusTopLeft', 'prop.radiusTopRight', 'prop.radiusBottomRight', 'prop.radiusBottomLeft',
  'prop.borderSideTop', 'prop.borderSideRight', 'prop.borderSideBottom', 'prop.borderSideLeft',
  'prop.borderSideX', 'prop.borderSideY', 'prop.divideColor', 'prop.divideAxis',
  'prop.shadow', 'prop.opacity', 'prop.ringColor', 'prop.ringWidth', 'prop.outline', 'prop.decorationColor',
  'prop.fill', 'prop.stroke', 'prop.placeholderColor', 'prop.accentColor', 'prop.caretColor',
  'prop.gradientFrom', 'prop.gradientVia', 'prop.gradientTo',
  'prop.blur', 'prop.brightness', 'prop.contrast', 'prop.saturate',
]);

const ANIMATION_PROPERTIES = new Set([
  'prop.animation', 'prop.transition', 'prop.duration', 'prop.delay', 'prop.easing',
  'prop.animationSpeed', 'prop.animationRepeat', 'prop.animationPlayState',
  'prop.translateX', 'prop.translateY', 'prop.scale', 'prop.scaleX', 'prop.scaleY', 'prop.rotate',
]);

/** What one class is for. */
export function styleCategory(token: IUtilityToken): StyleCategory {
  // The cascade writes into the CHILDREN (`[&>*:nth-child(2)]:delay-150`) and an entrance is written
  // with `starting:`. Neither has a property of its own, and both are motion.
  if (token.base.startsWith('[&>') || token.variants.some((variant) => variant.startsWith('[&>'))) return 'animation';
  if (token.variants.includes('starting')) return 'animation';

  const property = utilityLabel(token).property;
  if (!property) return 'other';
  if (PLACE_PROPERTIES.has(property)) return 'place';
  if (SPACING_PROPERTIES.has(property)) return 'spacing';
  if (ANIMATION_PROPERTIES.has(property)) return 'animation';
  if (APPEARANCE_PROPERTIES.has(property)) return 'appearance';
  return 'other';
}

/** The classes of a literal grouped by what they are for, in source order. */
export function styleCategories(literal: string): Record<StyleCategory, string[]> {
  const groups: Record<StyleCategory, string[]> = {
    appearance: [], spacing: [], place: [], animation: [], other: [],
  };
  for (const token of splitUtilities(literal)) groups[styleCategory(token)].push(token.raw);
  return groups;
}

/** The classes of a literal that fall in the given categories. */
export function classesInCategories(literal: string, categories: readonly StyleCategory[]): string[] {
  return splitUtilities(literal)
    .filter((token) => categories.includes(styleCategory(token)))
    .map((token) => token.raw);
}

/**
 * What makes two classes the same thing under different values: the property, under the same variants.
 *
 * `p-3` and `p-4` collide; `p-3` and `md:p-4` do not — they are different layers, and dropping the
 * second because of the first would silently delete a responsive rule.
 */
function propertyKey(token: IUtilityToken): string {
  const property = utilityLabel(token).property;
  // No known property (`isolate`, `mix-blend-multiply`): the class IS its own identity, so two
  // different unknowns can coexist and the same one never doubles.
  return `${token.variants.join(':')}|${property || token.base}`;
}

/**
 * The target's class attribute after the source's style is pasted onto it.
 *
 * REPLACE, not merge — decided with the user on 2026-09-01: the point is to keep the same style of
 * button 1 on button 2, so with nothing held back the result IS the source's literal.
 *
 * @param keep classes of the TARGET that survive (its place, typically). They win over the source's
 *   class for the same property.
 * @param drop classes of the SOURCE that do not travel. `keep` alone cannot express that: a
 *   `max-w-6xl` coming from a container has nothing to collide with on a target that has no width.
 */
export function pasteStyle(
  target: string,
  source: string,
  keep: readonly string[] = [],
  drop: readonly string[] = [],
): string {
  let result = source;
  for (const cls of drop) result = removeUtility(result, cls);

  const kept = splitUtilities(target).filter((token) => keep.includes(token.raw));
  for (const token of kept) {
    // Whatever the source says about that property gives way to what is being kept.
    for (const other of splitUtilities(result)) {
      if (propertyKey(other) === propertyKey(token)) result = removeUtility(result, other.raw);
    }
    result = addUtility(result, token.raw);
  }
  return result;
}

/** Every category, in the order the summary lists them. */
export const STYLE_CATEGORIES: readonly StyleCategory[] = ['appearance', 'spacing', 'place', 'animation', 'other'];

/**
 * The paste restricted to some categories: only those travel, the rest of the target stays put.
 *
 * This is how "only the looks" is expressed without a second algorithm — and how "keep my position"
 * is expressed too (every category except `place`).
 */
export function pasteCategories(
  target: string,
  source: string,
  categories: readonly StyleCategory[],
): string {
  const outside = STYLE_CATEGORIES.filter((category) => !categories.includes(category));
  if (!outside.length) return source;
  return pasteStyle(target, source, classesInCategories(target, outside), classesInCategories(source, outside));
}

export interface IStyleDiff {
  /** Classes the target does not have yet. */
  added: string[];
  /** Classes the target loses — the half of a replace nobody expects unless it is shown. */
  removed: string[];
}

/** What changes between two class attributes, for the summary shown BEFORE writing. */
export function diffLiterals(before: string, after: string): IStyleDiff {
  const from = splitUtilities(before).map((token) => token.raw);
  const to = splitUtilities(after).map((token) => token.raw);
  return {
    added: to.filter((cls) => !from.includes(cls)),
    removed: from.filter((cls) => !to.includes(cls)),
  };
}
