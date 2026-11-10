/// <mls fileReference="_102033_/l2/shared/nav3ActiveTab.test.ts" enhancement="_blank"/>
import assert from 'node:assert/strict';
import test from 'node:test';
import { activeTabHost, tabChanged } from '/_102033_/l2/shared/nav3ActiveTab.js';

const app = { name: 'app host' };
const finance = { name: 'finance tab div' };
const pinned = { name: 'pinned tab div' };
const tabs = [{ id: 'mod-/financeiro', element: finance }, { id: 'mod-/financeiro#1', element: pinned }];

test('the host is the one of the tab on screen', () => {
  assert.equal(activeTabHost('app', app, tabs), app);
  assert.equal(activeTabHost('mod-/financeiro', app, tabs), finance);
  assert.equal(activeTabHost('mod-/financeiro#1', app, tabs), pinned);
  // A tab that is gone, or an app host not rendered (blocking error), answers null — never another tab's host.
  assert.equal(activeTabHost('mod-/gone', app, tabs), null);
  assert.equal(activeTabHost('app', null, tabs), null);
});

test('a change is announced when the tab or the element it hosts changes, once', () => {
  assert.ok(tabChanged(null, { id: 'app', element: app }));
  assert.ok(!tabChanged({ id: 'app', element: app }, { id: 'app', element: app }));
  assert.ok(tabChanged({ id: 'app', element: app }, { id: 'mod-/financeiro', element: finance }));
  // Same id, another element: a pinned tab renumbered or re-created.
  assert.ok(tabChanged({ id: 'mod-/financeiro', element: finance }, { id: 'mod-/financeiro', element: pinned }));
  // The app host appearing after a blocking error.
  assert.ok(tabChanged({ id: 'app', element: null }, { id: 'app', element: app }));
});
