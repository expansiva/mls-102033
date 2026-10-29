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

export interface DraftDiffResult {
  head: string;
  /** Commit of main, when the server sent it. */
  main?: string;
  files: DraftDiffFile[];
}

/** One editor model of a source file. `.d.ts` has none. */
export type SourceModelSlot = 'ts' | 'test' | 'html' | 'style' | 'defs';

export function sourceModelSlot(extension: string): SourceModelSlot | undefined {
  if (extension === '.ts') return 'ts';
  if (extension === '.test.ts') return 'test';
  if (extension === '.defs.ts') return 'defs';
  if (extension === '.html') return 'html';
  if (extension === '.less') return 'style';
  return undefined;
}

/**
 * Bytes `_checkSameContent` hashes. `.less` drops the token block and trims;
 * every other source file is hashed as stored.
 */
export function draftContentCrc(text: string, extension: string): string {
  const source = extension === '.less'
    ? text.replace(/\/\/Start Less Tokens[\s\S]*?\/\/End Less Tokens/g, '').trim()
    : text;
  return mls.common.crc.crc32(source).toString(16);
}

/** CRC of the last draft send, per file. Not the published baseline. */
const sentCrc = new Map<string, string>();

function sentCrcKey(file: DraftFileIdentity): string {
  return `${file.project}\u0000${file.level}\u0000${file.folder}\u0000${file.shortName}\u0000${file.extension}`;
}

export function rememberSentCrc(file: DraftFileIdentity, crc: string): void {
  sentCrc.set(sentCrcKey(file), crc);
}

export function sentCrcOf(file: DraftFileIdentity): string | undefined {
  return sentCrc.get(sentCrcKey(file));
}

interface DraftStoredRow {
  versionRef: string;
  status?: string;
  inLocalStorage?: boolean;
  getHistoryContent?(ref: string): Promise<string | null>;
  getContent?(): Promise<string | Blob | null>;
  getValueInfo?(): Promise<mls.stor.IFileInfoValue | null | undefined>;
}

export interface DraftFilesDeps {
  draftDiff(project: number, slug: string): Promise<DraftDiffResult>;
  hasLocalEdit(project: number, path: string): boolean;
  addOrUpdateFile(info: DraftFileIdentity & { versionRef: string }): Promise<unknown>;
  fileKey(info: DraftFileIdentity): string;
  files(): { [key: string]: DraftStoredRow };
}

/** Published commit from the last draftDiff. Undo reads it to load the published blob. */
let publishedCommit: string | undefined;

export function draftPublishedCommit(): string | undefined {
  return publishedCommit;
}

/** Keep a non-empty main. An empty value does not wipe a commit already stored. */
export function rememberDraftMain(main: string): void {
  if (main.length === 0) {
    console.error('[studioDraftFiles] draftDiff main is empty');
    return;
  }
  publishedCommit = main;
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
  // First dot, same split as parseStorFileName (static/libs/mls.js:3568).
  const dot = filename.indexOf('.');
  if (dot < 0) return { level: layer, folder, shortName: filename, extension: '' };
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

async function requestDraftDiff(project: number, slug: string): Promise<DraftDiffResult> {
  const parsed = await postExec({ action: 'draftDiff', project, draft: slug, names: true });
  if (!isRecord(parsed) || parsed.status !== 'files' || typeof parsed.head !== 'string' || parsed.head.length === 0) {
    const code = isRecord(parsed) && typeof parsed.code === 'string' ? parsed.code : 'bad response';
    throw new Error(code);
  }
  if (!Array.isArray(parsed.files)) throw new Error('draftDiff response has no files array');
  const files = parsed.files.map(draftDiffFile);
  // The list and the source do not need main; only the undo does, and it reports the gap itself.
  if (typeof parsed.main !== 'string' || parsed.main.length === 0) {
    console.error('[studioDraftFiles] draftDiff response has no main; undo cannot find the published version');
    return { head: parsed.head, files };
  }
  rememberDraftMain(parsed.main);
  return { head: parsed.head, main: parsed.main, files };
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

type DraftStorStatus = 'new' | 'changed' | 'renamed';

function draftStorStatus(gitStatus: string): DraftStorStatus | undefined {
  if (gitStatus === 'A') return 'new';
  if (gitStatus === 'M') return 'changed';
  if (gitStatus === 'R') return 'renamed';
  return undefined;
}

function asStoredFile(value: unknown): { versionRef: string; status?: string } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if (typeof (value as { versionRef?: unknown }).versionRef !== 'string') return undefined;
  return value as { versionRef: string; status?: string };
}

function writeDraftStatus(
  op: DraftFileOp,
  row: { status?: string } | undefined,
  status: DraftStorStatus | undefined,
): void {
  if (!status) {
    console.error(`[studioDraftFiles] ${op.path}: no draft status to store`);
    return;
  }
  if (!row) {
    console.error(`[studioDraftFiles] ${op.path}: no stored row for status ${status}`);
    return;
  }
  row.status = status;
}

async function applyOp(
  project: number,
  op: DraftFileOp,
  deps: DraftFilesDeps,
  status: DraftStorStatus | undefined,
): Promise<'added' | 'changed' | 'removed'> {
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
    writeDraftStatus(op, existing, status);
    return 'changed';
  }
  const created = asStoredFile(await deps.addOrUpdateFile({ ...base, versionRef: op.sha }));
  writeDraftStatus(op, created ?? deps.files()[key], status);
  return 'added';
}

function identityOf(project: number, loc: ParsedDraftFile): DraftFileIdentity {
  return {
    project,
    level: loc.level,
    shortName: loc.shortName,
    extension: loc.extension,
    folder: loc.folder,
  };
}

function rowAt(project: number, path: string, deps: DraftFilesDeps): DraftStoredRow | undefined {
  const loc = parseDraftFile(path);
  if (!loc) return undefined;
  return deps.files()[deps.fileKey(identityOf(project, loc))];
}

type ValueInfoFn = () => Promise<mls.stor.IFileInfoValue | null | undefined>;

/** Original `getValueInfo` under our wrapper, or null when the wrapper had none. */
const pinBase = new WeakMap<ValueInfoFn, ValueInfoFn | null>();

/**
 * `_createModel` keeps `info.originalCRC` only when `info.content` is set, and it
 * reads `getValueInfo` before replacing it. Return the draft text with the published CRC.
 */
function installPublishedCrc(row: DraftStoredRow, crc: string, path: string): void {
  const current = row.getValueInfo;
  const known = current ? pinBase.get(current) : undefined;
  const base = known !== undefined ? known ?? undefined : current?.bind(row);
  const readContent = row.getContent?.bind(row);
  const pinned: ValueInfoFn = async () => {
    let info: mls.stor.IFileInfoValue | null | undefined;
    try {
      info = base ? await base() : undefined;
    } catch (err) {
      console.error(`[studioDraftFiles] ${path}: ${errorText(err)}`);
      return undefined;
    }
    if (info?.content) return { ...info, originalCRC: crc };
    let loaded: string | Blob | null = null;
    try {
      loaded = readContent ? await readContent() : null;
    } catch (err) {
      console.error(`[studioDraftFiles] ${path}: ${errorText(err)}`);
    }
    if (typeof loaded !== 'string' || loaded.length === 0) {
      console.error(`[studioDraftFiles] ${path}: published baseline has no draft text to keep`);
      return { content: null, originalCRC: crc };
    }
    return { content: loaded, originalCRC: crc };
  };
  pinBase.set(pinned, base ?? null);
  row.getValueInfo = pinned;
}

function assignOpenModel(project: number, loc: ParsedDraftFile, crc: string): void {
  const slot = sourceModelSlot(loc.extension);
  if (!slot) return;
  const editor = mls.editor;
  if (!editor?.getKeyModel || !editor.models) return;
  try {
    const key = editor.getKeyModel(project, loc.shortName, loc.folder, loc.level);
    const model = editor.models[key]?.[slot];
    if (!model) return;
    model.originalCRC = crc;
  } catch (err) {
    console.error(`[studioDraftFiles] ${loc.shortName}: could not set the published CRC`, err);
  }
}

function plantPublishedCrc(project: number, path: string, text: string, deps: DraftFilesDeps): void {
  const loc = parseDraftFile(path);
  const row = rowAt(project, path, deps);
  if (!loc || !row) {
    console.error(`[studioDraftFiles] ${path}: no stored row for the published baseline`);
    return;
  }
  let crc: string;
  try {
    crc = draftContentCrc(text, loc.extension);
  } catch (err) {
    console.error(`[studioDraftFiles] ${path}: ${errorText(err)}`);
    return;
  }
  installPublishedCrc(row, crc, path);
  assignOpenModel(project, loc, crc);
}

async function seedSentCrc(project: number, path: string, deps: DraftFilesDeps): Promise<void> {
  const loc = parseDraftFile(path);
  const row = rowAt(project, path, deps);
  if (!loc || !row || row.inLocalStorage === true || !row.getContent) return;
  let loaded: string | Blob | null;
  try {
    loaded = await row.getContent.call(row);
  } catch (err) {
    console.error(`[studioDraftFiles] ${path}: ${errorText(err)}`);
    return;
  }
  if (typeof loaded !== 'string') {
    console.error(`[studioDraftFiles] ${path}: draft text is not a string`);
    return;
  }
  try {
    rememberSentCrc(identityOf(project, loc), draftContentCrc(loaded, loc.extension));
  } catch (err) {
    console.error(`[studioDraftFiles] ${path}: ${errorText(err)}`);
  }
}

async function publishedText(
  project: number,
  file: DraftDiffFile,
  main: string,
  deps: DraftFilesDeps,
): Promise<string | null> {
  const publishedPath = file.status === 'R' && file.from ? file.from : file.path;
  const row = rowAt(project, publishedPath, deps);
  const read = row?.getHistoryContent?.bind(row);
  if (!read) {
    console.error(`[studioDraftFiles] ${file.path}: no getHistoryContent for the published baseline`);
    return null;
  }
  try {
    const text = await read(main);
    if (text === null) {
      console.error(`[studioDraftFiles] ${file.path}: published content is missing at ${main}`);
      return null;
    }
    return text;
  } catch (err) {
    console.error(`[studioDraftFiles] ${file.path}: ${errorText(err)}`);
    return null;
  }
}

export async function applyDraftFiles(
  project: number,
  slug: string,
  deps: DraftFilesDeps = defaultDeps,
): Promise<{ added: number; changed: number; removed: number }> {
  let diff: DraftDiffResult;
  try {
    diff = await deps.draftDiff(project, slug);
  } catch (err) {
    console.error(`[studioDraftFiles] draftDiff: ${errorText(err)}`);
    return { added: 0, changed: 0, removed: 0 };
  }
  if (typeof diff.main === 'string') rememberDraftMain(diff.main);

  const counts = { added: 0, changed: 0, removed: 0 };
  for (const file of diff.files) {
    let ops: DraftFileOp[];
    try {
      ops = draftFileOps([file]);
    } catch (err) {
      console.error(`[studioDraftFiles] ${file.path}: ${errorText(err)}`);
      continue;
    }
    // Rename deletes the published path. Read that blob before the row is gone.
    // A modify that is not in the map yet is read after applyOp creates the row.
    const wantBaseline = Boolean(diff.main)
      && (file.status === 'M' || file.status === 'R')
      && Boolean(parseDraftFile(file.path));
    const publishedPath = file.status === 'R' && file.from ? file.from : file.path;
    let published: string | null | undefined;
    if (wantBaseline && diff.main && (file.status === 'R' || rowAt(project, publishedPath, deps))) {
      published = await publishedText(project, file, diff.main, deps);
    }
    for (const op of ops) {
      if (deps.hasLocalEdit(project, op.path)) {
        console.info(`[studioDraftFiles] ${op.path}: local edit kept`);
        continue;
      }
      try {
        const outcome = await applyOp(project, op, deps, draftStorStatus(file.status));
        counts[outcome] += 1;
      } catch (err) {
        console.error(`[studioDraftFiles] ${op.path}: ${errorText(err)}`);
      }
    }
    if (wantBaseline && published === undefined && diff.main && file.status === 'M') {
      published = await publishedText(project, file, diff.main, deps);
    }
    if (typeof published !== 'string') continue;
    plantPublishedCrc(project, file.path, published, deps);
    await seedSentCrc(project, file.path, deps);
  }
  return counts;
}
