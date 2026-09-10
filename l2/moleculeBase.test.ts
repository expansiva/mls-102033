/// <mls fileReference="_102033_/l2/moleculeBase.test.ts" enhancement="_blank"/>
// Source-level guards for the live-slot projection. The projection itself is DOM-bound (no jsdom
// here), so what is guarded is the invariant the rest of the platform reads off the DOM afterwards.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BASE = readFileSync(new URL('moleculeBase.ts', import.meta.url), 'utf8');

/** `_fillAnchor` from its declaration to the next member. */
const FILL_ANCHOR = BASE.slice(BASE.indexOf('private _fillAnchor'), BASE.indexOf('private _holderFor'));

test('every projection marks the source it drained', () => {
  // Moving the consumer's nodes is what makes a live slot cheap — listeners, component identity and
  // Lit's parts all survive — and it is also what erases the only evidence of WHOSE those nodes are:
  // afterwards every DOM path to them runs through the molecule's own wrappers.
  //
  // The studio editor walks back through this mark to tell content the page passed in (in the page's
  // file, and legitimate to edit) from the molecule's internal markup (shared with every project
  // that imports it, and refused). `_liveRefs` is private and the anchor's key maps to nothing on
  // its own, so without the mark there is no way back to the source at all — which is what made the
  // 102047, a page that lives entirely inside a `<Scene>`, completely uneditable.
  assert.match(FILL_ANCHOR, /dataset\.mlLiveSource = key;/u);

  // With the capture, next to the hide: that is the one place that knows both the key and the
  // element it took the nodes from.
  const hide = FILL_ANCHOR.indexOf("style.display = 'none'");
  const mark = FILL_ANCHOR.indexOf('dataset.mlLiveSource');
  assert.notEqual(hide, -1);
  assert.ok(mark > hide, 'the mark belongs to the capture, not to the reattach');
});

test('the anchor keeps saying which key it is holding', () => {
  // The editor reads `mlLiveHeld` and not the key the anchor was rendered with: Lit reuses anchors
  // by position, so while a table is sorted an anchor still carries the previous id. Held is the
  // only field that says what is in there NOW.
  assert.match(FILL_ANCHOR, /anchor\.dataset\.mlLiveHeld = key;/u);
  assert.match(FILL_ANCHOR, /delete anchor\.dataset\.mlLiveHeld;/u, 'and eviction clears it');
});

test('a projected source is hidden, never removed', () => {
  // The source stays a child of the molecule in TEMPLATE order, and that is what the editor's
  // structural path counts on: the `<Scene>` step takes its index and its sibling count from there.
  // Removing the source instead of hiding it would leave the step with neither.
  assert.match(BASE, /_hideSlotTags\(\): void \{[\s\S]*?style\.display = 'none';/u);
  assert.equal(BASE.includes('source.remove()'), false);
  assert.equal(/_hideSlotTags\(\): void \{[\s\S]*?\.remove\(\)/u.test(BASE), false);
});
