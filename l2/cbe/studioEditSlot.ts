/// <mls fileReference="_102033_/l2/cbe/studioEditSlot.ts" enhancement="_blank" />
// Where the editing TOOLS plug into the running app (TASK-102033-studio-to-102020).
//
// The tools (the in-place editor, the class picker, the live-update bridge) used to live in this
// project and be imported straight from `serviceClientApp`. They are authoring, not runtime: they now
// live in the Studio plugin, and this file is the seam that lets them attach WITHOUT this project
// naming them.
//
//   serviceClientApp --publishEditHost({host, chromeHost, studioMode, editLevel})--> slot
//                                                                                     |
//   the tool module (declared by a plugin, loaded by loadStudioTools) --register------+
//
// The direction is the whole point. The master frontend announces "here is the app region and the
// user is on the edit level"; whoever knows what to do with that says so by registering. A tool that
// never loads costs exactly nothing, and a client app with no Studio plugin simply has no tools.

/** What a tool needs to attach itself to the running app. */
export interface IStudioEditHost {
  /**
   * The region the app renders into — what an editor binds to.
   *
   * NOT the page element and NOT a wrapper: the shell reuses the mounted element by comparing
   * `host.firstElementChild.tagName` with the route tag, so anything inserted in between makes it
   * remount the screen on the next render.
   */
  host: HTMLElement;
  /** The element the tool's own chrome measures itself against (the service element). */
  chromeHost: HTMLElement;
  /** Studio mode is on (Ctrl+Alt+S). Enough for the live-update bridge. */
  studioMode: boolean;
  /** The user is on the level that means "editing the page". What arms the in-place editor. */
  editLevel: boolean;
  /** Which level that is — the app side owns the nav semantics; a tool only shows the number. */
  level: number;
  /**
   * This service's panel is the one showing.
   *
   * A tool's overlay is a fixed layer on the body, so it does NOT disappear when the nav3 hands the
   * panel to another service — the selection box used to stay floating over whatever came next.
   */
  panelVisible: boolean;
}

/** A tool: called on every change, and with null when the app region goes away. */
export type StudioEditTool = (state: IStudioEditHost | null) => void;

const tools = new Set<StudioEditTool>();
let current: IStudioEditHost | null = null;

/**
 * A tool announces itself. Returns the unregister.
 *
 * It is called immediately with the current state: a tool loaded lazily (the plugin scan only runs
 * when studio mode turns on) would otherwise wait for the NEXT change to learn it should be armed —
 * and the change that armed it already happened.
 */
export function registerStudioEditTool(tool: StudioEditTool): () => void {
  tools.add(tool);
  if (current) safely(tool, current);
  return () => {
    tools.delete(tool);
  };
}

/** The app side publishes; it does not know who listens. */
export function publishEditHost(state: IStudioEditHost | null): void {
  current = state;
  for (const tool of tools) safely(tool, state);
}

/** The state a tool would get if it registered right now. */
export function currentEditHost(): IStudioEditHost | null {
  return current;
}

/** Only for tests: forget every tool and the last state. */
export function resetStudioEditSlot(): void {
  tools.clear();
  current = null;
}

/**
 * A tool that throws must not take the app's own chrome down with it.
 *
 * This runs inside the service's lifecycle (connect, level change, studio mode toggle) — an exception
 * from a plugin here would leave the app half-mounted, which is a far worse failure than a tool that
 * does not appear.
 */
function safely(tool: StudioEditTool, state: IStudioEditHost | null): void {
  try {
    tool(state);
  } catch (err) {
    console.warn('[studioEditSlot] edit tool failed:', err);
  }
}
