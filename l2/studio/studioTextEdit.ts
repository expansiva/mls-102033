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
export function applyTextEdit(origin: TextOrigin, newText: string, source: string, lang?: string): IEditResult {
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

  const objRegex = /const\s+(message_(\w+))\s*(?::\s*[^=]+)?\s*=\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = objRegex.exec(blockSource)) !== null) {
    const name = match[1];     // message_en
    const lang = match[2];     // en
    const objStartInBlock = match.index + match[0].length - 1; // position of the {

    const objEndInBlock = findClosingBrace(blockSource, objStartInBlock);
    if (objEndInBlock === -1) continue;

    const objContent = blockSource.substring(objStartInBlock, objEndInBlock + 1);
    const entries = parseObjectEntries(objContent, block.start + objStartInBlock);

    results.push({ name, lang, entries });
  }

  return results;
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
  const renderMatch = source.match(/render\s*\(\s*\)\s*\{/);
  if (!renderMatch || renderMatch.index === undefined) return null;

  const renderStart = renderMatch.index;

  const htmlTagIndex = source.indexOf('html`', renderStart);
  if (htmlTagIndex === -1) return null;

  const templateStart = htmlTagIndex + 5; // past html`

  const templateEnd = findTemplateEnd(source, templateStart);
  if (templateEnd === -1) return null;

  const templateContent = source.substring(templateStart, templateEnd);

  // Search the template, ignoring anything inside ${...}
  const staticParts = extractStaticParts(templateContent, templateStart);

  for (const part of staticParts) {
    const idx = part.text.indexOf(text);
    if (idx !== -1) {
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
function applyI18nEdit(origin: II18nOrigin, newText: string, source: string, lang?: string): IEditResult {
  let entries = origin.languages;
  if (lang) {
    entries = entries.filter((e) => e.lang === lang);
  }

  if (entries.length === 0) {
    return { success: false, error: `No i18n entry found for lang: ${lang}` };
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
 * Ordered map of every ${...} expression in the html`...` template of render().
 * The order matches the order of the text nodes in the rendered DOM.
 */
export function buildTemplateMap(source: string): ITemplateExpression[] {
  const renderMatch = source.match(/render\s*\(\s*\)\s*\{/);
  if (!renderMatch || renderMatch.index === undefined) return [];

  const renderStart = renderMatch.index;

  const htmlTagIndex = source.indexOf('html`', renderStart);
  if (htmlTagIndex === -1) return [];

  const templateStart = htmlTagIndex + 5; // past html`

  const templateEnd = findTemplateEnd(source, templateStart);
  if (templateEnd === -1) return [];

  const expressions: ITemplateExpression[] = [];
  let depth = 0;
  let exprStart = -1;
  let exprIndex = 0;

  for (let i = templateStart; i < templateEnd; i++) {
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

  // this.msg['key'] or this.msg["key"] — the DOTTED form real pages use, so `\w+` is not enough
  const bracketMatch = expression.match(/^this\.msg\[['"]([\w.\-]+)['"]\]$/u);
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

  const primaryObj = lang
    ? messageObjects.find((o) => o.lang === lang) || messageObjects[0]
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
