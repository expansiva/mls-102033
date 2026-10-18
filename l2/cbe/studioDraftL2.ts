/// <mls fileReference="_102033_/l2/cbe/studioDraftL2.ts" enhancement="_blank" />
// Compile, in this browser, the l2 sources the current draft changed against main.
// The draft text comes from /exec (the collab-draft cookie selects the copy).
// It is applied on the editor model directly: storFile.getContent() would return production.

const MARKER_KEY = 'collabDraftL2Synced';
const L2_STATUS = new Set(['A', 'M', 'R']);

export interface DraftDiffName {
  status: string;
  path: string;
}

export interface DraftL2Deps {
  readMarker(): string | null;
  writeMarker(value: string): void;
  draftDiff(project: number, slug: string): Promise<{ head: string; files: DraftDiffName[] }>;
  readDraftText(project: number, path: string): Promise<string>;
  applyAndCompile(project: number, path: string, text: string): Promise<boolean>;
  hasLocalEdit(project: number, path: string): boolean;
}

interface L2File {
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

async function applyAndCompile(project: number, path: string, text: string): Promise<boolean> {
  const loc = parseL2Ts(path);
  if (!loc) throw new Error(`not an l2 source: ${path}`);
  const existing = mls.editor.getModels(project, loc.shortName, loc.folder, 2)?.ts;
  const model = existing ?? await mls.editor.createModelTS(storFileFor(project, loc), text);
  model.model.setValue(text);
  return mls.l2.typescript.compileAndPostProcess(model, true, true);
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
  applyAndCompile,
  hasLocalEdit: defaultHasLocalEdit,
};

export async function syncDraftL2(
  project: number,
  slug: string,
  deps: DraftL2Deps = defaultDeps,
): Promise<{ compiled: number; head: string | null }> {
  let diff: { head: string; files: DraftDiffName[] };
  try {
    diff = await deps.draftDiff(project, slug);
  } catch (err) {
    console.error(`[studioDraftL2] draftDiff: ${errorText(err)}`);
    return { compiled: 0, head: null };
  }
  if (deps.readMarker() === `${slug}@${diff.head}`) return { compiled: 0, head: diff.head };

  const targets = draftL2Targets(diff.files);
  let compiled = 0;
  let failed = false;
  for (const path of targets) {
    if (deps.hasLocalEdit(project, path)) {
      console.info(`[studioDraftL2] ${path}: local edit kept`);
      continue;
    }
    try {
      const text = await deps.readDraftText(project, path);
      const ok = await deps.applyAndCompile(project, path, text);
      if (!ok) {
        failed = true;
        console.error(`[studioDraftL2] ${path}: compile failed`);
        continue;
      }
      compiled += 1;
    } catch (err) {
      failed = true;
      console.error(`[studioDraftL2] ${path}: ${errorText(err)}`);
    }
  }
  if (!failed) deps.writeMarker(`${slug}@${diff.head}`);
  return { compiled, head: diff.head };
}
