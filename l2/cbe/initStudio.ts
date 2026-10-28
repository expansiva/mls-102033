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
import { activeDraft, readCollabModeNotice } from '/_102033_/l2/cbe/studioDraft.js';
import { applyDraftFiles, draftPublishedCommit } from '/_102033_/l2/cbe/studioDraftFiles.js';
import { draftL2Targets, publishDraftL2 } from '/_102033_/l2/cbe/studioDraftL2.js';

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
let vmRegistration: Promise<void> | null = null;

/** Clears the one-shot guard so tests can register again. */
export function resetVmDriverRegistration(): void {
  registration = null;
  vmRegistration = null;
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
 * The VM driver is registered at boot (`registerVmDriver` from cbeMiniCfe) so
 * any page can read project files from disk (e.g. config.json for the messages
 * menu) without opening the Studio. Git drivers stay ON DEMAND when the studio
 * opens: an app visitor must not pay for those 100554 imports. Called from BOTH
 * studio doors (loadProjectDefinitions, reached by Ctrl+Alt+S, and studioHeader):
 * the header only mounts through the `setHeader(2)` path, which Ctrl+Alt+S never
 * takes. Callers can rely on the await: everyone shares the same in-flight
 * registration. A taken slot is left alone, so boot's vm is not replaced.
 */
export function registerDrivers(): Promise<void> {
  if (!registration) registration = runRegistration();
  return registration;
}

/**
 * Registers only the VM disk driver. Memoized; shares the in-flight vm work
 * with `runRegistration` so a second call does not addDriver twice.
 */
export function registerVmDriver(): Promise<void> {
  if (!vmRegistration) vmRegistration = runVmRegistration();
  return vmRegistration;
}

async function runVmRegistration(): Promise<void> {
  const others = (window as unknown as { mls?: MlsDriverApi }).mls?.stor?.others;
  if (!others?.addDriver) {
    console.warn('[initStudio] mls.stor.others.addDriver unavailable — no driver registered; any getDefaultDriver call will throw until this resolves');
    return;
  }
  await registerDriverInSlot(others, 'vm', async () => {
    const { DriverVm } = await import('/_102033_/l2/cbe/driverVm.js');
    return new DriverVm();
  });
}

async function runRegistration(): Promise<void> {
  const others = (window as unknown as { mls?: MlsDriverApi }).mls?.stor?.others;
  if (!others?.addDriver) {
    console.warn('[initStudio] mls.stor.others.addDriver unavailable — no driver registered; any getDefaultDriver call will throw until this resolves');
    return;
  }
  await registerVmDriver();
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

/** One l2 `.ts` the draft compiled. `level` is 2. */
export interface DraftScreenRef {
  project: number;
  shortName: string;
  folder: string;
  level: number;
}

export interface StudioDraftEntryDeps {
  applyFiles(project: number, slug: string): Promise<unknown>;
  publishL2(project: number, slug: string): Promise<unknown>;
  /** Compiled draft `.ts` files, after `publishL2`. Absent when the caller only publishes. */
  changedTs?(project: number, slug: string): Promise<DraftScreenRef[]>;
  /** Swaps one visible screen. Same function on the way out, after the production compile. */
  applyChanged?(ref: DraftScreenRef): Promise<void>;
}

/** Screens the last entry compiled. Exit swaps these back to production. */
let visibleRefs: DraftScreenRef[] = [];
let swapChanged: ((ref: DraftScreenRef) => Promise<void>) | null = null;
let modeListenerOn = false;

interface ProductionStorFile {
  project?: number;
}

interface ProductionModel {
  model?: { setValue?: (text: string) => void };
  storFile?: ProductionStorFile;
  compilerResults?: { modelNeedCompile?: boolean };
}

interface ProductionDriver {
  getHistoryContent?: (fileInfo: ProductionStorFile, ref: string) => Promise<string | null>;
}

interface ProductionMls {
  stor?: { others?: { getDefaultDriver?: (project: number) => Promise<ProductionDriver | null | undefined> | ProductionDriver | null | undefined } };
  editor?: {
    getModels?: (
      project: number,
      shortName: string,
      folder: string,
      level?: number,
    ) => { ts?: ProductionModel } | undefined;
  };
  l2?: {
    typescript?: {
      compileAndPostProcess?: (
        model: ProductionModel,
        runAfterCompile: boolean,
        saveCache: boolean,
      ) => Promise<boolean>;
    };
  };
}

function productionMls(): ProductionMls | undefined {
  const fromWindow = (globalThis as unknown as { window?: { mls?: ProductionMls } }).window?.mls;
  return fromWindow ?? (globalThis as unknown as { mls?: ProductionMls }).mls;
}

/**
 * The published source of one screen: `getHistoryContent` at the commit of `main` that `draftDiff` sent.
 * The row's own `getContent` would read the draft blob (the draft apply moved its `versionRef`), so it
 * is not production. Null when the screen has no published version or the read failed.
 */
async function publishedSource(ref: DraftScreenRef, storFile: ProductionStorFile): Promise<string | null> {
  const main = draftPublishedCommit();
  if (!main) {
    console.warn('[initStudio] draftDiff sent no main; production version was not restored', ref);
    return null;
  }
  try {
    const driver = await productionMls()?.stor?.others?.getDefaultDriver?.(ref.project);
    if (!driver?.getHistoryContent) {
      console.warn('[initStudio] driver has no getHistoryContent; production version was not restored', ref);
      return null;
    }
    const text = await driver.getHistoryContent(storFile, main);
    if (typeof text !== 'string') {
      console.warn('[initStudio] no published version of this screen; it stays as it is', {
        changed: `${ref.project}/${ref.folder}/${ref.shortName}`,
      });
      return null;
    }
    return text;
  } catch (err) {
    console.warn('[initStudio] published source failed', ref, err);
    return null;
  }
}

/**
 * Puts the published source back on the model and compiles it into the cache.
 * The model still holds the draft until this runs.
 * False when there is nothing to swap — the caller must not apply the draft over production.
 */
async function restoreProduction(ref: DraftScreenRef): Promise<boolean> {
  const model = productionMls()?.editor?.getModels?.(ref.project, ref.shortName, ref.folder, ref.level)?.ts;
  if (!model?.model?.setValue || !model.storFile) {
    console.warn('[initStudio] no model; production version was not compiled', {
      changed: `${ref.project}/${ref.folder}/${ref.shortName}`,
    });
    return false;
  }
  const content = await publishedSource(ref, model.storFile);
  if (content === null) return false;
  model.model.setValue(content);
  if (model.compilerResults) model.compilerResults.modelNeedCompile = true;
  const compile = productionMls()?.l2?.typescript?.compileAndPostProcess;
  if (!compile) {
    console.warn('[initStudio] compileAndPostProcess missing; production version was not compiled', ref);
    return false;
  }
  try {
    const ok = await compile(model, true, true);
    if (!ok) {
      console.warn('[initStudio] production compile failed', {
        changed: `${ref.project}/${ref.folder}/${ref.shortName}`,
      });
      return false;
    }
  } catch (err) {
    console.warn('[initStudio] production compile failed', ref, err);
    return false;
  }
  return true;
}

/** `{type:'collab-mode'}` with `production`: swap the visible screens to the release. Studio is the entry path. */
export async function handleCollabModeMessage(data: unknown): Promise<void> {
  const notice = readCollabModeNotice(data);
  if (!notice || notice.mode !== 'production') return;
  if (!swapChanged) {
    console.warn('[initStudio] production mode with no draft screens to swap');
    return;
  }
  for (const ref of visibleRefs) {
    const restored = await restoreProduction(ref);
    if (!restored) continue;
    await swapChanged(ref);
  }
}

function listenForProductionSwap(): void {
  if (modeListenerOn) return;
  modeListenerOn = true;
  const sw = globalThis.navigator?.serviceWorker;
  if (!sw || typeof sw.addEventListener !== 'function') {
    console.warn('[initStudio] service worker missing; this tab will not swap the visible screen on collab-mode');
    return;
  }
  sw.addEventListener('message', (event: MessageEvent) => {
    void handleCollabModeMessage(event.data);
  });
}

/** `l2/<folder/>shortName.ts` from `draftL2Targets`. Null when the path is not that shape. */
function refFromDraftPath(project: number, path: string): DraftScreenRef | null {
  if (!path.startsWith('l2/') || !path.endsWith('.ts') || path.endsWith('.d.ts') || path.endsWith('.test.ts')) {
    return null;
  }
  const rest = path.slice(3, -3);
  const slash = rest.lastIndexOf('/');
  const folder = slash === -1 ? '' : rest.slice(0, slash);
  const shortName = slash === -1 ? rest : rest.slice(slash + 1);
  if (!shortName) return null;
  return { project, shortName, folder, level: 2 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** l2 `.ts` files the draft differs from production. Empty when the diff cannot be read. */
export async function listChangedDraftTs(project: number, slug: string): Promise<DraftScreenRef[]> {
  let response: Response;
  try {
    response = await fetch('/exec', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'draftDiff', project, draft: slug, names: true }),
    });
  } catch (err) {
    console.error('[initStudio] draftDiff failed:', err);
    return [];
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (err) {
    console.error('[initStudio] draftDiff response is not json:', err);
    return [];
  }
  if (!response.ok || !isRecord(parsed) || parsed.status !== 'files' || !Array.isArray(parsed.files)) {
    const code = isRecord(parsed) && typeof parsed.code === 'string' ? parsed.code : `HTTP ${response.status}`;
    console.error('[initStudio] draftDiff:', code);
    return [];
  }
  const files: { status: string; path: string }[] = [];
  for (const item of parsed.files) {
    if (!isRecord(item) || typeof item.status !== 'string' || typeof item.path !== 'string') {
      console.error('[initStudio] draftDiff file entry is invalid');
      return [];
    }
    files.push({ status: item.status, path: item.path });
  }
  const refs: DraftScreenRef[] = [];
  for (const path of draftL2Targets(files)) {
    const ref = refFromDraftPath(project, path);
    if (!ref) {
      console.error('[initStudio] draft path is not an l2 ts:', path);
      continue;
    }
    refs.push(ref);
  }
  return refs;
}

async function applyChangedOnVisible(ref: DraftScreenRef): Promise<void> {
  const { applyChangedOnMounted } = await import('/_102020_/l2/aura/studio/studioLiveUpdateWatcher.js');
  await applyChangedOnMounted(ref);
}

/**
 * On studio entry: the draft list, then each l2 that differs from production compiled into the
 * service worker, then the visible screens swapped. Does not reload and does not write a `-d<slug>` cache.
 */
export async function enterStudioDraft(
  project: number,
  slug: string | undefined,
  deps: StudioDraftEntryDeps,
): Promise<void> {
  if (!slug) {
    console.warn('[initStudio] no active draft; draft versions were not sent');
    return;
  }
  await deps.applyFiles(project, slug);
  await deps.publishL2(project, slug);
  if (!deps.changedTs || !deps.applyChanged) return;
  const refs = await deps.changedTs(project, slug);
  visibleRefs = refs;
  swapChanged = deps.applyChanged;
  listenForProductionSwap();
  for (const ref of refs) await deps.applyChanged(ref);
}

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
  if (!project) return;
  // Creating the models reads project SOURCES on a cache miss — without the drivers that read
  // has nothing registered in the project's slot and throws `Driver _<project>_<name> not found`.
  await registerDrivers();
  // Called from the studio switch, which can happen before the Monaco download finishes — the
  // editor API below, and the draft compile, only exist after it. cbeMiniCfe sets this promise at boot.
  if (window.monacoReady) await window.monacoReady.catch(() => undefined);
  // `draftEnter` and `setMode('studio')` already ran; `activeDraft()` is that slug.
  // Re-entry in the same page (no reload) publishes again. Definition models stay once.
  await enterStudioDraft(project, activeDraft(), {
    applyFiles: (prj, slug) => applyDraftFiles(prj, slug),
    publishL2: (prj, slug) => publishDraftL2(prj, slug),
    changedTs: (prj, slug) => listChangedDraftTs(prj, slug),
    applyChanged: (ref) => applyChangedOnVisible(ref),
  });
  if (definitionsLoaded) return;
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
