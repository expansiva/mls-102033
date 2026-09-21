/// <mls fileReference="_102033_/l2/cbe/studioSplit.ts" enhancement="_blank" />
// The two layouts the ONE spliter shows: the client's (messages pinned at 375px on the left, the app
// taking the rest) and whatever the studio level the user is on prefers.
//
// Ctrl+Alt+S used to restore only the nav3 services, so a studio session that ended on l2 dropped the
// client into the 50/50 that level 2 defaults to — collab-spliter forces the 375px left ONLY on
// levels 3-7 (mls-102041/l2/collab-spliter.ts, `_defaultPx`), every other level is free percentages.
// Leaving studio mode now restores the layout too.
//
// The nav1 tab is deliberately NOT touched: it holds the studio context (level, open services,
// mls.actualLevel) and the user expects to come back to where they left. What we borrow instead is
// the spliter's own `level` attribute — its private channel (nothing outside the component reads it;
// every caller of setFullScreen passes the level explicitly) that picks which stored profile to load
// AND which slot of `user-msplit` to save into. Parking it on 7 while the client is up both restores
// the client split and leaves the studio level's own preference untouched.

/** The level whose stored profile IS the client layout. */
export const CLIENT_LEVEL = 7;
/** Mirrors collab-spliter's own `_defaultPx` and `_separatorWidth`. */
export const CLIENT_LEFT_PX = 375;
const SEPARATOR_PX = 8;
const MIN_RIGHT_PX = 200;

/** collab-nav-1's tab -> level table (mls-102041/l2/collab-nav-1.ts, `actualLevel`). */
const LEVEL_BY_TAB = [7, 6, 5, 4, 3, 2, 1, 0];

interface SpliterElement extends HTMLElement {
  setFullScreen?: (level: number, position: 'left' | 'right' | 'default') => void;
}

interface Nav1Element extends HTMLElement {
  actualLevel?: number;
}

/**
 * The studio's fullscreen flags, parked while the client borrows the spliter.
 *
 * The studio home pins level 7 to the left (serviceStart and collab-start-l7 call
 * `setFullScreen(7, 'left')`), which in client mode would hide the app entirely — so the client
 * always clears it, and gives it back on the way in.
 */
let parkedFullscreen: string | null = null;

function findSpliter(host: ParentNode): SpliterElement | null {
  return host.querySelector('collab-spliter') as SpliterElement | null;
}

/** The level the nav1 is on — the one the studio has to come back to. */
export function studioLevel(host: ParentNode): number | null {
  const nav1 = host.querySelector('collab-nav-1') as Nav1Element | null;
  if (!nav1) return null;
  if (typeof nav1.actualLevel === 'number') return nav1.actualLevel;
  // Not upgraded yet: read the tab straight off the attribute.
  const tab = Number(nav1.getAttribute('tabindexactive') ?? '0');
  const level = LEVEL_BY_TAB[tab > -1 ? tab : 0];
  return typeof level === 'number' ? level : null;
}

/**
 * Shows the client layout: messages fixed at 375px on the left, the app taking the rest.
 *
 * Runs both on the first paint of the studio structure and every time Ctrl+Alt+S leaves studio mode.
 */
export function applyClientSplit(host: ParentNode): void {
  const spliter = findSpliter(host);
  if (!spliter) return;
  const items = spliter.querySelectorAll('collab-spliter-item');
  const itemLeft = items[0];
  const itemRight = items[1];
  if (!itemLeft || !itemRight) return;

  if (parkedFullscreen === null) parkedFullscreen = spliter.getAttribute('msplit-fullscreen');
  spliter.setFullScreen?.(CLIENT_LEVEL, 'default');
  spliter.setAttribute('level', String(CLIENT_LEVEL));

  // Setting `level` alone already brings the 375px back (level 7 is in the forced range, even with no
  // stored profile at all). This stays because it is deterministic and because it is the only thing
  // that reopens a panel the spliter had collapsed.
  const right = Math.max(MIN_RIGHT_PX, window.innerWidth - CLIENT_LEFT_PX - SEPARATOR_PX);
  itemLeft.classList.remove('hidden', 'closed');
  itemRight.classList.remove('hidden', 'closed');
  spliter.setAttribute('msplit', `${CLIENT_LEFT_PX},${right}`);
}

/**
 * Gives the spliter back to the studio level the nav1 is still on.
 *
 * Level first, fullscreen after: restoring the flags while the spliter still sits on the client level
 * would reload the client profile once before the right one.
 */
export function restoreStudioSplit(host: ParentNode): void {
  const spliter = findSpliter(host);
  if (!spliter) return;
  const level = studioLevel(host);
  if (level !== null) spliter.setAttribute('level', String(level));
  if (parkedFullscreen !== null) {
    spliter.setAttribute('msplit-fullscreen', parkedFullscreen);
    parkedFullscreen = null;
  }
}

/** Test seam: the parked flags are module state. */
export function resetStudioSplit(): void {
  parkedFullscreen = null;
}
