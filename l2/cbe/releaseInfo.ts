/// <mls fileReference="_102033_/l2/cbe/releaseInfo.ts" enhancement="_blank" />
// Answers, from the browser console, "which release am I talking to, and did my
// save already land?".
//
// A save on the VM takes a whole pipeline to become live: /exec setContents writes
// the file, commits it, and schedules a debounced rebuild that compiles, assembles a
// NEW release and reloads pm2. Until that finishes the page is still served by the
// old workers — and nothing on screen says so. cbe's ping carries the three facts
// that settle it (see cbeRoutes 'ping'): the release this worker IS, whether a build
// is running right now, and which worker answered.

const EXEC_URL = '/exec';
/** The build is minutes long; polling is cheap and this is a console tool, not a hot path. */
const POLL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export interface IReleaseStamp {
  id: string;
  client?: string;
  libs?: string;
  versionRef?: string;
  platformCommit?: string | null;
}

export interface IReleasePing {
  version: string;
  pid: number;
  release: IReleaseStamp | null;
  rebuilding: boolean;
}

export interface IReleaseWaitResult {
  /** true when a different release answered — the rebuild landed. */
  changed: boolean;
  /** Why it stopped: the release moved, the build ended without moving it, or we gave up. */
  reason: 'released' | 'build-failed' | 'timeout';
  from: string | null;
  to: string | null;
  elapsedMs: number;
}

/** Current state of the worker that answers this request. */
export async function readRelease(): Promise<IReleasePing> {
  const response = await fetch(EXEC_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ping' }),
  });
  if (!response.ok) throw new Error(`cbe ping failed: HTTP ${response.status}`);
  return await response.json() as IReleasePing;
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/**
 * Follows a save through the pipeline and resolves when it is decided.
 *
 * Two workers serve in cluster, and during a reload one may already be new while the
 * other is still old — so a changed id is only trusted after the build has finished
 * (rebuilding false). The other decided outcome is just as useful: the build ended and
 * the release did NOT move, which means it failed and the reason is in
 * logs/rebuild-on-save.log on the VM.
 */
export async function waitForNewRelease(
  options: { timeoutMs?: number; pollMs?: number; onTick?: (ping: IReleasePing) => void } = {},
): Promise<IReleaseWaitResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = options.pollMs ?? POLL_MS;
  const startedAt = Date.now();
  const first = await readRelease();
  const from = first.release?.id ?? null;
  let sawBuildRunning = first.rebuilding;

  for (;;) {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > timeoutMs) {
      return { changed: false, reason: 'timeout', from, to: from, elapsedMs };
    }
    await sleep(pollMs);
    let ping: IReleasePing;
    try {
      // A reload drops connections mid-flight; that is the pipeline working, not an error.
      ping = await readRelease();
    } catch {
      continue;
    }
    options.onTick?.(ping);
    if (ping.rebuilding) {
      sawBuildRunning = true;
      continue;
    }
    const to = ping.release?.id ?? null;
    if (to !== from) {
      return { changed: true, reason: 'released', from, to, elapsedMs: Date.now() - startedAt };
    }
    // Build ran and ended with the same release: it failed.
    if (sawBuildRunning) {
      return { changed: false, reason: 'build-failed', from, to, elapsedMs: Date.now() - startedAt };
    }
  }
}

interface ReleaseConsoleApi {
  (): Promise<IReleasePing>;
  waitForNew: typeof waitForNewRelease;
}

/**
 * Publishes `collabRelease()` on window, so the console needs no fetch boilerplate:
 *   await collabRelease()             -> { version, pid, release, rebuilding }
 *   await collabRelease.waitForNew()  -> resolves when the save is live (or failed)
 */
export function installReleaseConsoleHelper(): void {
  const api = (() => readRelease()) as ReleaseConsoleApi;
  api.waitForNew = waitForNewRelease;
  (window as unknown as { collabRelease?: ReleaseConsoleApi }).collabRelease = api;
}
