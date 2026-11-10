/// <mls fileReference="_102033_/l2/shared/moduleTab.ts" enhancement="_blank" />
import type { MasterFrontendBootConfig } from '/_102029_/l2/contracts/bootstrap.js';
import { loadAuraRouteChunk, matchAuraRoute } from '/_102033_/l2/shared/routeRuntime.js';

type PageElement = HTMLElement & { bootConfig?: MasterFrontendBootConfig };
type RouteImporter = (specifier: string) => Promise<unknown>;

interface ModuleTabHost {
  id: string;
  basePath: string;
  div: HTMLDivElement;
  route: string;
  title: string;
  pinned: boolean;
  mounted: boolean;
  /** Bare page specifier from the route, once the tab has rendered. */
  pageSpecifier?: string;
  pageTag?: string;
}

/** One open preview tab. `page` is the module the route mounts. */
export interface PreviewTabSlot {
  div: HTMLElement;
  page: string;
  tag: string;
}

/** The shell's main content page. `host` is the element inside `main[data-region="content"]`. */
export interface ShellMainPage {
  page: string;
  tag: string;
  host: HTMLElement;
}

interface RenderedRoute {
  title: string;
  tag: string;
  entrypoint: string;
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
  en: { pin: 'Pin tab', unpin: 'Unpin tab' },
  pt: { pin: 'Fixar aba', unpin: 'Desafixar aba' },
};

function freeTabId(basePath: string): string {
  return `mod-${basePath}`;
}

/** A module id shown as a name: first letter uppercased. Never a path. */
export function moduleNameFromId(moduleId: string): string {
  const name = moduleId.replace(/^\/+|\/+$/gu, '').split('/').pop() ?? '';
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
}

/** Same name the apps menu uses (`moduleId`), with the first letter uppercased. Never a path. */
export function moduleDisplayName(basePath: string): string {
  const boot = window.collabBoot;
  const bootBase = boot?.basePath ?? '';
  const fromBoot = Boolean(boot?.moduleId) && basePath === bootBase;
  return moduleNameFromId(fromBoot ? boot?.moduleId ?? '' : basePath);
}

function pinnedTabId(basePath: string, number: number): string {
  return `mod-${basePath}#${number}`;
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
): Promise<RenderedRoute> {
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
  return {
    title: moduleNameFromId(boot.moduleId) || matched.title,
    tag: matched.tag,
    entrypoint: matched.entrypoint,
  };
}

function rememberPage(host: ModuleTabHost, rendered: RenderedRoute): void {
  host.title = rendered.title;
  host.pageSpecifier = rendered.entrypoint;
  host.pageTag = rendered.tag;
}

/**
 * Builds the page again inside this tab div.
 * `prepare` runs before the node is inserted, so a remount can copy state onto it first.
 * Nodes outside `div` are left as they are.
 */
export function replaceTabPage(
  div: HTMLElement,
  tag: string,
  prepare?: (previous: HTMLElement | null, next: HTMLElement) => void,
): HTMLElement {
  const previous = div.firstElementChild as PageElement | null;
  const next = document.createElement(tag) as PageElement;
  if (previous?.bootConfig !== undefined) next.bootConfig = previous.bootConfig;
  prepare?.(previous, next);
  div.replaceChildren(next);
  return next;
}

/** Open tabs that already rendered a page. A tab that failed to render is absent. */
export function previewTabSlots(): PreviewTabSlot[] {
  const slots: PreviewTabSlot[] = [];
  for (const host of hosts.values()) {
    if (!host.pageSpecifier || !host.pageTag || !tabIsOpen(host)) continue;
    slots.push({ div: host.div, page: host.pageSpecifier, tag: host.pageTag });
  }
  return slots;
}

let shellMainPage: ShellMainPage | null = null;

/** The shell writes this when it mounts or clears the content region. `null` clears it. */
export function registerShellMainPage(page: ShellMainPage | null): void {
  shellMainPage = page;
}

/**
 * The main page on screen, beside the module tabs.
 * A host that left the document is dropped: a detached node is not an open page.
 */
export function shellMainPageSlot(): ShellMainPage | null {
  if (!shellMainPage) return null;
  if (shellMainPage.host.isConnected === false) {
    // A remount by tag replaces the page element: the registered node is gone, the page is not.
    const current = typeof document === 'undefined' || typeof document.querySelector !== 'function'
      ? null
      : document.querySelector(`main[data-region="content"] ${shellMainPage.tag}`);
    if (typeof HTMLElement === 'function' && current instanceof HTMLElement && current.isConnected) {
      shellMainPage = { page: shellMainPage.page, tag: shellMainPage.tag, host: current };
      return shellMainPage;
    }
    console.info(`[moduleTab] main page ${shellMainPage.page} is not in the document`);
    shellMainPage = null;
    return null;
  }
  return shellMainPage;
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

/** `app` is the boot module; `mod-*` is that module's basePath. `#n` is the pin number. */
export function pinBasePathForTab(tabIdValue: string, bootBasePath: string): string {
  if (tabIdValue === 'app' || tabIdValue.startsWith('app#')) return bootBasePath;
  if (tabIdValue.startsWith('mod-')) {
    const rest = tabIdValue.slice(4);
    const hash = rest.indexOf('#');
    return hash === -1 ? rest : rest.slice(0, hash);
  }
  return '';
}

export function isModuleTabPinned(basePath: string): boolean {
  if (!basePath) return false;
  const stored = readPinnedTabs();
  return stored.ok && stored.pinned.some((entry) => entry.basePath === basePath);
}

/**
 * Whether the menu of THIS tab says "unpin". A pinned tab (`#n`) is pinned; a free hosted tab is not, even
 * when its module has pins elsewhere; the app tab is pinned only when a pin holds its current route.
 */
export function isTabPinned(tabIdValue: string, bootBasePath: string, appRoute: string): boolean {
  if (/#\d+$/u.test(tabIdValue)) return true;
  if (tabIdValue !== 'app') return false;
  const stored = readPinnedTabs();
  return stored.ok && stored.pinned.some((entry) => entry.basePath === bootBasePath && entry.route === appRoute);
}

export function tabPinLabel(pinned: boolean, language: string): string {
  const code = language.toLowerCase().startsWith('pt') ? 'pt' : 'en';
  return pinned ? pinLabels[code].unpin : pinLabels[code].pin;
}

export function moduleTabPinLabel(basePath: string, language: string): string {
  return tabPinLabel(isModuleTabPinned(basePath), language);
}

/** Result of closing one nav3 tab. `reopenInitial` means nothing was left, so the app tab returns at the boot route. */
export interface ClosedContentTab {
  appOpen: boolean;
  activeId: string;
  tabIds: string[];
  reopenInitial: boolean;
  syncUrl: boolean;
}

/** Hide the app tab or drop a module tab. The active tab moves only when the closed one was active. */
export function settleClosedContentTab(input: {
  closedId: string;
  appOpen: boolean;
  activeId: string;
  tabIds: string[];
}): ClosedContentTab | undefined {
  const { closedId, activeId, tabIds } = input;
  let appOpen = input.appOpen;
  if (closedId === 'app') {
    if (!appOpen) return undefined;
    appOpen = false;
  } else if (!tabIds.includes(closedId)) {
    return undefined;
  }
  const nextIds = closedId === 'app' ? tabIds : tabIds.filter((id) => id !== closedId);
  if (nextIds.length === 0 && !appOpen) {
    return { appOpen: true, activeId: 'app', tabIds: nextIds, reopenInitial: true, syncUrl: false };
  }
  const closedWasActive = activeId === closedId;
  const nextActive = closedWasActive
    ? (nextIds.length > 0 ? nextIds[nextIds.length - 1] : 'app')
    : activeId;
  return {
    appOpen,
    activeId: nextActive,
    tabIds: nextIds,
    reopenInitial: false,
    syncUrl: closedWasActive,
  };
}

/** `openContentTab` keeps the current tab while pinned tabs are restored. */
export function moduleTabOpenActivates(): boolean {
  return !restoringPins;
}

function navApi(): Window['collabRuntimeNav3'] | undefined {
  return window.collabRuntimeNav3;
}

function publishHost(host: ModuleTabHost, id: string): void {
  host.id = id;
  hosts.set(id, host);
  navApi()?.openTab({ id, title: host.title, element: host.div });
}

function dropHost(host: ModuleTabHost): void {
  hosts.delete(host.id);
  navApi()?.closeTab(host.id);
}

function renumberPinnedHosts(basePath: string, pinned: PinnedModuleTab[]): void {
  const mine = pinned.filter((entry) => entry.basePath === basePath);
  mine.forEach((entry, index) => {
    const nextId = pinnedTabId(basePath, index + 1);
    const current = [...hosts.values()].find((host) => host.pinned && host.basePath === basePath && host.route === entry.route);
    if (!current || current.id === nextId) return;
    const previousId = current.id;
    hosts.delete(previousId);
    publishHost(current, nextId);
    navApi()?.closeTab(previousId);
  });
}

/** A pin of the boot module is a hosted tab. The `app` tab stays the free one. */
function openPinnedBootTab(basePath: string, route: string, number: number): void {
  const id = pinnedTabId(basePath, number);
  const nav = navApi();
  if (!nav) {
    const error = new Error('collabRuntimeNav3 is not available');
    console.error('[moduleTab]', error.message);
    return;
  }
  const existing = hosts.get(id);
  if (tabIsOpen(existing)) return;
  const div = document.createElement('div');
  div.style.cssText = 'display:block;width:100%;height:100%;';
  const host: ModuleTabHost = {
    id,
    basePath,
    div,
    route,
    title: moduleDisplayName(basePath),
    pinned: true,
    mounted: false,
  };
  hosts.set(id, host);
  nav.openTab({ id, title: host.title, element: div });
  void mountModuleTabOnActivate(id);
}

/** The pinned tab becomes the free tab. A second free tab closes the older one. Remaining pins renumber. */
function unpinStored(pinned: PinnedModuleTab[], index: number): void {
  const entry = pinned[index];
  const next = pinned.filter((_, itemIndex) => itemIndex !== index);
  writePinnedTabs(next);
  const host = [...hosts.values()].find((item) => item.pinned && item.basePath === entry.basePath && item.route === entry.route);
  if (host) {
    host.pinned = false;
    const freeId = freeTabId(entry.basePath);
    const other = hosts.get(freeId);
    if (other && other !== host) {
      dropHost(other);
      const previousId = host.id;
      hosts.delete(previousId);
      publishHost(host, freeId);
      navApi()?.closeTab(previousId);
    } else if (host.id !== freeId) {
      const previousId = host.id;
      hosts.delete(previousId);
      publishHost(host, freeId);
      navApi()?.closeTab(previousId);
    }
  }
  renumberPinnedHosts(entry.basePath, next);
}

function pinStored(basePath: string, route: string, pinned: PinnedModuleTab[]): void {
  const next = [...pinned, { basePath, route }];
  writePinnedTabs(next);
  const number = next.filter((entry) => entry.basePath === basePath).length;
  const bootBase = window.collabBoot?.basePath ?? '';
  if (basePath === bootBase) {
    openPinnedBootTab(basePath, route, number);
    return;
  }
  const free = hosts.get(freeTabId(basePath));
  if (!free || free.pinned) return;
  free.pinned = true;
  free.route = route;
  const previousId = free.id;
  hosts.delete(previousId);
  publishHost(free, pinnedTabId(basePath, number));
  navApi()?.closeTab(previousId);
}

/** The route a pinned tab holds, so unpinning it never lands on another pin of the module. */
export function pinnedTabRoute(tabIdValue: string): string | undefined {
  const host = hosts.get(tabIdValue);
  return host?.pinned ? host.route : undefined;
}

export function toggleModuleTabPin(basePath: string, route?: string): void {
  const stored = readPinnedTabs();
  if (!stored.ok || !basePath) return;
  const free = hosts.get(freeTabId(basePath));
  const modulePins = stored.pinned.filter((entry) => entry.basePath === basePath);
  const freeOpen = Boolean(free && !free.pinned);
  let target = route;
  if (!target) {
    if (freeOpen && free) target = free.route;
    else if (modulePins.length === 1) target = modulePins[0].route;
    else target = currentHref() || basePath;
  }
  const index = stored.pinned.findIndex((entry) => entry.basePath === basePath && entry.route === target);
  if (index >= 0 && !(freeOpen && !route)) {
    unpinStored(stored.pinned, index);
    return;
  }
  pinStored(basePath, target, stored.pinned);
}

function basePathOwns(basePath: string, href: string): boolean {
  const pathname = pathnameOf(href);
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

function attachPinnedTab(item: PinnedModuleTab, number: number): void {
  const id = pinnedTabId(item.basePath, number);
  const existing = hosts.get(id);
  if (existing && tabIsOpen(existing)) return;
  const nav = navApi();
  if (!nav) {
    const error = new Error('collabRuntimeNav3 is not available');
    console.error('[moduleTab]', error.message);
    throw error;
  }
  const div = document.createElement('div');
  div.style.cssText = 'display:block;width:100%;height:100%;';
  const host: ModuleTabHost = {
    id,
    basePath: item.basePath,
    div,
    route: item.route,
    title: moduleDisplayName(item.basePath),
    pinned: true,
    mounted: false,
  };
  hosts.set(id, host);
  nav.openTab({ id, title: host.title, element: div });
}

/** First activation renders the page. A tab that was already rendered stays as it is. */
export async function mountModuleTabOnActivate(id: string, importer?: RouteImporter): Promise<void> {
  const host = hosts.get(id);
  if (!host || host.mounted) return;
  try {
    rememberPage(host, await renderRoute(host.basePath, host.route, host.div, importer));
    host.mounted = true;
  } catch (error) {
    host.mounted = true;
    showTabError(host.div, error);
  }
}

export async function restorePinnedModuleTabs(importer?: RouteImporter): Promise<void> {
  const stored = readPinnedTabs();
  if (!stored.ok) return;
  const href = currentHref();
  if (bootOwns(href)) rememberShellRoute(href);
  restoringPins = true;
  try {
    const counts = new Map<string, number>();
    for (const item of stored.pinned) {
      const number = (counts.get(item.basePath) ?? 0) + 1;
      counts.set(item.basePath, number);
      attachPinnedTab(item, number);
    }
    const exact = [...hosts.values()].find((host) => host.pinned && tabIsOpen(host) && host.route === href);
    if (exact) {
      await mountModuleTabOnActivate(exact.id, importer);
      navApi()?.activateTab(exact.id);
      return;
    }
    if (bootOwns(href)) {
      navApi()?.activateTab('app');
      return;
    }
    const owner = [...counts.keys()]
      .filter((basePath) => basePathOwns(basePath, href))
      .sort((left, right) => right.length - left.length)[0];
    if (owner) {
      await openModuleTab(owner, href, importer);
      return;
    }
    navApi()?.activateTab('app');
  } finally {
    restoringPins = false;
  }
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

function tabIsOpen(host: ModuleTabHost | undefined): host is ModuleTabHost {
  const nav = window.collabRuntimeNav3;
  // `listTabs` is the truth: the shell updates it synchronously in `openTab` and `closeTab`. The div is NOT
  // required to be connected yet, because right after `openTab` Lit has not rendered it (first open).
  if (!host || !nav) return false;
  return nav.listTabs().includes(host.id);
}

/** The free tab of the module that owns `path`. A pinned tab is never the link target. */
export function findModuleTabForPath(path: string): { basePath: string; route: string } | undefined {
  const pathname = pathnameOf(path);
  let found: ModuleTabHost | undefined;
  for (const host of hosts.values()) {
    if (host.pinned || !tabIsOpen(host)) continue;
    if (pathname !== host.basePath && !pathname.startsWith(`${host.basePath}/`)) continue;
    if (!found || host.basePath.length > found.basePath.length) found = host;
  }
  return found ? { basePath: found.basePath, route: found.route } : undefined;
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
  const host = hosts.get(id);
  if (!host?.route) return;
  if (bootOwns(current)) rememberShellRoute(current);
  if (host.route !== current) window.history.replaceState({}, '', host.route);
}

function exactPinnedHost(href: string): ModuleTabHost | undefined {
  let found: ModuleTabHost | undefined;
  for (const host of hosts.values()) {
    if (!host.pinned || !tabIsOpen(host) || host.route !== href) continue;
    if (!found || host.basePath.length > found.basePath.length) found = host;
  }
  return found;
}

/** Back/forward: an exact pinned route activates that pin. Any other link stays on the free tab. */
export async function revealModuleTabForLocation(href: string): Promise<boolean> {
  if (bootOwns(href)) return false;
  const pinned = exactPinnedHost(href);
  if (pinned) {
    await mountModuleTabOnActivate(pinned.id);
    window.collabRuntimeNav3?.activateTab(pinned.id);
    return true;
  }
  const tab = findModuleTabForPath(href);
  if (!tab) return false;
  if (tab.route !== href) await navigateModuleTab(tab.basePath, href);
  window.collabRuntimeNav3?.activateTab(freeTabId(tab.basePath));
  return true;
}

export async function navigateModuleTab(
  basePath: string,
  route: string,
  importer?: RouteImporter,
): Promise<void> {
  const host = hosts.get(freeTabId(basePath));
  if (!host || host.pinned) {
    const error = new Error(`Module tab is not open for ${basePath}`);
    console.error('[moduleTab]', error.message);
    throw error;
  }
  try {
    rememberPage(host, await renderRoute(basePath, route, host.div, importer));
    host.route = route;
    host.mounted = true;
  } catch (error) {
    host.route = route;
    host.mounted = true;
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
  const id = freeTabId(basePath);
  const existing = hosts.get(id);
  if (tabIsOpen(existing)) {
    if (existing.route !== route) await navigateModuleTab(basePath, route, importer);
    nav.activateTab(id);
    return;
  }
  hosts.delete(id);
  const div = document.createElement('div');
  div.style.cssText = 'display:block;width:100%;height:100%;';
  const host: ModuleTabHost = {
    id,
    basePath,
    div,
    route,
    title: moduleDisplayName(basePath),
    pinned: false,
    mounted: false,
  };
  hosts.set(id, host);
  try {
    rememberPage(host, await renderRoute(basePath, route, div, importer));
    host.mounted = true;
  } catch (error) {
    host.mounted = true;
    showTabError(div, error);
  }
  nav.openTab({ id, title: host.title, element: div });
  if (moduleTabOpenActivates()) syncHistoryForContentTab(id);
}
