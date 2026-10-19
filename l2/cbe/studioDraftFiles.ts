/// <mls fileReference="_102033_/l2/cbe/studioDraftFiles.ts" enhancement="_blank" />
// Point the in-memory file list at the draft blobs from draftDiff.
// Memory only: do not call savePrjInfo, updateProjectFilesInfo or loadOtherProjectInfoIfNeeded,
// and do not change the project updated-at. The next login would overwrite these files.

export interface DraftDiffFile {
  status: string;
  path: string;
  sha: string | null;
  from?: string;
}

export interface DraftFileOp {
  action: 'add' | 'modify' | 'delete';
  path: string;
  level: number;
  folder: string;
  shortName: string;
  extension: string;
  sha: string | null;
}

export interface DraftFileIdentity {
  project: number;
  level: number;
  shortName: string;
  extension: string;
  folder: string;
}

export interface DraftFilesDeps {
  draftDiff(project: number, slug: string): Promise<{ head: string; files: DraftDiffFile[] }>;
  hasLocalEdit(project: number, path: string): boolean;
  addOrUpdateFile(info: DraftFileIdentity & { versionRef: string }): Promise<unknown>;
  fileKey(info: DraftFileIdentity): string;
  files(): { [key: string]: { versionRef: string } };
}

interface ParsedDraftFile {
  level: number;
  folder: string;
  shortName: string;
  extension: string;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `l2/cbe/studioDraftFiles.ts` → level, folder, short name, extension. Other paths → undefined. */
function parseDraftFile(path: string): ParsedDraftFile | undefined {
  const layer = path.startsWith('l1/') ? 1 : path.startsWith('l2/') ? 2 : path.startsWith('l3/') ? 3 : 0;
  if (layer === 0) return undefined;
  const rest = path.slice(3);
  if (rest.length === 0 || rest.startsWith('/') || rest.endsWith('/')) return undefined;
  const slash = rest.lastIndexOf('/');
  const folder = slash === -1 ? '' : rest.slice(0, slash);
  const filename = slash === -1 ? rest : rest.slice(slash + 1);
  if (!filename || (slash !== -1 && !folder)) return undefined;
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return { level: layer, folder, shortName: filename, extension: '' };
  const shortName = filename.slice(0, dot);
  if (!shortName) return undefined;
  return { level: layer, folder, shortName, extension: filename.slice(dot) };
}

function toOp(action: DraftFileOp['action'], path: string, loc: ParsedDraftFile, sha: string | null): DraftFileOp {
  return {
    action,
    path,
    level: loc.level,
    folder: loc.folder,
    shortName: loc.shortName,
    extension: loc.extension,
    sha,
  };
}

function opsOfRename(file: DraftDiffFile): DraftFileOp[] {
  const created = parseDraftFile(file.path);
  if (typeof file.from !== 'string' || file.from.length === 0) {
    if (!created) return [];
    throw new Error('rename without from');
  }
  const removed = parseDraftFile(file.from);
  if (!removed && !created) return [];
  const ops: DraftFileOp[] = [];
  if (removed) ops.push(toOp('delete', file.from, removed, null));
  if (created) ops.push(toOp('add', file.path, created, file.sha));
  return ops;
}

function opsOf(file: DraftDiffFile): DraftFileOp[] {
  if (file.status === 'R') return opsOfRename(file);
  const loc = parseDraftFile(file.path);
  if (!loc) return [];
  if (file.status === 'A') return [toOp('add', file.path, loc, file.sha)];
  if (file.status === 'M') return [toOp('modify', file.path, loc, file.sha)];
  if (file.status === 'D') return [toOp('delete', file.path, loc, null)];
  throw new Error(`unsupported status ${file.status}`);
}

/** One operation per side of an l1, l2 or l3 diff entry. Anything else is left out. */
export function draftFileOps(files: DraftDiffFile[]): DraftFileOp[] {
  const ops: DraftFileOp[] = [];
  for (const file of files) ops.push(...opsOf(file));
  return ops;
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

function draftDiffFile(item: unknown): DraftDiffFile {
  if (!isRecord(item) || typeof item.status !== 'string' || typeof item.path !== 'string') {
    throw new Error('draftDiff file entry is invalid');
  }
  if (item.sha !== null && typeof item.sha !== 'string') throw new Error('draftDiff file entry is invalid');
  if (item.from !== undefined && typeof item.from !== 'string') throw new Error('draftDiff file entry is invalid');
  const file: DraftDiffFile = { status: item.status, path: item.path, sha: item.sha };
  if (typeof item.from === 'string') file.from = item.from;
  return file;
}

async function requestDraftDiff(project: number, slug: string): Promise<{ head: string; files: DraftDiffFile[] }> {
  const parsed = await postExec({ action: 'draftDiff', project, draft: slug, names: true });
  if (!isRecord(parsed) || parsed.status !== 'files' || typeof parsed.head !== 'string' || parsed.head.length === 0) {
    const code = isRecord(parsed) && typeof parsed.code === 'string' ? parsed.code : 'bad response';
    throw new Error(code);
  }
  if (!Array.isArray(parsed.files)) throw new Error('draftDiff response has no files array');
  return { head: parsed.head, files: parsed.files.map(draftDiffFile) };
}

function defaultHasLocalEdit(project: number, path: string): boolean {
  const loc = parseDraftFile(path);
  if (!loc) {
    console.error(`[studioDraftFiles] ${path}: local edit check is not an l1/l2/l3 file`);
    return false;
  }
  const base: DraftFileIdentity = {
    project,
    level: loc.level,
    shortName: loc.shortName,
    extension: loc.extension,
    folder: loc.folder,
  };
  const key = mls.stor.getKeyToFile(base);
  return mls.stor.files[key]?.inLocalStorage === true;
}

const defaultDeps: DraftFilesDeps = {
  draftDiff: requestDraftDiff,
  hasLocalEdit: defaultHasLocalEdit,
  addOrUpdateFile: (info) => mls.stor.addOrUpdateFile(info),
  fileKey: (info) => mls.stor.getKeyToFile(info),
  files: () => mls.stor.files,
};

async function applyOp(project: number, op: DraftFileOp, deps: DraftFilesDeps): Promise<'added' | 'changed' | 'removed'> {
  const base: DraftFileIdentity = {
    project,
    level: op.level,
    shortName: op.shortName,
    extension: op.extension,
    folder: op.folder,
  };
  const stored = deps.files();
  const key = deps.fileKey(base);
  if (op.action === 'delete') {
    delete stored[key];
    return 'removed';
  }
  if (!op.sha) throw new Error('missing sha');
  const existing = stored[key];
  if (op.action === 'modify' && existing) {
    existing.versionRef = op.sha;
    return 'changed';
  }
  await deps.addOrUpdateFile({ ...base, versionRef: op.sha });
  return 'added';
}

export async function applyDraftFiles(
  project: number,
  slug: string,
  deps: DraftFilesDeps = defaultDeps,
): Promise<{ added: number; changed: number; removed: number }> {
  let diff: { head: string; files: DraftDiffFile[] };
  try {
    diff = await deps.draftDiff(project, slug);
  } catch (err) {
    console.error(`[studioDraftFiles] draftDiff: ${errorText(err)}`);
    return { added: 0, changed: 0, removed: 0 };
  }

  const counts = { added: 0, changed: 0, removed: 0 };
  for (const file of diff.files) {
    let ops: DraftFileOp[];
    try {
      ops = draftFileOps([file]);
    } catch (err) {
      console.error(`[studioDraftFiles] ${file.path}: ${errorText(err)}`);
      continue;
    }
    for (const op of ops) {
      if (deps.hasLocalEdit(project, op.path)) {
        console.info(`[studioDraftFiles] ${op.path}: local edit kept`);
        continue;
      }
      try {
        const outcome = await applyOp(project, op, deps);
        counts[outcome] += 1;
      } catch (err) {
        console.error(`[studioDraftFiles] ${op.path}: ${errorText(err)}`);
      }
    }
  }
  return counts;
}
