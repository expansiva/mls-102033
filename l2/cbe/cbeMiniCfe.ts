/// <mls fileReference="_102033_/l2/cbe/cbeMiniCfe.ts" enhancement="_blank" />
// Mini 'cfe' bootstrap for the runtime VM. Loads the mls lib (window.mls) from
// /libs/mls.js — served by the cbe module in mls-102034 — and performs the cbe
// login. The login populates mls.stor.orgs (memory) and the mlsDB IndexedDB
// with the workspace project sources, leaving the studio environment prepared
// in the background while the normal app page renders untouched.
//
// Inspect the result in the browser console:
//   window.mls                      -> the loaded lib
//   mls.stor.orgs                   -> orgs/projects returned by the login
//   mls.stor.localDB.getAllKeys()   -> keys persisted in IndexedDB (mlsDB)

declare global {
  interface Window {
    mls?: {
      api: { cbeLogin: () => Promise<{ statusCode: number } | undefined> };
      stor: {
        orgs: Record<string, unknown>;
        files: Record<string, unknown>;
        localDB: { getAllKeys: () => Promise<string[]> };
        cache: { installIfNeeded: () => Promise<unknown> };
        server: { loadProjectInfoIfNeeded: (project: number, forceUpdate?: boolean) => Promise<boolean> };
        loadProjectdependenciesInfoIfNeed: (project: number, forceUpdate?: boolean) => Promise<number[]>;
      };
    };
  }
}

// Bump on every change so the console shows which build is live on the VM.
const CBE_MINI_CFE_VERSION = '1.0.3';

const MLS_SCRIPT_ID = 'cbe-mls-lib';
const MLS_LOAD_TIMEOUT_MS = 20000;

function loadMlsScript(): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    if (window.mls) {
      resolvePromise();
      return;
    }
    if (document.getElementById(MLS_SCRIPT_ID)) {
      waitForMls(resolvePromise, rejectPromise);
      return;
    }
    const script = document.createElement('script');
    script.id = MLS_SCRIPT_ID;
    script.type = 'module';
    script.src = '/libs/mls.js';
    script.onerror = () => rejectPromise(new Error('failed to load /libs/mls.js'));
    script.onload = () => waitForMls(resolvePromise, rejectPromise);
    document.head.appendChild(script);
  });
}

function waitForMls(onReady: () => void, onTimeout: (err: Error) => void): void {
  const startedAt = Date.now();
  const poll = () => {
    if (window.mls) {
      onReady();
      return;
    }
    if (Date.now() - startedAt > MLS_LOAD_TIMEOUT_MS) {
      onTimeout(new Error('mls lib did not initialize (window.mls missing)'));
      return;
    }
    setTimeout(poll, 50);
  };
  poll();
}

export async function initCbeMiniCfe(): Promise<void> {
  console.info(`[cbeMiniCfe] v${CBE_MINI_CFE_VERSION} starting`);
  try {
    const t0 = performance.now();
    await loadMlsScript();
    const mls = window.mls;
    if (!mls) return;

    // The service worker backs the js cache used by updateProjectFilesInfo —
    // without it the files processing awaits navigator.serviceWorker.ready
    // forever. Same order the studio uses (mls2.html).
    await mls.stor.cache.installIfNeeded();

    const rc = await mls.api.cbeLogin();

    // Preload mls.stor.files for the site's project + dependencies. This is
    // what "opening" a project in the studio does; here everything resolves
    // from the IndexedDB the login just filled (the driver is only consulted
    // on a cache miss), so no external call happens on the VM.
    await preloadStorFiles(mls);

    const keys = await mls.stor.localDB.getAllKeys();
    const elapsed = Math.round(performance.now() - t0);
    console.info(
      `[cbeMiniCfe] studio environment ready in ${elapsed}ms`,
      {
        loginStatus: rc?.statusCode,
        orgs: Object.keys(mls.stor.orgs),
        indexedDbKeys: keys.length,
        storFiles: Object.keys(mls.stor.files).length,
      },
    );
  } catch (err) {
    // The app page must render regardless of the studio bootstrap outcome.
    console.warn('[cbeMiniCfe] studio bootstrap skipped:', err);
  }
}

/** Loads the site's project and its dependencies (transitively) into mls.stor.files. */
async function preloadStorFiles(mls: NonNullable<Window['mls']>): Promise<void> {
  const boot = (window as unknown as { collabBoot?: { projectId?: string | number } }).collabBoot;
  const projectId = Number(boot?.projectId) || 0;
  if (projectId < 100000) {
    console.warn(`[cbeMiniCfe] preload skipped: no valid collabBoot.projectId (${boot?.projectId})`);
    return;
  }
  try {
    await mls.stor.server.loadProjectInfoIfNeeded(projectId);
    const pending: number[] = [projectId];
    const seen = new Set<number>();
    while (pending.length > 0) {
      const current = pending.shift() as number;
      if (seen.has(current)) continue;
      seen.add(current);
      const loadedDeps = await mls.stor.loadProjectdependenciesInfoIfNeed(current);
      pending.push(...loadedDeps);
    }
  } catch (err) {
    console.warn(`[cbeMiniCfe] preload of stor.files failed for project ${projectId}:`, err);
  }
}

// Fire-and-forget: the shell mounts independently of the studio bootstrap.
void initCbeMiniCfe();
