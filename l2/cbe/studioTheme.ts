/// <mls fileReference="_102033_/l2/cbe/studioTheme.ts" enhancement="_blank" />
// Light/dark while editing, without touching the app's own theme.
//
// The studio and the client app share ONE document, so the theme is the `.dark` class (and the legacy
// `data-theme="dark"`) on <html> for both — the same pair bootstrap.applyThemePreference sets before
// first paint from `collab_app_theme`. Switching it in the studio must not become the app's choice:
// entering studio mode snapshots what the app had, leaving puts that snapshot back, and
// `collab_app_theme` is never written here.
//
// The snapshot lives ON <html> (`data-studio-app-theme`), not in this module: the shell and the
// studio panels may load this file through different builds, and both must see the same snapshot.
//
// The studio choice is remembered on its own key, so a reload in studio mode (or the next session)
// comes back to it. Without a choice, entering the studio changes nothing.

export type StudioTheme = 'light' | 'dark';

/** The part of <html> the theme lives on. */
export interface IThemeRoot {
  classList: { contains(name: string): boolean; add(name: string): void; remove(name: string): void };
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export interface IThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STUDIO_THEME_KEY = 'collab_studio_theme';
/** Present only between enter and leave: the app's theme as the studio found it. */
export const APP_THEME_ATTR = 'data-studio-app-theme';

function defaultRoot(): IThemeRoot | null {
  return typeof document === 'undefined' ? null : document.documentElement;
}

function defaultStorage(): IThemeStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage blocked: the choice lasts the session
  }
}

function readTheme(root: IThemeRoot): StudioTheme {
  return root.classList.contains('dark') ? 'dark' : 'light';
}

function paint(root: IThemeRoot, theme: StudioTheme): void {
  if (theme === 'dark') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
  } else {
    root.classList.remove('dark');
    root.removeAttribute('data-theme');
  }
}

function appSnapshot(root: IThemeRoot): StudioTheme | null {
  const value = root.getAttribute(APP_THEME_ATTR);
  return value === 'dark' || value === 'light' ? value : null;
}

function storedChoice(storage: IThemeStorage | null): StudioTheme | null {
  try {
    const value = storage?.getItem(STUDIO_THEME_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

/** The theme on screen now. */
export function getStudioTheme(root: IThemeRoot | null = defaultRoot()): StudioTheme {
  return root ? readTheme(root) : 'light';
}

/** Whether the studio is holding the app's theme (between enter and leave). */
export function isStudioThemeActive(root: IThemeRoot | null = defaultRoot()): boolean {
  return !!root && appSnapshot(root) !== null;
}

/** Studio mode on: keep the app's theme aside and show the studio choice, if there is one. */
export function enterStudioTheme(root: IThemeRoot | null = defaultRoot(), storage: IThemeStorage | null = defaultStorage()): void {
  if (!root || appSnapshot(root) !== null) return;
  const app = readTheme(root);
  root.setAttribute(APP_THEME_ATTR, app);
  const choice = storedChoice(storage);
  if (choice && choice !== app) paint(root, choice);
}

/** Studio mode off: the app gets back exactly the theme it had. */
export function leaveStudioTheme(root: IThemeRoot | null = defaultRoot()): void {
  if (!root) return;
  const back = appSnapshot(root);
  if (back === null) return;
  root.removeAttribute(APP_THEME_ATTR);
  if (readTheme(root) !== back) paint(root, back);
}

/**
 * The studio's switch. Outside studio mode it does nothing: the app's theme is the app's business.
 * Returns the theme on screen after the call.
 */
export function setStudioTheme(
  theme: StudioTheme,
  root: IThemeRoot | null = defaultRoot(),
  storage: IThemeStorage | null = defaultStorage(),
): StudioTheme {
  if (!root) return 'light';
  if (appSnapshot(root) === null) return readTheme(root);
  try {
    storage?.setItem(STUDIO_THEME_KEY, theme);
  } catch { /* storage blocked: the choice lasts the session */ }
  if (readTheme(root) !== theme) paint(root, theme);
  return theme;
}
