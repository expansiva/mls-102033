/// <mls fileReference="_102033_/l2/shared/moduleTab.ts" enhancement="_blank" />
import type { MasterFrontendBootConfig } from '/_102029_/l2/contracts/bootstrap.js';
import { loadAuraRouteChunk, matchAuraRoute } from '/_102033_/l2/shared/routeRuntime.js';

type PageElement = HTMLElement & { bootConfig?: MasterFrontendBootConfig };
type RouteImporter = (specifier: string) => Promise<unknown>;

interface ModuleTabHost {
  div: HTMLDivElement;
  route: string;
  title: string;
}

const COLLAB_TABS_KEY = 'collabTabs';

interface PinnedModuleTab {
  basePath: string;
  route: string;
}

const bootCache = new Map<string, MasterFrontendBootConfig>();
const hosts = new Map<string, ModuleTabHost>();
let shellRoute = '';
let restoringPins = false;

const pinLabels: Record<string, { pin: string; unpin: string }> = {
  en: { pin: 'Pin', unpin: 'Unpin' },
  pt: { pin: 'Fixar', unpin: 'Desafixar' },
};

function tabId(basePath: string): string {
  return `mod-${basePath}`;
}

function pathnameOf(route: string): string {
  try {
    return new URL(route, 'http://collab.local').pathname;
  } catch {
    return route.split(/[?#]/u, 1)[0];
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isBootConfig(value: unknown): value is MasterFrontendBootConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.projectId === 'string'
    && typeof candidate.moduleId === 'string'
    && typeof candidate.basePath === 'string'
    && typeof candidate.shellMode === 'string'
    && typeof candidate.device === 'string'
    && Array.isArray(candidate.routes);
}

function showTabError(div: HTMLElement, error: unknown): void {
  const message = errorText(error);
  console.error('[moduleTab]', message);
  div.replaceChildren();
  div.textContent = message;
}

class ModuleNotRegisteredError extends Error {
  constructor(basePath: string) {
    super(`Module is not registered: ${basePath}`);
    this.name = 'ModuleNotRegisteredError';
  }
}

async function loadBoot(basePath: string): Promise<MasterFrontendBootConfig> {
  const cached = bootCache.get(basePath);
  if (cached) return cached;
  const response = await fetch(`/_moduleBoot?basePath=${encodeURIComponent(basePath)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (response.status === 404) {
    throw new ModuleNotRegisteredError(basePath);
  }
  if (!response.ok) {
    throw new Error(`Module boot failed for ${basePath}: ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!isBootConfig(body)) {
    throw new Error(`Module boot is invalid for ${basePath}`);
  }
  bootCache.set(basePath, body);
  return body;
}

async function renderRoute(
  basePath: string,
  route: string,
  div: HTMLElement,
  importer: RouteImporter | undefined,
): Promise<string> {
  const boot = await loadBoot(basePath);
  const pathname = pathnameOf(route);
  const matched = matchAuraRoute(boot.routes, pathname);
  if (!matched) {
    throw new Error(`Route not registered for ${pathname}.`);
  }
  await loadAuraRouteChunk(matched.entrypoint, importer);
  const current = div.firstElementChild as PageElement | null;
  const page = current?.tagName.toLowerCase() === matched.tag
    ? current
    : document.createElement(matched.tag) as PageElement;
  page.bootConfig = boot;
  if (page !== current) div.replaceChildren(page);
  return boot.moduleId || matched.title;
}

function currentHref(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function bootOwns(path: string): boolean {
  const basePath = window.collabBoot?.basePath ?? '';
  if (!basePath) return false;
  const pathname = pathnameOf(path);
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

function readPinnedTabs(): { ok: true; pinned: PinnedModuleTab[] } | { ok: false } {
  try {
    const storage = window.localStorage;
    if (!storage) return { ok: true, pinned: [] };
    const raw = storage.getItem(COLLAB_TABS_KEY);
    if (!raw) return { ok: true, pinned: [] };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { pinned?: unknown }).pinned)) {
      return { ok: false };
    }
    const pinned = (parsed as { pinned: unknown[] }).pinned.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const basePath = (item as { basePath?: unknown }).basePath;
      const route = (item as { route?: unknown }).route;
      if (typeof basePath !== 'string' || typeof route !== 'string') return [];
      return [{ basePath, route }];
    });
    return { ok: true, pinned };
  } catch (error) {
    console.error('[moduleTab] collabTabs', errorText(error));
    return { ok: false };
  }
}

function writePinnedTabs(pinned: PinnedModuleTab[]): void {
  try {
    window.localStorage?.setItem(COLLAB_TABS_KEY, JSON.stringify({ pinned }));
  } catch (error) {
    console.error('[moduleTab] collabTabs', errorText(error));
  }
}

function rememberPinnedRoute(basePath: string, route: string): void {
  const stored = readPinnedTabs();
  if (!stored.ok) return;
  const item = stored.pinned.find((entry) => entry.basePath === basePath);
  if (!item || item.route === route) return;
  item.route = route;
  writePinnedTabs(stored.pinned);
}

export function moduleTabPinLabel(basePath: string, language: string): string {
  const code = language.toLowerCase().startsWith('pt') ? 'pt' : 'en';
  const stored = readPinnedTabs();
  const pinned = stored.ok && stored.pinned.some((entry) => entry.basePath === basePath);
  return pinned ? pinLabels[code].unpin : pinLabels[code].pin;
}

/** `openContentTab` keeps the current tab while pinned tabs are restored. */
export function moduleTabOpenActivates(): boolean {
  return !restoringPins;
}

export function toggleModuleTabPin(basePath: string): void {
  const stored = readPinnedTabs();
  if (!stored.ok) return;
  const existing = stored.pinned.find((entry) => entry.basePath === basePath);
  if (existing) {
    writePinnedTabs(stored.pinned.filter((entry) => entry.basePath !== basePath));
    return;
  }
  const route = hosts.get(basePath)?.route || basePath;
  writePinnedTabs([...stored.pinned, { basePath, route }]);
}

export async function restorePinnedModuleTabs(importer?: RouteImporter): Promise<void> {
  const stored = readPinnedTabs();
  if (!stored.ok) return;
  const href = currentHref();
  if (bootOwns(href)) rememberShellRoute(href);
  restoringPins = true;
  try {
    const bootBasePath = window.collabBoot?.basePath ?? '';
    for (const item of stored.pinned) {
      // The boot module already lives in the `app` tab; its pin stays stored for when the F5 lands elsewhere.
      if (bootBasePath && item.basePath === bootBasePath) continue;
      await openModuleTab(item.basePath, item.route, importer);
    }
  } finally {
    restoringPins = false;
  }
  const owner = bootOwns(href) ? undefined : findModuleTabForPath(href);
  window.collabRuntimeNav3?.activateTab(owner ? tabId(owner.basePath) : 'app');
}

/** True when `/_moduleBoot` knows `basePath`. Only a 404 is "no"; any other failure is thrown, never hidden. */
export async function isModuleRegistered(basePath: string): Promise<boolean> {
  try {
    await loadBoot(basePath);
    return true;
  } catch (error) {
    if (error instanceof ModuleNotRegisteredError) return false;
    throw error;
  }
}

function tabIsOpen(basePath: string): ModuleTabHost | undefined {
  const host = hosts.get(basePath);
  const nav = window.collabRuntimeNav3;
  if (!host || !nav || !host.div.isConnected) return undefined;
  if (!nav.listTabs().includes(tabId(basePath))) return undefined;
  return host;
}

export function findModuleTabForPath(path: string): { basePath: string; route: string } | undefined {
  const pathname = pathnameOf(path);
  let found: { basePath: string; route: string } | undefined;
  for (const [basePath, host] of hosts) {
    if (!tabIsOpen(basePath)) continue;
    if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) continue;
    if (!found || basePath.length > found.basePath.length) {
      found = { basePath, route: host.route };
    }
  }
  return found;
}

export function rememberShellRoute(route: string): void {
  if (route) shellRoute = route;
}

export function readShellRoute(): string {
  return shellRoute;
}

/** Point the bar at the active content tab. The boot module keeps `shellRoute`. */
export function syncHistoryForContentTab(id: string): void {
  if (!window.location || typeof window.history?.replaceState !== 'function') return;
  const current = currentHref();
  if (id === 'app') {
    const target = shellRoute;
    if (target && target !== current) window.history.replaceState({}, '', target);
    return;
  }
  if (!id.startsWith('mod-')) return;
  const tab = findModuleTabForPath(id.slice(4));
  if (!tab) return;
  if (bootOwns(current)) rememberShellRoute(current);
  if (tab.route && tab.route !== current) window.history.replaceState({}, '', tab.route);
}

/** Back/forward: the open module tab that owns `href` renders it and becomes active. */
export async function revealModuleTabForLocation(href: string): Promise<boolean> {
  const tab = findModuleTabForPath(href);
  if (!tab || bootOwns(href)) return false;
  if (tab.route !== href) await navigateModuleTab(tab.basePath, href);
  window.collabRuntimeNav3?.activateTab(tabId(tab.basePath));
  return true;
}

export async function navigateModuleTab(
  basePath: string,
  route: string,
  importer?: RouteImporter,
): Promise<void> {
  const host = hosts.get(basePath);
  if (!host) {
    const error = new Error(`Module tab is not open for ${basePath}`);
    console.error('[moduleTab]', error.message);
    throw error;
  }
  try {
    host.title = await renderRoute(basePath, route, host.div, importer);
    host.route = route;
    rememberPinnedRoute(basePath, route);
  } catch (error) {
    host.route = route;
    rememberPinnedRoute(basePath, route);
    showTabError(host.div, error);
  }
}

export async function openModuleTab(
  basePath: string,
  route: string,
  importer?: RouteImporter,
): Promise<void> {
  const nav = window.collabRuntimeNav3;
  if (!nav) {
    const error = new Error('collabRuntimeNav3 is not available');
    console.error('[moduleTab]', error.message);
    throw error;
  }
  const open = tabIsOpen(basePath);
  if (open) {
    if (open.route !== route) await navigateModuleTab(basePath, route, importer);
    nav.activateTab(tabId(basePath));
    return;
  }
  const div = document.createElement('div');
  div.style.cssText = 'display:block;width:100%;height:100%;';
  const host: ModuleTabHost = { div, route, title: basePath };
  hosts.set(basePath, host);
  try {
    host.title = await renderRoute(basePath, route, div, importer);
  } catch (error) {
    showTabError(div, error);
  }
  nav.openTab({ id: tabId(basePath), title: host.title, element: div });
  if (moduleTabOpenActivates()) syncHistoryForContentTab(tabId(basePath));
}
