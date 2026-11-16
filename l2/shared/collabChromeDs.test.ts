/// <mls fileReference="_102033_/l2/shared/collabChromeDs.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { MANDATORY_COLOR_ROLES } from '/_102029_/l2/designSystemBase.js';
import {
  CHROME_MARK_ATTR, CHROME_STYLE_ID, COLLAB_TO_DS_ROLE, DS_TOKENS_STYLE_ID, chromeMarkFor, collabChromeDsCss,
  ensureCollabChromeDsStyle, syncCollabChromeMark,
} from './collabChromeDs.js';

test('the mark: only outside studio mode and with a DS on the page', () => {
  assert.equal(chromeMarkFor(false, true), 'ds');
  assert.equal(chromeMarkFor(true, true), null);
  assert.equal(chromeMarkFor(false, false), null, 'no DS: the Collab keeps its own colors');
});

test('every role the bridge uses is mandatory in a DS — that is why there are no fallbacks', () => {
  const css = collabChromeDsCss();
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((m) => m[1]);
  assert.ok(used.length > 0);
  for (const role of used) assert.ok((MANDATORY_COLOR_ROLES as readonly string[]).includes(role), role);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'no copied color values');
});

test('the Collab variables, the shell background and the tab border, all under the mark', () => {
  const css = collabChromeDsCss();
  for (const [name, role] of Object.entries(COLLAB_TO_DS_ROLE)) assert.match(css, new RegExp(`${name}: var\\(--${role}\\);`));
  assert.match(css, /--collab-nav-bg-2: var\(--surface-alt-bg\);/);
  assert.match(css, /html\[data-aura-chrome="ds"\] collab-aura-shell \.region\.content \{\n  background: var\(--page-bg\);/);
  assert.match(css, /html\[data-aura-chrome="ds"\] collab-aura-shell \.nav3-tabs \{\n  border-bottom-color: var\(--border-subtle\);/);
});

function fakeDoc(withDs: boolean) {
  const attrs = new Map<string, string>();
  const nodes: any[] = withDs ? [{ id: DS_TOKENS_STYLE_ID }] : [];
  return {
    attrs, nodes,
    documentElement: {
      setAttribute: (n: string, v: string) => { attrs.set(n, v); },
      removeAttribute: (n: string) => { attrs.delete(n); },
    },
    getElementById: (id: string) => nodes.find((n) => n.id === id) ?? null,
    createElement: () => ({ id: '', textContent: null as string | null }),
    head: { appendChild: (n: unknown) => { nodes.push(n); return n; } },
  };
}

test('the style goes in once; the mark follows studio mode and the DS', () => {
  const doc = fakeDoc(true);
  ensureCollabChromeDsStyle(doc);
  ensureCollabChromeDsStyle(doc);
  assert.equal(doc.nodes.filter((n) => n.id === CHROME_STYLE_ID).length, 1);

  syncCollabChromeMark(false, doc);
  assert.equal(doc.attrs.get(CHROME_MARK_ATTR), 'ds');
  syncCollabChromeMark(true, doc);
  assert.equal(doc.attrs.has(CHROME_MARK_ATTR), false);

  const bare = fakeDoc(false);
  syncCollabChromeMark(false, bare);
  assert.equal(bare.attrs.has(CHROME_MARK_ATTR), false);
  assert.equal(bare.nodes.length, 0, 'no DS: no bridge stylesheet either');
});
