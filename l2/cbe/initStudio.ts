/// <mls fileReference="_102033_/l2/cbe/initStudio.ts" enhancement="_blank" />
// Loads what the mini-studio environment needs beyond the base mls lib.
// Today that's Monaco: collab-messages' agent orchestration compiles project
// TypeScript (readProjectTypescriptAndCompile -> libModel.ts -> mls.editor.
// createModelProjectDefinition), which touches the global `monaco` object.
// Mirrors the studio's own boot chain (mls-102041/l2/index.ts's loadMonaco +
// mls-100554/l2/collabInit.ts's initCompileMonaco awaiting window.monacoReady)
// — neither of those files runs on the VM runtime, so cbeMiniCfe.ts calls
// initStudio() instead once window.mls is loaded.

declare global {
  interface Window {
    latest?: { monaco?: string };
    monacoReady?: Promise<void>;
  }
}

export interface StudioMls {
  baseMonaco?: string;
  editor: { InitMonaco: () => Promise<void> };
}

const MONACO_SCRIPT_ID = 'cbe-monaco-loader';

/** Absolute path: served by the VM's own /monaco/* route (registerCbeRoutes), not a CDN-relative guess. */
function loadMonacoScript(mls: StudioMls): Promise<void> {
  if (window.monacoReady) return window.monacoReady;

  window.monacoReady = new Promise<void>((resolve, reject) => {
    const versionMonaco = window.latest?.monaco;
    if (!versionMonaco) {
      reject(new Error('No monaco version loaded (window.latest.monaco missing)'));
      return;
    }

    mls.baseMonaco = `/monaco/${versionMonaco}/vs/`;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${mls.baseMonaco}../monaco.css`;
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.id = MONACO_SCRIPT_ID;
    script.src = `${mls.baseMonaco}../monaco.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${script.src}`));
    document.head.appendChild(script);
  });

  return window.monacoReady;
}

/** Loads Monaco and initializes it. Idempotent — safe to call more than once. */
export async function initStudio(mls: StudioMls): Promise<void> {
  await loadMonacoScript(mls);
  await mls.editor.InitMonaco();
}
