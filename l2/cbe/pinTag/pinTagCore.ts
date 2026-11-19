/// <mls fileReference="_102033_/l2/cbe/pinTag/pinTagCore.ts" enhancement="_blank" />
// PinTag: client comments pinned to elements of the running app (collabMyFiles/pinTagIdeia.md).
//
// This module is the part that loads EARLY and stays small: the pin type, the storage, the screen
// lookup, export/import and the Ctrl+Shift+P shortcut. The interface itself (pinTagMode.ts) is only
// imported the first time the client enters the mode.
//
// Demo phase: the pins live in localStorage (`collab:pins:<project>`). The pin format is already the
// one a future task needs: turning a pin into a task changes WHERE it is written, not the pin.

import { matchAuraRoute } from '/_102033_/l2/shared/routeRuntime.js';
import { siteProjectFromBoot } from '/_102033_/l2/shared/siteProject.js';
import type { MasterFrontendRouteDefinition } from '/_102033_/l2/shared/contracts/bootstrap.js';

export type PinKind = 'bug' | 'suggestion' | 'question';
export type PinStatus = 'open' | 'resolved';

export const PIN_KINDS: readonly PinKind[] = ['bug', 'suggestion', 'question'];
export const PIN_VERSION = 1;

export interface IPinAuthor { id: string; label: string }

export interface IPinScreen {
  project: number;
  module: string;
  /** The registered route serving the URL, WITHOUT params: `/x/detalhe/42` and `/x/detalhe/7` are one screen. */
  route: string;
  /** The full URL (path + query + hash), to go back exactly to it. */
  href: string;
  title: string;
}

export interface IPinTarget {
  /** Project tags from the page down to the clicked element (tags ending in `-<project>`). */
  chain: string[];
  /** Path from the nearest chain component down to the element. Empty when the element is that component. */
  selector: string;
  /** Where the pin sits inside the element, as a fraction of its width and height. */
  offset: { x: number; y: number };
  label: string;
}

export interface IPinTag {
  id: string;
  version: number;
  kind: PinKind;
  text: string;
  status: PinStatus;
  createdAt: string;
  updatedAt: string;
  author: IPinAuthor;
  screen: IPinScreen;
  target: IPinTarget;
  context: { viewport: string; device: string };
}

/** The subset of Storage the pins use. Lets the tests pass a fake, or a throwing one. */
export interface IPinStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface IPinReadResult {
  pins: IPinTag[];
  /** False when the storage could not be read (private window, blocked site data). */
  ok: boolean;
}

export function pinStorageKey(project: number): string {
  return `collab:pins:${project}`;
}

// ─── Validation ─────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function fraction(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/**
 * Reads one pin from untrusted JSON (storage edited by hand, an imported file).
 * Returns undefined when the pin cannot be placed or identified; fills the rest with defaults.
 */
export function parsePin(value: unknown): IPinTag | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id);
  if (!id) return undefined;
  const screen = isRecord(value.screen) ? value.screen : undefined;
  const target = isRecord(value.target) ? value.target : undefined;
  if (!screen || !target) return undefined;
  const route = str(screen.route);
  if (!route) return undefined;
  const chain = Array.isArray(target.chain) ? target.chain.filter((t): t is string => typeof t === 'string' && t.length > 0) : [];
  if (chain.length === 0) return undefined;
  const offset = isRecord(target.offset) ? target.offset : {};
  const author = isRecord(value.author) ? value.author : {};
  const context = isRecord(value.context) ? value.context : {};
  const kind = PIN_KINDS.includes(value.kind as PinKind) ? value.kind as PinKind : 'suggestion';
  const createdAt = str(value.createdAt, new Date(0).toISOString());
  return {
    id,
    version: typeof value.version === 'number' ? value.version : PIN_VERSION,
    kind,
    text: str(value.text),
    status: value.status === 'resolved' ? 'resolved' : 'open',
    createdAt,
    updatedAt: str(value.updatedAt, createdAt),
    author: { id: str(author.id, 'anon'), label: str(author.label, '-') },
    screen: {
      project: typeof screen.project === 'number' ? screen.project : 0,
      module: str(screen.module),
      route,
      href: str(screen.href, route),
      title: str(screen.title),
    },
    target: {
      chain,
      selector: str(target.selector),
      offset: { x: fraction(offset.x), y: fraction(offset.y) },
      label: str(target.label),
    },
    context: { viewport: str(context.viewport), device: str(context.device) },
  };
}

/** A list of pins from JSON. Invalid JSON, a non-array or invalid entries give fewer pins, never a throw. */
export function parsePinList(json: string | null): IPinTag[] {
  if (!json) return [];
  let data: unknown;
  try { data = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const pins: IPinTag[] = [];
  for (const item of data) {
    const pin = parsePin(item);
    if (!pin || seen.has(pin.id)) continue;
    seen.add(pin.id);
    pins.push(pin);
  }
  return pins;
}

// ─── Storage ────────────────────────────────────────────────────────────────

/** The browser storage, or null when even touching it throws. */
export function browserPinStorage(): IPinStorage | null {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

export function readPins(storage: IPinStorage | null, project: number): IPinReadResult {
  if (!storage) return { pins: [], ok: false };
  try {
    return { pins: parsePinList(storage.getItem(pinStorageKey(project))), ok: true };
  } catch {
    return { pins: [], ok: false };
  }
}

/** Returns false when the write failed (blocked storage, quota). */
export function writePins(storage: IPinStorage | null, project: number, pins: readonly IPinTag[]): boolean {
  if (!storage) return false;
  try {
    storage.setItem(pinStorageKey(project), JSON.stringify(pins));
    return true;
  } catch {
    return false;
  }
}

// ─── Filters ────────────────────────────────────────────────────────────────

export function pinsForScreen(pins: readonly IPinTag[], route: string): IPinTag[] {
  return pins.filter((pin) => pin.screen.route === route);
}

export interface IPinScreenGroup {
  module: string;
  route: string;
  title: string;
  pins: IPinTag[];
}

/** Pins of the other screens, grouped by module and route, in first-seen order. */
export function groupOtherScreens(pins: readonly IPinTag[], route: string): IPinScreenGroup[] {
  const groups = new Map<string, IPinScreenGroup>();
  for (const pin of pins) {
    if (pin.screen.route === route) continue;
    const key = `${pin.screen.module}\u0000${pin.screen.route}`;
    let group = groups.get(key);
    if (!group) {
      group = { module: pin.screen.module, route: pin.screen.route, title: pin.screen.title, pins: [] };
      groups.set(key, group);
    }
    group.pins.push(pin);
  }
  return [...groups.values()];
}

// ─── Export / import ────────────────────────────────────────────────────────

export function exportPins(pins: readonly IPinTag[]): string {
  return JSON.stringify(pins, null, 2);
}

export interface IPinImportResult {
  pins: IPinTag[];
  added: number;
  /** False when the file is not a JSON list. */
  ok: boolean;
}

/** Joins the imported pins by `id`: a pin already here is kept as is, a new one is added. */
export function importPins(existing: readonly IPinTag[], json: string): IPinImportResult {
  let data: unknown;
  try { data = JSON.parse(json); } catch { return { pins: [...existing], added: 0, ok: false }; }
  if (!Array.isArray(data)) return { pins: [...existing], added: 0, ok: false };
  const ids = new Set(existing.map((pin) => pin.id));
  const pins = [...existing];
  let added = 0;
  for (const pin of parsePinList(json)) {
    if (ids.has(pin.id)) continue;
    ids.add(pin.id);
    pins.push(pin);
    added++;
  }
  return { pins, added, ok: true };
}

// ─── Ids ────────────────────────────────────────────────────────────────────

export function newPinId(random: () => number = Math.random): string {
  let id = '';
  for (let i = 0; i < 8; i++) id += Math.floor(random() * 16).toString(16);
  return `pin_${id}`;
}

// ─── Current screen ─────────────────────────────────────────────────────────

interface IBootLike {
  projectId?: string | number;
  clientProjectId?: string | number;
  moduleId?: string;
  routes?: MasterFrontendRouteDefinition[];
}

export interface ILocationLike { pathname: string; search: string; hash: string }

/**
 * The screen a URL shows: the registered route (no params) when the boot knows it, else the path
 * itself. A module tab of another module is not in this boot's routes, so it falls back to its path.
 */
export function screenFor(boot: IBootLike | undefined, location: ILocationLike, documentTitle = ''): IPinScreen {
  const project = siteProjectFromBoot(boot);
  const routes = Array.isArray(boot?.routes) ? boot.routes : [];
  const match = routes.length ? matchAuraRoute(routes, location.pathname) : undefined;
  const route = match?.path ?? location.pathname;
  const firstSegment = route.split('/').filter(Boolean)[0] ?? '';
  return {
    project,
    module: match && boot?.moduleId ? boot.moduleId : firstSegment,
    route,
    href: `${location.pathname}${location.search}${location.hash}`,
    title: match?.title || documentTitle || route,
  };
}

export function currentScreen(): IPinScreen {
  const boot = (window as { collabBoot?: IBootLike }).collabBoot;
  return screenFor(boot, window.location, document.title);
}

/** The site project the pins belong to. 0 when the boot has none. */
export function currentPinProject(): number {
  return siteProjectFromBoot((window as { collabBoot?: IBootLike }).collabBoot);
}

// ─── Mode toggle and shortcut ───────────────────────────────────────────────

const SHORTCUT_KEY = 'P';

/** Loads the interface on first use, then enters or leaves the mode. */
export async function togglePinTagMode(): Promise<void> {
  try {
    const mode = await import('/_102033_/l2/cbe/pinTag/pinTagMode.js');
    mode.togglePinTagMode();
  } catch (error) {
    console.error('[pinTag] mode failed to load', error);
  }
}

/** Ctrl+Shift+P, only the plain combination: Alt and Meta belong to other shortcuts. */
export function isPinTagShortcut(ev: { ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean; key: unknown }): boolean {
  return ev.ctrlKey && ev.shiftKey && !ev.altKey && !ev.metaKey
    && typeof ev.key === 'string' && ev.key.toUpperCase() === SHORTCUT_KEY;
}

/**
 * Installs only the shortcut — once per page. Called at module load, like the report bug's
 * Ctrl+Shift+B. Firefox may keep Ctrl+Shift+P for its private window; the menu item still works.
 */
export function installPinTag(): void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  const w = window as unknown as { __collabPinTagInstalled?: boolean };
  if (w.__collabPinTagInstalled) return;
  w.__collabPinTagInstalled = true;
  window.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (!isPinTagShortcut(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    void togglePinTagMode();
  }, true);
}

installPinTag();
