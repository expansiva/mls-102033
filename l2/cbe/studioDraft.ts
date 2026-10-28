/// <mls fileReference="_102033_/l2/cbe/studioDraft.ts" enhancement="_blank" />

const DRAFT_SLUG = /^(team|user)-[a-z0-9_.-]{1,64}$/;

/** Local view of mls: `studio` lives in l5/config.json and is not on the lib type. */
interface DraftMls {
  l5: {
    getProjectConf: (project: number) => Promise<{ studio?: { defaultDraft?: string } } | null | undefined>;
  };
}

export function defaultDraftFor(project: number, defaultDraft?: string): string {
  if (defaultDraft !== undefined && DRAFT_SLUG.test(defaultDraft)) return defaultDraft;
  return `team-${project}`;
}

export function isVmDriver(driver: { driverVersion?: string } | null | undefined): boolean {
  const version = driver?.driverVersion;
  return typeof version === 'string' && version.startsWith('1.0.0-vm');
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

export type ServiceWorkerModeMessage = ServiceWorkerSetModeMessage | { action: 'getMode' };

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
  message: ServiceWorkerModeMessage,
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
      reject(new Error(`service worker ${message.action} timed out`));
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

/** What the service worker last told this tab. Memory only: not storage, not a cookie. */
export interface CollabModeState {
  mode: CollabRunMode;
  project?: number;
  draft?: string;
}

let modeMirror: CollabModeState = { mode: 'production' };

export function modeState(): CollabModeState {
  const state: CollabModeState = { mode: modeMirror.mode };
  if (modeMirror.project !== undefined) state.project = modeMirror.project;
  if (modeMirror.draft !== undefined) state.draft = modeMirror.draft;
  return state;
}

/** Draft slug while the tab is in studio. Production has none. */
export function activeDraft(): string | undefined {
  if (modeMirror.mode !== 'studio') return undefined;
  return modeMirror.draft;
}

/** Replaces the mirror. A production state keeps no draft slug. */
export function rememberCollabMode(state: CollabModeState): void {
  const next: CollabModeState = { mode: state.mode === 'studio' ? 'studio' : 'production' };
  if (typeof state.project === 'number') next.project = state.project;
  if (next.mode === 'studio' && typeof state.draft === 'string' && state.draft.length > 0) next.draft = state.draft;
  modeMirror = next;
}

function collabModeStateFromReply(reply: unknown): CollabModeState | null {
  if (!isRecord(reply)) return null;
  if (reply.mode !== 'studio' && reply.mode !== 'production') return null;
  const state: CollabModeState = { mode: reply.mode };
  if (typeof reply.project === 'number') state.project = reply.project;
  if (typeof reply.draft === 'string') state.draft = reply.draft;
  return state;
}

/**
 * One service-worker reply applied to the mirror.
 * A failure (`Error`, `"Error: …"`, or an unreadable body) is logged and the tab stays in production.
 */
export function applyRecordedModeReply(reply: unknown, reportError: (message: string) => void): CollabModeState {
  if (reply instanceof Error) {
    reportError(`[studioDraft] getMode: ${reply.message}`);
    rememberCollabMode({ mode: 'production' });
    return modeState();
  }
  if (typeof reply === 'string') {
    reportError(reply);
    rememberCollabMode({ mode: 'production' });
    return modeState();
  }
  const parsed = collabModeStateFromReply(reply);
  if (!parsed) {
    reportError('[studioDraft] getMode: unexpected service worker reply');
    rememberCollabMode({ mode: 'production' });
    return modeState();
  }
  rememberCollabMode(parsed);
  return modeState();
}

export interface LoadRecordedModeDeps {
  send: (message: { action: 'getMode' }) => Promise<unknown>;
  reportError: (message: string) => void;
  /** When this is false after the reply, a newer mode already won and the mirror is put back. */
  stillCurrent?: () => boolean;
}

/** Boot query `{action:'getMode'}` so the tab is born in the mode the service worker stored. */
export async function loadRecordedMode(deps: LoadRecordedModeDeps): Promise<CollabModeState> {
  let reply: unknown;
  try {
    reply = await deps.send({ action: 'getMode' });
  } catch (err) {
    reply = err instanceof Error ? err : new Error(errorText(err));
  }
  const previous = modeState();
  const state = applyRecordedModeReply(reply, deps.reportError);
  if (deps.stillCurrent && !deps.stillCurrent()) {
    rememberCollabMode(previous);
    return modeState();
  }
  return state;
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
  const parsed = collabModeStateFromReply(reply);
  if (!parsed || parsed.mode !== next) {
    deps.reportError('[shell] setMode: unexpected service worker reply');
    return { mode: current };
  }
  rememberCollabMode(parsed);
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
  rememberCollabMode(notice);
  return notice.mode;
}
