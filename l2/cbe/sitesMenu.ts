/// <mls fileReference="_102033_/l2/cbe/sitesMenu.ts" enhancement="_blank" />
// mls.sites.getMenu() and mls.sites.updateMenu() (rt200).
//
// The collab-messages (cm) lists the apps of the VM and needs to know WHEN the menu of an app changed, without depending on
// the app (each project stays independent: Wagner, 09/11/2026). So:
//   getMenu()    the menu the apps tab shows, from the SAME source: `buildProgramMenu` (the release menu, or the draft's
//                `l5/config.json` in Studio mode). No copy of that logic here.
//   updateMenu() only TELLS: `mls.events.fire([0..7], 'SitesMenuChanged')`. It saves nothing: the menu comes from the app's
//                config (or the draft), which whoever changes it already saves. The cm listens and fetches the menu again by
//                its own path. There is no menu cache in the shell or in `buildProgramMenu` (it reads the BFF / the draft
//                every call), so there is nothing to invalidate before the event; if one is ever added, it is cleared in
//                `updateMenu`, BEFORE firing.

import type { CollabProgramMenu } from '/_102036_/l2/environmentContract.js';

/** Level 0..7: the cm may listen at any of them (contract with the collabMessages, menu_02). */
export const SITES_MENU_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7];
export const SITES_MENU_CHANGED = 'SitesMenuChanged';

// The ONE place with a loose type: the mls lib's `TypeEvent` union (mls.d.ts) does not have `SitesMenuChanged` yet (it is the
// collab-workspace's to add, request of 09/11/2026 for the menu_02). Until the lib publishes the name, `type` is a string here;
// when it does, this alias goes away and `fire` takes the typed name.
type FireEvent = (levels: number[], type: string) => unknown;

export interface SitesMenuDeps {
  /** The menu builder. Default: `buildProgramMenu`, loaded on first use (the shell must not load the messages stack at boot). */
  buildMenu?: () => Promise<CollabProgramMenu[]>;
  /** `window.mls.events.fire`, looked up at call time (the lib loads after the shell). */
  fire?: () => FireEvent | undefined;
  /** Clears a menu cache, when there is one. */
  invalidate?: () => void;
}

function defaultFire(): FireEvent | undefined {
  const fire = (globalThis as { mls?: { events?: { fire?: FireEvent } } }).mls?.events?.fire;
  return typeof fire === 'function' ? fire : undefined;
}

async function defaultBuildMenu(): Promise<CollabProgramMenu[]> {
  const { buildProgramMenu } = await import('/_102033_/l2/cbe/runtimeMessagesEnvironment.js');
  return buildProgramMenu();
}

export function createSitesMenuControls(deps: SitesMenuDeps = {}): {
  getMenu: () => Promise<CollabProgramMenu[]>;
  updateMenu: () => void;
} {
  return {
    getMenu: () => (deps.buildMenu ?? defaultBuildMenu)(),
    updateMenu: () => {
      deps.invalidate?.();
      const fire = (deps.fire ?? defaultFire)();
      if (!fire) {
        console.error('[sitesMenu] updateMenu: mls.events.fire is not available; SitesMenuChanged was not sent');
        return;
      }
      void Promise.resolve(fire(SITES_MENU_LEVELS, SITES_MENU_CHANGED)).catch((error: unknown) => {
        console.error('[sitesMenu] updateMenu: firing SitesMenuChanged failed:', error);
      });
    },
  };
}
