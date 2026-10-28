/// <mls fileReference="_102033_/l2/shared/layout/auraNavigate.ts" enhancement="_blank" />

// SPA navigation protocol of the shell regions, extracted from the aside so the header (base class
// and generated subclasses) uses the SAME path. A region that navigates with a plain `href` breaks
// the SPA and, worse, leaves the shell's expected-navigation promise pending — every menu click
// would then end in the 10s TIMEOUT of beginExpectedNavigationLoad with no request involved.

import type { MasterFrontendBootConfig } from '/_102029_/l2/contracts/bootstrap.js';
import { beginExpectedNavigationLoad, runBlockingUiAction } from '/_102033_/l2/shared/interactionRuntime.js';
import {
  findModuleTabForPath,
  openModuleTab,
  rememberShellRoute,
  navigateModuleTab,
} from '/_102033_/l2/shared/moduleTab.js';

function traceLazy(event: string, details?: Record<string, unknown>) {
  if (!window.isTraceLazy) {
    return;
  }
  console.log('[traceLazy][auraNavigate]', event, details ?? {});
}

/** True when `href` is a route of the module currently booted (SPA navigation applies). */
export function isInternalModuleHref(href: string, basePath: string): boolean {
  if (!href.startsWith('/')) return false;
  if (!basePath) return true;
  return href === basePath || href.startsWith(`${basePath}/`);
}

/**
 * Active state of a region's navigation entry. The module root answers to its aliases
 * (`/index.html`, `/overview`) — the rule the aside has always applied, now shared with the header.
 */
export function isRegionLinkActive(href: string, currentPath: string, basePath?: string): boolean {
  if (basePath && href === basePath) {
    return currentPath === href
      || currentPath === `${href}/index.html`
      || currentPath === `${href}/overview`;
  }
  return currentPath === href;
}

export interface AuraNavigateOptions {
  /** Module base path from the boot config; routes outside it are a full page load. */
  basePath?: string;
  /** Ran right after an in-module navigation starts (the aside closes its drawer here). */
  afterNavigate?: () => void;
  busyLabel?: string;
  errorTitle?: string;
}

/** Pushes the route and lets the shell's popstate handler settle the expected load. */
async function pushRoute(href: string, signal?: AbortSignal): Promise<void> {
  const pendingLoad = beginExpectedNavigationLoad(signal);
  traceLazy('pushRoute.dispatch', { href });
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  await pendingLoad;
  traceLazy('pushRoute.resolved', { href });
}

function bootBasePath(): string {
  const boot: MasterFrontendBootConfig | undefined = window.collabBoot;
  return boot?.basePath ?? '';
}

function basePathForNewTab(href: string, hinted: string, bootBase: string): string {
  const path = href.split(/[?#]/u, 1)[0];
  if (hinted && hinted !== bootBase && (path === hinted || path.startsWith(`${hinted}/`))) {
    return hinted;
  }
  const segment = path.split('/').filter(Boolean)[0];
  return segment ? `/${segment}` : path;
}

/** Module tab: pushState, render that tab, activate it. popstate settles the expected load. */
async function pushModuleTab(href: string, basePath: string, alreadyOpen: boolean, signal?: AbortSignal): Promise<void> {
  const pendingLoad = beginExpectedNavigationLoad(signal);
  const bootBase = bootBasePath();
  if (bootBase && isInternalModuleHref(window.location.pathname, bootBase)) {
    rememberShellRoute(`${window.location.pathname}${window.location.search}${window.location.hash}`);
  }
  traceLazy('pushModuleTab.dispatch', { href, basePath, alreadyOpen });
  window.history.pushState({}, '', href);
  if (alreadyOpen) await navigateModuleTab(basePath, href);
  else await openModuleTab(basePath, href);
  window.collabRuntimeNav3?.activateTab(`mod-${basePath}`);
  const PopState = globalThis.PopStateEvent ?? Event;
  window.dispatchEvent(new PopState('popstate'));
  await pendingLoad;
  traceLazy('pushModuleTab.resolved', { href });
}

/**
 * Navigates to `href`: SPA push inside the current module (guarded by the blocking UI), full page
 * load anywhere else. Returns false when the href is not navigable (empty, or not absolute).
 */
export function auraNavigate(href: string, options: AuraNavigateOptions = {}): boolean {
  if (!href || !href.startsWith('/')) {
    return false;
  }

  const hinted = options.basePath ?? '';
  const bootBase = bootBasePath() || hinted;
  const path = href.split(/[?#]/u, 1)[0];
  const ownedByBoot = Boolean(bootBase) && isInternalModuleHref(path, bootBase);
  const openTab = ownedByBoot ? undefined : findModuleTabForPath(path);

  if (!ownedByBoot) {
    const basePath = openTab?.basePath ?? basePathForNewTab(href, hinted, bootBase);
    traceLazy('auraNavigate.moduleTab', { href, basePath, alreadyOpen: Boolean(openTab) });
    const retry = () => pushModuleTab(href, basePath, Boolean(openTab));
    void runBlockingUiAction(
      async (signal) => {
        await pushModuleTab(href, basePath, Boolean(openTab), signal);
      },
      {
        mode: 'silent',
        busyLabel: options.busyLabel ?? 'Carregando pagina...',
        errorTitle: options.errorTitle ?? 'Nao foi possivel carregar esta pagina',
        retry,
      },
    );
    options.afterNavigate?.();
    return true;
  }

  if (window.location.pathname !== href) {
    traceLazy('auraNavigate', { href });
    const retry = () => pushRoute(href);
    void runBlockingUiAction(
      async (signal) => {
        await pushRoute(href, signal);
      },
      {
        clearContentWhileBusy: true,
        busyLabel: options.busyLabel ?? 'Carregando pagina...',
        errorTitle: options.errorTitle ?? 'Nao foi possivel carregar esta pagina',
        retry,
      },
    );
  }

  options.afterNavigate?.();
  return true;
}

/** Click handler for an in-app anchor: same protocol, taking the href from the event target. */
export function auraNavigateFromEvent(event: Event, options: AuraNavigateOptions = {}): void {
  const target = event.currentTarget as HTMLAnchorElement | null;
  const href = target?.getAttribute('href');
  if (!href || !href.startsWith('/')) {
    return;
  }

  event.preventDefault();
  auraNavigate(href, options);
}
