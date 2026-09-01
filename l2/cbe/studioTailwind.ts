/// <mls fileReference="_102033_/l2/cbe/studioTailwind.ts" enhancement="_blank" />
// Tailwind JIT for the STUDIO mode of the client app (TASK-102033-studio-tailwind-jit).
//
// The app's Tailwind is build-time: the CLI scans `@source` and writes
// `_102033_/l2/shared/tailwind.css` (scripts/build.mjs:620), and the scan covers only
// `Object.keys(clientConfig.projects)` (scripts/build.mjs:734). The studio chrome (plugins and
// services of 102020) runs INSIDE that same document, but 102020 is not a client project — it is a
// workspace dependency — so 75% of its distinct classes (44% of its uses) have no rule in the built
// sheet. Outside the preview iframe there was no Tailwind at all for them.
//
// The fix is the browser JIT, loaded ONLY in studio mode: 102020 is studio-only, so its classes must
// NOT be baked into the client's CSS. A safelist in the build was rejected — it would cover a
// hand-picked vocabulary, not the 552 classes already in use.
//
// Client sessions never see any of this: studioStructure calls setStudioTailwind() with the shell's
// `data-studio-mode`, and the CDN bundle is only fetched the first time that turns true. Leaving studio
// mode does not (cannot) unload the JIT — its sheet is made inert instead, see JIT_SUSPENDED_MEDIA.

/**
 * Pinned so the studio renders what the BUILD will generate.
 *
 * The preview's CDN entry is a floating major (`@tailwindcss/browser@4`, in
 * mls-102020/l2/enhancementAura.ts:118); here that drift would silently defeat the whole point of the
 * JIT. `studioTailwind.test.ts` fails when this stops matching the `tailwindcss` / `@tailwindcss/cli`
 * versions the build actually resolves.
 */
export const TAILWIND_JIT_VERSION = '4.3.0';

export const TAILWIND_JIT_URL = `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@${TAILWIND_JIT_VERSION}`;

const CONFIG_STYLE_ID = 'cbe-studio-tailwind-config';
const JIT_SCRIPT_ID = 'cbe-studio-tailwind-jit';

/** The built app sheet, the one the CLIENT gets — the reference for the coverage audit below. */
const BUILT_SHEET_PATH = '/_102033_/l2/shared/tailwind.css';

/**
 * The `@theme` block of mls-102033/l2/shared/tailwind.css, verbatim.
 *
 * A literal copy because the SERVED file is the compiled one (the build overwrites it), where `@theme`
 * is already lowered to `:root { --color-... }` and cannot be handed back to the JIT. The test asserts
 * this copy still matches the source file, so drift is caught by the suite and not on screen.
 */
export const STUDIO_TAILWIND_THEME = `@theme {
  --color-aura-ink: #102a43;
  --color-aura-navy: #17324d;
  --color-aura-blue: #22496e;
  --color-aura-sand: #fffdfa;
  --color-aura-mist: #f7f4ea;
}`;

/**
 * The stylesheet handed to the JIT (`<style type="text/tailwindcss">`).
 *
 * - `@import "tailwindcss"`: the browser build prepends it only when no `@import` appears at all;
 *   being explicit keeps our block self-contained whatever else gets injected later.
 * - `@custom-variant dark`: without it `dark:` follows `prefers-color-scheme` instead of the `.dark`
 *   class the app puts on `<html>` (mls-102033/l2/shared/bootstrap.ts:69) — and `dark:` utilities are
 *   the single largest slice of 102020's dead classes. Same injection the Aura preview does
 *   (mls-102020/l2/aura/services/preview/previewModeAura.ts:451).
 * - `@theme`: the JIT cannot generate theme-dependent utilities (`text-aura-ink`, ...) without it.
 */
export const STUDIO_TAILWIND_CSS = `@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));
${STUDIO_TAILWIND_THEME}
`;

/**
 * `media` value that makes the JIT sheet inert.
 *
 * Leaving studio mode has to give the CLIENT'S css back: with both sheets live, a page edited in the
 * studio keeps looking right in client mode, which is precisely the masking this module is supposed to
 * expose. The script itself cannot be unloaded (the browser build is an IIFE with no exit door and its
 * own DOM observer), so the sheet is neutralised instead — and re-enabled instantly on the way back in,
 * with no second download.
 *
 * `media` on the ELEMENT rather than `sheet.disabled`: the JIT rewrites the style's `textContent` on
 * every rebuild, which re-parses the sheet and would drop `disabled`; the attribute survives.
 */
export const JIT_SUSPENDED_MEDIA = 'not all';

/** The JIT's own output sheet, adopted when the script finishes loading (see adoptJitStyle). */
let jitStyleElement: HTMLStyleElement | undefined;
let jitStyleCandidates: HTMLStyleElement[] = [];
let headObserver: MutationObserver | undefined;
let suspended = false;
let auditScheduled = false;

/** Only what applyJitSuspension touches, so it can be exercised without a DOM. */
export interface JitStyleTarget {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export function applyJitSuspension(style: JitStyleTarget, isSuspended: boolean): void {
  if (isSuspended) style.setAttribute('media', JIT_SUSPENDED_MEDIA);
  else style.removeAttribute('media');
}

/**
 * Follows the studio mode both ways: `true` loads the JIT (once) and makes its sheet live, `false`
 * makes it inert so the app renders with exactly the css the client is served.
 */
export function setStudioTailwind(active: boolean): void {
  suspended = !active;
  if (active) ensureStudioTailwind();
  if (jitStyleElement) applyJitSuspension(jitStyleElement, suspended);
}

/**
 * Loads the Tailwind browser JIT into the app document. Idempotent: repeated studio-mode toggles reuse
 * the injected script, so the CDN bundle is downloaded once per session.
 */
export function ensureStudioTailwind(): void {
  if (document.getElementById(JIT_SCRIPT_ID)) return;

  // The config MUST be in the DOM before the script runs: the browser build reads every
  // `style[type="text/tailwindcss"]` on its first full build, right after evaluating.
  if (!document.getElementById(CONFIG_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = CONFIG_STYLE_ID;
    style.setAttribute('type', 'text/tailwindcss');
    style.textContent = STUDIO_TAILWIND_CSS;
    document.head.appendChild(style);
  }

  watchForJitStyle();

  const script = document.createElement('script');
  script.id = JIT_SCRIPT_ID;
  script.src = TAILWIND_JIT_URL;
  script.addEventListener('load', () => {
    adoptJitStyle();
    console.info(`[studio-tailwind] JIT ${TAILWIND_JIT_VERSION} active`);
    scheduleCoverageAudit();
  });
  script.addEventListener('error', () => {
    console.warn(`[studio-tailwind] JIT could not be loaded from ${TAILWIND_JIT_URL}`);
  });
  document.head.appendChild(script);
}

/**
 * The JIT appends its generated sheet as a bare `<style>` at the end of `<head>` — no id, no type, so
 * afterwards it is indistinguishable from the shell's own style tags. Watch for the insertion instead
 * of guessing later: both the suspension and the audit need to tell that node from the others.
 */
function watchForJitStyle(): void {
  if (headObserver || jitStyleElement) return;
  headObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (!(node instanceof HTMLStyleElement)) continue;
        if (node.id || node.getAttribute('type')) continue;
        jitStyleCandidates.push(node);
      }
    }
  });
  headObserver.observe(document.head, { childList: true });
}

/**
 * Takes the LAST bare style inserted before the script's `load` event.
 *
 * The browser build appends its sheet while the script EVALUATES, so it is always the most recent
 * candidate by the time `load` fires — narrower than "the first bare style ever added", which could
 * pick up someone else's tag injected while the bundle was still downloading. Getting this wrong now
 * costs more than a wrong audit: suspension would neutralise a stranger's stylesheet.
 */
function adoptJitStyle(): void {
  headObserver?.disconnect();
  headObserver = undefined;
  jitStyleElement = jitStyleCandidates[jitStyleCandidates.length - 1];
  jitStyleCandidates = [];
  if (!jitStyleElement) {
    console.warn('[studio-tailwind] the JIT sheet could not be identified: leaving studio mode will not restore the client css');
    return;
  }
  applyJitSuspension(jitStyleElement, suspended);
}

// ─── Coverage audit: what the studio shows but the CLIENT will not ─────────────

/**
 * Class names a list of selectors targets.
 *
 * Tailwind escapes utilities heavily (`.dark\:text-gray-300`, `.w-\[10px\]`, `.p-1\.5`), so escapes
 * are undone before comparing. Pure on purpose — the DOM side only feeds it selectorTexts.
 */
export function classNamesFromSelectors(selectors: Iterable<string>): Set<string> {
  const names = new Set<string>();
  for (const selector of selectors) {
    for (const match of selector.matchAll(/\.((?:[^\s.,:>+~()[\]{}'"\\]|\\.)+)/gu)) {
      names.add(match[1].replace(/\\(.)/gu, '$1'));
    }
  }
  return names;
}

/**
 * Classes the studio renders correctly ONLY because the JIT is here — in use, known to Tailwind, and
 * absent from the built sheet the client app is served.
 *
 * Without this signal the JIT would MASK the build's `@source` scope problem: the premise of the
 * parent task is "the app IS the faithful preview", which stops holding the moment studio-only CSS
 * makes a page look finished.
 */
export function missingFromBuiltCss(
  used: Iterable<string>,
  jitClasses: Set<string>,
  builtClasses: Set<string>,
): string[] {
  const missing = new Set<string>();
  for (const name of used) {
    if (jitClasses.has(name) && !builtClasses.has(name)) missing.add(name);
  }
  return [...missing].sort();
}

function collectSelectors(rules: CSSRuleList | undefined, into: string[]): void {
  if (!rules) return;
  for (const rule of Array.from(rules)) {
    const selectorText = (rule as CSSStyleRule).selectorText;
    if (typeof selectorText === 'string') into.push(selectorText);
    collectSelectors((rule as CSSGroupingRule).cssRules, into);
  }
}

/** Same-origin sheets only; a cross-origin one throws on `cssRules` and is simply skipped. */
function selectorsOf(sheet: CSSStyleSheet | null | undefined): string[] {
  const selectors: string[] = [];
  try {
    collectSelectors(sheet?.cssRules, selectors);
  } catch {
    /* opaque stylesheet */
  }
  return selectors;
}

function usedClassNames(): Set<string> {
  const names = new Set<string>();
  for (const element of Array.from(document.querySelectorAll('[class]'))) {
    for (const name of Array.from(element.classList)) names.add(name);
  }
  return names;
}

function builtSheet(): CSSStyleSheet | undefined {
  return Array.from(document.styleSheets).find((sheet) => sheet.href?.includes(BUILT_SHEET_PATH));
}

/**
 * Classes that have a rule in the BUILT sheet — i.e. what the client app will actually render.
 *
 * The class picker (studioClassEdit) asks this before offering a utility: with the JIT on, a class
 * absent from here still works on screen but would come out unstyled for the client until the next
 * publish, and the picker has to say so instead of quietly promising it.
 */
export function builtCssClassNames(): Set<string> {
  return classNamesFromSelectors(selectorsOf(builtSheet()));
}

/** True when the JIT is loaded AND its sheet is live (not suspended by leaving studio mode). */
export function isStudioTailwindLive(): boolean {
  if (!document.getElementById(JIT_SCRIPT_ID)) return false;
  if (suspended) return false;
  return (jitStyleElement?.sheet?.cssRules.length ?? 0) > 0;
}

/**
 * One-shot report, run once the JIT has produced its first sheet. Cheap (three set walks) and silent
 * when there is nothing to report.
 */
export function auditBuiltTailwindCoverage(): string[] {
  const jitSheet = jitStyleElement?.sheet;
  const built = builtSheet();
  if (!jitSheet || !built) return [];
  const missing = missingFromBuiltCss(
    usedClassNames(),
    classNamesFromSelectors(selectorsOf(jitSheet)),
    classNamesFromSelectors(selectorsOf(built)),
  );
  if (missing.length) {
    console.warn(
      `[studio-tailwind] ${missing.length} class(es) in use have NO rule in the built ${BUILT_SHEET_PATH}`
      + ' — they render here only because the studio JIT is loaded, and will NOT render for the client.'
      + ` Sample: ${missing.slice(0, 12).join(', ')}`,
    );
  }
  return missing;
}

/**
 * The JIT's first build is async (it compiles after the script evaluates), so the audit waits for the
 * generated sheet to actually carry rules instead of racing it. Bounded: gives up quietly after ~10s.
 */
function scheduleCoverageAudit(): void {
  if (auditScheduled) return;
  auditScheduled = true;
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const rules = jitStyleElement?.sheet?.cssRules.length ?? 0;
    if (rules > 0) {
      clearInterval(timer);
      auditBuiltTailwindCoverage();
      return;
    }
    if (attempts >= 20) clearInterval(timer);
  }, 500);
}
