/// <mls fileReference="_102033_/l2/cbe/studioDraftL2.ts" enhancement="_blank" />
// Compile, in this browser, the l2 sources the current draft changed against main.
// The draft text comes from /exec (the collab-draft cookie selects the copy).
// It is applied on the editor model directly: storFile.getContent() would return production.

const MARKER_KEY = 'collabDraftL2Synced';
const RELOADED_KEY = 'collabDraftL2Reloaded';
const L2_STATUS = new Set(['A', 'M', 'R']);
const IMPORT_DEPTH = 3;
const CONTROLLER_WAIT_MS = 10_000;
const L2_IMPORT = /^\/?_(\d+)_\/l2\/(.+?)(\.js)?$/;

export interface DraftDiffName {
  status: string;
  path: string;
}

export interface DraftL2Deps {
  readMarker(): string | null;
  writeMarker(value: string): void;
  draftDiff(project: number, slug: string): Promise<{ head: string; files: DraftDiffName[] }>;
  readDraftText(project: number, path: string): Promise<string>;
  apply(project: number, path: string, text: string): Promise<void>;
  compile(project: number, path: string): Promise<string | null>;
  inDraftCache(slug: string, url: string): Promise<boolean>;
  hasLocalEdit(project: number, path: string): boolean;
}

interface L2File {
  folder: string;
  shortName: string;
}

export interface L2ImportFile {
  project: number;
  folder: string;
  shortName: string;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** l2 TypeScript sources, excluding tests and declarations. Folder may be nested. */
function parseL2Ts(path: string): L2File | undefined {
  if (!path.startsWith('l2/') || !path.endsWith('.ts')) return undefined;
  if (path.endsWith('.d.ts') || path.endsWith('.test.ts')) return undefined;
  const rest = path.slice(3, -3);
  if (rest.length === 0 || rest.startsWith('/') || rest.endsWith('/')) return undefined;
  const slash = rest.lastIndexOf('/');
  const folder = slash === -1 ? '' : rest.slice(0, slash);
  const shortName = slash === -1 ? rest : rest.slice(slash + 1);
  if (!shortName || (slash !== -1 && !folder)) return undefined;
  return { folder, shortName };
}

/** `/_102047_/l2/a/b/c.js` → the stor identity of that l2 source. Anything else → null. */
export function importToL2File(importName: string): L2ImportFile | null {
  const match = L2_IMPORT.exec(importName);
  if (!match) return null;
  const rest = match[2];
  const slash = rest.lastIndexOf('/');
  const folder = slash === -1 ? '' : rest.slice(0, slash);
  const shortName = slash === -1 ? rest : rest.slice(slash + 1);
  if (!shortName || (slash !== -1 && !folder)) return null;
  return { project: Number(match[1]), folder, shortName };
}

function visitKey(file: { project: number; folder: string; shortName: string }): string {
  return `${file.project}:${file.folder}:${file.shortName}`;
}

export function draftL2Targets(files: { status: string; path: string }[]): string[] {
  const targets: string[] = [];
  for (const file of files) {
    if (!L2_STATUS.has(file.status)) continue;
    if (!parseL2Ts(file.path)) continue;
    targets.push(file.path);
  }
  return targets;
}

async function postExec(body: Record<string, unknown>): Promise<unknown> {
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
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (err) {
    throw new Error(errorText(err));
  }
  if (!response.ok) {
    const msg = isRecord(parsed) && typeof parsed.msg === 'string' ? parsed.msg : `HTTP ${response.status}`;
    throw new Error(msg);
  }
  return parsed;
}

async function requestDraftDiff(project: number, slug: string): Promise<{ head: string; files: DraftDiffName[] }> {
  const parsed = await postExec({ action: 'draftDiff', project, draft: slug, names: true });
  if (!isRecord(parsed) || parsed.status !== 'files' || typeof parsed.head !== 'string' || parsed.head.length === 0) {
    const code = isRecord(parsed) && typeof parsed.code === 'string' ? parsed.code : 'bad response';
    throw new Error(code);
  }
  if (!Array.isArray(parsed.files)) throw new Error('draftDiff response has no files array');
  const files: DraftDiffName[] = [];
  for (const item of parsed.files) {
    if (!isRecord(item) || typeof item.status !== 'string' || typeof item.path !== 'string') {
      throw new Error('draftDiff file entry is invalid');
    }
    files.push({ status: item.status, path: item.path });
  }
  return { head: parsed.head, files };
}

async function requestDraftText(project: number, path: string): Promise<string> {
  const parsed = await postExec({ action: 'getContents', project, shortPaths: [path] });
  if (!isRecord(parsed) || parsed.statusCode !== 200 || !Array.isArray(parsed.files)) {
    const msg = isRecord(parsed) && typeof parsed.msg === 'string' ? parsed.msg : 'getContents failed';
    throw new Error(msg);
  }
  const file = parsed.files.find((item) => isRecord(item) && item.shortPath === path);
  if (!isRecord(file) || typeof file.content !== 'string') throw new Error('getContents missing content');
  return file.encoding === 'base64' ? atob(file.content) : file.content;
}

function l2FileBase(project: number, loc: L2File): mls.stor.IFileInfoBase {
  return {
    project,
    level: 2,
    shortName: loc.shortName,
    folder: loc.folder,
    extension: '.ts',
  };
}

function storFileFor(project: number, loc: L2File): mls.stor.IFileInfo {
  const base = l2FileBase(project, loc);
  const existing = mls.stor.files[mls.stor.getKeyToFile(base)];
  if (existing) return existing;
  // Not registered yet (a file the draft added). Identity fields are enough for
  // createModelTS and the cache key; getContent would serve the release.
  const unused = (name: string) => Promise.reject(new Error(`[studioDraftL2] ${name} is not used`));
  return {
    ...base,
    versionRef: '',
    projectDependencies: null,
    isLocalVersionOutdated: false,
    inLocalStorage: false,
    status: 'nochange',
    hasError: false,
    getContent: () => unused('getContent'),
    getHistory: () => unused('getHistory'),
    getHistoryContent: () => unused('getHistoryContent'),
    saveContentInCacheIfNeed: () => unused('saveContentInCacheIfNeed'),
    getOrCreateModel: () => unused('getOrCreateModel'),
  };
}

function asModelTS(model: mls.editor.IModelBase): mls.editor.IModelTS | undefined {
  if (model.storFile.extension !== '.ts') return undefined;
  return model as mls.editor.IModelTS;
}

async function loadImportModels(model: mls.editor.IModelTS, depth: number, visited: Set<string>): Promise<void> {
  const key = visitKey(model.storFile);
  if (visited.has(key)) return;
  visited.add(key);
  if (depth <= 0) return;

  let imports: string[] = [];
  try {
    await mls.l2.typescript.compileAndPostProcess(model, false, false);
    imports = model.compilerResults?.imports ?? [];
  } catch (err) {
    console.warn(`[studioDraftL2] ${key}: ${errorText(err)}`);
    return;
  }

  for (const importName of imports) {
    const info = importToL2File(importName);
    if (!info || visited.has(visitKey(info))) continue;
    try {
      const storFile = mls.stor.files[mls.stor.getKeyToFile(l2FileBase(info.project, info))];
      if (!storFile) continue;
      const existing = mls.editor.getModels(info.project, info.shortName, info.folder, 2)?.ts;
      const created = existing ?? await storFile.getOrCreateModel();
      const dep = asModelTS(created);
      if (!dep) {
        console.warn(`[studioDraftL2] ${importName}: model is not typescript`);
        continue;
      }
      await loadImportModels(dep, depth - 1, visited);
    } catch (err) {
      console.warn(`[studioDraftL2] ${importName}: ${errorText(err)}`);
    }
  }
}

async function applyDraft(project: number, path: string, text: string): Promise<void> {
  const loc = parseL2Ts(path);
  if (!loc) throw new Error(`not an l2 source: ${path}`);
  const existing = mls.editor.getModels(project, loc.shortName, loc.folder, 2)?.ts;
  const model = existing ?? await mls.editor.createModelTS(storFileFor(project, loc), text);
  model.model.setValue(text);
}

/** Same key `saveCacheAfterCompile` stores: `/local/_<project>_….js?v=<cacheVersion>`. */
function draftCacheUrl(model: mls.editor.IModelTS): string | null {
  const version = model.compilerResults?.cacheVersion;
  if (!version) return null;
  const { project, folder, shortName } = model.storFile;
  const extension = model.storFile.extension.replace('.ts', '.js');
  return `/local/_${project}_${folder ? `${folder}/` : ''}${shortName}${extension}?v=${version}`;
}

async function compileDraft(project: number, path: string): Promise<string | null> {
  const loc = parseL2Ts(path);
  if (!loc) throw new Error(`not an l2 source: ${path}`);
  const model = mls.editor.getModels(project, loc.shortName, loc.folder, 2)?.ts;
  if (!model) throw new Error(`model missing: ${path}`);
  await loadImportModels(model, IMPORT_DEPTH, new Set());
  // The probe compile records this version with modelNeedCompile false (mls.js compile).
  // Without this, the final compile returns the missing-import errors and skips the cache.
  if (model.compilerResults) model.compilerResults.modelNeedCompile = true;
  const ok = await mls.l2.typescript.compileAndPostProcess(model, true, true);
  if (!ok) return null;
  return draftCacheUrl(model);
}

/** True when `url` is stored in a cache whose name ends with `-d<slug>` (the server's draft suffix). */
async function defaultInDraftCache(slug: string, url: string): Promise<boolean> {
  const storage = globalThis.caches;
  if (!storage) {
    console.warn(`[studioDraftL2] ${url}: Cache Storage is unavailable`);
    return false;
  }
  const suffix = `-d${slug}`;
  for (const name of await storage.keys()) {
    if (!name.endsWith(suffix)) continue;
    const hit = await (await storage.open(name)).match(url);
    if (hit) return true;
  }
  return false;
}

function waitForDraftController(timeoutMs: number): Promise<boolean> {
  const sw = globalThis.navigator?.serviceWorker;
  if (!sw) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sw.removeEventListener('controllerchange', onChange);
      resolve(false);
    }, timeoutMs);
    function onChange(): void {
      clearTimeout(timer);
      sw.removeEventListener('controllerchange', onChange);
      resolve(true);
    }
    sw.addEventListener('controllerchange', onChange);
  });
}

function defaultHasLocalEdit(project: number, path: string): boolean {
  const loc = parseL2Ts(path);
  if (!loc) {
    console.error(`[studioDraftL2] ${path}: local edit check is not an l2 source`);
    return false;
  }
  const base = l2FileBase(project, loc);
  return mls.stor.files[mls.stor.getKeyToFile(base)]?.inLocalStorage === true;
}

const defaultDeps: DraftL2Deps = {
  readMarker: () => sessionStorage.getItem(MARKER_KEY),
  writeMarker: (value) => sessionStorage.setItem(MARKER_KEY, value),
  draftDiff: requestDraftDiff,
  readDraftText: requestDraftText,
  apply: applyDraft,
  compile: compileDraft,
  inDraftCache: defaultInDraftCache,
  hasLocalEdit: defaultHasLocalEdit,
};

async function syncDraftL2Once(
  project: number,
  slug: string,
  deps: DraftL2Deps,
): Promise<{ compiled: number; head: string | null; outside: boolean }> {
  let diff: { head: string; files: DraftDiffName[] };
  try {
    diff = await deps.draftDiff(project, slug);
  } catch (err) {
    console.error(`[studioDraftL2] draftDiff: ${errorText(err)}`);
    return { compiled: 0, head: null, outside: false };
  }
  if (deps.readMarker() === `${slug}@${diff.head}`) return { compiled: 0, head: diff.head, outside: false };

  const targets = draftL2Targets(diff.files);
  const ready: string[] = [];
  let failed = false;
  for (const path of targets) {
    if (deps.hasLocalEdit(project, path)) {
      console.info(`[studioDraftL2] ${path}: local edit kept`);
      continue;
    }
    try {
      const text = await deps.readDraftText(project, path);
      await deps.apply(project, path, text);
      ready.push(path);
    } catch (err) {
      failed = true;
      console.error(`[studioDraftL2] ${path}: ${errorText(err)}`);
    }
  }

  let compiled = 0;
  let outside = false;
  for (const path of ready) {
    try {
      const url = await deps.compile(project, path);
      if (!url) {
        failed = true;
        console.error(`[studioDraftL2] ${path}: compile failed`);
        continue;
      }
      if (!await deps.inDraftCache(slug, url)) {
        failed = true;
        outside = true;
        console.warn(`[studioDraftL2] ${path}: compiled outside the draft cache`);
        continue;
      }
      compiled += 1;
    } catch (err) {
      failed = true;
      console.error(`[studioDraftL2] ${path}: ${errorText(err)}`);
    }
  }
  if (!failed) deps.writeMarker(`${slug}@${diff.head}`);
  return { compiled, head: diff.head, outside };
}

interface DraftCacheStorage {
  keys(): Promise<string[]>;
  delete(cacheName: string): Promise<boolean>;
}

/** Drop the draft l2 markers and every cache named `…-d<slug>`. Without Cache Storage, only the markers. */
export async function forgetDraftL2(
  slug: string,
  deps: { caches?: DraftCacheStorage; session: { removeItem(key: string): void } } = {
    caches: globalThis.caches,
    session: globalThis.sessionStorage,
  },
): Promise<void> {
  deps.session.removeItem(MARKER_KEY);
  deps.session.removeItem(RELOADED_KEY);
  const storage = deps.caches;
  if (!storage) return;
  const suffix = `-d${slug}`;
  let names: string[];
  try {
    names = await storage.keys();
  } catch (err) {
    console.warn(`[studioDraftL2] forget caches: ${errorText(err)}`);
    return;
  }
  for (const name of names) {
    if (!name.endsWith(suffix)) continue;
    try {
      await storage.delete(name);
    } catch (err) {
      console.warn(`[studioDraftL2] forget ${name}: ${errorText(err)}`);
    }
  }
}

export async function syncDraftL2(
  project: number,
  slug: string,
  deps: DraftL2Deps = defaultDeps,
): Promise<{ compiled: number; head: string | null }> {
  const first = await syncDraftL2Once(project, slug, deps);
  if (!first.outside) return { compiled: first.compiled, head: first.head };
  // One extra pass after the draft worker takes control. An unconfirmed compile never reloads by itself.
  const claimed = await waitForDraftController(CONTROLLER_WAIT_MS);
  if (!claimed) {
    console.warn('[studioDraftL2] draft service worker not in control; will retry on next boot');
    return { compiled: first.compiled, head: first.head };
  }
  const second = await syncDraftL2Once(project, slug, deps);
  return { compiled: second.compiled, head: second.head };
}
