/// <mls fileReference="_102033_/l2/shared/collabChromeDs.ts" enhancement="_blank" />

// The Collab chrome around the client app follows the app's design system — outside studio mode only.
//
// The nav3 bars (☰), the nav3 menu and the App tab strip are painted by the Collab's own variables
// (`--collab-nav-*`, `--collab-*-primary-color`, defined in _102041_/l2/collab-css-base.less). Outside studio mode
// the shell marks <html> with `data-aura-chrome="ds"` and the bridge below re-points those variables to DS roles.
// The mark is on <html> because the nav3 is an ANCESTOR of the shell (the shell lives inside the right nav3): a rule
// scoped to the shell would not reach the bars. In studio mode the mark is gone and the chrome is the Collab's.
//
// No fallback values: every role used here is mandatory in a DS (MANDATORY_COLOR_ROLES, _102029_), and the mark is
// only set while the DS stylesheet (`#ds-tokens`) is on the page — without a DS the Collab keeps its own colors,
// so nothing here copies them. The bridge only points at the roles `#ds-tokens` rewrites, so switching the DS
// repaints the chrome by itself. `html[data-…]` (0,1,1) wins over the Collab's `:root` / `[data-theme="dark"]`
// (0,1,0) without `!important`, and the roles' own light/dark pairs carry the theme.
//
// The app area is not chrome. `collab-aura-shell .region.content` follows the DS `--page-bg` whenever the DS
// is on the page, in both modes, under a second mark (`data-aura-app`). The studio columns live in `.layout`
// and `.body`, so those — and the `--collab-*` variables and the tab border — stay under the chrome mark.

export const CHROME_MARK_ATTR = 'data-aura-chrome';
export const CHROME_MARK_VALUE = 'ds';
/** The app area (<html>): set whenever a DS is on the page, studio mode included. */
export const APP_AREA_MARK_ATTR = 'data-aura-app';
export const CHROME_STYLE_ID = 'aura-chrome-ds';
/** The DS stylesheet the bridge depends on (written by bootstrap / designSystemRuntime). */
export const DS_TOKENS_STYLE_ID = 'ds-tokens';

/** Collab variable → DS role. */
export const COLLAB_TO_DS_ROLE: Record<string, string> = {
  '--collab-nav-bg-1': 'nav-bg',
  '--collab-nav-bg-2': 'surface-alt-bg',
  '--collab-nav-bg-3': 'surface-bg',
  '--collab-nav-color': 'text-muted',
  '--collab-nav-color-active': 'text-strong',
  '--collab-nav-3-link-active': 'link-text',
  '--collab-text-primary-color': 'text-default',
  '--collab-bg-primary-color': 'page-bg',
  '--collab-bg-secondary-color': 'surface-alt-bg',
};

/** The mark <html> carries: only outside studio mode and with a DS on the page. */
export function chromeMarkFor(studioOn: boolean, hasDesignSystem: boolean): string | null {
  return !studioOn && hasDesignSystem ? CHROME_MARK_VALUE : null;
}

const ON = `html[${CHROME_MARK_ATTR}="${CHROME_MARK_VALUE}"]`;
const APP_ON = `html[${APP_AREA_MARK_ATTR}="${CHROME_MARK_VALUE}"]`;

/** The bridge stylesheet: the Collab chrome under its mark, and the app area under its own. */
export function collabChromeDsCss(): string {
  const variables = Object.entries(COLLAB_TO_DS_ROLE).map(([name, role]) => `  ${name}: var(--${role});`).join('\n');
  return [
    `${ON} {\n${variables}\n}`,
    // Chrome surfaces only, and only outside studio mode. The studio columns live in `.layout` and `.body`.
    `${ON} collab-aura-shell .layout,\n${ON} collab-aura-shell .body {\n  background: var(--page-bg);\n}`,
    `${ON} collab-aura-shell .nav3-tabs {\n  border-bottom-color: var(--border-subtle);\n}`,
    // App area in both modes. The mark stays on while a DS is on the page, studio included.
    `${APP_ON} collab-aura-shell .region.content {\n  background: var(--page-bg);\n}`,
  ].join('\n\n');
}

interface IChromeRoot {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

interface IChromeDocument {
  documentElement: IChromeRoot;
  getElementById(id: string): unknown;
  createElement(tag: 'style'): { id: string; textContent: string | null };
  head: { appendChild(node: unknown): unknown } | null;
}

function defaultDocument(): IChromeDocument | null {
  return typeof document === 'undefined' ? null : (document as unknown as IChromeDocument);
}

/** Puts the bridge stylesheet in <head> once. */
export function ensureCollabChromeDsStyle(doc: IChromeDocument | null = defaultDocument()): void {
  if (!doc?.head || doc.getElementById(CHROME_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = CHROME_STYLE_ID;
  style.textContent = collabChromeDsCss();
  doc.head.appendChild(style);
}

/** Marks (or unmarks) <html> for the current studio mode and the DS on the page. */
export function syncCollabChromeMark(studioOn: boolean, doc: IChromeDocument | null = defaultDocument()): void {
  if (!doc) return;
  const hasDesignSystem = Boolean(doc.getElementById(DS_TOKENS_STYLE_ID));
  const mark = chromeMarkFor(studioOn, hasDesignSystem);
  if (hasDesignSystem) ensureCollabChromeDsStyle(doc);
  if (mark) doc.documentElement.setAttribute(CHROME_MARK_ATTR, mark);
  else doc.documentElement.removeAttribute(CHROME_MARK_ATTR);
  if (hasDesignSystem) doc.documentElement.setAttribute(APP_AREA_MARK_ATTR, CHROME_MARK_VALUE);
  else doc.documentElement.removeAttribute(APP_AREA_MARK_ATTR);
}
