/// <mls fileReference="_102033_/l2/cbe/studioTheme.test.ts" enhancement="_blank" />
// The studio's light/dark switch never leaks into the app: whatever the app had when the studio
// opened is what it has when the studio closes. No DOM in the l2 harness, so <html> is a fake with
// the same two marks bootstrap.applyThemePreference sets.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_THEME_ATTR,
  STUDIO_THEME_KEY,
  enterStudioTheme,
  getStudioTheme,
  isStudioThemeActive,
  leaveStudioTheme,
  setStudioTheme,
  type IThemeRoot,
  type IThemeStorage,
} from '/_102033_/l2/cbe/studioTheme.js';

function fakeRoot(dark: boolean): IThemeRoot & { attrs: Map<string, string>; classes: Set<string> } {
  const classes = new Set<string>(dark ? ['dark'] : []);
  const attrs = new Map<string, string>(dark ? [['data-theme', 'dark']] : []);
  return {
    classes,
    attrs,
    classList: { contains: (n) => classes.has(n), add: (n) => { classes.add(n); }, remove: (n) => { classes.delete(n); } },
    getAttribute: (n) => attrs.get(n) ?? null,
    setAttribute: (n, v) => { attrs.set(n, v); },
    removeAttribute: (n) => { attrs.delete(n); },
  };
}

function fakeStorage(initial: Record<string, string> = {}): IThemeStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

test('switching in the studio and leaving gives the app its own theme back', () => {
  const root = fakeRoot(false);
  const storage = fakeStorage();
  enterStudioTheme(root, storage);
  assert.equal(setStudioTheme('dark', root, storage), 'dark');
  assert.ok(root.classes.has('dark'));
  assert.equal(root.attrs.get('data-theme'), 'dark');
  leaveStudioTheme(root);
  assert.equal(getStudioTheme(root), 'light');
  assert.equal(root.attrs.has('data-theme'), false);
  assert.equal(root.attrs.has(APP_THEME_ATTR), false);
  assert.equal(isStudioThemeActive(root), false);
});

test('the app theme key is never written; the studio choice has its own', () => {
  const root = fakeRoot(true);
  const storage = fakeStorage({ collab_app_theme: 'dark' });
  enterStudioTheme(root, storage);
  setStudioTheme('light', root, storage);
  assert.equal(storage.data.collab_app_theme, 'dark');
  assert.equal(storage.data[STUDIO_THEME_KEY], 'light');
  leaveStudioTheme(root);
  assert.equal(getStudioTheme(root), 'dark');
  assert.equal(root.attrs.get('data-theme'), 'dark');
});

test('entering again brings back the remembered studio choice', () => {
  const root = fakeRoot(false);
  const storage = fakeStorage({ [STUDIO_THEME_KEY]: 'dark' });
  enterStudioTheme(root, storage);
  assert.equal(getStudioTheme(root), 'dark');
  leaveStudioTheme(root);
  assert.equal(getStudioTheme(root), 'light');
});

test('without a studio choice, entering changes nothing', () => {
  const root = fakeRoot(true);
  enterStudioTheme(root, fakeStorage());
  assert.equal(getStudioTheme(root), 'dark');
  assert.equal(isStudioThemeActive(root), true);
});

test('outside studio mode the switch does nothing', () => {
  const root = fakeRoot(false);
  const storage = fakeStorage();
  assert.equal(setStudioTheme('dark', root, storage), 'light');
  assert.equal(getStudioTheme(root), 'light');
  assert.equal(storage.data[STUDIO_THEME_KEY], undefined);
});

test('a second enter does not overwrite the app snapshot', () => {
  const root = fakeRoot(false);
  const storage = fakeStorage();
  enterStudioTheme(root, storage);
  setStudioTheme('dark', root, storage);
  enterStudioTheme(root, storage);
  leaveStudioTheme(root);
  assert.equal(getStudioTheme(root), 'light');
});

test('leaving without entering keeps the app as it is', () => {
  const root = fakeRoot(true);
  leaveStudioTheme(root);
  assert.equal(getStudioTheme(root), 'dark');
});
