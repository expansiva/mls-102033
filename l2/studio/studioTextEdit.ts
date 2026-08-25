/// <mls fileReference="_102033_/l2/studio/studioTextEdit.ts" enhancement="_blank" />
// Maps a visible text back to its origin in the page SOURCE, and applies the edit there.
//
// PORT of `_102020_/l2/aura/services/preview/previewTextEditor.ts` (TASK-102033-app-como-preview,
// part 2). The copy exists because 102020 is NOT part of the app build — the build compiles only
// `config.projects` (102029/102033/102034/102025/102027/102036) and 102020 reaches the VM through
// the CI's obj/compiled.zip. Referencing it from here would mean a runtime dynamic import on a path
// that must work on a cold cache.
//
// Differences from the original, all subtractive:
//  - `replaceComponentTag` / `ITagReplaceResult` dropped (molecule tag swap — not text editing).
//    That was the ONLY thing importing `resolveTagToFile`, so this file has NO external dependency.
//  - `findTextOriginByIndex` dropped (unused by the editor: it resolves by key or by occurrence).
// One behavioural divergence, not subtractive: the entry regex in `parseObjectEntries` is FIXED
// here — the original truncates i18n values containing an escaped quote and corrupts the source on
// save (details at the regex). The original carries the same bug.
// Everything else is the same logic, so a bug found in one file should be checked in the other —
// the consolidation path is a shared lib, never a manual sync.
//
// Three cases:
//   1. static  — literal text inside the html`...` template  -> editable
//   2. i18n    — text inside a message_xx block of the same file -> editable
//   3. dynamic — text from an external source (API, state, props) -> NOT editable

// --- Types ---

export type TextOrigin = IStaticOrigin | II18nOrigin | IDynamicOrigin;

export interface IStaticOrigin {
  type: 'static';
  /** Offset in the source where the text starts */
  startOffset: number;
  /** Offset in the source where the text ends */
  endOffset: number;
  /** Original text found in the source */
  originalText: string;
}

export interface II18nOrigin {
  type: 'i18n';
  /** Key in the messages object (e.g. 'login') */
  key: string;
  /** Expression in the template (e.g. 'this.msg.login') */
  templateExpression: string;
  /** Every occurrence across the message objects, by language */
  languages: II18nEntry[];
}

export interface II18nEntry {
  /** Object name (e.g. 'message_en') */
  objectName: string;
  /** Language (e.g. 'en') */
  lang: string;
  /** Current value */
  value: string;
  /** Offset where the string literal starts (quote included) */
  startOffset: number;
  /** Offset where the string literal ends (quote included) */
  endOffset: number;
}

export interface IDynamicOrigin {
  type: 'dynamic';
  /** Why it is not editable */
  reason: string;
}

export interface IEditResult {
  success: boolean;
  newSource?: string;
  error?: string;
}

// --- Main entry points ---

/**
 * Identifies where a visible text comes from.
 *
 * @param text - Visible text (e.g. "Login")
 * @param source - Full .ts file content
 */
export function findTextOrigin(text: string, source: string): TextOrigin {
  const trimmed = text.trim();
  if (!trimmed) return { type: 'dynamic', reason: 'Empty text' };

  const i18nResult = findInI18n(trimmed, source);
  if (i18nResult) return i18nResult;

  const staticResult = findInTemplate(trimmed, source);
  if (staticResult) return staticResult;

  return { type: 'dynamic', reason: `Text "${trimmed}" not found in source file` };
}

/**
 * Applies a text edit to the source.
 *
 * @param origin - Origin returned by one of the find* functions
 * @param newText - New text
 * @param source - Full .ts file content
 * @param lang - Current language (for i18n, edits only that language; all of them when undefined)
 */
export function applyTextEdit(
  origin: TextOrigin,
  newText: string,
  source: string,
  lang?: string | readonly string[],
): IEditResult {
  if (origin.type === 'dynamic') {
    return { success: false, error: origin.reason };
  }

  if (origin.type === 'static') {
    return applyStaticEdit(origin, newText, source);
  }

  if (origin.type === 'i18n') {
    return applyI18nEdit(origin, newText, source, lang);
  }

  return { success: false, error: 'Unknown origin type' };
}

/**
 * The locale whose catalog is ACTUALLY ON SCREEN.
 *
 * This MIRRORS `getMessageKey` ([collabLitElement.ts:48](mls-102029/l2/collabLitElement.ts#L48)), the
 * runtime function that picks the catalog: exact match, then a key that IS the two-letter prefix, then
 * the FIRST key. It must not have an opinion of its own — editing a locale other than the displayed
 * one changes the file while the screen keeps the old text, which is exactly the failure mode this
 * replaces (an earlier version reduced `pt-br` to `pt`).
 *
 * `declared` must come in the order of the catalog MAP (`const pageMessages = { 'pt': ... }`), which is
 * what `getMessageKey` enumerates — parseMessageObjects sorts by it.
 */
export function pickLocale(declared: readonly string[], documentLang: string): string | undefined {
  if (declared.length === 0) return undefined;
  const lang = (documentLang || '').trim().toLowerCase().replace(/_/gu, '-');
  if (!lang) return declared[0];

  const exact = declared.find((l) => l.toLowerCase() === lang);
  if (exact) return exact;

  const twoLetter = lang.substring(0, 2);
  const similar = declared.find((l) => l.toLowerCase() === twoLetter);
  if (similar) return similar;

  return declared[0];
}

/**
 * Locales an edit should reach: the displayed one, plus same-language siblings that currently hold the
 * SAME text.
 *
 * The app can offer more than one locale for the same language — this codebase ships `pt` AND `pt-br`,
 * and the language cycle walks through both. Editing only the displayed one made the change seem to
 * vanish when the user cycled back into the sibling ("voltei pro português e minha alteração sumiu").
 *
 * The identical-value condition is what keeps this safe: same text means duplicated content and the
 * user means both; different text means a REAL translation (`'A carregar o painel…'` in `pt` vs
 * `'Carregando o painel…'` in `pt-br`, `'€'` vs `'R$'`) and overwriting it would destroy work.
 */
export function pickSiblingLocales(origin: II18nOrigin, lang: string): string[] {
  const target = origin.languages.find((l) => l.lang === lang);
  if (!target) return lang ? [lang] : [];

  const primary = lang.toLowerCase().split('-')[0];
  return origin.languages
    .filter((l) => l.lang === lang
      || (l.lang.toLowerCase().split('-')[0] === primary && l.value === target.value))
    .map((l) => l.lang);
}

// --- i18n lookup ---

/**
 * Looks the text up in the collab_i18n block delimited by
 * /// **collab_i18n_start** and /// **collab_i18n_end**
 */
function findInI18n(text: string, source: string): II18nOrigin | null {
  const i18nBlock = extractI18nBlock(source);
  if (!i18nBlock) return null;

  const messageObjects = parseMessageObjects(source, i18nBlock);
  if (messageObjects.length === 0) return null;

  let foundKey: string | null = null;

  // Normalize: trim + collapse inner whitespace
  const normalizedText = text.replace(/\s+/g, ' ').trim();

  for (const obj of messageObjects) {
    for (const [key, entry] of Object.entries(obj.entries)) {
      const normalizedValue = entry.value.replace(/\s+/g, ' ').trim();
      if (normalizedValue === normalizedText) {
        foundKey = key;
        break;
      }
    }
    if (foundKey) break;
  }

  if (!foundKey) return null;

  const templateExpression = findTemplateExpression(foundKey, source);

  // Collect the entries of that key across every language
  const languages: II18nEntry[] = [];
  for (const obj of messageObjects) {
    const entry = obj.entries[foundKey];
    if (entry) {
      languages.push({
        objectName: obj.name,
        lang: obj.lang,
        value: entry.value,
        startOffset: entry.startOffset,
        endOffset: entry.endOffset,
      });
    }
  }

  return {
    type: 'i18n',
    key: foundKey,
    templateExpression: templateExpression || `this.msg.${foundKey}`,
    languages,
  };
}

interface IMessageObject {
  name: string;       // e.g. 'message_en'
  lang: string;       // e.g. 'en'
  entries: Record<string, { value: string; startOffset: number; endOffset: number }>;
}

/** Positions of the i18n block in the source. */
function extractI18nBlock(source: string): { start: number; end: number } | null {
  const startMarker = '/// **collab_i18n_start**';
  const endMarker = '/// **collab_i18n_end**';

  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);

  if (start === -1 || end === -1 || end <= start) return null;

  return { start, end: end + endMarker.length };
}

/**
 * Parses the message_xx objects inside the i18n block. Supports:
 *   const message_en = { key: 'value', ... }
 *   const message_en: Record<string, string> = { key: 'value', ... }
 *   const message_en: MessageType = { key: 'value', ... }
 */
function parseMessageObjects(source: string, block: { start: number; end: number }): IMessageObject[] {
  const blockSource = source.substring(block.start, block.end);
  const results: IMessageObject[] = [];

  // `message_en`, but ALSO `pageMessage_en` and `o1Message_pt_br`: the current generator emits a
  // PREFIXED catalog in the page and in each organism file
  // ([cfePageSkeleton.ts:129-133](mls-102020/l2/agentChangeFrontend/helpers/cfePageSkeleton.ts#L129)).
  // Requiring the bare `message_` name found ZERO objects in those files, so every text of a
  // generated page fell through to the shared catalog — and a page-local literal, which exists in no
  // other file, was reported as "data, not code".
  const objRegex = /const\s+(\w*?[mM]essage_(\w+))\s*(?::\s*[^=]+)?\s*=\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = objRegex.exec(blockSource)) !== null) {
    const name = match[1];                    // message_en | pageMessage_pt_br
    // The const suffix is the locale with `-` replaced by `_` (the generator's constSuffix), so
    // `pt_br` is the locale `pt-br`. Keeping the raw suffix would make it match no declared locale.
    const lang = match[2].replace(/_/gu, '-');
    const objStartInBlock = match.index + match[0].length - 1; // position of the {

    const objEndInBlock = findClosingBrace(blockSource, objStartInBlock);
    if (objEndInBlock === -1) continue;

    const objContent = blockSource.substring(objStartInBlock, objEndInBlock + 1);
    const entries = parseObjectEntries(objContent, block.start + objStartInBlock);

    results.push({ name, lang, entries });
  }

  return sortByCatalogMap(source, results);
}

/**
 * Reorders the catalogs to match the MAP that the runtime enumerates.
 *
 * `getMessageKey` walks `Object.keys(pageMessages)`, so the FIRST key of that map is the fallback the
 * screen shows when the document language matches nothing — and `pickLocale` has to agree. The const
 * declaration order happens to match the map in every generated file checked (120/120), but relying on
 * that would be relying on a coincidence of the generator.
 */
function sortByCatalogMap(source: string, objects: IMessageObject[]): IMessageObject[] {
  const map = source.match(/const\s+\w*[mM]essages\s*:[^=]*=\s*\{([^}]*)\}/u);
  if (!map) return objects;

  const order = [...map[1].matchAll(/'([\w\-]+)'\s*:/gu)].map((m) => m[1].toLowerCase());
  if (order.length === 0) return objects;

  const rank = (lang: string) => {
    const at = order.indexOf(lang.toLowerCase());
    // A catalog absent from the map is unreachable at runtime — keep it last, never as the fallback.
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };
  return [...objects].sort((a, b) => rank(a.lang) - rank(b.lang));
}

/** Position of the matching closing brace. */
function findClosingBrace(source: string, openPos: number): number {
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = openPos; i < source.length; i++) {
    const ch = source[i];
    const prev = i > 0 ? source[i - 1] : '';

    if (inString) {
      if (ch === stringChar && prev !== '\\') {
        inString = false;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Parses the key: 'value' pairs of an object, returning ABSOLUTE offsets.
 *
 * @param objContent - Object content, braces included
 * @param absoluteOffset - Offset of the { in the full source
 */
function parseObjectEntries(
  objContent: string,
  absoluteOffset: number,
): Record<string, { value: string; startOffset: number; endOffset: number }> {
  const entries: Record<string, { value: string; startOffset: number; endOffset: number }> = {};

  // `key: 'value'` / `"dotted.key": "value"` — quoted or bare keys.
  //
  // THREE bugs of previewTextEditor.ts are fixed here; all three were measured against a real
  // generated page (mls-102051 cafeFlow web/shared/dashboardWorkspace.ts, 54 entries):
  //
  //  1. KEY CHARSET. The original key group was `(\w+)`, which matches neither `.` nor `-`. Real
  //     generated keys are dotted ("section.dashboardWorkspace.sec-kpi-overview.title"), so the
  //     regex silently matched only the LAST segment: 54 entries collapsed onto 3 distinct keys
  //     (51 collisions) and, since `entries` is a Record, the last one won. Effect: a lookup by the
  //     full key never found anything and the text was reported as "dynamic" — i.e. every i18n text
  //     of a real page looked like data instead of code.
  //  2. VALUE OFFSET. `match[0].indexOf(quote)` finds the FIRST occurrence of the quote char in the
  //     whole match — which is the KEY's opening quote whenever key and value use the same style
  //     (`"key": "value"`, exactly what the generator emits). The offsets then pointed INTO THE KEY,
  //     so saving would have overwritten the key instead of the value. The match ends with
  //     quote+value+quote, so the value literal is always the last `value.length + 2` characters:
  //     that is exact and needs no searching.
  //  3. ESCAPED QUOTES. The value group was `((?:(?!\2|(?<!\\)\2).)*?)`: its first alternative
  //     (`\2` alone) fails on ANY quote, escaped included, cancelling the `(?<!\\)\2` meant to allow
  //     them — 'It\'s fine' parsed as `It\` and editing it left `s fine'` dangling. Guarding only
  //     the consuming loop is not enough (the trailing `\2` still terminates on the escaped quote):
  //     the escape pair must be consumed as a UNIT.
  //
  // Groups: 1 = key quote (may be empty), 2 = key, 3 = value quote, 4 = value.
  const entryRegex = /(['"]?)([\w.\-]+)\1\s*:\s*(['"`])((?:\\.|(?!\3)[^\\\r\n])*)\3/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(objContent)) !== null) {
    const key = match[2];
    const value = match[4];

    // Position of the whole string literal (quotes included) — see bug 2 above.
    const valueWithQuotesStart = match.index + match[0].length - value.length - 2;
    const valueWithQuotesEnd = valueWithQuotesStart + value.length + 2; // +2 for the quotes

    entries[key] = {
      value: unescapeString(value),
      startOffset: absoluteOffset + valueWithQuotesStart,
      endOffset: absoluteOffset + valueWithQuotesEnd,
    };
  }

  return entries;
}

/** Removes simple string escapes. */
function unescapeString(str: string): string {
  return str
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

// --- Template lookup ---

/**
 * Looks for static text inside the html`...` template of render().
 * Static text is anything between HTML tags that is NOT inside ${...}.
 */
function findInTemplate(text: string, source: string): IStaticOrigin | null {
  // EVERY html`` block, not just the first one after `render() {`. The generator splits a page across
  // render()/renderXxx() methods (9 templates in the file this was tested against), and organism
  // files have no `render()` at all — they export plain functions. Anchoring on the first template
  // made every text outside it invisible.
  for (const template of findTemplates(source)) {
    // Search the template, ignoring anything inside ${...}
    const staticParts = extractStaticParts(template.content, template.start);

    for (const part of staticParts) {
      const idx = part.text.indexOf(text);
      if (idx === -1) continue;
      return {
        type: 'static',
        startOffset: part.absoluteOffset + idx,
        endOffset: part.absoluteOffset + idx + text.length,
        originalText: text,
      };
    }
  }

  return null;
}

interface ITemplateSpan {
  /** Offset of the first character INSIDE the template (past ``html` ``). */
  start: number;
  /** Offset of the closing backtick. */
  end: number;
  content: string;
}

/**
 * Every top-level html`` template in a source, in source order.
 *
 * Nested templates (an ``html` `` inside a `${...}`) are NOT returned separately: scanning resumes
 * past the closing backtick of the outer one, which is where `findTemplateEnd` already accounts for
 * them. Their expressions therefore stay invisible to the template map — the same limit the previous
 * single-template version had, kept explicit here.
 */
function findTemplates(source: string): ITemplateSpan[] {
  const spans: ITemplateSpan[] = [];
  let from = 0;

  for (;;) {
    const tagIndex = source.indexOf('html`', from);
    if (tagIndex === -1) break;

    const start = tagIndex + 5; // past html`
    const end = findTemplateEnd(source, start);
    if (end === -1) break;

    spans.push({ start, end, content: source.substring(start, end) });
    from = end + 1;
  }

  return spans;
}

/** Closing backtick of a template literal, respecting nested ${...}. */
function findTemplateEnd(source: string, start: number): number {
  let depth = 0; // ${...} depth

  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    const next = i + 1 < source.length ? source[i + 1] : '';

    if (ch === '$' && next === '{') {
      depth++;
      i++; // skip the {
      continue;
    }

    if (ch === '}' && depth > 0) {
      depth--;
      continue;
    }

    if (ch === '`' && depth === 0) {
      return i;
    }
  }
  return -1;
}

/** Static parts of a template literal (everything outside ${...}). */
function extractStaticParts(template: string, absoluteOffset: number): { text: string; absoluteOffset: number }[] {
  const parts: { text: string; absoluteOffset: number }[] = [];
  let depth = 0;
  let partStart = 0;

  for (let i = 0; i < template.length; i++) {
    const ch = template[i];
    const next = i + 1 < template.length ? template[i + 1] : '';

    if (ch === '$' && next === '{' && depth === 0) {
      // Keep the static part before the ${
      if (i > partStart) {
        parts.push({
          text: template.substring(partStart, i),
          absoluteOffset: absoluteOffset + partStart,
        });
      }
      depth++;
      i++; // skip the {
      continue;
    }

    if (ch === '{' && depth > 0) {
      depth++;
      continue;
    }

    if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0) {
        partStart = i + 1;
      }
      continue;
    }
  }

  // Trailing static part
  if (partStart < template.length) {
    parts.push({
      text: template.substring(partStart),
      absoluteOffset: absoluteOffset + partStart,
    });
  }

  return parts;
}

// --- Template expression lookup ---

/**
 * How an i18n key is referenced in the template.
 * For key='login', looks for ${this.msg.login} or ${this.msg['login']}.
 */
function findTemplateExpression(key: string, source: string): string | null {
  // The key goes INTO a regex, and real keys carry dots — unescaped they would match any char.
  const k = key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const patterns = [
    new RegExp(`this\\.msg\\.${k}\\b`),
    new RegExp(`this\\.msg\\['${k}'\\]`),
    new RegExp(`this\\.msg\\["${k}"\\]`),
    new RegExp(`(?:this\\.)?t\\(\\s*['"]${k}['"]\\s*\\)`),
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return match[0];
  }

  return null;
}

// --- Applying edits ---

/** Applies a static text edit in the template. */
function applyStaticEdit(origin: IStaticOrigin, newText: string, source: string): IEditResult {
  const before = source.substring(0, origin.startOffset);
  const after = source.substring(origin.endOffset);

  return {
    success: true,
    newSource: before + newText + after,
  };
}

/**
 * Applies an i18n text edit. With `lang`, only that language; without it, all of them.
 *
 * IMPORTANT: edits back to front so earlier offsets stay valid.
 */
function applyI18nEdit(
  origin: II18nOrigin,
  newText: string,
  source: string,
  lang?: string | readonly string[],
): IEditResult {
  let entries = origin.languages;
  if (lang) {
    const wanted = typeof lang === 'string' ? [lang] : lang;
    entries = entries.filter((e) => wanted.includes(e.lang));
  }

  if (entries.length === 0) {
    return { success: false, error: `No i18n entry found for lang: ${String(lang)}` };
  }

  const sorted = [...entries].sort((a, b) => b.startOffset - a.startOffset);

  let result = source;
  for (const entry of sorted) {
    // Preserve whichever quote style the literal used
    const quoteChar = result[entry.startOffset];
    const escapedText = escapeForQuote(newText, quoteChar);
    const replacement = `${quoteChar}${escapedText}${quoteChar}`;

    result = result.substring(0, entry.startOffset) + replacement + result.substring(entry.endOffset);
  }

  return { success: true, newSource: result };
}

/** Escapes text for use inside a string with the given quote character. */
function escapeForQuote(text: string, quote: string): string {
  if (quote === "'") return text.replace(/'/g, "\\'");
  if (quote === '"') return text.replace(/"/g, '\\"');
  if (quote === '`') return text.replace(/`/g, '\\`');
  return text;
}

// --- Template map ---

/** A ${...} expression in the template, in the order it appears. */
export interface ITemplateExpression {
  /** Sequential index in the template (0, 1, 2, ...) */
  index: number;
  /** Full expression (e.g. 'this.msg.login') */
  expression: string;
  /** The i18n key when it is an i18n pattern, null otherwise */
  i18nKey: string | null;
  type: 'i18n' | 'dynamic';
  /** Offset where the expression starts (past the ${) */
  startOffset: number;
  /** Offset where the expression ends (before the }) */
  endOffset: number;
}

/**
 * Ordered map of every ${...} expression across ALL html`` templates of a source.
 *
 * Used only to DISAMBIGUATE keys that share a value, by their position. Source order is the proxy for
 * DOM order: with a page split across render()/renderXxx() methods, the two agree as long as the
 * methods are declared in the order they are called — which is what the generator emits. It is a
 * heuristic, and it only ever decides between same-valued keys.
 */
export function buildTemplateMap(source: string): ITemplateExpression[] {
  const expressions: ITemplateExpression[] = [];
  let exprIndex = 0;

  for (const template of findTemplates(source)) {
    let depth = 0;
    let exprStart = -1;

    for (let i = template.start; i < template.end; i++) {
      const ch = source[i];
      const next = i + 1 < source.length ? source[i + 1] : '';

      if (ch === '$' && next === '{' && depth === 0) {
        depth = 1;
        exprStart = i + 2; // past the ${
        i++; // skip the {
        continue;
      }

      if (depth > 0) {
        if (ch === '{') depth++;
        if (ch === '}') {
          depth--;
          if (depth === 0) {
            const expression = source.substring(exprStart, i).trim();
            const i18nKey = extractI18nKeyFromExpression(expression);

            expressions.push({
              index: exprIndex++,
              expression,
              i18nKey,
              type: i18nKey ? 'i18n' : 'dynamic',
              startOffset: exprStart,
              endOffset: i,
            });
          }
        }
      }
    }
  }

  return expressions;
}

/**
 * i18n key of an expression like 'this.msg.login' or 'this.msg["login"]'.
 * Also recognizes the t() helper: t('login') / this.t('login'). Null when unrecognized.
 */
function extractI18nKeyFromExpression(expression: string): string | null {
  // this.msg.key — only a bare identifier can be reached with dot access
  const dotMatch = expression.match(/^this\.msg\.(\w+)$/u);
  if (dotMatch) return dotMatch[1];

  // this.msg['key'] / msg['key'] — the DOTTED form real pages use, so `\w+` is not enough. The bare
  // `msg[...]` matters because the generator opens every render with `const msg = this.msg;` (and, in
  // organism files, `const msg = o1Messages[...]`), so the template never says `this.msg`.
  const bracketMatch = expression.match(/^(?:this\.)?msg\[['"]([\w.\-]+)['"]\]$/u);
  if (bracketMatch) return bracketMatch[1];

  // t('key') or this.t('key')
  const tMatch = expression.match(/^(?:this\.)?t\(\s*['"]([\w.\-]+)['"]\s*\)$/u);
  if (tMatch) return tMatch[1];

  return null;
}

// --- Deterministic resolution by key (data-i18n-key) ---

/**
 * Resolves the i18n origin DIRECTLY by key, with no ambiguity.
 *
 * This is the correct path: used when the DOM carries the key via data-i18n-key (emitted by the
 * t() helper). It does not depend on occurrence counting, DOM order, or the text matching some
 * literal — so it resolves distinct keys that share the SAME value.
 *
 * @param key - i18n key (e.g. 'colFormaPagamento')
 * @param source - Full .ts file content
 * @param _lang - Current language (unused here; per-language editing happens in applyTextEdit).
 *                Kept for signature symmetry.
 */
export function findTextOriginByKey(key: string, source: string, _lang?: string): TextOrigin {
  if (!key) return { type: 'dynamic', reason: 'No i18n key' };

  const i18nBlock = extractI18nBlock(source);
  if (!i18nBlock) return { type: 'dynamic', reason: 'No i18n block in source' };

  const messageObjects = parseMessageObjects(source, i18nBlock);
  if (messageObjects.length === 0) return { type: 'dynamic', reason: 'No message objects in source' };

  const languages: II18nEntry[] = [];
  for (const obj of messageObjects) {
    const entry = obj.entries[key];
    if (entry) {
      languages.push({
        objectName: obj.name,
        lang: obj.lang,
        value: entry.value,
        startOffset: entry.startOffset,
        endOffset: entry.endOffset,
      });
    }
  }

  if (languages.length === 0) {
    return { type: 'dynamic', reason: `i18n key "${key}" not found in source` };
  }

  return {
    type: 'i18n',
    key,
    templateExpression: findTemplateExpression(key, source) || `this.msg.${key}`,
    languages,
  };
}

// --- The `fromShared` mapping of generated pages ---

/**
 * Short page key -> long shared key, read from the `fromShared` mapping.
 *
 * The current generator gives the page (and each organism) its own catalog with SHORT keys, part of
 * them mapped from the shared catalog and part of them literals of its own:
 *
 *   const fromShared = (m: MessageType) => ({
 *     'locate.empty': m['intent.approveChangeOrder.qryLocateChangeOrder.list.empty'],
 *   });
 *   const pageMessage_pt = { ...fromShared(sharedMessages['pt']), 'refresh': 'Atualizar' };
 *
 * The mapped entries are REFERENCES: their text is not in this file, so editing them means editing
 * the shared catalog under the long key — and that changes the text for EVERY page mapping it. The
 * literals are local and change only this page. Telling the two apart is what makes the difference
 * reportable instead of silent.
 */
export function readSharedKeyMap(source: string): Map<string, string> {
  const map = new Map<string, string>();

  const decl = source.match(/const\s+fromShared\s*=\s*\(([^)]*)\)\s*=>\s*\(?\s*\{/u);
  if (!decl || decl.index === undefined) return map;

  const bodyStart = source.indexOf('{', decl.index + decl[0].length - 1);
  if (bodyStart < 0) return map;
  const bodyEnd = findClosingBrace(source, bodyStart);
  if (bodyEnd < 0) return map;
  const body = source.substring(bodyStart, bodyEnd + 1);

  // The mapping parameter is `m` by convention, but read whatever the signature declares.
  const param = (decl[1].split(':')[0] || 'm').trim() || 'm';
  const pairRegex = new RegExp(
    `(['"]?)([\\w.\\-]+)\\1\\s*:\\s*${param}\\s*\\[\\s*(['"])([\\w.\\-]+)\\3\\s*\\]`,
    'gu',
  );

  let match: RegExpExecArray | null;
  while ((match = pairRegex.exec(body)) !== null) {
    map.set(match[2], match[4]);
  }
  return map;
}

/** Locales a source's catalog declares, in declaration order. */
export function readDeclaredLocales(source: string): string[] {
  const block = extractI18nBlock(source);
  if (!block) return [];
  return parseMessageObjects(source, block).map((o) => o.lang);
}

// --- Occurrence-based disambiguation ---

/** Every i18n key whose value matches the given text, in declaration order. */
export function findAllI18nMatches(text: string, source: string, lang?: string): { key: string; origin: II18nOrigin }[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const i18nBlock = extractI18nBlock(source);
  if (!i18nBlock) return [];

  const messageObjects = parseMessageObjects(source, i18nBlock);
  if (messageObjects.length === 0) return [];

  const normalizedText = trimmed.replace(/\s+/g, ' ');
  const matchingKeys: string[] = [];

  const picked = lang ? pickLocale(messageObjects.map((o) => o.lang), lang) : undefined;
  const primaryObj = picked
    ? messageObjects.find((o) => o.lang === picked) || messageObjects[0]
    : messageObjects[0];

  for (const [key, entry] of Object.entries(primaryObj.entries)) {
    const normalizedValue = entry.value.replace(/\s+/g, ' ').trim();
    if (normalizedValue === normalizedText) {
      matchingKeys.push(key);
    }
  }

  const results: { key: string; origin: II18nOrigin }[] = [];

  for (const foundKey of matchingKeys) {
    const templateExpression = findTemplateExpression(foundKey, source);
    const languages: II18nEntry[] = [];
    for (const obj of messageObjects) {
      const entry = obj.entries[foundKey];
      if (entry) {
        languages.push({
          objectName: obj.name,
          lang: obj.lang,
          value: entry.value,
          startOffset: entry.startOffset,
          endOffset: entry.endOffset,
        });
      }
    }
    results.push({
      key: foundKey,
      origin: {
        type: 'i18n',
        key: foundKey,
        templateExpression: templateExpression || `this.msg.${foundKey}`,
        languages,
      },
    });
  }

  return results;
}

/**
 * Resolves the text origin using the DOM occurrence index to disambiguate when several i18n keys
 * share the same value.
 *
 * NOTE: this is the FALLBACK path, for text that was not tagged with data-i18n-key. Prefer
 * findTextOriginByKey for deterministic resolution.
 *
 * @param text - Visible text
 * @param source - Source holding the i18n block (the shared base class, on generated pages)
 * @param occurrenceIndex - Which occurrence of this text in the DOM (0-based)
 * @param lang - Current language
 * @param templateSource - Source holding the render() template, when it is a DIFFERENT file.
 *        Generated pages split the two: messages live in `web/shared/<name>.ts` (the base class) and
 *        the template in `web/desktop/page<N>/<name>.ts`. Ordering the matches needs the TEMPLATE,
 *        so passing only the shared source would silently degrade to declaration order.
 */
export function findTextOriginByOccurrence(
  text: string,
  source: string,
  occurrenceIndex: number,
  lang?: string,
  templateSource?: string,
): TextOrigin {
  const trimmed = text.trim();
  if (!trimmed) return { type: 'dynamic', reason: 'Empty text' };

  const matches = findAllI18nMatches(trimmed, source, lang);

  if (matches.length > 1 && occurrenceIndex >= 0) {
    const templateMap = buildTemplateMap(templateSource ?? source);

    // Order the matches by template position. Keys absent from the template (templateIdx = -1) are
    // NOT discarded: they go last, in declaration order — discarding them made every edit collapse
    // onto matches[0].
    const ordered = matches
      .map((m, declIdx) => {
        const templateIdx = templateMap.findIndex((expr) => expr.i18nKey === m.key);
        return { ...m, declIdx, templateIdx };
      })
      .sort((a, b) => {
        const ta = a.templateIdx < 0 ? Number.MAX_SAFE_INTEGER : a.templateIdx;
        const tb = b.templateIdx < 0 ? Number.MAX_SAFE_INTEGER : b.templateIdx;
        return ta !== tb ? ta - tb : a.declIdx - b.declIdx;
      });

    if (occurrenceIndex < ordered.length) {
      return ordered[occurrenceIndex].origin;
    }
  }

  if (matches.length > 0) {
    return matches[0].origin;
  }

  return findTextOrigin(text, source);
}
