/// <mls fileReference="_102033_/l2/shared/navigationVisibility.test.ts" enhancement="_blank" />

// The menu shows what the user's authorities allow. Two properties matter more than the filtering itself:
// with NO authorities known nothing is filtered (a menu that empties itself when a lookup fails is worse
// than an unfiltered one), and an item that declares no actors belongs to everybody.

import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleNavigation } from '/_102033_/l2/shared/navigationVisibility.js';

const NAVIGATION = [
  { id: 'clients', actors: ['projectManager'] },
  { id: 'tasks', actors: ['fieldWorker', 'projectManager'] },
  { id: 'about' },
];

test('an authority of THIS module reveals its items and hides the others', () => {
  const seen = visibleNavigation(NAVIGATION, ['buildFlowFsm:fieldWorker'], 'buildFlowFsm');
  assert.deepEqual(seen.map(item => item.id), ['tasks', 'about']);
});

test('an authority of ANOTHER module says nothing about this one', () => {
  // Only `petShop:admin` — nothing of buildFlowFsm — so there is nothing to filter BY here, and the menu
  // stays whole rather than emptying.
  assert.deepEqual(
    visibleNavigation(NAVIGATION, ['petShop:admin'], 'buildFlowFsm').map(item => item.id),
    ['clients', 'tasks', 'about'],
  );
});

test('no authorities known ⇒ nothing is filtered (today every session, until the issuer emits them)', () => {
  assert.deepEqual(visibleNavigation(NAVIGATION, [], 'buildFlowFsm').map(item => item.id), ['clients', 'tasks', 'about']);
  assert.deepEqual(visibleNavigation(NAVIGATION, [], '').map(item => item.id), ['clients', 'tasks', 'about']);
});

test('several authorities union their items, and the input array is never mutated', () => {
  const original = [...NAVIGATION];
  const seen = visibleNavigation(NAVIGATION, ['buildFlowFsm:projectManager', 'buildFlowFsm:fieldWorker'], 'buildFlowFsm');
  assert.deepEqual(seen.map(item => item.id), ['clients', 'tasks', 'about']);
  assert.deepEqual(NAVIGATION, original);
});
