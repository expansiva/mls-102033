/// <mls fileReference="_102033_/l2/studio/studioLiveUpdate.ts" enhancement="_blank" />
// How an applied edit reaches the RUNNING app (TASK-102033-app-como-preview, fase 3.5).
//
// THE PROBLEM THIS EXISTS FOR
// A custom element tag can be defined once and never redefined or removed — there is no API for it.
// The text edit itself shows up immediately (the contenteditable span leaves the new text in the
// DOM), but navigating away and back makes the shell do `document.createElement(tag)`, which builds
// an instance of the class registered at boot: the old text is back. The preview never had this
// problem because it throws the whole realm away — every createPreview builds a NEW iframe, with a
// fresh custom element registry. The app has a single realm.
//
// WHY A PLUGGABLE MODE
// There is more than one defensible answer (patch the registered class, reload the page, do
// nothing and let the user reload), each with different fidelity/cost, and the right one depends on
// what was edited. So the policy lives behind this contract: one function to call, one file per mode.
//
// Switch at runtime from devtools:
//   studioLiveUpdate.list()          -> available modes
//   studioLiveUpdate.set('reload')   -> persisted in localStorage
//   studioLiveUpdate.get()

import type { IStudioEditTarget } from '/_102033_/l2/studio/studioEditTarget.js';
import { t } from '/_102033_/l2/studio/studioMessages.js';

export interface ILiveUpdateContext {
  /** File that was edited — often the SHARED base class, not the page. */
  edited: IStudioEditTarget;
  /** The mounted page, whose tag is the one registered in the custom element registry. */
  page: IStudioEditTarget;
  /** Tag currently mounted in the region host. */
  pageTag: string;
}

export interface ILiveUpdateResult {
  ok: boolean;
  /** Short sentence for the editor status strip. */
  message: string;
}

export interface ILiveUpdateMode {
  readonly name: LiveUpdateModeName;
  /** One-line description, shown by studioLiveUpdate.list(). */
  readonly description: string;
  apply(ctx: ILiveUpdateContext): Promise<ILiveUpdateResult>;
}

export type LiveUpdateModeName = 'hotSwap' | 'reload' | 'off';

const STORAGE_KEY = 'studioLiveUpdateMode';
const DEFAULT_MODE: LiveUpdateModeName = 'hotSwap';

/**
 * Does nothing but tell the truth — the baseline. Inline because nobody needs to edit it; the modes
 * that carry real policy live in their own files.
 */
const offMode: ILiveUpdateMode = {
  name: 'off',
  // English: `studioLiveUpdate.list()` is a devtools listing, not panel copy.
  description: 'does nothing; the change shows on the next reload',
  async apply() {
    return { ok: true, message: t('live.off') };
  },
};

const LOADERS: Record<LiveUpdateModeName, () => Promise<ILiveUpdateMode>> = {
  hotSwap: async () => (await import('/_102033_/l2/studio/studioLiveUpdateHotSwap.js')).hotSwapMode,
  reload: async () => (await import('/_102033_/l2/studio/studioLiveUpdateReload.js')).reloadMode,
  off: async () => offMode,
};

export function listLiveUpdateModes(): LiveUpdateModeName[] {
  return Object.keys(LOADERS) as LiveUpdateModeName[];
}

export function isLiveUpdateMode(name: string): name is LiveUpdateModeName {
  return Object.prototype.hasOwnProperty.call(LOADERS, name);
}

let activeMode: LiveUpdateModeName | undefined;

export function getLiveUpdateMode(): LiveUpdateModeName {
  if (activeMode) return activeMode;
  // Read once, lazily: the `reload` mode reloads the page, so a choice that did not survive the
  // reload would silently bounce back to the default.
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode / blocked storage — the default is fine.
  }
  activeMode = stored && isLiveUpdateMode(stored) ? stored : DEFAULT_MODE;
  return activeMode;
}

export function setLiveUpdateMode(name: string): LiveUpdateModeName {
  if (!isLiveUpdateMode(name)) {
    throw new Error(`invalid mode "${name}". Valid: ${listLiveUpdateModes().join(', ')}`);
  }
  activeMode = name;
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch { /* not fatal */ }
  return activeMode;
}

/**
 * Applies an already-persisted edit to the running app, using the active mode.
 *
 * Never throws: a failure here means the edit is in the source but the screen may show the old text
 * on a remount — worth reporting, never worth breaking the edit flow over.
 */
export async function applyLiveUpdate(ctx: ILiveUpdateContext): Promise<ILiveUpdateResult> {
  const name = getLiveUpdateMode();
  try {
    const mode = await LOADERS[name]();
    return await mode.apply(ctx);
  } catch (err) {
    return { ok: false, message: t('live.failed', { mode: name, error: (err as Error).message }) };
  }
}

// Devtools handle. Assigned at import time so it exists as soon as anything armed the editor.
(window as unknown as { studioLiveUpdate?: unknown }).studioLiveUpdate = {
  get: getLiveUpdateMode,
  set: setLiveUpdateMode,
  list: listLiveUpdateModes,
};
