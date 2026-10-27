/// <mls fileReference="_102033_/l2/cbe/studioDraft.ts" enhancement="_blank" />
// Default draft cookie for Studio on a VM project. The server reads `collab-draft`
// on /exec (st05); the name and the attribute string are the contract.

import { getRuntimeLanguage } from '/_102033_/l2/shared/languageRuntime.js';

const DRAFT_SLUG = /^(team|user)-[a-z0-9_.-]{1,64}$/;

/** Local view of mls: `studio` lives in l5/config.json and is not on the lib type. */
interface DraftMls {
  stor: {
    others: {
      getDefaultDriver: (project: number) => Promise<{ driverVersion?: string } | null | undefined>;
    };
  };
  l5: {
    getProjectConf: (project: number) => Promise<{ studio?: { defaultDraft?: string } } | null | undefined>;
  };
}

export function readDraftCookie(cookieString: string): string | undefined {
  if (!cookieString) return undefined;
  for (const part of cookieString.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== 'collab-draft') continue;
    const value = trimmed.slice(eq + 1).trim();
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}

export function buildDraftCookie(slug: string, secure: boolean): string {
  const cookie = `collab-draft=${slug}; Path=/; SameSite=Lax`;
  return secure ? `${cookie}; Secure` : cookie;
}

export function defaultDraftFor(project: number, defaultDraft?: string): string {
  if (defaultDraft !== undefined && DRAFT_SLUG.test(defaultDraft)) return defaultDraft;
  return `team-${project}`;
}

export function isVmDriver(driver: { driverVersion?: string } | null | undefined): boolean {
  const version = driver?.driverVersion;
  return typeof version === 'string' && version.startsWith('1.0.0-vm');
}

export interface EnsuredDraftCookie {
  slug: string | null;
  changed: boolean;
}

function currentDraftSlug(): string | null {
  return readDraftCookie(document.cookie ?? '') ?? null;
}

export async function ensureDefaultDraftCookie(project: number): Promise<EnsuredDraftCookie> {
  const unchanged = (): EnsuredDraftCookie => ({ slug: currentDraftSlug(), changed: false });
  try {
    const api = mls as unknown as DraftMls;
    let driver: { driverVersion?: string } | null | undefined;
    try {
      driver = await api.stor.others.getDefaultDriver(project);
    } catch (err) {
      console.warn('[studioDraft] getDefaultDriver failed; draft cookie not set:', err);
      return unchanged();
    }
    if (!isVmDriver(driver)) return unchanged();

    const before = currentDraftSlug();
    let configured: string | undefined;
    if (!before) {
      try {
        const conf = await api.l5.getProjectConf(project);
        configured = conf?.studio?.defaultDraft;
      } catch (err) {
        console.warn('[studioDraft] getProjectConf failed; using team draft:', err);
      }
    }
    const slug = before ?? defaultDraftFor(project, configured);

    let detail: string;
    try {
      const response = await fetch(
        '/desenv?draft=' + encodeURIComponent(slug) + '&to=/',
        { redirect: 'manual', credentials: 'same-origin' },
      );
      const accepted =
        response.type === 'opaqueredirect' ||
        (response.status >= 200 && response.status < 300) ||
        response.status === 302;
      const after = currentDraftSlug();
      if (accepted && after) return { slug: after, changed: before !== after };
      detail = String(response.status);
    } catch (err) {
      detail = err instanceof Error ? err.message : String(err);
    }
    console.warn('[studio] rascunho indisponível: ' + detail);
    if (before) {
      try {
        await fetch('/desenv/sair', { redirect: 'manual', credentials: 'same-origin' });
      } catch (err) {
        console.warn('[studio] rascunho indisponível: ' + (err instanceof Error ? err.message : String(err)));
      }
    }
    return { slug: null, changed: false };
  } catch (err) {
    console.warn('[studioDraft] ensureDefaultDraftCookie failed:', err);
    return { slug: null, changed: false };
  }
}

/** Shown when a page outside Studio is still served from a draft. */
export interface DraftNotice {
  slug: string;
  href: string;
}

export interface DraftNoticeText {
  seeing: string;
  viewProduction: string;
}

const DRAFT_NOTICE_TEXT = {
  en: {
    seeing: 'You are seeing the draft {slug}.',
    viewProduction: 'View production',
  },
  pt: {
    seeing: 'Você está vendo o rascunho {slug}.',
    viewProduction: 'Ver a produção',
  },
} as const;

export function draftNotice(cookieString: string, studioModeOn: boolean, path: string): DraftNotice | null {
  if (studioModeOn) return null;
  const slug = readDraftCookie(cookieString);
  if (!slug) return null;
  return { slug, href: '/desenv/sair?to=' + encodeURIComponent(path) };
}

export function draftNoticeText(slug: string): DraftNoticeText {
  const language = getRuntimeLanguage(Object.keys(DRAFT_NOTICE_TEXT), document.documentElement.lang || 'en');
  const row = DRAFT_NOTICE_TEXT[language as keyof typeof DRAFT_NOTICE_TEXT] ?? DRAFT_NOTICE_TEXT.en;
  return {
    seeing: row.seeing.replace('{slug}', slug),
    viewProduction: row.viewProduction,
  };
}

export type CollabRunMode = 'studio' | 'production';

export interface DraftEnterResponse {
  statusCode: number;
  ok: boolean;
  slug?: string;
  head?: string;
}

export interface EnterDraftDeps {
  postExec: (body: { action: 'draftEnter'; project: number; draft: string }) => Promise<unknown>;
}

export type ServiceWorkerSetModeMessage =
  | { action: 'setMode'; mode: 'production' }
  | { action: 'setMode'; mode: 'studio'; project: number; draft: string };

export interface ServiceWorkerModeDeps {
  controller?: { postMessage: (message: unknown, transfer: Transferable[]) => void };
  MessageChannel: new () => MessageChannel;
  timeoutMs?: number;
}

export interface RequestModeChangeDeps {
  project: number;
  resolveDraft: (project: number) => Promise<string>;
  enterDraft: (project: number, slug: string) => Promise<DraftEnterResponse>;
  sendToServiceWorker: (message: ServiceWorkerSetModeMessage) => Promise<unknown>;
  reportError: (message: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Slug the shell sends with `draftEnter`: `studio.defaultDraft` when it is valid, otherwise `team-<project>`. */
export async function resolveDefaultDraft(
  project: number,
  deps: { getProjectConf: (project: number) => Promise<{ studio?: { defaultDraft?: string } } | null | undefined> },
): Promise<string> {
  let configured: string | undefined;
  try {
    const conf = await deps.getProjectConf(project);
    configured = conf?.studio?.defaultDraft;
  } catch (err) {
    console.warn('[studioDraft] getProjectConf failed; using team draft:', err);
  }
  return defaultDraftFor(project, configured);
}

export function resolveDefaultDraftFromMls(project: number): Promise<string> {
  const api = mls as unknown as DraftMls;
  return resolveDefaultDraft(project, {
    getProjectConf: (prj) => api.l5.getProjectConf(prj),
  });
}

/**
 * `POST /exec` `{action:'draftEnter', project, draft}`.
 * Same request shape as `studioDraftFiles` `postExec`. The server may not be published yet:
 * callers inject `postExec` (tests pass a fake).
 */
export async function postDraftEnter(body: { action: 'draftEnter'; project: number; draft: string }): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch('/exec', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(errorText(err));
  }
  try {
    return await response.json();
  } catch (err) {
    throw new Error(errorText(err));
  }
}

export async function enterDraft(project: number, slug: string, deps: EnterDraftDeps): Promise<DraftEnterResponse> {
  if (!Number.isInteger(project) || project < 1) {
    console.error('[studioDraft] draftEnter: invalid project:', project);
    return { statusCode: 400, ok: false };
  }
  if (!DRAFT_SLUG.test(slug)) {
    console.error('[studioDraft] draftEnter: invalid slug:', slug);
    return { statusCode: 400, ok: false };
  }
  let parsed: unknown;
  try {
    parsed = await deps.postExec({ action: 'draftEnter', project, draft: slug });
  } catch (err) {
    console.error('[studioDraft] draftEnter failed:', errorText(err));
    return { statusCode: 0, ok: false };
  }
  if (!isRecord(parsed) || parsed.ok !== true) {
    const statusCode = isRecord(parsed) && typeof parsed.statusCode === 'number' ? parsed.statusCode : 0;
    console.error('[studioDraft] draftEnter rejected:', statusCode);
    return { statusCode, ok: false };
  }
  const statusCode = typeof parsed.statusCode === 'number' ? parsed.statusCode : 200;
  if (statusCode < 200 || statusCode >= 300) {
    console.error('[studioDraft] draftEnter rejected:', statusCode);
    return { statusCode, ok: false };
  }
  const returned = typeof parsed.slug === 'string' && DRAFT_SLUG.test(parsed.slug) ? parsed.slug : slug;
  const response: DraftEnterResponse = { statusCode, ok: true, slug: returned };
  if (typeof parsed.head === 'string') response.head = parsed.head;
  return response;
}

function browserServiceWorkerModeDeps(): ServiceWorkerModeDeps {
  return {
    controller: navigator.serviceWorker?.controller ?? undefined,
    MessageChannel: globalThis.MessageChannel,
  };
}

/** One round-trip on `ports[0]` (MessageChannel). Reply is the mode state, or `"Error: <cause>"`. */
export function sendServiceWorkerMode(
  message: ServiceWorkerSetModeMessage,
  deps: ServiceWorkerModeDeps = browserServiceWorkerModeDeps(),
): Promise<unknown> {
  const controller = deps.controller;
  if (!controller) {
    return Promise.reject(new Error('service worker controller is not available'));
  }
  const channel = new deps.MessageChannel();
  const timeoutMs = deps.timeoutMs ?? 3000;
  // Node keeps the process alive while a port is open. The browser has no `unref`.
  const nodePort = channel.port1 as MessagePort & { unref?: () => void };
  nodePort.unref?.();
  (channel.port2 as MessagePort & { unref?: () => void }).unref?.();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error('service worker setMode timed out'));
    }, timeoutMs);
    channel.port1.onmessage = (event: MessageEvent) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data);
    };
    channel.port1.start();
    try {
      controller.postMessage(message, [channel.port2]);
    } catch (err) {
      clearTimeout(timer);
      channel.port1.close();
      reject(err instanceof Error ? err : new Error(errorText(err)));
    }
  });
}

function isModeReply(reply: unknown, mode: CollabRunMode): boolean {
  return isRecord(reply) && reply.mode === mode;
}

/**
 * Studio: `draftEnter`, then `{action:'setMode', mode:'studio', project, draft}`.
 * Production: only `{action:'setMode', mode:'production'}`.
 * A service-worker `"Error: …"` leaves the mode unchanged.
 */
export async function requestModeChange(
  current: CollabRunMode,
  next: CollabRunMode,
  deps: RequestModeChangeDeps,
): Promise<{ mode: CollabRunMode }> {
  let message: ServiceWorkerSetModeMessage;
  if (next === 'production') {
    message = { action: 'setMode', mode: 'production' };
  } else {
    if (!Number.isInteger(deps.project) || deps.project < 1) {
      deps.reportError(`[shell] setMode: project is not available (${deps.project})`);
      return { mode: current };
    }
    let slug: string;
    try {
      slug = await deps.resolveDraft(deps.project);
    } catch (err) {
      deps.reportError(`[shell] setMode: draft slug failed: ${errorText(err)}`);
      return { mode: current };
    }
    if (!DRAFT_SLUG.test(slug)) {
      deps.reportError(`[shell] setMode: draft slug is invalid: ${slug}`);
      return { mode: current };
    }
    const entered = await deps.enterDraft(deps.project, slug);
    if (!entered.ok || !entered.slug) {
      deps.reportError(`[shell] draftEnter failed: ${entered.statusCode}`);
      return { mode: current };
    }
    message = { action: 'setMode', mode: 'studio', project: deps.project, draft: entered.slug };
  }
  let reply: unknown;
  try {
    reply = await deps.sendToServiceWorker(message);
  } catch (err) {
    deps.reportError(`[shell] setMode: ${errorText(err)}`);
    return { mode: current };
  }
  if (typeof reply === 'string') {
    deps.reportError(reply);
    return { mode: current };
  }
  if (!isModeReply(reply, next)) {
    deps.reportError('[shell] setMode: unexpected service worker reply');
    return { mode: current };
  }
  return { mode: next };
}

export function readCollabModeNotice(data: unknown): { mode: CollabRunMode; project?: number; draft?: string } | null {
  if (!isRecord(data) || data.type !== 'collab-mode') return null;
  if (data.mode !== 'studio' && data.mode !== 'production') return null;
  const notice: { mode: CollabRunMode; project?: number; draft?: string } = { mode: data.mode };
  if (typeof data.project === 'number') notice.project = data.project;
  if (typeof data.draft === 'string') notice.draft = data.draft;
  return notice;
}

/**
 * Mode broadcast from the service worker: the mode to show here. The caller applies it locally and
 * must not call `setMode` (that would echo the change back to the service worker).
 */
export function applyCollabModeNotice(current: CollabRunMode, data: unknown): CollabRunMode {
  const notice = readCollabModeNotice(data);
  if (!notice) return current;
  return notice.mode;
}
