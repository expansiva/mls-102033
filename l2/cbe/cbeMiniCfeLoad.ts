/// <mls fileReference="_102033_/l2/cbe/cbeMiniCfeLoad.ts" enhancement="_blank" />
// Isolated from cbeMiniCfe.ts so loadMlsScript can be tested without firing
// the module-level `void initCbeMiniCfe()`.

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
export function loadMlsScript(): Promise<void> {
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
    if (!window.latest?.libs) {
      console.warn(
        '[cbeMiniCfe] window.latest.libs missing; loading the unversioned pin bundle from /libs/mls.js',
      );
    }
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
