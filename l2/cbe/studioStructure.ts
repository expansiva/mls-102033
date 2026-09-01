/// <mls fileReference="_102033_/l2/cbe/studioStructure.ts" enhancement="_blank" />
// Progressive upgrade of the runtime shell to the REAL on.collab.codes
// structure (see nav3_unificado_plano.md, "ALINHAMENTO FINAL"):
//
//   collab-page > collab-nav-1 (30px)
//                 collab-spliter > item-left  [collab-nav-2, collab-nav-3 left ]
//                                  item-right [collab-nav-2, collab-nav-3 right]
//
// The nav3s host the runtime services: `_102033_/l2/cbe/serviceRuntimeMessages`
// (left — adopts the client's messages aside element) and
// `_102033_/l2/cbe/serviceClientApp` (right — adopts the app content host).
// msize/resize stays 100% the studio components' own cascade.
//
// Production vs studio mode is ONLY the top 66px: the client banner (header
// region, turned into a fixed 66px overlay) covers nav1+nav2; studio mode
// hides the banner and the studio bars appear ("nav1 e nav2 ficam embaixo do
// header do cliente"). Everything below never changes between modes.
//
// The first paint keeps the classic lightweight layout; the shell calls
// upgradeToStudioStructure() in the background and swaps only when every
// module is ready. Any failure -> classic layout stays (graceful).

import {
  STUDIO_PROJECT,
  STUDIO_BASE_PROJECT,
  ANONYMOUS_SERVICES,
  ensureStudioPageAssets,
  buildStudioServices,
  withRuntimeServices,
  SERVICE_MESSAGES,
  SERVICE_APP,
} from '/_102033_/l2/cbe/studioHeader.js';
import { setStudioTailwind } from '/_102033_/l2/cbe/studioTailwind.js';
// Runtime services must be DEFINED before the nav3 instances them (the nav3
// attaches directly when customElements.get(tag) resolves).
import '/_102033_/l2/cbe/serviceClientApp.js';
import '/_102033_/l2/cbe/serviceRuntimeMessages.js';

const STUDIO_MODULES = [
  'collab-page', 'collab-spliter', 'collab-spliter-item',
  'collab-nav-1', 'collab-nav-2', 'collab-nav-3',
  // nav3 toolbar (service menu bar: hamburger + mode tabs + tools).
  'collab-nav-3-menu', 'collab-nav-3-menu-tools-cycle', 'collab-nav-3-menu-tools-dropdown',
  'collab-nav-3-menu-tools-link', 'collab-nav-3-menu-tools-tree-dropdown',
];
const NAV_TAGS = ['collab-page', 'collab-spliter', 'collab-nav-1', 'collab-nav-2', 'collab-nav-3'];

export const NAV1_HEIGHT_PX = 30;
export const NAV2_HEIGHT_PX = 36;

interface Nav2Toolbar extends Element {
  selectServiceByWidget?: (widget: string) => boolean;
}

/**
 * Puts the runtime pair back on the nav3s — messages left, app right.
 *
 * What CLIENT mode shows. Leaving studio mode has to force these back: the toolbars remember the
 * last service opened, which by then is whatever the user was doing in the studio.
 */
export function showRuntimeServices(host: ParentNode): void {
  const nav2Left = host.querySelector('collab-nav-2[toolbarposition="left"]') as Nav2Toolbar | null;
  const nav2Right = host.querySelector('collab-nav-2[toolbarposition="right"]') as Nav2Toolbar | null;
  nav2Left?.selectServiceByWidget?.(SERVICE_MESSAGES);
  nav2Right?.selectServiceByWidget?.(SERVICE_APP);
}

let tailwindWatchInstalled = false;

/**
 * Follows `data-studio-mode` BOTH ways for the Tailwind JIT.
 *
 * This structure is built in every desktop session, the client's included, so the trigger cannot be
 * the upgrade itself: what must stay conditional is the JIT DOWNLOAD, not the wiring. The shell
 * already publishes `data-studio-mode` on itself (mls-102033/l2/shared/shell.ts:1198), so no shell
 * change is needed — same channel serviceClientApp watches to show/hide its edit tools.
 *
 * The observer STAYS connected after the first activation: entering studio mode loads the JIT once
 * (never twice), and leaving it makes the JIT's sheet inert, so the app falls back to exactly the css
 * the client is served. Without that, a page edited in the studio would keep looking finished in
 * client mode — masking the very problem the JIT works around.
 */
function watchStudioModeForTailwind(container: HTMLElement): void {
  // The shell retries the upgrade up to 3 times (attemptStructureUpgrade) — one observer is enough.
  if (tailwindWatchInstalled) return;
  const shell = container.closest('collab-aura-shell');
  if (!shell) return;
  tailwindWatchInstalled = true;
  const sync = () => setStudioTailwind(shell.getAttribute('data-studio-mode') === 'true');
  // Only when it is ALREADY on: a first sync in client mode would be a pointless no-op.
  if (shell.getAttribute('data-studio-mode') === 'true') sync();
  new MutationObserver(sync).observe(shell, { attributes: true, attributeFilter: ['data-studio-mode'] });
}

function el(tag: string, attrs: Record<string, string>): HTMLElement {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

/**
 * Builds the studio structure and appends it to `container`. Returns the
 * collab-page element, or throws when the studio environment is unavailable.
 * The caller decides when to reveal it / hide the classic layout.
 */
export async function upgradeToStudioStructure(container: HTMLElement, siteProject: number): Promise<HTMLElement> {
  ensureStudioPageAssets();
  watchStudioModeForTailwind(container);
  await Promise.all(STUDIO_MODULES.map((name) => import(`/_${STUDIO_PROJECT}_/l2/${name}.js`)));
  if (!customElements.get(NAV_TAGS[2]) && window.mls) {
    window.dispatchEvent(new Event('mls:ready'));
  }
  await Promise.race([
    Promise.all(NAV_TAGS.map((name) => customElements.whenDefined(name))),
    new Promise((_, reject) => setTimeout(() => reject(new Error('studio components did not register')), 8000)),
  ]);

  const page = el('collab-page', {});
  const nav1 = el('collab-nav-1', {
    mheight: String(NAV1_HEIGHT_PX),
    tabindexactive: '0',
    initialproject: String(STUDIO_BASE_PROJECT),
  });
  // `fixed`: no drag, no dblclick on the separator — the split is driven by msplit alone.
  const spliter = el('collab-spliter', { defaultleft: '50', defaultright: '50', fixed: '' });
  const itemLeft = el('collab-spliter-item', {});
  const itemRight = el('collab-spliter-item', {});
  const nav2Left = el('collab-nav-2', { mheight: String(NAV2_HEIGHT_PX), level: '7', toolbarposition: 'left' });
  const nav2Right = el('collab-nav-2', { mheight: String(NAV2_HEIGHT_PX), level: '7', toolbarposition: 'right' });
  const nav3Left = el('collab-nav-3', { toolbarposition: 'left', level: '7' });
  const nav3Right = el('collab-nav-3', { toolbarposition: 'right', level: '7' });

  itemLeft.append(nav2Left, nav3Left);
  itemRight.append(nav2Right, nav3Right);
  spliter.append(itemLeft, itemRight);
  page.append(nav1, spliter);
  container.appendChild(page);

  // nav1 services (studio scan; anonymous fallback), with the runtime services
  // PREPENDED on level 7 — the nav1/nav2 flow owns the nav3 data-service, so
  // our widgets must be part of its service list, not set manually.
  const nav1El = nav1 as HTMLElement & { services?: { services: string[] } };
  let services = ANONYMOUS_SERVICES;
  try {
    services = await buildStudioServices(siteProject);
  } catch { /* anonymous fallback */ }
  // EVERY level gets the runtime pair (messages left, app right) prepended and
  // shown by default — the unified nav3 is active on all nav1 tabs. Shared with
  // the studio header so both toolbars offer the same way back (withRuntimeServices).
  nav1El.services = { services: withRuntimeServices(services, nav2Left, nav2Right) };

  nav1.setAttribute('status', 'enabled');

  // Production split: messages fixed-ish at 375px left, the app taking the
  // rest (the photo layout). msplit is the spliter's own channel (it also
  // persists the per-level preference); clear any hidden/closed leftovers from
  // stored level-7 preferences (the studio home is left-fullscreen there).
  const applySplit = () => {
    const total = window.innerWidth;
    const left = 375;
    const right = Math.max(200, total - left - 8);
    itemLeft.classList.remove('hidden', 'closed');
    itemRight.classList.remove('hidden', 'closed');
    spliter.setAttribute('msplit', `${left},${right}`);
  };
  applySplit();
  setTimeout(applySplit, 600);

  return page;
}
