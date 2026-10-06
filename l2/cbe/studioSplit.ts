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
//
// Level 7 is the one level that looks the SAME in both modes: its profile is the client split, and
// studio mode has to show exactly that. So nothing here ever gives l7 a layout of its own — in
// particular the left-fullscreen the studio home pins on it is cleared and never handed back.

import { runtimeSplitFor } from '/_102033_/l2/shared/mobilePane.js';

/** The level whose stored profile IS the client layout. */
export const CLIENT_LEVEL = 7;
/** Which side of the client layout is full-screen on a mobile (single-panel) viewport. */
export type ClientPanelSide = 'left' | 'right';
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

  // Level 7 shows the client split in BOTH modes, so the fullscreen flag is cleared for good, not
  // parked and handed back. The studio home pins it to the left (serviceStart and collab-start-l7
  // call `setFullScreen(7, 'left')`); giving that back on the way in made l7 open at 100%.
  spliter.setFullScreen?.(CLIENT_LEVEL, 'default');
  spliter.setAttribute('level', String(CLIENT_LEVEL));

  // Setting `level` alone already brings the 375px back (level 7 is in the forced range, even with no
  // stored profile at all). This stays because it is deterministic and because it is the only thing
  // that reopens a panel the spliter had collapsed.
  const right = Math.max(MIN_RIGHT_PX, window.innerWidth - CLIENT_LEFT_PX - SEPARATOR_PX);
  itemLeft.classList.remove('hidden', 'closed');
  itemRight.classList.remove('hidden', 'closed');
  spliter.setAttribute('msplit', `${CLIENT_LEFT_PX},${right}`);
  clearSeparatorOverride(spliter);
}

/**
 * Shows ONE side of the client layout full-width — the mobile (single-panel) layout. Uses the same
 * `setFullScreen` level-7 channel the studio home already relies on for its own left-fullscreen pin
 * (see the module comment above), so no width preference is written: collab-spliter's own
 * `_savePreferencesByLevel` (mls-102041/l2/collab-spliter.ts) already returns early while a level is
 * full-screen — nothing here duplicates or depends on that beyond calling `setFullScreen`.
 *
 * Mobile only; desktop keeps using `applyClientSplit`/`restoreStudioSplit`.
 */
export function showClientPanel(host: ParentNode, side: ClientPanelSide): void {
  const spliter = findSpliter(host);
  if (!spliter) return;
  // Same order `applyClientSplit` uses, and for the same reason: `setFullScreen` applies against
  // whatever `level` attribute is CURRENTLY on the spliter — if that's stale (e.g. a studio level
  // left over from desktop), the first pass computes the wrong level's widths. Setting `level`
  // SECOND re-triggers the load, this time under level 7 with the fullscreen flag already in place —
  // the only pass whose write `_savePreferencesByLevel` actually skips.
  spliter.setFullScreen?.(CLIENT_LEVEL, side);
  spliter.setAttribute('level', String(CLIENT_LEVEL));
  // The separator keeps its 8px band (background only — `fixed` already drops the drag handle,
  // mls-102041/l2/collab-spliter.less `.spliter-separator.fixed > div`) even with one side at 0
  // width, which would show as a stray strip on a full-width mobile panel. Hidden here, from the
  // structure side, so 102041 stays untouched; `applyClientSplit` clears the override on the way
  // back to the two-panel desktop layout.
  const separator = spliter.querySelector?.('.spliter-separator') as HTMLElement | null;
  if (separator) separator.style.display = 'none';
}

function clearSeparatorOverride(spliter: SpliterElement): void {
  const separator = spliter.querySelector?.('.spliter-separator') as HTMLElement | null;
  if (separator) separator.style.removeProperty('display');
}

/**
 * Shows one pane fullscreen — the phone layout. Same structure as desktop, but there is room for one
 * nav3 only: `left` is messages, `right` is the app.
 *
 * Uses the spliter's own fullscreen flag on the client level, which is not persisted (only the
 * attribute holds it) and is cleared by applyClientSplit when the screen widens again.
 */
export function applyPaneFullscreen(host: ParentNode, side: 'left' | 'right'): void {
  const spliter = findSpliter(host);
  if (!spliter) return;
  const items = spliter.querySelectorAll('collab-spliter-item');
  // The spliter adds `hidden` to the zero-width side but never takes it off the other one.
  items.forEach((item) => item.classList.remove('hidden', 'closed'));
  spliter.setAttribute('level', String(CLIENT_LEVEL));
  spliter.setFullScreen?.(CLIENT_LEVEL, side);
}

/**
 * The client-mode layout for the device the shell is on: the client split on desktop, the current
 * pane fullscreen on a phone. Read from the shell's own attributes (`data-device`,
 * `data-mobile-pane`), so the structure's delayed re-applies follow the shell without a callback.
 */
export function applyRuntimeSplit(host: ParentNode): void {
  const shell = (host as Element).closest?.('collab-aura-shell') ?? null;
  const device = shell?.getAttribute('data-device') === 'mobile' ? 'mobile' : 'desktop';
  const pane = shell?.getAttribute('data-mobile-pane') === 'app' ? 'app' : 'messages';
  const split = runtimeSplitFor(device, pane);
  if (split === 'client') applyClientSplit(host);
  else applyPaneFullscreen(host, split);
}

/**
 * Gives the spliter back to the studio level the nav1 is still on.
 *
 * Only the level moves. Coming back to level 7 is a no-op on purpose: its profile IS the client
 * split, which is what l7 has to show in studio mode too.
 */
export function restoreStudioSplit(host: ParentNode): void {
  const spliter = findSpliter(host);
  if (!spliter) return;
  const level = studioLevel(host);
  if (level !== null) spliter.setAttribute('level', String(level));
  clearSeparatorOverride(spliter);
}
