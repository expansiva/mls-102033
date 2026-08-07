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
} from '/_102033_/l2/cbe/studioHeader.js';
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
const SERVICE_MESSAGES = '_102033_/l2/cbe/serviceRuntimeMessages';
const SERVICE_APP = '_102033_/l2/cbe/serviceClientApp';

export const NAV1_HEIGHT_PX = 30;
export const NAV2_HEIGHT_PX = 36;

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
  const spliter = el('collab-spliter', { defaultleft: '50', defaultright: '50' });
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
  // shown by default — the unified nav3 is active on all nav1 tabs. The
  // studio's own serviceCollabMessages is dropped from the scan: on the VM it
  // would override the runtime environment (msg.collab.codes endpoints) and
  // blank out; ours is the messages service here.
  services = [...services];
  type Nav2State = HTMLElement & { state_?: Record<number, Record<string, string>> };
  const nav2LeftEl = nav2Left as Nav2State;
  const nav2RightEl = nav2Right as Nav2State;
  const dropStudioMessages = (csv: string) =>
    csv.split(',').filter((widget) => widget && !widget.endsWith('serviceCollabMessages')).join(',');
  for (let level = 0; level <= 7; level += 1) {
    const [rawLeft = '', rawRight = ''] = (services[level] ?? ';').split(';');
    const left = dropStudioMessages(rawLeft);
    const right = dropStudioMessages(rawRight);
    services[level] = `${SERVICE_MESSAGES}${left ? `,${left}` : ''};${SERVICE_APP}${right ? `,${right}` : ''}`;
    if (nav2LeftEl.state_?.[level]) nav2LeftEl.state_[level].left = SERVICE_MESSAGES;
    if (nav2RightEl.state_?.[level]) nav2RightEl.state_[level].right = SERVICE_APP;
  }
  nav1El.services = { services };

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
