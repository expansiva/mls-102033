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

const bootCache = new Map<string, MasterFrontendBootConfig>();
const hosts = new Map<string, ModuleTabHost>();

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

async function loadBoot(basePath: string): Promise<MasterFrontendBootConfig> {
  const cached = bootCache.get(basePath);
  if (cached) return cached;
  const response = await fetch(`/_moduleBoot?basePath=${encodeURIComponent(basePath)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
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

function tabIsOpen(basePath: string): ModuleTabHost | undefined {
  const host = hosts.get(basePath);
  const nav = window.collabRuntimeNav3;
  if (!host || !nav || !host.div.isConnected) return undefined;
  if (!nav.listTabs().includes(tabId(basePath))) return undefined;
  return host;
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
  } catch (error) {
    host.route = route;
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
}
