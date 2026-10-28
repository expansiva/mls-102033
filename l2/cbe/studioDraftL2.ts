/// <mls fileReference="_102033_/l2/cbe/studioDraftL2.ts" enhancement="_blank" />
// Compile, in this browser, the l2 sources the current draft changed against main.
// The draft text comes from /exec.
// It is applied on the editor model directly: storFile.getContent() would return production.

const DRAFT_SLUG = /^(team|user)-[a-z0-9_.-]{1,64}$/;
const L2_STATUS = new Set(['A', 'M', 'R']);
const IMPORT_DEPTH = 3;
const L2_IMPORT = /^\/?_(\d+)_\/l2\/(.+?)(\.js)?$/;
/** `getUrlLocalWithVersion` (`mls.js:5148`) plus a 17-digit `cacheVersion` (`mls.js:3087`). */
const COMPILED_L2_URL = /^\/local\/_(\d+)_(.+)\.js\?v=(\d{17})$/;

export interface DraftDiffName {
  status: string;
  path: string;
}

interface StaleCacheRequest {
  url: string;
}

interface StaleCache {
  keys(): Promise<Iterable<StaleCacheRequest>>;
  delete(request: StaleCacheRequest): Promise<boolean>;
}

interface StaleCacheStorage {
  keys(): Promise<string[]>;
  open(name: string): Promise<StaleCache>;
}

export interface ForgetStaleDeps {
  caches?: StaleCacheStorage;
  hasLocalEdit(project: number, path: string): boolean;
}

interface L2File {
  folder: string;
  shortName: string;
}

/** Compiled l2 sent to the service worker. `path` is `_project_folder/name.js`, with no `-d<slug>` cache. */
export interface DraftCompiledJs {
  path: string;
  version: string;
  content: string;
}

/** Same body as `mls.stor.cache.addIfNeed` (`mls.js` `addIfNeed`), plus the draft slug. */
export interface DraftWorkerAdd {
  action: 'add';
  path: string;
  version: string;
  content: string;
  contentType: 'application/javascript';
  draft: string;
}

export interface PublishDraftL2Deps {
  draftDiff(project: number, slug: string): Promise<{ head: string; files: DraftDiffName[] }>;
  readDraftText(project: number, path: string): Promise<string>;
  apply(project: number, path: string, text: string): Promise<void>;
  /** `saveCache` is false. `null` when the compile produced nothing to send. */
  compile(project: number, path: string): Promise<DraftCompiledJs | null>;
  postAdd(message: DraftWorkerAdd): Promise<unknown>;
  hasLocalEdit(project: number, path: string): boolean;
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

function workerPath(project: number, loc: L2File): string {
  return `_${project}_${loc.folder ? `${loc.folder}/` : ''}${loc.shortName}.js`;
}

/** Compiles one l2 source and keeps the bytes. `saveCache` stays false: the worker stores the draft copy. */
export async function compileDraftForWorker(project: number, path: string): Promise<DraftCompiledJs | null> {
  const loc = parseL2Ts(path);
  if (!loc) throw new Error(`not an l2 source: ${path}`);
  const model = mls.editor.getModels(project, loc.shortName, loc.folder, 2)?.ts;
  if (!model) throw new Error(`model missing: ${path}`);
  await loadImportModels(model, IMPORT_DEPTH, new Set());
  if (model.compilerResults) model.compilerResults.modelNeedCompile = true;
  const ok = await mls.l2.typescript.compileAndPostProcess(model, true, false);
  if (!ok) return null;
  const version = model.compilerResults?.cacheVersion;
  const content = model.compilerResults?.prodJS;
  if (!version || !content) {
    console.error(`[studioDraftL2] ${path}: compile produced no version or prodJS`);
    return null;
  }
  return { path: workerPath(project, loc), version, content };
}

/** `addIfNeed` posts `{action:'add', path, version, content, contentType}` on `registration.active`. This adds `draft`. */
async function postDraftAdd(message: DraftWorkerAdd): Promise<unknown> {
  const sw = globalThis.navigator?.serviceWorker;
  if (!sw || typeof MessageChannel === 'undefined') {
    throw new Error('service workers are not supported in this browser');
  }
  const registration = await sw.ready;
  const worker = registration.active;
  if (!worker) throw new Error('no active service worker to receive the message');
  const channel = new MessageChannel();
  const nodePort = channel.port1 as MessagePort & { unref?: () => void };
  nodePort.unref?.();
  (channel.port2 as MessagePort & { unref?: () => void }).unref?.();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error('service worker add timed out'));
    }, 3000);
    channel.port1.onmessage = (event: MessageEvent) => {
      clearTimeout(timer);
      channel.port1.close();
      const data: unknown = event.data;
      if (typeof data === 'string' && data.startsWith('Error')) {
        reject(new Error(data));
        return;
      }
      resolve(data);
    };
    try {
      worker.postMessage(message, [channel.port2]);
    } catch (err) {
      clearTimeout(timer);
      channel.port1.close();
      reject(err instanceof Error ? err : new Error(errorText(err)));
    }
  });
}

/** `/local/_<project>_….js?v=<17 digits>` → `l2/….ts`. Release versions and other projects → undefined. */
function compiledL2Source(project: number, url: string): string | undefined {
  let path = url;
  if (!path.startsWith('/')) {
    try {
      const parsed = new URL(url);
      path = parsed.pathname + parsed.search;
    } catch (err) {
      console.error(`[studioDraftL2] ${url}: ${errorText(err)}`);
      return undefined;
    }
  }
  const match = COMPILED_L2_URL.exec(path);
  if (!match || Number(match[1]) !== project) return undefined;
  return `l2/${match[2]}.ts`;
}

function browserCaches(): StaleCacheStorage | undefined {
  return (globalThis.caches as StaleCacheStorage | undefined) ?? undefined;
}

/** Drop browser-compiled l2 entries (17-digit version) that are no longer in `keep` or a local edit. */
export async function forgetStaleDraftL2(
  project: number,
  slug: string,
  keep: ReadonlySet<string>,
  deps: Partial<ForgetStaleDeps> = {},
): Promise<number> {
  const caches = deps.caches ?? browserCaches();
  const hasLocalEdit = deps.hasLocalEdit ?? defaultHasLocalEdit;
  const count = caches ? await deleteStaleCompiled(project, slug, keep, caches, hasLocalEdit) : 0;
  console.info(`[studioDraftL2] forgot ${count} compiled l2 entries`);
  return count;
}

async function deleteStaleCompiled(
  project: number,
  slug: string,
  keep: ReadonlySet<string>,
  caches: StaleCacheStorage,
  hasLocalEdit: (project: number, path: string) => boolean,
): Promise<number> {
  const suffix = `-d${slug}`;
  let names: string[];
  try {
    names = await caches.keys();
  } catch (err) {
    console.warn(`[studioDraftL2] forget stale caches: ${errorText(err)}`);
    return 0;
  }
  let count = 0;
  for (const name of names) {
    if (!name.endsWith(suffix)) continue;
    let cache: StaleCache;
    try {
      cache = await caches.open(name);
    } catch (err) {
      console.warn(`[studioDraftL2] forget stale ${name}: ${errorText(err)}`);
      continue;
    }
    let requests: Iterable<StaleCacheRequest>;
    try {
      requests = await cache.keys();
    } catch (err) {
      console.warn(`[studioDraftL2] forget stale ${name}: ${errorText(err)}`);
      continue;
    }
    for (const request of requests) {
      const source = compiledL2Source(project, request.url);
      if (!source || keep.has(source)) continue;
      let local = false;
      try {
        local = hasLocalEdit(project, source);
      } catch (err) {
        console.error(`[studioDraftL2] ${source}: ${errorText(err)}`);
        continue;
      }
      if (local) continue;
      try {
        if (await cache.delete(request)) count += 1;
      } catch (err) {
        console.error(`[studioDraftL2] ${request.url}: ${errorText(err)}`);
      }
    }
  }
  return count;
}

const defaultPublishDeps: PublishDraftL2Deps = {
  draftDiff: requestDraftDiff,
  readDraftText: requestDraftText,
  apply: applyDraft,
  compile: compileDraftForWorker,
  postAdd: postDraftAdd,
  hasLocalEdit: defaultHasLocalEdit,
};

/**
 * Each l2 the draft changed against production: compile with `saveCache` false and
 * `{action:'add', draft:slug}` to the service worker. Does not reload and does not touch a `-d<slug>` cache.
 */
export async function publishDraftL2(
  project: number,
  slug: string,
  deps: PublishDraftL2Deps = defaultPublishDeps,
): Promise<{ sent: number }> {
  if (!DRAFT_SLUG.test(slug)) {
    console.error(`[studioDraftL2] ${slug}: draft slug is invalid; versions were not sent`);
    return { sent: 0 };
  }
  let diff: { head: string; files: DraftDiffName[] };
  try {
    diff = await deps.draftDiff(project, slug);
  } catch (err) {
    console.error(`[studioDraftL2] draftDiff: ${errorText(err)}`);
    return { sent: 0 };
  }
  let sent = 0;
  for (const path of draftL2Targets(diff.files)) {
    if (deps.hasLocalEdit(project, path)) {
      console.info(`[studioDraftL2] ${path}: local edit kept`);
      continue;
    }
    try {
      const text = await deps.readDraftText(project, path);
      await deps.apply(project, path, text);
      const compiled = await deps.compile(project, path);
      if (!compiled) {
        console.error(`[studioDraftL2] ${path}: compile failed`);
        continue;
      }
      await deps.postAdd({
        action: 'add',
        path: compiled.path,
        version: compiled.version,
        content: compiled.content,
        contentType: 'application/javascript',
        draft: slug,
      });
      sent += 1;
    } catch (err) {
      console.error(`[studioDraftL2] ${path}: ${errorText(err)}`);
    }
  }
  return { sent };
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
