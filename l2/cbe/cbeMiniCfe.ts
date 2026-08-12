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

import { getLoginUser } from '/_102033_/l2/cbe/cbeAuth.js';
import { initStudio } from '/_102033_/l2/cbe/initStudio.js';
import type { StudioMls } from '/_102033_/l2/cbe/global.js';


// Base project of the studio environment (the studio core, mls-100554). Same
// hardcode the on.collab.codes site carries in its nav1 markup
// (mls-102041/l2/index.html: <collab-nav-1 initialproject="100554">). The VM
// shell has no nav1, so cbeMiniCfe provides the equivalent marker below —
// groundwork for running studio widgets (collab-messages) in the SPA aside.
const CBE_BASE_PROJECT = 100554;

// Bump on every change so the console shows which build is live on the VM.
const CBE_MINI_CFE_VERSION = '1.3.0';

const MLS_SCRIPT_ID = 'cbe-mls-lib';
const MLS_LIB_SCRIPT_ID = 'cbe-mls-nodelibs';
const MLS_LOAD_TIMEOUT_MS = 20000;

/** '/libs/<version>' when window.latest carries it, plain '/libs' otherwise. */
function getLibsBasePath(): string {
  const libsVersion = window.latest?.libs;
  return libsVersion ? `/libs/${libsVersion}` : '/libs';
}

/**
 * Same load chain as the studio index.html (loadNodeJSLibs -> loadMLS):
 * mlsLib.min.js (node polyfills) FIRST, then mls.js, then login. The origin
 * only publishes VERSIONED lib paths — without window.latest there is no
 * mlsLib URL, so it is skipped (login never needed it; only studio editing
 * features do) and mls.js falls back to the unversioned disk-cached copy.
 */
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
    const basePath = getLibsBasePath();
    const loadMls = () => {
      const script = document.createElement('script');
      script.id = MLS_SCRIPT_ID;
      script.type = 'module';
      script.src = `${basePath}/mls.js`;
      script.onerror = () => rejectPromise(new Error(`failed to load ${script.src}`));
      script.onload = () => waitForMls(resolvePromise, rejectPromise);
      document.head.appendChild(script);
    };
    if (window.latest?.libs && !document.getElementById(MLS_LIB_SCRIPT_ID)) {
      const libScript = document.createElement('script');
      libScript.id = MLS_LIB_SCRIPT_ID;
      libScript.src = `${basePath}/mlsLib.min.js`;
      libScript.onload = () => loadMls();
      // mlsLib only backs studio editing features — mls.js loads without it.
      libScript.onerror = () => loadMls();
      document.head.appendChild(libScript);
    } else {
      loadMls();
    }
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
  // Embedded frames (foreign modules in nav3 content tabs) render content
  // only — the TOP page owns the studio bootstrap; a nested login/upgrade
  // would duplicate work and mount a mini-studio inside the tab.
  try {
    if (window.self !== window.top) {
      console.info(`[cbeMiniCfe] v${CBE_MINI_CFE_VERSION} embedded frame — studio bootstrap skipped`);
      return;
    }
  } catch {
    return;
  }
  console.info(`[cbeMiniCfe] v${CBE_MINI_CFE_VERSION} starting`);
  try {
    const t0 = performance.now();
    await loadMlsScript();
    const mls = window.mls;
    if (!mls) return;

    // Kicked off in parallel with login/preload below — Monaco is a large,
    // independent download (only needs window.latest.monaco), no reason to
    // serialize it behind the login round-trip. Awaited before the "ready"
    // signal so nothing races ahead of window.monacoReady (unlike the
    // studio, this env has no initCompileMonaco-style guard downstream).
    const studioReady = initStudio(mls).catch((err) => {
      console.warn('[cbeMiniCfe] monaco init failed — TS compile features unavailable:', err);
    });

    // The service worker backs the js cache used by updateProjectFilesInfo —
    // without it the files processing awaits navigator.serviceWorker.ready
    // forever. Same order the studio uses (mls2.html).
    await mls.stor.cache.installIfNeeded();

    // Make the login request faithful to the studio's: actualProject = the
    // site's project, baseProject = the studio core (via the collabNav1
    // marker, the exact DOM channel the cfe reads in api.ts cbeLogin).
    prepareStudioLoginContext(mls);

    const rc = await mls.api.cbeLogin();

    // Preload mls.stor.files for the site's project + dependencies. This is
    // what "opening" a project in the studio does; here everything resolves
    // from the IndexedDB the login just filled (the driver is only consulted
    // on a cache miss), so no external call happens on the VM.
    await preloadStorFiles(mls);
    await studioReady;

    const keys = await mls.stor.localDB.getAllKeys();
    // Signals the shell that the mini-studio env is FULLY ready (login done,
    // stor preloaded) — the structure upgrade waits for this, not just for
    // window.mls, or the nav service scan runs against a half-filled store.
    (window as unknown as { collabMiniCfeReady?: boolean }).collabMiniCfeReady = true;
    const elapsed = Math.round(performance.now() - t0);
    console.info(
      `[cbeMiniCfe] studio environment ready in ${elapsed}ms`,
      {
        loginStatus: rc?.statusCode,
        loginUser: getLoginUser() || 'anonymous',
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

/** The site's project id from the boot config (0 when absent/invalid). */
function getSiteProjectId(): number {
  const boot = (window as unknown as { collabBoot?: { projectId?: string | number } }).collabBoot;
  const projectId = Number(boot?.projectId) || 0;
  return projectId >= 100000 ? projectId : 0;
}

/**
 * Aligns the login request with the studio's shape: mls.actualProject = the
 * site's project, and a collabNav1 marker carrying initialproject=100554 so
 * the cfe sends baseProject exactly like on.collab.codes does.
 */
function prepareStudioLoginContext(mls: NonNullable<Window['mls']>): void {
  const projectId = getSiteProjectId();
  if (projectId && typeof mls.setActualProject === 'function') {
    mls.setActualProject(projectId);
  }
  if (!document.getElementById('collabNav1')) {
    const marker = document.createElement('meta');
    marker.id = 'collabNav1';
    marker.setAttribute('initialproject', String(CBE_BASE_PROJECT));
    document.head.appendChild(marker);
  }
}

/**
 * Loads into mls.stor.files the site's project and the studio base project
 * (100554), each with its transitive dependencies. The base project chain is
 * what studio widgets mounted in the shell aside (collab-messages) will need.
 */
async function preloadStorFiles(mls: NonNullable<Window['mls']>): Promise<void> {
  const projectId = getSiteProjectId();
  if (!projectId) {
    console.warn('[cbeMiniCfe] preload skipped: no valid collabBoot.projectId');
    return;
  }
  const seen = new Set<number>();
  for (const root of [projectId, CBE_BASE_PROJECT]) {
    try {
      await mls.stor.server.loadProjectInfoIfNeeded(root);
      const pending: number[] = [root];
      while (pending.length > 0) {
        const current = pending.shift() as number;
        if (seen.has(current)) continue;
        seen.add(current);
        const loadedDeps = await mls.stor.loadProjectdependenciesInfoIfNeed(current);
        pending.push(...loadedDeps);
      }
    } catch (err) {
      console.warn(`[cbeMiniCfe] preload of stor.files failed for project ${root}:`, err);
    }
  }
}

// Fire-and-forget: the shell mounts independently of the studio bootstrap.
void initCbeMiniCfe();
