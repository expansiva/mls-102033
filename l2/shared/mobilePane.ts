/// <mls fileReference="_102033_/l2/shared/mobilePane.ts" enhancement="_blank" />
// On a phone the unified structure is the same as on desktop (messages nav3 | app nav3), but there is
// room for one pane only: the spliter shows one of them fullscreen. Messages first, the app page after
// navigating, and the header's ☰ switches between the two.
//
// Pure rules only (no DOM) so the shell's decisions are testable.

import type { MasterFrontendDeviceKind } from '/_102033_/l2/shared/contracts/bootstrap.js';

export type MobilePane = 'messages' | 'app';

/** Which spliter side is fullscreen for a pane — messages live on the left nav3, the app on the right. */
export type SpliterSide = 'left' | 'right';

/**
 * Whether `pathname` is the module root (the aliases the aside always treated as the root).
 */
export function isModuleRootPath(pathname: string, basePath: string | undefined): boolean {
  const base = (basePath ?? '').replace(/\/+$/u, '');
  const path = pathname.replace(/\/+$/u, '');
  if (!base) return path === '' || path === '/index.html';
  return path === base || path === `${base}/index.html` || path === `${base}/overview`;
}

/**
 * The pane a phone opens on. Messages at the module root; a link straight to a page
 * (/controleEstoque/produtos) opens that page, with messages one ☰ away.
 */
export function initialMobilePane(pathname: string, basePath: string | undefined): MobilePane {
  return isModuleRootPath(pathname, basePath) ? 'messages' : 'app';
}

export function otherMobilePane(pane: MobilePane): MobilePane {
  return pane === 'messages' ? 'app' : 'messages';
}

/**
 * How the spliter is laid out: the client split on desktop, one side fullscreen on a phone.
 */
export function runtimeSplitFor(device: MasterFrontendDeviceKind, pane: MobilePane): 'client' | SpliterSide {
  if (device !== 'mobile') return 'client';
  return pane === 'messages' ? 'left' : 'right';
}
