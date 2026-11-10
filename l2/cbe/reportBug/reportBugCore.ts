/// <mls fileReference="_102033_/l2/cbe/reportBug/reportBugCore.ts" enhancement="_blank" />
// Bug report capture for the client app (ported from _100554_/l2/serviceReportBug).
//
// This module is the part that must run EARLY and stay small: the console/error/network collectors,
// the Ctrl+Shift+B shortcut and the "Open" listener of a ```BUG block in the chat. The panel itself
// (reportBug.ts) is only imported when a report is opened, so a client session that never reports a
// bug never loads it.
//
// The panel opens in a nav3 content tab (collabRuntimeNav3.openTab), next to the app tab.

export interface IConsoleEntry { ts: string; level: string; text: string }
export interface INetworkEntry { ts: string; method: string; url: string; status: number | string; durationMs: number }
export interface IFileRef { project?: number; shortName?: string; folder?: string; extension?: string }

export interface IMlsSnapshot {
  actualProject?: number;
  actualLevel?: number;
  actualService?: string;
  actualPosition?: string;
  actualModule?: string;
  actual: Array<{ level: number; project?: number; path?: string; left?: IFileRef; right?: IFileRef }>;
}

/** Injected by the app server (startServer, mls-102034) when the page loads. */
export interface IBootSnapshot { collabBoot?: unknown; collabFecho?: unknown }

export interface IBugSnapshot {
  capturedAt: string;
  user: string;
  href: string;
  userAgent: string;
  viewport: string;
  mls: IMlsSnapshot;
  boot?: IBootSnapshot;
  console: IConsoleEntry[];
  network: INetworkEntry[];
  screenshot?: string;
}

export type IBugView = IBugSnapshot & { description?: string };

export const REPORT_TAB_ID = 'report-bug';
export const REPORT_VIEW_TAB_ID = 'report-bug-view';

const CONSOLE_CAP = 200;
const CONSOLE_ENTRY_MAX_CHARS = 2000;
/** What goes in the message: the chat stores it, so the whole buffer (up to ~400 KB) is too much. */
export const CONSOLE_SEND = 50;
const NETWORK_CAP = 30;
const NETWORK_SEND = 10;
const SCREENSHOT_JPEG_QUALITY = 0.7;
const SHORTCUT_KEY = 'B';

const consoleBuffer: IConsoleEntry[] = [];
const networkBuffer: INetworkEntry[] = [];
let lastSnapshot: IBugSnapshot | undefined;
let capturing = false;

export function getLastSnapshot(): IBugSnapshot | undefined {
  return lastSnapshot;
}

function nowIso(): string { return new Date().toISOString(); }

function pushCapped<T>(buffer: T[], entry: T, cap: number): void {
  buffer.push(entry);
  if (buffer.length > cap) buffer.splice(0, buffer.length - cap);
}

function safeText(args: unknown[]): string {
  const text = args.map((a) => {
    if (typeof a === 'string') return a;
    if (a instanceof Error) return `${a.message}\n${a.stack || ''}`;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
  return text.length > CONSOLE_ENTRY_MAX_CHARS ? `${text.slice(0, CONSOLE_ENTRY_MAX_CHARS)}[truncated]` : text;
}

function pushConsole(level: string, args: unknown[]): void {
  try { pushCapped(consoleBuffer, { ts: nowIso(), level, text: safeText(args) }, CONSOLE_CAP); } catch { }
}

function installErrorListeners(): void {
  // Uncaught errors are observed, not wrapped: DevTools attribution stays intact.
  window.addEventListener('error', (ev: ErrorEvent) => {
    pushConsole('uncaught', [ev.error || ev.message, `at ${ev.filename}:${ev.lineno}:${ev.colno}`]);
  });
  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    pushConsole('unhandledrejection', [ev.reason]);
  });
}

function installConsoleInterceptor(): void {
  // Only warn/error are wrapped (log stays untouched). The wrapper is compiled as a
  // separate script whose sourceURL contains /node_modules/, which Chrome DevTools
  // ignore-lists by default, so the console link points to the real caller.
  const source = `return function (push) {
    ['warn', 'error'].forEach(function (method) {
        var original = console[method];
        if (typeof original !== 'function') return;
        console[method] = function () {
            try { push(method, Array.prototype.slice.call(arguments)); } catch (e) { }
            return original.apply(console, arguments);
        };
    });
};
//# sourceURL=/node_modules/collab-bug-report/consoleInterceptor.js`;
  try {
    (new Function(source))()(pushConsole);
  } catch {
    // CSP without unsafe-eval: skip the wrapper, error listeners still apply.
  }
}

/** Resource Timing reports 0 for a failed request (or cross-origin without Timing-Allow-Origin). */
export function networkStatus(responseStatus: unknown): number | string {
  if (typeof responseStatus !== 'number') return '-'; // Chrome < 109
  return responseStatus === 0 ? 'failed' : responseStatus;
}

function installNetworkObserver(): void {
  // Reads the browser's Resource Timing instead of patching fetch/XHR, so the
  // Initiator column in the Network panel keeps pointing to the real caller.
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    new PerformanceObserver((list) => {
      (list.getEntries() as PerformanceResourceTiming[]).forEach((e) => {
        if (e.initiatorType !== 'fetch' && e.initiatorType !== 'xmlhttprequest') return;
        pushCapped(networkBuffer, {
          ts: new Date(performance.timeOrigin + e.startTime).toISOString(),
          method: '-', // not exposed by Resource Timing
          url: e.name,
          status: networkStatus((e as PerformanceResourceTiming & { responseStatus?: number }).responseStatus),
          durationMs: Math.round(e.duration),
        }, NETWORK_CAP);
      });
    }).observe({ type: 'resource', buffered: true });
  } catch { }
}

function installShortcutListener(): void {
  window.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (!ev.ctrlKey || !ev.shiftKey || typeof ev.key !== 'string' || ev.key.toUpperCase() !== SHORTCUT_KEY) return;
    ev.preventDefault();
    ev.stopPropagation();
    void captureAndOpenReportBug();
  }, true);
}

function installOpenViewListener(): void {
  // Fired by collab-messages-rich-preview-text-102025 when the user clicks
  // "Open" on a ```BUG code block in the chat.
  window.addEventListener('collab-bug-report-open', ((ev: CustomEvent<{ json?: string }>) => {
    void openReportBugView(ev.detail?.json || '');
  }) as EventListener);
}

/**
 * Installs the collectors, the shortcut and the chat listener — once per page.
 *
 * Called at module load: errors from the boot are the most useful ones and happen before any service
 * is instanced.
 */
export function installReportBug(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __collabBugReportInstalled?: boolean };
  if (w.__collabBugReportInstalled) return;
  w.__collabBugReportInstalled = true;
  installErrorListeners();
  installConsoleInterceptor();
  installNetworkObserver();
  installShortcutListener();
  installOpenViewListener();
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

type MlsLike = {
  actual?: unknown[];
  actualProject?: number;
  actualLevel?: number;
  actualService?: string;
  actualPosition?: string;
  actualModule?: string;
  getActualUser?: () => string;
};

/** A client session without the studio bootstrap has no `mls` at all. */
function mlsGlobal(): MlsLike | undefined {
  return (globalThis as unknown as { mls?: MlsLike }).mls;
}

function serializeFileRef(f: any): IFileRef | undefined {
  if (!f || typeof f !== 'object') return undefined;
  return { project: f.project, shortName: f.shortName, folder: f.folder, extension: f.extension };
}

function snapshotMls(): IMlsSnapshot {
  const g = mlsGlobal();
  const actual = (Array.isArray(g?.actual) ? g.actual : []).map((a: any) => ({
    level: a?.level,
    project: a?.project,
    path: a?.path,
    left: serializeFileRef(a?.left),
    right: serializeFileRef(a?.right),
  }));
  return {
    actualProject: g?.actualProject,
    actualLevel: g?.actualLevel,
    actualService: g?.actualService,
    actualPosition: g?.actualPosition,
    actualModule: g?.actualModule,
    actual,
  };
}

function cloneSafe(value: unknown): unknown {
  // Copy, not reference: the live object may change after the capture.
  if (value === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); }
}

function snapshotBoot(): IBootSnapshot {
  const w = window as unknown as { collabBoot?: unknown; collabFecho?: unknown };
  return { collabBoot: cloneSafe(w.collabBoot), collabFecho: cloneSafe(w.collabFecho) };
}

async function captureScreenshot(): Promise<string | undefined> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return undefined;
  let stream: MediaStream | undefined;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
      preferCurrentTab: true,
    } as DisplayMediaStreamOptions);
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    // The first frame can arrive after play() resolves: wait a few frames for a real size.
    for (let i = 0; i < 10 && (!video.videoWidth || !video.videoHeight); i++) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    if (!video.videoWidth || !video.videoHeight) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', SCREENSHOT_JPEG_QUALITY);
  } catch {
    return undefined; // user denied the prompt — report goes on without the screenshot
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
  }
}

function getUserSafe(): string {
  try { return mlsGlobal()?.getActualUser?.() || 'unknown'; } catch { return 'unknown'; }
}

/**
 * Takes the screenshot and the state, then opens the report tab.
 *
 * The state is read BEFORE the screenshot prompt: the time and the console have to be those of the
 * moment the user asked, not of when they accepted the share dialog. The screenshot still comes before
 * the tab opens, so the screen shows the state where the bug happened.
 */
export async function captureAndOpenReportBug(): Promise<void> {
  if (capturing) return;
  capturing = true;
  try {
    const snapshot: IBugSnapshot = {
      capturedAt: nowIso(),
      user: getUserSafe(),
      href: location.href,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      mls: snapshotMls(),
      boot: snapshotBoot(),
      console: consoleBuffer.slice(),
      network: networkBuffer.slice(-NETWORK_SEND),
    };
    snapshot.screenshot = await captureScreenshot();
    lastSnapshot = snapshot;
    const { openReportBugTab } = await import('/_102033_/l2/cbe/reportBug/reportBug.js');
    await openReportBugTab('capture');
  } catch (error) {
    console.error('[reportBug] capture failed', error);
  } finally {
    capturing = false;
  }
}

/** Opens a bug received in the chat, read-only, in its own tab (a draft being written stays intact). */
export async function openReportBugView(json: string): Promise<void> {
  try {
    const { openReportBugTab } = await import('/_102033_/l2/cbe/reportBug/reportBug.js');
    await openReportBugTab('view', json);
  } catch (error) {
    console.error('[reportBug] open view failed', error);
  }
}

// ---------------------------------------------------------------------------
// Message format (shared by send and view)
// ---------------------------------------------------------------------------

/**
 * The chat message carrying the bug.
 *
 * The chat parser closes a code block on ANY ``` — and console text from markdown/LLM output often has
 * one, which used to cut the block in half and make it unreadable on the other side. Backticks only
 * occur inside JSON strings, so ``` is an exact escape that JSON.parse restores.
 */
export function buildBugMessage(payload: IBugView): string {
  const json = JSON.stringify({
    ...payload,
    console: payload.console.slice(-CONSOLE_SEND),
    screenshot: payload.screenshot ? `[jpeg base64 - ${payload.screenshot.length} chars - ver console.log]` : undefined,
  }, null, 2).replace(/`/gu, '\\u0060');
  return `Bug: ${payload.capturedAt} — ${payload.user}\n\`\`\`BUG\n${json}\n\`\`\``;
}

function str(value: unknown, fallback = '-'): string {
  if (typeof value === 'string') return value || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function optNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function optString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function arr(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Reads a bug JSON that came from a chat message — someone else's text, possibly edited by hand.
 *
 * Every field is normalized down to the leaves the panel renders, so a malformed block shows dashes
 * instead of throwing inside render (which left the panel blank, close button included).
 */
export function parseBugView(json: string): IBugView | undefined {
  let data: any;
  try { data = JSON.parse(json); } catch { return undefined; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const mls = data.mls && typeof data.mls === 'object' ? data.mls : {};
  const boot = data.boot && typeof data.boot === 'object' ? data.boot : {};
  return {
    capturedAt: str(data.capturedAt),
    user: str(data.user),
    href: str(data.href),
    userAgent: str(data.userAgent),
    viewport: str(data.viewport),
    mls: {
      actualProject: optNumber(mls.actualProject),
      actualLevel: optNumber(mls.actualLevel),
      actualService: optString(mls.actualService),
      actualPosition: optString(mls.actualPosition),
      actualModule: optString(mls.actualModule),
      actual: arr(mls.actual).filter((a) => a && typeof a === 'object').map((a) => ({
        level: optNumber(a.level) ?? -1,
        project: optNumber(a.project),
        path: optString(a.path),
        left: serializeFileRef(a.left),
        right: serializeFileRef(a.right),
      })),
    },
    boot: { collabBoot: boot.collabBoot, collabFecho: boot.collabFecho },
    console: arr(data.console).filter((c) => c && typeof c === 'object').map((c) => ({
      ts: str(c.ts, ''),
      level: str(c.level),
      text: str(c.text, ''),
    })),
    network: arr(data.network).filter((n) => n && typeof n === 'object').map((n) => ({
      ts: str(n.ts, ''),
      method: str(n.method),
      url: str(n.url),
      status: typeof n.status === 'number' ? n.status : str(n.status),
      durationMs: optNumber(n.durationMs) ?? 0,
    })),
    screenshot: optString(data.screenshot),
    description: optString(data.description),
  };
}

installReportBug();
