/// <mls fileReference="_102033_/l2/studio/studioEditor.test.ts" enhancement="_blank" />
// Source-level guards for the in-place editor. It is DOM-bound (no jsdom here), so what can be tested
// is the invariant that matters and is easy to break by accident: where an edit is allowed to land.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const EDITOR = readFileSync(new URL('studioEditor.ts', import.meta.url), 'utf8');
const TARGET = readFileSync(new URL('studioEditTarget.ts', import.meta.url), 'utf8');
const PANEL = readFileSync(new URL('classPickerPanel.ts', import.meta.url), 'utf8');

/** Code lines only: a mention inside a comment is documentation, not a call. */
function codeLines(source: string): string[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*'));
}

test('an in-place edit stops at the LOCAL store — the editor never writes to the project files', () => {
  // The whole point: an edit writes the model and the local copy (IndexedDB). Reaching the project's
  // files is the save's job. `saveTarget` right after an edit also had a side effect that read as a
  // bug — the lib's `setContents` clears the local copy on success, so nothing ever showed up in
  // IndexedDB.
  const calls = codeLines(EDITOR).filter((line) => line.includes('saveTarget('));
  assert.deepEqual(calls, [], 'the editor must not call saveTarget');

  // And it must not reach the driver by any other door.
  for (const forbidden of ['mls.stor.setContents', 'stor.setContents(']) {
    assert.equal(
      codeLines(EDITOR).some((line) => line.includes(forbidden)),
      false,
      `${forbidden} is a write to the project's files`,
    );
  }
});

test('the local write is still there, and it is the model + IndexedDB pair', () => {
  const code = codeLines(EDITOR);
  assert.equal(code.filter((line) => line.includes('persistLocalEdit(')).length, 2, 'text edit and class edit');
  // The model is the source of truth; the local copy is what a reload reads.
  assert.equal(code.some((line) => line.includes('pushEditOperations')), true);
  // And the compile stays: it feeds the live update and the service worker cache.
  assert.equal(code.some((line) => line.includes('compileAfterEdit(')), true);
});

test('every edit says it is not saved yet', () => {
  // The edit survives a reload but has not reached the project — and nothing else on screen says so.
  const statuses = codeLines(EDITOR).filter((line) => line.includes('this.setStatus(`${what}'));
  assert.ok(statuses.length >= 2, 'both paths report their outcome');
  for (const line of statuses) {
    if (line.includes("t('status.applying')")) continue; // the progress message
    assert.ok(line.includes("t('status.localOnly')"), line);
  }
  // The old wording claimed a save that no longer happens.
  assert.equal(codeLines(EDITOR).some((line) => line.includes('} salvo${where}')), false);
});

test('saveTarget stays available for whoever does the saving, and says who that is', () => {
  assert.match(TARGET, /export async function saveTarget/u);
  assert.match(TARGET, /NOT CALLED BY THE EDITOR/u);
  assert.match(TARGET, /serviceSave/u, 'the doc points at where the save lives');
});

test('the panel is a component, and the editor stopped building markup', () => {
  // The markup, the css and the words moved into classPickerPanel; what stays here is the brain.
  const code = codeLines(EDITOR);
  // `innerHTML` still serves the OVERLAY (the hover/selection boxes on the body), which is a different
  // layer and out of this change; what must be gone is the panel's markup and css.
  assert.equal(code.some((line) => line.includes('innerHTML') && !line.includes('overlayEl')), false,
    'the panel is not hand-built any more');
  assert.equal(code.some((line) => line.includes('se-cp-')), false, 'no panel css left either');
  assert.ok(code.some((line) => line.includes('CLASS_PICKER_TAG')), 'it creates the component');
  for (const intent of ['picker-apply', 'picker-preview', 'picker-close']) {
    assert.ok(code.some((line) => line.includes(intent)), intent);
  }
});

test('the role picker is a palette list, not a native select', () => {
  // A native `<option>` takes no markup, so the only way to show the colour there was to paint the
  // whole row. The swatch needs an element of its own.
  // Code lines only: the file EXPLAINS why there is no select, and that comment is not a select.
  assert.equal(codeLines(PANEL).some((line) => line.includes('<select')), false, 'no native select left');
  assert.ok(PANEL.includes('class="swatch'), 'the swatch is an element');
  // Inline, not floating: the panel scrolls, so a positioned popup would be clipped by its own
  // container.
  assert.match(PANEL, /\.role-list \{[^}]*display: block/u);
  assert.equal(/\.role-list \{[^}]*position: (absolute|fixed)/u.test(PANEL), false);
});

test('a preview never outlives the moment it is showing', () => {
  // The bug it guards: the pointer stays over the chips while an edit is written, a hover starts a
  // preview, and the panel then re-reads the element's class attribute — finding the PREVIEWED classes
  // and reporting that they are not in the source. It went away on the next click, which is exactly
  // what a transient DOM state looks like.
  const code = codeLines(EDITOR);

  const inside = (method: string): string => {
    const start = EDITOR.indexOf(`private ${method}`);
    assert.notEqual(start, -1, method);
    return EDITOR.slice(start, EDITOR.indexOf('\n  }', start));
  };

  // Reading the class attribute has to happen with no preview applied.
  const show = inside('async showClassPanel');
  assert.ok(show.indexOf('previewAnimation(null)') < show.indexOf("getAttribute('class')"), 'cancel BEFORE reading');
  // Closing the panel cannot leave a preview on the element.
  assert.ok(inside('hideClassPanel').includes('previewAnimation(null)'));
  // And the cancel must not depend on the panel state that may already be gone.
  assert.ok(code.some((line) => line.includes('private previewEl')), 'the preview owns its element');
});

test('two fast clicks cannot silently revert each other', () => {
  // Both would compute from the SAME starting literal, and the second would overwrite the first.
  const start = EDITOR.indexOf('private async applyLiteralChange');
  const body = EDITOR.slice(start, EDITOR.indexOf('\n  }', start));
  assert.ok(body.includes('if (this.applying)'), 'the write is serialised');
  assert.ok(body.includes('finally'), 'and the flag is released even when the write throws');
});

test('a pasted style is written like every other edit, and its preview is HELD', () => {
  // The gesture is copy on one element, paste on another — so the clipboard is the ONE piece of panel
  // state that must survive a change of selection.
  const willUpdate = PANEL.slice(PANEL.indexOf('protected willUpdate'));
  assert.equal(
    willUpdate.slice(0, willUpdate.indexOf('\n  }')).includes('clipboard'),
    false,
    'the copied style must not be dropped with the rest of the per-selection state',
  );

  // The panel asks, the editor writes. A paste that reached the model from here would skip the
  // anchoring, the local store and the live update.
  for (const write of ['pushEditOperations', 'persistLocalEdit', 'setContent']) {
    assert.equal(codeLines(PANEL).some((line) => line.includes(write)), false, `${write} belongs to the editor`);
  }
  assert.ok(PANEL.includes("this.applyLiteral(literal, t('status.pasted'"), 'the paste goes out as picker-apply');

  // An animation preview undoes itself after a moment; a paste preview must NOT — the eyes are on the
  // summary while the pointer is on the button, and a result that vanishes mid-read is a bug report.
  const start = EDITOR.indexOf('private previewLiteral');
  assert.notEqual(start, -1);
  const preview = EDITOR.slice(start, EDITOR.indexOf('\n  }', start));
  assert.ok(preview.includes('if (timeout)'), 'the timer is opt-in');
  assert.ok(EDITOR.includes('this.previewLiteral(applyAnimationOption('), 'and the animation asks for one');
});
