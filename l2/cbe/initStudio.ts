/// <mls fileReference="_102033_/l2/cbe/initStudio.ts" enhancement="_blank" />
// Loads what the mini-studio environment needs beyond the base mls lib.
// Today that's Monaco: collab-messages' agent orchestration compiles project
// TypeScript (readProjectTypescriptAndCompile -> libModel.ts -> mls.editor.
// createModelProjectDefinition), which touches the global `monaco` object.
// Mirrors the studio's own boot chain (mls-102041/l2/index.ts's loadMonaco +
// mls-100554/l2/collabInit.ts's initCompileMonaco awaiting window.monacoReady)
// — neither of those files runs on the VM runtime. cbeMiniCfe registers a
// LoadMonaco listener that calls initStudio() on demand.

import type { StudioMls } from './global.js'; 

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

async function onLoadMonaco(): Promise<void> {
  const studio = window.mls;
  if (!studio) return;
  await initStudio(studio);
}

/**
 * Cheap: does not load Monaco, only listens. The 102025 previews fire LoadMonaco
 * and then await window.monacoReady — this host is the one that creates it.
 */
export function listenForLoadMonaco(): void {
  mls.events?.addEventListener([2], ['LoadMonaco'] as unknown as mls.events.TypeEvent[], onLoadMonaco);
}

// ─── Organization context ─────────────────────────────────────────────────────

interface MlsOrgApi {
  l5?: {
    getProjectOrgIndex?: (prjID: number) => number | undefined;
    setActualOrg?: (org: number | undefined) => void;
  };
}

/**
 * Sets mls.l5.actualOrg for `project` — port of collabInit.setOrgActual
 * (mls-100554), which never runs on the VM runtime. Without this, actualOrg
 * stays undefined forever here, and any save through serviceSave.ts throws
 * "No organization selected", even for a project whose org index is
 * perfectly resolvable (project 0 in the org list is a valid index, not "no
 * org" — serviceSave.ts's own check must compare against undefined, not use
 * a falsy check, for this to actually take effect).
 */
export function setOrgActual(project: number): void {
  const mls = (window as unknown as { mls?: MlsOrgApi }).mls;
  const orgIndex = mls?.l5?.getProjectOrgIndex?.(project);
  mls?.l5?.setActualOrg?.(orgIndex);
}

// ─── Storage drivers ─────────────────────────────────────────────────────────

interface MlsDriverApi {
  stor?: {
    others?: {
      getDriver?: (provider: string) => unknown;
      addDriver?: (driver: unknown, provider: string) => void;
    };
  };
}

type DriverHost = NonNullable<NonNullable<MlsDriverApi['stor']>['others']>;

/**
 * The registration in flight (or the finished one). Memoizing the PROMISE, not a
 * boolean: the studio reaches this from two doors — loadProjectDefinitions and
 * studioHeader — that can fire close enough together to interleave. With a boolean
 * claimed before the awaits, the second caller returned while the first was still
 * loading, so `await registerDrivers()` resolved with the slots still empty and the
 * next source read failed with `Driver _<project>_<name> not found`.
 */
let registration: Promise<void> | null = null;

/** Clears the one-shot guard so tests can register again. */
export function resetVmDriverRegistration(): void {
  registration = null;
}

/**
 * Puts one driver in its slot, unless something already holds it (a taken slot is a
 * decision someone else already made).
 *
 * Failure is contained per driver on purpose: the git drivers live in ANOTHER project
 * (mls-100554) and may not be served by this VM — that must never cost us the VM driver,
 * the only one that can read a source from local disk.
 */
async function registerDriverInSlot(
  others: DriverHost,
  slot: string,
  create: () => Promise<unknown>,
): Promise<void> {
  if (others.getDriver?.(slot)) return;
  try {
    others.addDriver?.(await create(), slot);
    console.info(`[initStudio] driver registered in slot '${slot}'`);
  } catch (err) {
    console.warn(`[initStudio] driver for slot '${slot}' not registered — every getDefaultDriver call resolving to it will throw \`Driver _<project>_<name> not found\` until this succeeds:`, err);
  }
}

/**
 * Registers every storage driver this runtime can offer, each in ITS OWN slot:
 *   vm     -> DriverVm (this project)      — sources read from / written to the VM disk
 *   github -> DriverGitHub (mls-100554)    — the real git host
 *   gitlab -> DriverGitLab (mls-100554)
 *
 * WHICH ONE A PROJECT USES IS THE PROJECT'S CHOICE: l5/config.json's projectSettings.driver
 * reaches the browser through the login (cbeLogin.buildProjectSettings, which defaults to
 * 'vm' when a project declares nothing) and getDefaultDriver maps that name to a slot. A
 * project declaring "vm" is served from the VM disk; one declaring "GitHub" goes to the git
 * host — which is why the 'github' slot gets the REAL driver and not a stand-in.
 *
 * Port of collabInit.setDrivers (mls-100554), which never runs on the VM runtime, plus the VM
 * driver, which only exists here. Dynamic imports on purpose — these classes extend
 * DriverIOBase, which only exists once the mls lib is loaded.
 *
 * ON DEMAND, when the studio opens — never at boot: an app visitor never reads a .ts
 * source, so an app page must not pay for these imports. Called from BOTH studio doors
 * (loadProjectDefinitions, reached by Ctrl+Alt+S, and studioHeader): the header only
 * mounts through the `setHeader(2)` path, which Ctrl+Alt+S never takes. Callers can rely
 * on the await: everyone shares the same in-flight registration.
 */
export function registerDrivers(): Promise<void> {
  if (!registration) registration = runRegistration();
  return registration;
}

async function runRegistration(): Promise<void> {
  const others = (window as unknown as { mls?: MlsDriverApi }).mls?.stor?.others;
  if (!others?.addDriver) {
    console.warn('[initStudio] mls.stor.others.addDriver unavailable — no driver registered; any getDefaultDriver call will throw until this resolves');
    return;
  }
  await registerDriverInSlot(others, 'vm', async () => {
    const { DriverVm } = await import('/_102033_/l2/cbe/driverVm.js');
    return new DriverVm();
  });
  await registerDriverInSlot(others, 'github', async () => {
    const url = '/_100554_/l2/driverGithub.js';
    const { DriverGitHub } = await import(url);
    return new DriverGitHub();
  });
  await registerDriverInSlot(others, 'gitlab', async () => {
    const url = '/_100554_/l2/driverGitlab.js';
    const { DriverGitLab } = await import(url);
    return new DriverGitLab();
  });
}

// ─── Project definition models (.d.ts of the dependency chain) ───────────────

/** Read through window: the narrow Window.mls of cbeMiniCfe does not carry these APIs. */
interface MlsDefinitionApi {
  editor?: {
    getModels?: (project: number, shortName: string, folder: string, level?: number) => { ts?: unknown } | undefined;
    createModelProjectDefinition?: (project: number, content: string) => Promise<unknown>;
  };
  l5?: { getProjectDependencies?: (project: number, addParentPrj: boolean) => number[] };
  stor?: {
    LOCALPROJECTNUMBER?: number;
    localDB?: { readPrjInfo?: (project: number) => Promise<{ indexModules?: string }> };
  };
}

// Projects the studio itself skips — they have no index to model.
const SKIP_PROJECTS = [100529, 100131];

let definitionsLoaded = false;

/**
 * Registers the TypeScript definition model of a project and of every project it depends on, so
 * Monaco resolves imports across the workspace (`/_102027_/l2/...` and friends) instead of
 * flagging them as missing modules.
 *
 * Port of collabInit.initCompileMonaco (mls-100554), which never runs on the VM. Requires BOTH
 * Monaco initialized and the cbe login done — the index of each project comes from the IndexedDB
 * the login fills (`readPrjInfo().indexModules`, fed by the compiled.zip's types/index.d.ts).
 *
 * Runs once per page. A project that fails is logged and skipped: a missing definition degrades
 * the editing experience, it must never break the studio bootstrap.
 */
export async function loadProjectDefinitions(project: number): Promise<void> {
  if (definitionsLoaded || !project) return;
  // Creating the models reads project SOURCES on a cache miss — without the drivers that read
  // has nothing registered in the project's slot and throws `Driver _<project>_<name> not found`.
  await registerDrivers();
  // Called from the studio switch, which can happen before the Monaco download finishes — the
  // editor API below only exists after it. cbeMiniCfe sets this promise at boot.
  if (window.monacoReady) await window.monacoReady.catch(() => undefined);
  const mls = (window as unknown as { mls?: MlsDefinitionApi }).mls;
  const editor = mls?.editor;
  if (!editor?.getModels || !editor.createModelProjectDefinition || !mls?.stor?.localDB?.readPrjInfo) return;
  definitionsLoaded = true;

  const dependencies = mls.l5?.getProjectDependencies?.(project, false) ?? [];
  const localProject = mls.stor.LOCALPROJECTNUMBER;
  let created = 0;

  for (const prj of [project, ...dependencies]) {
    if (SKIP_PROJECTS.includes(prj) || prj === localProject) continue;
    try {
      const model = editor.getModels(prj, '', '', 2);
      if (model?.ts) continue; // already modeled
      const info = await mls.stor.localDB.readPrjInfo(prj);
      if (!info?.indexModules) {
        console.warn(`[initStudio] project ${prj} has no indexModules — definitions not loaded`);
        continue;
      }
      await editor.createModelProjectDefinition(prj, info.indexModules);
      created += 1;
    } catch (err) {
      console.warn(`[initStudio] definition model failed for project ${prj}:`, err);
    }
  }
  console.info(`[initStudio] definition models ready (${created} created of ${dependencies.length + 1} project(s))`);
}
