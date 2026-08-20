/// <mls fileReference="_102033_/l2/shared/layout/auraNavigate.ts" enhancement="_blank" />

// SPA navigation protocol of the shell regions, extracted from the aside so the header (base class
// and generated subclasses) uses the SAME path. A region that navigates with a plain `href` breaks
// the SPA and, worse, leaves the shell's expected-navigation promise pending — every menu click
// would then end in the 10s TIMEOUT of beginExpectedNavigationLoad with no request involved.

import { beginExpectedNavigationLoad, runBlockingUiAction } from '/_102033_/l2/shared/interactionRuntime.js';

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

/**
 * Navigates to `href`: SPA push inside the current module (guarded by the blocking UI), full page
 * load anywhere else. Returns false when the href is not navigable (empty, or not absolute).
 */
export function auraNavigate(href: string, options: AuraNavigateOptions = {}): boolean {
  if (!href || !href.startsWith('/')) {
    return false;
  }

  const basePath = options.basePath ?? '';
  if (!isInternalModuleHref(href, basePath)) {
    window.location.href = href;
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
