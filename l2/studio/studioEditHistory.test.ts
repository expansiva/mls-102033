/// <mls fileReference="_102033_/l2/studio/studioEditHistory.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { EditHistory, HISTORY_LIMIT } from '/_102033_/l2/studio/studioEditHistory.js';

/** A step is opaque to the history, so the tests use the simplest thing that can be one. */
const step = (name: string) => ({ name });

test('the newest edit is the first to be undone', () => {
  const history = new EditHistory<{ name: string }>();
  history.push(step('a'));
  history.push(step('b'));

  assert.deepEqual(history.peekUndo(), step('b'));
  assert.equal(history.peekRedo(), undefined);
  assert.deepEqual(history.depth, { undo: 2, redo: 0 });
});

test('an applied step crosses to the redo side, and comes back', () => {
  const history = new EditHistory<{ name: string }>();
  history.push(step('a'));
  history.push(step('b'));

  history.commitUndo();
  assert.deepEqual(history.depth, { undo: 1, redo: 1 });
  assert.deepEqual(history.peekUndo(), step('a'));
  assert.deepEqual(history.peekRedo(), step('b'));

  history.commitRedo();
  assert.deepEqual(history.depth, { undo: 2, redo: 0 });
  assert.deepEqual(history.peekUndo(), step('b'));
});

test('a new edit kills the redo branch', () => {
  // What had been undone no longer describes this file: redoing it would write over the edit the
  // user just made.
  const history = new EditHistory<{ name: string }>();
  history.push(step('a'));
  history.commitUndo();
  assert.deepEqual(history.peekRedo(), step('a'));

  history.push(step('b'));
  assert.equal(history.peekRedo(), undefined);
  assert.deepEqual(history.depth, { undo: 1, redo: 0 });
});

test('a step that cannot be applied takes everything older with it', () => {
  // The steps are a chain. If the file no longer holds what the NEWEST step wrote, the older ones
  // describe a file further away still — applying them would write over whatever took their place.
  const history = new EditHistory<{ name: string }>();
  history.push(step('a'));
  history.push(step('b'));
  history.push(step('c'));

  history.dropUndo();
  assert.equal(history.peekUndo(), undefined);
  assert.deepEqual(history.depth, { undo: 0, redo: 0 });
});

test('dropping the redo branch leaves the undo side alone', () => {
  const history = new EditHistory<{ name: string }>();
  history.push(step('a'));
  history.push(step('b'));
  history.commitUndo();

  history.dropRedo();
  assert.equal(history.peekRedo(), undefined);
  assert.deepEqual(history.peekUndo(), step('a'), 'what is still applicable stays');
});

test('the oldest step is what falls off the limit', () => {
  const history = new EditHistory<{ name: string }>(3);
  for (const name of ['a', 'b', 'c', 'd']) history.push(step(name));

  assert.deepEqual(history.depth, { undo: 3, redo: 0 });
  assert.deepEqual(history.peekUndo(), step('d'), 'the newest is always there');

  history.commitUndo();
  history.commitUndo();
  history.commitUndo();
  assert.equal(history.peekUndo(), undefined);
  assert.deepEqual(history.peekRedo(), step('b'), 'a fell off, b is the oldest left');
});

test('the default limit is a session, not a monument', () => {
  assert.equal(HISTORY_LIMIT, 50);
  const history = new EditHistory<{ name: string }>();
  for (let i = 0; i < HISTORY_LIMIT + 10; i += 1) history.push(step(`s${i}`));
  assert.deepEqual(history.depth, { undo: HISTORY_LIMIT, redo: 0 });
  assert.deepEqual(history.peekUndo(), step(`s${HISTORY_LIMIT + 9}`));
});

test('committing with nothing on the stack is a no-op, not a crash', () => {
  const history = new EditHistory<{ name: string }>();
  history.commitUndo();
  history.commitRedo();
  assert.deepEqual(history.depth, { undo: 0, redo: 0 });
  assert.equal(history.peekUndo(), undefined);
});

test('clear empties both sides', () => {
  const history = new EditHistory<{ name: string }>();
  history.push(step('a'));
  history.push(step('b'));
  history.commitUndo();

  history.clear();
  assert.deepEqual(history.depth, { undo: 0, redo: 0 });
});
