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

/** Window event: the unsaved count may have changed, and no file event fired. 102033 does not import the listener. */
export const COLLAB_DRAFT_RECOUNT = 'collabDraftRecount';

export interface ICollabDraftRecountDetail {
  project: number;
}

export function requestDraftRecount(project: number): void {
  if (typeof project !== 'number' || project <= 0) {
    console.error('[studioDraftFiles] collabDraftRecount was not dispatched: project is missing');
    return;
  }
  const target = (globalThis as { window?: EventTarget }).window;
  if (!target || typeof target.dispatchEvent !== 'function') {
    console.error('[studioDraftFiles] collabDraftRecount was not dispatched: window is missing');
    return;
  }
  const detail: ICollabDraftRecountDetail = { project };
  try {
    target.dispatchEvent(new CustomEvent(COLLAB_DRAFT_RECOUNT, { detail }));
  } catch (err) {
    console.error('[studioDraftFiles] collabDraftRecount was not dispatched:', err);
  }
}

/** Studio entry has asked for the diff and has not finished seeding. Born false: no draft, no hold. */
let entrySeedOpen = false;

/** Only `enterStudioDraft` opens the hold, before its diff. Other `requestDraftDiff` callers (discard module) never do. */
export function beginDraftEntrySeed(): void {
  entrySeedOpen = true;
}

export function draftEntrySeedPending(): boolean {
  return entrySeedOpen;
}

/** Seeding finished, saved or failed. The recount is what publishes the cover, once. */
export function completeDraftEntrySeed(project: number): void {
  if (!entrySeedOpen) return;
  entrySeedOpen = false;
  requestDraftRecount(project);
}

/** Window event after a draft restore was accepted. Same name the panel already emits. */
export const COLLAB_DRAFT_DISCARDED = 'collabDraftDiscarded';

export interface ICollabDraftDiscardedDetail {
  project: number;
  /** Paths restored by this undo. */
  before: string[];
  /** Nothing stays in the diff for those paths. */
  after: string[];
}

/** Paths last seen in this tab's draft. Undo of a local copy uses this to tell a saved file from a browser-only one. */
const draftPaths = new Set<string>();

function draftPathKey(project: number, path: string): string {
  return `${project}\u0000${path}`;
}

export function rememberDraftPaths(project: number, paths: readonly string[]): void {
  for (const path of paths) {
    if (path.length === 0) continue;
    draftPaths.add(draftPathKey(project, path));
  }
}

export function forgetDraftPaths(project: number, paths: readonly string[]): void {
  for (const path of paths) draftPaths.delete(draftPathKey(project, path));
}

export function draftPathIsSaved(project: number, path: string): boolean {
  return draftPaths.has(draftPathKey(project, path));
}

/** A stor row the Save uses to find the draft path a `new` rename should drop. */
export interface IDraftRenameOriginFile {
  project: number;
  status?: string;
  level?: number;
  folder?: string;
  shortName?: string;
  extension?: string;
  inLocalStorage?: boolean;
  getValueInfo?: () => Promise<{
    originalFolder?: string;
    originalProject?: number;
    originalShortName?: string;
  } | null | undefined>;
}

function draftShortPath(level: number, folder: string, shortName: string, extension: string): string {
  const folderPart = folder === '' ? '' : `${folder}/`;
  return `l${level}/${folderPart}${shortName}${extension}`;
}

function listedDraftPaths(project: number): string[] {
  const prefix = `${project}\u0000`;
  const listed: string[] = [];
  for (const key of draftPaths) {
    if (key.startsWith(prefix)) listed.push(key.slice(prefix.length));
  }
  return listed;
}

function storHasDraftPath(project: number, path: string): boolean {
  const loc = parseDraftFile(path);
  const stor = (globalThis as {
    mls?: {
      stor?: {
        files?: Record<string, unknown>;
        getKeyToFiles?: (
          project: number,
          level: number,
          shortName: string,
          folder: string,
          extension: string,
        ) => string;
      };
    };
  }).mls?.stor;
  if (!loc || !stor?.files || typeof stor.getKeyToFiles !== 'function') return false;
  const key = stor.getKeyToFiles(project, loc.level, loc.shortName, loc.folder, loc.extension);
  return stor.files[key] != null;
}

async function readRenameOrigin(
  file: IDraftRenameOriginFile,
): Promise<{ originalFolder?: string; originalProject?: number; originalShortName?: string } | undefined> {
  if (!file.getValueInfo) return undefined;
  const previous = file.inLocalStorage;
  file.inLocalStorage = true;
  try {
    return (await file.getValueInfo()) ?? undefined;
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    console.error(`[studioDraftFiles] rename origin could not be read: ${why}`);
    return undefined;
  } finally {
    file.inLocalStorage = previous;
  }
}

function uniqueStaleOrigin(
  project: number,
  current: string,
  level: number,
  extension: string,
): string | undefined {
  const stale: string[] = [];
  for (const path of listedDraftPaths(project)) {
    if (path === current) continue;
    const loc = parseDraftFile(path);
    if (!loc || loc.level !== level || loc.extension !== extension) continue;
    if (storHasDraftPath(project, path)) continue;
    stale.push(path);
  }
  if (stale.length === 0) return undefined;
  if (stale.length === 1) return stale[0];
  console.error(`[studioDraftFiles] several saved names could be the rename origin of ${current}`);
  return undefined;
}

/**
 * Draft path the Save must delete for a `new` file that was renamed after it was saved.
 * The published `renamed` status is left to the driver. A name that was never in the draft
 * is not deleted. A→B→C without a save in the middle drops A, the oldest name still in the draft.
 */
export async function savedOriginToDrop(file: IDraftRenameOriginFile): Promise<string | undefined> {
  if (file.status !== 'new') return undefined;
  if (
    file.level === undefined
    || file.shortName === undefined
    || file.folder === undefined
    || file.extension === undefined
  ) {
    console.error('[studioDraftFiles] renamed new file is missing a path');
    return undefined;
  }
  const current = draftShortPath(file.level, file.folder, file.shortName, file.extension);
  const info = await readRenameOrigin(file);
  const originalName = info?.originalShortName;
  if (!originalName) return undefined;
  if (info.originalProject !== undefined && info.originalProject !== file.project) {
    console.error(`[studioDraftFiles] rename origin of ${current} is in another project`);
    return undefined;
  }
  const originalFolder = (info.originalFolder ?? file.folder).replace(/\\/gu, '/');
  const origin = draftShortPath(file.level, originalFolder, originalName, file.extension);
  if (origin === current) return undefined;
  if (draftPathIsSaved(file.project, origin)) return origin;
  return uniqueStaleOrigin(file.project, current, file.level, file.extension);
}

/** Stor row `DriverVm.setContents` treats as a delete. Non-l1/l2/l3 paths stay in the draft. */
export function deletedDraftFile(project: number, path: string): {
  project: number;
  level: number;
  folder: string;
  shortName: string;
  extension: string;
  status: 'deleted';
} | undefined {
  const loc = parseDraftFile(path);
  if (!loc) {
    console.error(`[studioDraftFiles] cannot drop a non-l1/l2/l3 origin: ${path}`);
    return undefined;
  }
  return {
    project,
    level: loc.level,
    folder: loc.folder,
    shortName: loc.shortName,
    extension: loc.extension,
    status: 'deleted',
  };
}

let browserOnlyUndo = 0;

/** True while Discard module is clearing local copies. Those undos must not call the server again. */
export function draftUndoBrowserOnly(): boolean {
  return browserOnlyUndo > 0;
}

export async function withDraftUndoBrowserOnly<T>(body: () => Promise<T>): Promise<T> {
  browserOnlyUndo += 1;
  try {
    return await body();
  } finally {
    browserOnlyUndo -= 1;
  }
}

export interface IDraftUndoFetchResponse {
  status: number;
  json: () => Promise<unknown>;
}

export type DraftUndoFetch = (
  input: string,
  init: {
    method: 'POST';
    credentials: 'same-origin';
    headers: { 'Content-Type': 'application/json' };
    body: string;
  },
) => Promise<IDraftUndoFetchResponse>;

const DRAFT_SLUG_RE = /^(team|user)-([a-z0-9_.-]{1,64})$/;

function dispatchDraftDiscarded(project: number, paths: readonly string[]): void {
  const target = (globalThis as { window?: EventTarget }).window;
  if (!target || typeof target.dispatchEvent !== 'function') {
    console.error('[studioDraftFiles] collabDraftDiscarded was not dispatched: window is missing');
    return;
  }
  const detail: ICollabDraftDiscardedDetail = { project, before: [...paths], after: [] };
  try {
    target.dispatchEvent(new CustomEvent(COLLAB_DRAFT_DISCARDED, { detail }));
  } catch (err) {
    console.error('[studioDraftFiles] collabDraftDiscarded was not dispatched:', err);
  }
}

/**
 * One `draftRestorePaths` for every path, then the browser copy, one recount, one preview reload.
 * A server refusal throws before `afterRestore`, so the browser stays as it was.
 */
export async function undoDraftPaths(
  project: number,
  slug: string,
  paths: readonly string[],
  afterRestore: () => Promise<void>,
  fetchImpl?: DraftUndoFetch,
): Promise<void> {
  if (paths.length === 0 || paths.some((path) => path.trim() === '')) {
    console.error('[studioDraftFiles] undo path is empty');
    throw new Error('undo path is empty');
  }
  if (!DRAFT_SLUG_RE.test(slug)) {
    console.error(`[studioDraftFiles] undo draft slug is invalid: ${slug}`);
    throw new Error(`undo draft slug is invalid: ${slug}`);
  }
  const fetchFn: DraftUndoFetch = fetchImpl ?? ((input, init) => fetch(input, init));
  let response: IDraftUndoFetchResponse;
  try {
    response = await fetchFn('/exec', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'draftRestorePaths',
        project,
        draft: slug,
        ref: 'main',
        paths: [...paths],
      }),
    });
  } catch (err) {
    const message = errorText(err);
    console.error(`[studioDraftFiles] draftRestorePaths: ${message}`);
    throw new Error(message);
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (err) {
    const message = errorText(err);
    console.error(`[studioDraftFiles] draftRestorePaths: ${message}`);
    throw new Error(message);
  }
  if (!isRecord(parsed)) {
    console.error('[studioDraftFiles] draftRestorePaths response was not a JSON object');
    throw new Error('response was not a JSON object');
  }
  if (typeof parsed.code === 'string') {
    const message = typeof parsed.msg === 'string' ? parsed.msg : parsed.code;
    console.error(`[studioDraftFiles] draftRestorePaths: ${message}`);
    throw new Error(message);
  }
  if (parsed.status !== 'restored' && parsed.status !== 'unchanged') {
    const message = typeof parsed.status === 'string' ? parsed.status : 'draftRestorePaths failed';
    console.error(`[studioDraftFiles] draftRestorePaths: ${message}`);
    throw new Error(message);
  }
  try {
    await afterRestore();
  } catch (err) {
    const message = errorText(err);
    console.error(`[studioDraftFiles] draftRestorePaths accepted but the browser copy stayed: ${message}`);
    throw err instanceof Error ? err : new Error(message);
  }
  forgetDraftPaths(project, paths);
  requestDraftRecount(project);
  dispatchDraftDiscarded(project, paths);
}

interface DraftStoredRow {
  versionRef: string;
  status?: string;
  inLocalStorage?: boolean;
  project?: number;
  level?: number;
  shortName?: string;
  folder?: string;
  extension?: string;
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

export async function requestDraftDiff(project: number, slug: string): Promise<DraftDiffResult> {
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

/** One driver getContents call covers at most this many paths. */
const DRAFT_CONTENT_BATCH = 100;

type ContentsReader = (
  project: number,
  fileInfos: mls.stor.IFileInfo[],
  ref?: string,
) => Promise<mls.stor.IRegGetContents[]>;

/** Draft reads omit `ref`. Published reads pass the commit of main. */
async function readContents(
  project: number,
  fileInfos: mls.stor.IFileInfo[],
  ref?: string,
): Promise<mls.stor.IRegGetContents[]> {
  const driver = await mls.stor.others.getDefaultDriver(project);
  const read = driver.getContents as ContentsReader;
  if (ref === undefined) return await read(project, fileInfos);
  return await read(project, fileInfos, ref);
}

interface SentCrcTarget {
  path: string;
  loc: ParsedDraftFile;
  row: DraftStoredRow;
}

/** Path fields the driver reads. The stored row is sent when it already has them. */
interface DraftContentRequest extends DraftFileIdentity {
  versionRef: string;
}

function sentCrcTarget(project: number, path: string, deps: DraftFilesDeps): SentCrcTarget | undefined {
  const loc = parseDraftFile(path);
  const row = rowAt(project, path, deps);
  if (!loc || !row || !row.getContent) return undefined;
  return { path, loc, row };
}

function contentRequest(project: number, target: SentCrcTarget): mls.stor.IFileInfo {
  const row = target.row as Partial<mls.stor.IFileInfo>;
  if (
    row.level === target.loc.level
    && row.folder === target.loc.folder
    && row.shortName === target.loc.shortName
    && row.extension === target.loc.extension
  ) {
    return target.row as mls.stor.IFileInfo;
  }
  const request: DraftContentRequest = {
    project,
    level: target.loc.level,
    folder: target.loc.folder,
    shortName: target.loc.shortName,
    extension: target.loc.extension,
    versionRef: target.row.versionRef,
  };
  return request as mls.stor.IFileInfo;
}

function fileRequest(project: number, loc: ParsedDraftFile): mls.stor.IFileInfo {
  const request: DraftContentRequest = {
    project,
    level: loc.level,
    folder: loc.folder,
    shortName: loc.shortName,
    extension: loc.extension,
    versionRef: '',
  };
  return request as mls.stor.IFileInfo;
}

function rememberLoadedCrc(project: number, target: SentCrcTarget, loaded: string | Blob | null | undefined): void {
  if (typeof loaded !== 'string') {
    console.error(`[studioDraftFiles] ${target.path}: draft text is not a string`);
    return;
  }
  try {
    rememberSentCrc(identityOf(project, target.loc), draftContentCrc(loaded, target.loc.extension));
  } catch (err) {
    console.error(`[studioDraftFiles] ${target.path}: ${errorText(err)}`);
  }
}

/** Draft text for the sent CRC, one getContents per batch. A failed batch is logged and skipped. */
async function seedSentCrcs(project: number, targets: SentCrcTarget[]): Promise<void> {
  for (let start = 0; start < targets.length; start += DRAFT_CONTENT_BATCH) {
    const batch = targets.slice(start, start + DRAFT_CONTENT_BATCH);
    const paths = batch.map((target) => target.path).join(', ');
    const fileInfos = batch.map((target) => contentRequest(project, target));
    let loaded: mls.stor.IRegGetContents[];
    try {
      loaded = await readContents(project, fileInfos);
    } catch (err) {
      console.error(`[studioDraftFiles] ${paths}: ${errorText(err)}`);
      continue;
    }
    const byInfo = new Map<mls.stor.IFileInfo, string | Blob | null>();
    for (const item of loaded ?? []) byInfo.set(item.fileInfo, item.content);
    for (let index = 0; index < batch.length; index++) {
      rememberLoadedCrc(project, batch[index], byInfo.get(fileInfos[index]));
    }
  }
  if (!draftEntrySeedPending()) requestDraftRecount(project);
}

interface PublishedRead {
  file: DraftDiffFile;
  loc: ParsedDraftFile;
}

/** M/R files whose published blob is read at `main`. A rename reads `from`. */
function publishedReads(files: DraftDiffFile[], main: string): PublishedRead[] {
  const reads: PublishedRead[] = [];
  for (const file of files) {
    if (file.status !== 'M' && file.status !== 'R') continue;
    if (!parseDraftFile(file.path)) continue;
    const publishedPath = file.status === 'R' && file.from ? file.from : file.path;
    const loc = parseDraftFile(publishedPath);
    if (!loc) {
      console.error(`[studioDraftFiles] ${file.path}: published content is missing at ${main}`);
      continue;
    }
    reads.push({ file, loc });
  }
  return reads;
}

/** Published text for every M/R, one getContents per batch, before any row is removed. */
async function loadPublishedTexts(
  project: number,
  reads: PublishedRead[],
  main: string,
): Promise<Map<DraftDiffFile, string>> {
  const texts = new Map<DraftDiffFile, string>();
  for (let start = 0; start < reads.length; start += DRAFT_CONTENT_BATCH) {
    const batch = reads.slice(start, start + DRAFT_CONTENT_BATCH);
    const paths = batch.map((read) => read.file.path).join(', ');
    const fileInfos = batch.map((read) => fileRequest(project, read.loc));
    let loaded: mls.stor.IRegGetContents[];
    try {
      loaded = await readContents(project, fileInfos, main);
    } catch (err) {
      console.error(`[studioDraftFiles] ${paths}: ${errorText(err)}`);
      continue;
    }
    const byInfo = new Map<mls.stor.IFileInfo, string | Blob | null>();
    for (const item of loaded ?? []) byInfo.set(item.fileInfo, item.content);
    for (let index = 0; index < batch.length; index++) {
      const text = byInfo.get(fileInfos[index]);
      if (typeof text !== 'string') {
        console.error(`[studioDraftFiles] ${batch[index].file.path}: published content is missing at ${main}`);
        continue;
      }
      texts.set(batch[index].file, text);
    }
  }
  return texts;
}

interface OutsideLocal {
  path: string;
  row: DraftStoredRow;
}

/** l1/l2/l3 browser copies that are not a side of this draftDiff. */
function outsideLocals(
  project: number,
  rows: { [key: string]: DraftStoredRow },
  inDiff: Set<string>,
): OutsideLocal[] {
  const found: OutsideLocal[] = [];
  for (const row of Object.values(rows)) {
    if (!row || row.project !== project || row.inLocalStorage !== true) continue;
    if (row.level !== 1 && row.level !== 2 && row.level !== 3) continue;
    if (typeof row.shortName !== 'string' || row.shortName.length === 0 || typeof row.folder !== 'string' || typeof row.extension !== 'string') {
      console.error('[studioDraftFiles] local copy has no path');
      continue;
    }
    const folder = row.folder.length > 0 ? `${row.folder}/` : '';
    const path = `l${row.level}/${folder}${row.shortName}${row.extension}`;
    if (inDiff.has(path)) continue;
    if (!parseDraftFile(path)) {
      console.error(`[studioDraftFiles] ${path}: local copy is not an l1/l2/l3 file`);
      continue;
    }
    found.push({ path, row });
  }
  found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return found;
}

async function localCopyText(path: string, row: DraftStoredRow): Promise<string | undefined> {
  if (!row.getValueInfo) {
    console.error(`[studioDraftFiles] ${path}: local copy has no getValueInfo`);
    return undefined;
  }
  try {
    const info = await row.getValueInfo();
    if (typeof info?.content !== 'string') {
      console.error(`[studioDraftFiles] ${path}: local copy is not text`);
      return undefined;
    }
    return info.content;
  } catch (err) {
    console.error(`[studioDraftFiles] ${path}: ${errorText(err)}`);
    return undefined;
  }
}

/** IndexedDB row gone, and the file is no longer "edited". */
async function clearLocalCopy(path: string, row: DraftStoredRow): Promise<void> {
  const setContent = mls.stor.localStor?.setContent;
  if (typeof setContent !== 'function') {
    console.error(`[studioDraftFiles] ${path}: localStor.setContent is missing`);
    return;
  }
  try {
    const stored = await setContent(row as mls.stor.IFileInfo, { contentType: 'string', content: null });
    if (stored === false) {
      console.error(`[studioDraftFiles] ${path}: local copy was not cleared`);
      return;
    }
  } catch (err) {
    console.error(`[studioDraftFiles] ${path}: ${errorText(err)}`);
    return;
  }
  row.inLocalStorage = false;
  row.status = 'nochange';
}

/**
 * A local copy that matches `main` and is absent from the draft is the published file.
 * One that is still in the draft stays: undo keeps that copy until the draft comes back.
 */
async function dropLocalsEqualToPublished(
  project: number,
  files: DraftDiffFile[],
  main: string,
  deps: DraftFilesDeps,
): Promise<void> {
  const inDiff = new Set<string>();
  for (const file of files) {
    inDiff.add(file.path);
    if (typeof file.from === 'string' && file.from.length > 0) inDiff.add(file.from);
  }
  const copies = outsideLocals(project, deps.files(), inDiff);
  const comparable: OutsideLocal[] = [];
  const locals = new Map<string, string>();
  for (const copy of copies) {
    const text = await localCopyText(copy.path, copy.row);
    if (text === undefined) continue;
    locals.set(copy.path, text);
    comparable.push(copy);
  }
  if (comparable.length === 0) return;
  const asDiff: DraftDiffFile[] = comparable.map((copy) => ({ status: 'M', path: copy.path, sha: null }));
  const published = await loadPublishedTexts(project, publishedReads(asDiff, main), main);
  const publishedByPath = new Map<string, string>();
  for (const file of asDiff) {
    const text = published.get(file);
    if (typeof text === 'string') publishedByPath.set(file.path, text);
  }
  for (const copy of comparable) {
    const onMain = publishedByPath.get(copy.path);
    if (onMain === undefined || onMain !== locals.get(copy.path)) continue;
    await clearLocalCopy(copy.path, copy.row);
  }
}

export async function applyDraftFiles(
  project: number,
  slug: string,
  deps: DraftFilesDeps = defaultDeps,
  known?: DraftDiffResult,
): Promise<{ added: number; changed: number; removed: number }> {
  try {
    return await applyDraftFilesNow(project, slug, deps, known);
  } catch (err) {
    console.error(`[studioDraftFiles] draft seed failed: ${errorText(err)}`);
    throw err;
  } finally {
    if (draftEntrySeedPending()) completeDraftEntrySeed(project);
  }
}

async function applyDraftFilesNow(
  project: number,
  slug: string,
  deps: DraftFilesDeps,
  known?: DraftDiffResult,
): Promise<{ added: number; changed: number; removed: number }> {
  let diff: DraftDiffResult;
  if (known) {
    diff = known;
  } else {
    try {
      diff = await deps.draftDiff(project, slug);
    } catch (err) {
      console.error(`[studioDraftFiles] draftDiff: ${errorText(err)}`);
      return { added: 0, changed: 0, removed: 0 };
    }
  }
  if (typeof diff.main === 'string') rememberDraftMain(diff.main);
  const noted: string[] = [];
  for (const file of diff.files) {
    noted.push(file.path);
    if (typeof file.from === 'string' && file.from.length > 0) noted.push(file.from);
  }
  rememberDraftPaths(project, noted);

  const counts = { added: 0, changed: 0, removed: 0 };
  const sentTargets: SentCrcTarget[] = [];
  // Read every published blob first. A rename's applyOp deletes the origin row.
  const published = diff.main
    ? await loadPublishedTexts(project, publishedReads(diff.files, diff.main), diff.main)
    : new Map<DraftDiffFile, string>();
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
        const outcome = await applyOp(project, op, deps, draftStorStatus(file.status));
        counts[outcome] += 1;
      } catch (err) {
        console.error(`[studioDraftFiles] ${op.path}: ${errorText(err)}`);
      }
    }
    const text = published.get(file);
    if (typeof text !== 'string') continue;
    plantPublishedCrc(project, file.path, text, deps);
    const target = sentCrcTarget(project, file.path, deps);
    if (target) sentTargets.push(target);
  }
  if (typeof diff.main === 'string' && diff.main.length > 0) {
    await dropLocalsEqualToPublished(project, diff.files, diff.main, deps);
  }
  await seedSentCrcs(project, sentTargets);
  return counts;
}
