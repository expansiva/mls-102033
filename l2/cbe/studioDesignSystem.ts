/// <mls fileReference="_102033_/l2/cbe/studioDesignSystem.ts" enhancement="_blank" />
// The design system while editing, without touching the app's own.
//
// The studio and the client app share ONE document, and the app paints from ONE
// `<style id="ds-tokens">` (bootstrap). The studio's DS knob repaints that style with the DS being
// edited; that choice must not become the app's: the first studio paint keeps the app's tokens
// aside, leaving studio mode puts them back, and entering again brings the studio's DS back.
//
// Both sides live ON the document, in inert styles (`media="not all"`), not in this module: the
// shell and the studio services may load this file through different builds, and both must see the
// same state (same reason as studioTheme).

export const DS_TOKENS_ID = 'ds-tokens';
/** Present only while the studio holds the app's tokens: what the app had. */
export const APP_DS_ID = 'ds-tokens-app';
/** Present only outside studio mode: what the studio showed when it closed. */
export const STUDIO_DS_ID = 'ds-tokens-studio';

export interface IDsStyle {
  id: string;
  textContent: string | null;
  dataset: Record<string, string | undefined>;
  setAttribute(name: string, value: string): void;
  remove(): void;
}

export interface IDsDocument {
  getElementById(id: string): IDsStyle | null;
  createElement(tagName: 'style'): IDsStyle;
  head: { appendChild(element: IDsStyle): unknown };
}

function defaultDoc(): IDsDocument | null {
  return typeof document === 'undefined' ? null : (document as unknown as IDsDocument);
}

/** Copy text + DS name from one style to another (`designSystem` absent stays absent). */
function copyInto(from: IDsStyle, to: IDsStyle): void {
  to.textContent = from.textContent;
  if (from.dataset.designSystem) to.dataset.designSystem = from.dataset.designSystem;
  else delete to.dataset.designSystem;
}

/** An inert copy of `source` under `id` (replacing any previous one). */
function stash(doc: IDsDocument, id: string, source: IDsStyle): void {
  let style = doc.getElementById(id);
  if (!style) {
    style = doc.createElement('style');
    style.id = id;
    style.setAttribute('media', 'not all');
    doc.head.appendChild(style);
  }
  copyInto(source, style);
}

/** Whether the studio is holding the app's tokens (a studio DS is on screen). */
export function isStudioDesignSystemActive(doc: IDsDocument | null = defaultDoc()): boolean {
  return !!doc?.getElementById(APP_DS_ID);
}

/**
 * The studio's DS knob: paint `css` as the DS `name`. The first call keeps the app's tokens aside.
 * Returns false when the page has no token style (no app on screen, or an app without a DS).
 */
export function applyStudioDesignSystem(css: string, name: string, doc: IDsDocument | null = defaultDoc()): boolean {
  if (!holdAppDesignSystem(doc)) return false;
  const tokens = doc!.getElementById(DS_TOKENS_ID)!;
  tokens.textContent = css;
  tokens.dataset.designSystem = name;
  return true;
}

/**
 * Keep the app's tokens aside without painting anything — for a studio that is about to write the
 * token style itself (the editor's live preview of an unsaved draft). From here on, leaving the
 * studio gives the app its own DS back. Returns false when the page has no token style.
 */
export function holdAppDesignSystem(doc: IDsDocument | null = defaultDoc()): boolean {
  const tokens = doc?.getElementById(DS_TOKENS_ID);
  if (!doc || !tokens) return false;
  if (!doc.getElementById(APP_DS_ID)) stash(doc, APP_DS_ID, tokens);
  doc.getElementById(STUDIO_DS_ID)?.remove();
  return true;
}

/** Studio mode off: keep the studio's DS for the next entry, give the app exactly what it had. */
export function leaveStudioDesignSystem(doc: IDsDocument | null = defaultDoc()): void {
  const app = doc?.getElementById(APP_DS_ID);
  if (!doc || !app) return;
  const tokens = doc.getElementById(DS_TOKENS_ID);
  if (tokens) {
    stash(doc, STUDIO_DS_ID, tokens);
    copyInto(app, tokens);
  }
  app.remove();
}

/** Studio mode on again: the DS the studio showed when it closed comes back (nothing, if it never chose one). */
export function enterStudioDesignSystem(doc: IDsDocument | null = defaultDoc()): void {
  const studio = doc?.getElementById(STUDIO_DS_ID);
  if (!doc || !studio) return;
  const tokens = doc.getElementById(DS_TOKENS_ID);
  if (tokens) {
    if (!doc.getElementById(APP_DS_ID)) stash(doc, APP_DS_ID, tokens);
    copyInto(studio, tokens);
  }
  studio.remove();
}
