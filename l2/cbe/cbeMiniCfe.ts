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
        localDB: { getAllKeys: () => Promise<string[]> };
      };
    };
  }
}

// Bump on every change so the console shows which build is live on the VM.
const CBE_MINI_CFE_VERSION = '1.0.1';

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

    const rc = await mls.api.cbeLogin();
    const keys = await mls.stor.localDB.getAllKeys();
    const elapsed = Math.round(performance.now() - t0);
    console.info(
      `[cbeMiniCfe] studio environment ready in ${elapsed}ms`,
      {
        loginStatus: rc?.statusCode,
        orgs: Object.keys(mls.stor.orgs),
        indexedDbKeys: keys.length,
      },
    );
  } catch (err) {
    // The app page must render regardless of the studio bootstrap outcome.
    console.warn('[cbeMiniCfe] studio bootstrap skipped:', err);
  }
}

// Fire-and-forget: the shell mounts independently of the studio bootstrap.
void initCbeMiniCfe();
