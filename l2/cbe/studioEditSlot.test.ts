/// <mls fileReference="_102033_/l2/cbe/studioEditSlot.test.ts" enhancement="_blank" />
// The seam that replaced the direct import of the editor (TASK-102033-studio-to-102020).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentEditHost,
  publishEditHost,
  registerStudioEditTool,
  askPreviewTabsUpdate,
  dropPendingPreviewTabs,
  holdPreviewTabsUpdate,
  registerPreviewTabsUpdate,
  resetStudioEditSlot,
  type IStudioEditHost,
} from '/_102033_/l2/cbe/studioEditSlot.js';

/** The slot never looks inside the elements, so a marker object is enough. */
function hostState(overrides: Partial<IStudioEditHost> = {}): IStudioEditHost {
  return {
    host: { id: 'region' } as unknown as HTMLElement,
    chromeHost: { id: 'service' } as unknown as HTMLElement,
    studioMode: true,
    editLevel: true,
    level: 3,
    panelVisible: true,
    ...overrides,
  };
}

test('a tool hears every change, and stops hearing after it unregisters', () => {
  resetStudioEditSlot();
  const seen: (IStudioEditHost | null)[] = [];
  const stop = registerStudioEditTool((state) => seen.push(state));

  const armed = hostState();
  publishEditHost(armed);
  publishEditHost(null);
  assert.deepEqual(seen, [armed, null]);

  stop();
  publishEditHost(hostState());
  assert.equal(seen.length, 2, 'nothing after the unregister');
});

test('a tool that arrives late is told the current state right away', () => {
  // The scan that loads a tool only runs when studio mode turns on — so the change that should have
  // armed it already happened. Waiting for the NEXT one would leave the editor off until the user
  // clicked something else.
  resetStudioEditSlot();
  const armed = hostState();
  publishEditHost(armed);

  const seen: (IStudioEditHost | null)[] = [];
  registerStudioEditTool((state) => seen.push(state));
  assert.deepEqual(seen, [armed]);
  assert.equal(currentEditHost(), armed);
});

test('with nothing published, a tool is not called at all', () => {
  resetStudioEditSlot();
  let calls = 0;
  registerStudioEditTool(() => { calls += 1; });
  assert.equal(calls, 0);
  assert.equal(currentEditHost(), null);
});

test('a tool that throws does not take the app chrome down with it', () => {
  // This runs inside the service lifecycle (connect, level change, studio toggle): an exception from
  // a plugin here would leave the app half-mounted, which is far worse than a tool not appearing.
  resetStudioEditSlot();
  const seen: string[] = [];
  registerStudioEditTool(() => { throw new Error('plugin exploded'); });
  registerStudioEditTool(() => seen.push('second tool still ran'));

  assert.doesNotThrow(() => publishEditHost(hostState()));
  assert.deepEqual(seen, ['second tool still ran']);
});

test('the state carries the two conditions separately', () => {
  // They are separate because the tools are: the in-place editor wants the level, and the live-update
  // bridge does not (editing through the studio file editor never arms the overlay).
  resetStudioEditSlot();
  const seen: (IStudioEditHost | null)[] = [];
  registerStudioEditTool((state) => { seen.push(state); });

  publishEditHost(hostState({ editLevel: false }));
  const last = seen[0];
  assert.equal(last?.studioMode, true);
  assert.equal(last?.editLevel, false);
  assert.equal(last?.panelVisible, true, 'and the panel visibility, which the overlay follows');
});

test('st68 s1: a tab update asked before the tool loads runs once when it registers', async () => {
  resetStudioEditSlot();
  const seen: string[] = [];
  holdPreviewTabsUpdate(7, ['l2/web/page11/page11.ts']);
  const stop = registerPreviewTabsUpdate(async (_project, files) => { seen.push(files.join('+')); });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, ['l2/web/page11/page11.ts']);
  stop();
  holdPreviewTabsUpdate(7, ['l2/web/page12/other.ts']);
  dropPendingPreviewTabs();
  registerPreviewTabsUpdate(async () => { seen.push('late'); });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, ['l2/web/page11/page11.ts']);
});

test('st66 s4: a tab update with no tool fails out loud; a registered tool receives the files', async () => {
  resetStudioEditSlot();
  await assert.rejects(askPreviewTabsUpdate(102047, ['l2/a.ts']), /not registered/);
  const seen: { project: number; files: readonly string[] }[] = [];
  const stop = registerPreviewTabsUpdate(async (project, files) => { seen.push({ project, files }); });
  await askPreviewTabsUpdate(102047, ['l2/a.ts']);
  assert.deepEqual(seen, [{ project: 102047, files: ['l2/a.ts'] }]);
  stop();
  await assert.rejects(askPreviewTabsUpdate(102047, ['l2/a.ts']), /not registered/);
});
