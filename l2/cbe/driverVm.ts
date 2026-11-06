/// <mls fileReference="_102033_/l2/cbe/driverVm.ts" enhancement="_blank" />
// Storage driver that reads and writes project SOURCES from the runtime VM
// instead of a git host. It answers the cfe's cache misses over the cbe /exec
// endpoint of the very server that serves this page (same origin, session by
// cookie) — no network call ever leaves the VM.
//
// SLOTS
// The driver's own slot is 'vm', and only that one. The login
// (mls-102034/cbeLogin.ts) announces projectDriver 'vm' for a project that
// declares nothing, and whatever its l5/config.json projectSettings says when
// it does — so a project asking for "GitHub" reaches the REAL git driver, which
// initStudio.registerDrivers puts in the 'github' slot alongside this one. Each
// project is served from where it says it lives.
//
// WHY THE SOURCES ARE NEEDED AT ALL
// The login payload carries `jsContent` (compiled js), NOT the .ts source. So
// running modules works from cache, but opening a file in the editor or an
// agent reading/writing a .ts always misses and lands here.
//
// LOADING: this module extends a class that only exists at runtime
// (mls.stor.others.DriverIOBase), so it MUST be imported dynamically, after
// window.mls is up — never with a static import.

const EXEC_URL = '/exec';
/** Same-origin page that shows one source file — see getUrl. */
const SOURCE_VIEW_URL = '/cbe/source';

interface IVmFilePayload {
  shortPath: string;
  content: string;
  /** utf8 for text, base64 for binary (l3 assets), gzip-base64 when the utf-8 body alone exceeds the ceiling. */
  encoding: 'utf8' | 'base64' | 'gzip-base64';
}

interface IVmContentsResponse {
  statusCode: number;
  msg?: string;
  files?: IVmFilePayload[];
}

interface IVmFilesInfoResponse {
  statusCode: number;
  msg?: string;
  filesInfo?: mls.cbe.IPrjSourcesFiles[];
}

/** One commit, as cbeGit reports it. `date` is ISO-8601; IHistory calls it `data`. */
interface IVmHistoryEntry {
  ref: string;
  authorName: string;
  date: string;
  message: string;
  additions: number;
  deletions: number;
}

interface IVmHistoryResponse {
  statusCode: number;
  msg?: string;
  history?: IVmHistoryEntry[];
}

interface IVmHistoryContentResponse {
  statusCode: number;
  msg?: string;
  content?: string | null;
}

/**
 * Repository path of a file: `l<level>/<folder>/<shortName><extension>`.
 * Same construction the GitHub driver uses, so both drivers address a file
 * identically (level 0 has no prefix; the extension may come without the dot).
 */
export function toShortPath(fileInfo: mls.stor.IFileInfoBase): string {
  const folderSep = fileInfo.folder === '' || fileInfo.folder.endsWith('/') ? '' : '/';
  const extSep = fileInfo.extension.startsWith('.') ? '' : '.';
  const levelPath = fileInfo.level === 0 ? '' : `l${fileInfo.level}/`;
  return `${levelPath}${fileInfo.folder.replace(/\\/gu, '/')}${folderSep}${fileInfo.shortName}${extSep}${fileInfo.extension}`;
}

async function execAction<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(EXEC_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json() as { msg?: string };
      if (typeof body?.msg === 'string' && body.msg.length > 0) detail = `: ${body.msg}`;
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      console.error(`cbe ${action}: error body was not json: ${why}`);
    }
    throw new Error(`cbe ${action} failed: HTTP ${response.status}${detail}`);
  }
  return await response.json() as T;
}

/**
 * UTF-8 size of one setContents POST (`action` + payload).
 * Every request stays at or under 2 MB. The server accepts 4 MB, so the
 * ceiling leaves margin. A text file whose own body exceeds it is sent as
 * gzip-base64 when that still fits in one request. Past that, the encoded
 * text goes in parts and one setContents that only references the upload.
 * A file above 64 MB is not sent.
 */
const SET_CONTENTS_MAX_BODY_BYTES = 2 * 1024 * 1024;

/** Original file size the server accepts after decode. Above this, the file is refused. */
const SET_CONTENTS_MAX_FILE_BYTES = 64 * 1024 * 1024;

/**
 * Joined part text the server will store: the base64 of a 64 MB file.
 * gzip-base64 of a file that does not shrink is larger than this, so that file
 * travels as the original text instead.
 */
const MAX_UPLOAD_CHARS = Math.ceil((SET_CONTENTS_MAX_FILE_BYTES * 4) / 3);

/** Server refuses a total above this. */
const MAX_UPLOAD_PARTS = 64;

/** About 1.5 MB of part text. The request ceiling above is what bounds each POST. */
const PART_DATA_CHARS = Math.floor(1.5 * 1024 * 1024);

/** Multiple of 3 so each chunk but the last is valid base64 without padding. */
const BASE64_CHUNK_BYTES = 3 * 8192;

/** Base64 of a byte string, in chunks. A single spread (`String.fromCharCode(...bytes)`) blows the stack past ~500 KB. */
function bytesToBase64(bytes: Uint8Array): string {
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    const slice = bytes.subarray(offset, offset + BASE64_CHUNK_BYTES);
    let binary = '';
    for (let index = 0; index < slice.length; index++) binary += String.fromCharCode(slice[index]);
    encoded += btoa(binary);
  }
  return encoded;
}

/** gzip (RFC 1952, same bytes pako and the server accept) then base64. The read starts before the write so a large body cannot stall the stream. */
async function gzipBase64(text: string): Promise<string> {
  const raw = new TextEncoder().encode(text);
  const stream = new CompressionStream('gzip');
  const done = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  await writer.write(raw);
  await writer.close();
  const compressed = new Uint8Array(await done);
  return bytesToBase64(compressed);
}

interface ISetContentsBatch {
  files: IVmFilePayload[];
  deletes: string[];
}

interface ISetContentsOversized {
  shortPath: string;
  bytes: number;
}

interface IOverLimitFile {
  shortPath: string;
  bytes: number;
  limit: number;
}

/** The draft panel matches this whole sentence. One limit; each file is `path (bytes bytes)`, joined by `, `. */
function overLimitSentence(files: IOverLimitFile[]): string {
  const byLimit = new Map<number, IOverLimitFile[]>();
  for (const file of files) {
    const group = byLimit.get(file.limit);
    if (group) group.push(file);
    else byLimit.set(file.limit, [file]);
  }
  const sentences: string[] = [];
  for (const [limit, group] of byLimit) {
    const listed = group.map((file) => `${file.shortPath} (${file.bytes} bytes)`).join(', ');
    sentences.push(`setContents: file exceeds the ${limit} byte limit: ${listed}`);
  }
  return sentences.join('; ');
}

/** Progress for the draft panel. No `window` (tests, agent host): do nothing and do not log. */
interface ICollabDraftUploadDetail {
  project: number;
  shortPath: string;
  part: number;
  total: number;
  done: boolean;
  failed?: boolean;
}

function dispatchDraftUpload(detail: ICollabDraftUploadDetail): void {
  const target = (globalThis as { window?: EventTarget }).window;
  if (!target || typeof target.dispatchEvent !== 'function') return;
  try {
    target.dispatchEvent(new CustomEvent('collabDraftUpload', { detail }));
  } catch (err) {
    console.error('[driverVm] collabDraftUpload was not dispatched:', err);
  }
}

function setContentsBodyBytes(
  project: number,
  files: IVmFilePayload[],
  deletes: string[],
  comments: string | null,
): number {
  const json = JSON.stringify({ action: 'setContents', project, files, deletes, comments });
  return new TextEncoder().encode(json).length;
}

interface IVmUploadFile {
  shortPath: string;
  encoding: 'gzip-base64' | 'utf8';
  /** The string the parts are slices of: gzip-base64, or the original text when that encoding does not fit the upload cap. */
  encoded: string;
  sha256: string;
}

type IPreparedFile =
  | { kind: 'inline'; file: IVmFilePayload }
  | { kind: 'upload'; file: IVmUploadFile }
  | { kind: 'refuse'; shortPath: string; bytes: number; limit: number };

function requestBytes(payload: Record<string, unknown>): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

/** SHA-256 hex of the file's final bytes (the utf-8 text the server writes). */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let index = 0; index < bytes.length; index++) hex += bytes[index].toString(16).padStart(2, '0');
  return hex;
}

function refuseOverLimit(shortPath: string, bytes: number, limit: number): IPreparedFile {
  return { kind: 'refuse', shortPath, bytes, limit };
}

/**
 * A utf-8 file whose body alone exceeds the ceiling travels as gzip-base64
 * when the compressed request still fits. When it does not, and the file is
 * within 64 MB, it is marked for parts. Binary base64 is unchanged.
 */
async function prepareSetContentsFile(
  project: number,
  file: IVmFilePayload,
  comments: string | null,
): Promise<IPreparedFile> {
  if (file.encoding !== 'utf8') {
    const bytes = setContentsBodyBytes(project, [file], [], comments);
    if (bytes > SET_CONTENTS_MAX_BODY_BYTES) return refuseOverLimit(file.shortPath, bytes, SET_CONTENTS_MAX_BODY_BYTES);
    return { kind: 'inline', file };
  }
  const originalBytes = new TextEncoder().encode(file.content).length;
  if (originalBytes > SET_CONTENTS_MAX_FILE_BYTES) return refuseOverLimit(file.shortPath, originalBytes, SET_CONTENTS_MAX_FILE_BYTES);
  if (setContentsBodyBytes(project, [file], [], comments) <= SET_CONTENTS_MAX_BODY_BYTES) return { kind: 'inline', file };

  let encoded: string;
  try {
    encoded = await gzipBase64(file.content);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    console.error(`setContents: gzip failed for ${file.shortPath}: ${why}`);
    return refuseOverLimit(file.shortPath, originalBytes, SET_CONTENTS_MAX_BODY_BYTES);
  }
  const compressed: IVmFilePayload = { shortPath: file.shortPath, content: encoded, encoding: 'gzip-base64' };
  if (setContentsBodyBytes(project, [compressed], [], comments) <= SET_CONTENTS_MAX_BODY_BYTES) return { kind: 'inline', file: compressed };

  const sha256 = await sha256Hex(file.content);
  if (encoded.length <= MAX_UPLOAD_CHARS) {
    return { kind: 'upload', file: { shortPath: file.shortPath, encoding: 'gzip-base64', encoded, sha256 } };
  }
  if (file.content.length <= MAX_UPLOAD_CHARS) {
    console.info(`setContents: gzip-base64 of ${file.shortPath} is ${encoded.length} chars and exceeds the upload cap; sending the original text in parts`);
    return { kind: 'upload', file: { shortPath: file.shortPath, encoding: 'utf8', encoded: file.content, sha256 } };
  }
  return refuseOverLimit(file.shortPath, originalBytes, SET_CONTENTS_MAX_FILE_BYTES);
}

/** Slices of `text`, each a setContentsPart body of at most 2 MB. `total` in the measure is the maximum, so the real body is never larger. */
function splitUpload(project: number, uploadId: string, text: string): string[] | null {
  const parts: string[] = [];
  let at = 0;
  while (at < text.length) {
    let size = Math.min(PART_DATA_CHARS, text.length - at);
    let data = text.slice(at, at + size);
    while (requestBytes({ action: 'setContentsPart', project, uploadId, index: parts.length, total: MAX_UPLOAD_PARTS, data }) > SET_CONTENTS_MAX_BODY_BYTES) {
      if (size <= 1) return null;
      size = Math.max(1, Math.floor(size * 3 / 4));
      data = text.slice(at, at + size);
    }
    parts.push(data);
    at += data.length;
    if (parts.length > MAX_UPLOAD_PARTS) return null;
  }
  return parts;
}

/**
 * Parts in order, then one setContents that names the upload and nothing else.
 * A refused part stops this file only. Returns the reason, or null when it was sent.
 */
async function sendUpload(project: number, file: IVmUploadFile, comments: string | null): Promise<string | null> {
  const uploadId = crypto.randomUUID();
  const parts = splitUpload(project, uploadId, file.encoded);
  const tell = (part: number, total: number, done: boolean, failed = false): void => {
    const detail: ICollabDraftUploadDetail = { project, shortPath: file.shortPath, part, total, done };
    if (failed) detail.failed = true;
    dispatchDraftUpload(detail);
  };
  if (!parts || parts.length === 0) {
    const reason = `setContents: ${file.shortPath} does not fit in ${MAX_UPLOAD_PARTS} parts under the ${SET_CONTENTS_MAX_BODY_BYTES} byte limit; not sent`;
    console.error(reason);
    return reason;
  }
  for (let index = 0; index < parts.length; index++) {
    try {
      const rc = await execAction<{ statusCode: number; msg?: string }>('setContentsPart', {
        project,
        uploadId,
        index,
        total: parts.length,
        data: parts[index],
      });
      if (rc.statusCode !== 200) {
        const reason = `setContents: ${file.shortPath} part ${index + 1}/${parts.length} refused: ${rc.msg || 'error'}; not sent`;
        console.error(reason);
        tell(index + 1, parts.length, true, true);
        return reason;
      }
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      const reason = `setContents: ${file.shortPath} part ${index + 1}/${parts.length} refused: ${why}; not sent`;
      console.error(reason);
      tell(index + 1, parts.length, true, true);
      return reason;
    }
    tell(index + 1, parts.length, false);
  }
  try {
    const rc = await execAction<{ statusCode: number; msg?: string }>('setContents', {
      project,
      files: [{ shortPath: file.shortPath, uploadId, encoding: file.encoding, sha256: file.sha256 }],
      deletes: [],
      comments,
    });
    if (rc.statusCode !== 200) {
      const reason = `setContents: ${file.shortPath} refused: ${rc.msg || 'error'}; not sent`;
      console.error(reason);
      tell(parts.length, parts.length, true, true);
      return reason;
    }
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    const reason = `setContents: ${file.shortPath} refused: ${why}; not sent`;
    console.error(reason);
    tell(parts.length, parts.length, true, true);
    return reason;
  }
  tell(parts.length, parts.length, true);
  return null;
}

/** Deletes ride on the first batch. Every file passed in already fits in one request. */
function planSetContentsBatches(
  project: number,
  files: IVmFilePayload[],
  deletes: string[],
  comments: string | null,
): { batches: ISetContentsBatch[]; oversized: ISetContentsOversized[] } {
  const oversized: ISetContentsOversized[] = [];
  const sendable: IVmFilePayload[] = [];
  for (const file of files) {
    const bytes = setContentsBodyBytes(project, [file], [], comments);
    if (bytes > SET_CONTENTS_MAX_BODY_BYTES) {
      oversized.push({ shortPath: file.shortPath, bytes });
      continue;
    }
    sendable.push(file);
  }

  const batches: ISetContentsBatch[] = [];
  let current: IVmFilePayload[] = [];
  let deletesLeft = deletes;

  const flush = (): void => {
    if (current.length === 0 && deletesLeft.length === 0) return;
    batches.push({ files: current, deletes: deletesLeft });
    current = [];
    deletesLeft = [];
  };

  for (const file of sendable) {
    const trial = setContentsBodyBytes(project, [...current, file], deletesLeft, comments);
    if (current.length > 0 && trial > SET_CONTENTS_MAX_BODY_BYTES) flush();
    if (current.length === 0 && deletesLeft.length > 0) {
      const withDeletes = setContentsBodyBytes(project, [file], deletesLeft, comments);
      if (withDeletes > SET_CONTENTS_MAX_BODY_BYTES) flush();
    }
    current.push(file);
  }
  flush();
  return { batches, oversized };
}

export class DriverVm extends mls.stor.others.DriverIOBase {

  /**
   * Diagnostic label: the actual slot comes from the 'vm' key passed to addDriver in
   * registerDrivers, not from this field. It must NOT say 'github' — getDriversInfo
   * reports it, and libGithubIo (mls-100554) gates on it to find the real git driver,
   * which now occupies that slot for real. Cast because mls.cbe.Provider has no 'vm'
   * member yet; the lib already resolves the name at runtime, only the type is behind.
   */
  public shortName = 'vm' as mls.cbe.Provider;
  /** Not bound to a single project: it serves every project the VM hosts. */
  public project: number = 0;
  public driverVersion: string = '1.0.0-vm';

  constructor() {
    super();
    if (mls.istrace) console.info(`vmDriver: ${this.driverVersion}`);
  }

  // ── Implemented ───────────────────────────────────────────────────────────

  public getContents = async (
    project: number,
    fileInfos: mls.stor.IFileInfo[],
    ref?: string,
  ): Promise<mls.stor.IRegGetContents[]> => {
    if (fileInfos.length === 0) return [];
    // The contract guarantees a single project per call — one request, not one per file.
    // `ref` reads those paths as of that commit. Without it the body is unchanged.
    const byShortPath = new Map<string, mls.stor.IFileInfo>();
    for (const fileInfo of fileInfos) byShortPath.set(toShortPath(fileInfo), fileInfo);

    const rc = await execAction<IVmContentsResponse>('getContents', {
      project,
      shortPaths: [...byShortPath.keys()],
      ...(typeof ref === 'string' && ref.length > 0 ? { ref } : {}),
    });
    if (rc.statusCode !== 200) throw new Error(`getContents: ${rc.msg || 'error'}`);

    const contents = new Map<string, string | null>();
    for (const file of rc.files ?? []) {
      contents.set(file.shortPath, file.encoding === 'base64' ? atob(file.content) : file.content);
    }
    // The cfe matches results by object identity: return the SAME fileInfo it handed us.
    // A file the VM does not have comes back as null — that is "absent", not "failed".
    return [...byShortPath.entries()].map(([shortPath, fileInfo]) => ({
      fileInfo,
      content: contents.has(shortPath) ? contents.get(shortPath) as string | null : null,
    }));
  };

  public setContents = async (project: number, fileInfos: mls.stor.IFileInfo[], comments: string | null): Promise<boolean> => {
    if (fileInfos.length === 0) return true;
    const files: IVmFilePayload[] = [];
    const deletes: string[] = [];

    for (const fileInfo of fileInfos) {
      const shortPath = toShortPath(fileInfo);
      if (fileInfo.status === 'deleted') {
        deletes.push(shortPath);
        continue;
      }
      if (fileInfo.status === 'renamed') {
        // Write the new path and drop the old one — the rename origin lives in getValueInfo.
        const info = await this.readValueInfo(fileInfo);
        // No original name = nothing provable to delete; writing the new path alone
        // leaves a stale copy, but inventing a path to remove is worse.
        if (info?.originalShortName) {
          const originalFolder = (info.originalFolder || '').replace(/\\/gu, '/');
          deletes.push(toShortPath({ ...fileInfo, folder: originalFolder, shortName: info.originalShortName }));
        }
      }
      const payload = await this.readFilePayload(fileInfo, shortPath);
      if (payload) files.push(payload);
    }

    if (files.length === 0 && deletes.length === 0) return true;
    // `comments` is the studio's save comment: on a git host it is the commit
    // message, and the VM now uses it for exactly that (mls-102034 cbeGitCommit.ts),
    // so it shows up in getHistory below. Each batch repeats it; a failed batch
    // stops the sequence and is not reported as saved.
    const inline: IVmFilePayload[] = [];
    const uploads: IVmUploadFile[] = [];
    const overLimit: IOverLimitFile[] = [];
    const refused: string[] = [];
    for (const file of files) {
      const prepared = await prepareSetContentsFile(project, file, comments);
      if (prepared.kind === 'inline') inline.push(prepared.file);
      else if (prepared.kind === 'upload') uploads.push(prepared.file);
      else {
        const item: IOverLimitFile = { shortPath: prepared.shortPath, bytes: prepared.bytes, limit: prepared.limit };
        console.error(overLimitSentence([item]));
        overLimit.push(item);
      }
    }
    const plan = planSetContentsBatches(project, inline, deletes, comments);
    for (const file of plan.oversized) {
      const item: IOverLimitFile = { shortPath: file.shortPath, bytes: file.bytes, limit: SET_CONTENTS_MAX_BODY_BYTES };
      console.error(overLimitSentence([item]));
      overLimit.push(item);
    }
    const { batches } = plan;
    for (let index = 0; index < batches.length; index++) {
      const batch = batches[index];
      const unsent = batches.slice(index).reduce((sum, item) => sum + item.files.length, 0);
      try {
        const rc = await execAction<{ statusCode: number; msg?: string }>('setContents', {
          project,
          files: batch.files,
          deletes: batch.deletes,
          comments,
        });
        if (rc.statusCode !== 200) {
          console.error(`setContents: batch ${index + 1}/${batches.length} refused: ${rc.msg || 'error'}; ${unsent} file(s) not sent`);
          return false;
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`setContents: batch ${index + 1}/${batches.length} failed: ${reason}; ${unsent} file(s) not sent`);
        return false;
      }
    }
    // Each large file is its own request, after the small ones, so a refusal does not drop them.
    for (const file of uploads) {
      const reason = await sendUpload(project, file, comments);
      if (reason) refused.push(reason);
    }
    const messages: string[] = [];
    if (overLimit.length > 0) messages.push(overLimitSentence(overLimit));
    messages.push(...refused);
    if (messages.length > 0) throw new Error(messages.join('; '));
    return true;
  };

  /**
   * Commits that touched the file, newest first — read from the project's git
   * repo on the VM (every mls-<id> there is one; see gitReposSetup.mjs).
   *
   * Studio saves DO commit (mls-102034 cbeGitCommit.ts commits what setContents
   * wrote, with the caller's session as author and the save comment as message),
   * so this lists both the publish history and the edits made here.
   *
   * Returns null only when the call itself failed — the UI reads null and an
   * empty list the same way, but null keeps "broke" distinct from "no commits".
   */
  public async getHistory(fileInfo: mls.stor.IFileInfo): Promise<mls.stor.IHistory[] | null> {
    // A file that was never saved has nothing in git, and asking costs a round trip.
    if (fileInfo.status === 'new') return [];
    try {
      const rc = await execAction<IVmHistoryResponse>('getHistory', {
        project: fileInfo.project,
        shortPath: toShortPath(fileInfo),
      });
      if (rc.statusCode !== 200) return null;
      return (rc.history ?? []).map((entry) => ({
        authorName: entry.authorName,
        // No avatars on the VM; mlsHistoryList falls back to a generic icon when empty.
        authorUrl: '',
        data: new Date(entry.date),
        ref: entry.ref,
        message: entry.message,
        additions: entry.additions,
        deletions: entry.deletions,
      }));
    } catch {
      // The history panel is an accessory — a failure here must not break the editor.
      return null;
    }
  }

  /** The file's content at one commit of getHistory, for the side-by-side diff. */
  public async getHistoryContent(fileInfo: mls.stor.IFileInfo, ref: string): Promise<string | null> {
    try {
      const rc = await execAction<IVmHistoryContentResponse>('getHistoryContent', {
        project: fileInfo.project,
        shortPath: toShortPath(fileInfo),
        ref,
      });
      if (rc.statusCode !== 200) return null;
      return rc.content ?? null;
    } catch {
      return null;
    }
  }

  public async loadFilesInfo(project: number): Promise<mls.cbe.IPrjSourcesFiles[]> {
    const rc = await execAction<IVmFilesInfoResponse>('loadFilesInfo', { project });
    if (rc.statusCode !== 200) throw new Error(`loadFilesInfo: ${rc.msg || 'error'}`);
    return rc.filesInfo ?? [];
  }

  /**
   * getValueInfo (getContentInfoOrNull) returns { content: null } while
   * inLocalStorage is off, which hides originalShortName. Force the flag for
   * the read and restore whatever it was.
   */
  private async readValueInfo(fileInfo: mls.stor.IFileInfo) {
    const previous = fileInfo.inLocalStorage;
    fileInfo.inLocalStorage = true;
    try {
      if (!fileInfo.getValueInfo) return undefined;
      return await fileInfo.getValueInfo();
    } finally {
      fileInfo.inLocalStorage = previous;
    }
  }

  /**
   * Content to persist, read the same way the GitHub driver does: force
   * inLocalStorage so getContent serves the LOCAL edit — otherwise a cache miss
   * would call this very driver back — and restore the flag afterwards.
   */
  private async readFilePayload(fileInfo: mls.stor.IFileInfo, shortPath: string): Promise<IVmFilePayload | null> {
    const previous = fileInfo.inLocalStorage;
    fileInfo.inLocalStorage = true;
    let content: string | Blob | null = null;
    try {
      const info = await this.readValueInfo(fileInfo);
      if (info) content = info.content ?? null;
      if (content === null) content = await fileInfo.getContent();
    } finally {
      fileInfo.inLocalStorage = previous;
    }
    if (content === null) return null;
    if (typeof content === 'string') return { shortPath, content, encoding: 'utf8' };
    const buffer = new Uint8Array(await content.arrayBuffer());
    let binary = '';
    for (const byte of buffer) binary += String.fromCharCode(byte);
    return { shortPath, content: btoa(binary), encoding: 'base64' };
  }

  /**
   * Where the editor's "View on repository" goes. On the VM the repository IS
   * the VM, so this points at the cbe's own source view, which reads the same
   * tree getContents reads.
   *
   * getUrl is SYNCHRONOUS by contract, so whatever it returns has to be
   * derivable here, without a round trip — which rules out asking the server
   * for a real git remote. A same-origin url is the only honest answer.
   *
   * Uses toShortPath, so the level is part of the path: the GitHub driver
   * hardcodes `/l2/` and therefore points an l1 file at a path that does not
   * exist.
   */
  public getUrl(file: mls.stor.IFileInfo): string {
    if (!file?.project) return '';
    return `${SOURCE_VIEW_URL}?project=${file.project}&path=${encodeURIComponent(toShortPath(file))}`;
  }

  // ── Not supported on the VM ───────────────────────────────────────────────
  // Branches and pull requests belong to a git host: the VM has the repository
  // but no notion of review. They return the "nothing here" value of their
  // contract instead of throwing, so the studio UI degrades quietly rather than
  // breaking on a feature that does not exist here. (History and getUrl are NOT
  // in this list — both are served by the VM itself, above.)

  public async getVersionFromFiles(): Promise<{ [key: string]: string } | undefined> { return undefined; }
  public async checkBranchExistence(): Promise<boolean> { return false; }
  public async reviewPullRequest(): Promise<boolean> { return false; }
  public async listPullRequests(): Promise<mls.stor.others.IPullRequest[]> { return []; }
  public async listForks(): Promise<mls.stor.others.IFork[]> { return []; }
  public async listBranches(): Promise<mls.stor.others.IBranch[]> { return []; }
  public async getUserInfo(): Promise<mls.stor.others.IInfo> { return {} as mls.stor.others.IInfo; }
  public async getOrganizations(): Promise<mls.stor.others.IOrg[]> { return []; }
  public async createRepository(): Promise<boolean> { return false; }
  public async deleteRepository(): Promise<boolean> { return false; }
  public async createFork(): Promise<boolean> { return false; }
  public async renameRepository(): Promise<boolean> { return false; }
  public async createFileInRepo(): Promise<boolean> { return false; }
  public async changeVisibility(): Promise<boolean> { return false; }
  public async verifyRepositoryNew(): Promise<'free' | 'reuse' | 'wait' | 'error'> { return 'error'; }
  public async verifyPermission(): Promise<mls.stor.others.IPermission> { return {} as mls.stor.others.IPermission; }
  public async addVariable(): Promise<boolean> { return false; }
  public async updateVariable(): Promise<boolean> { return false; }
  public async listVariables(): Promise<{ variables: { name: string; value: string; created_at: string; updated_at: string }[]; total_count: number }> {
    return { variables: [], total_count: 0 };
  }
  public async delVariable(): Promise<boolean> { return false; }
  public async checkFork(): Promise<boolean> { return false; }

  // ── serviceSave's onSave() ceremony (fork/branch/PR) ──────────────────────
  // serviceSave.ts's fork+branch+pull-request flow treats a falsy return from
  // these as a hard failure and throws (it has no "not supported" case, unlike
  // the read/list methods above). The VM writes files directly — no fork,
  // branch or PR ever really happens — so these report success unconditionally
  // and let the flow fall through to onSavenewPullrequest's mls.stor.setContents,
  // which is the actual save (driverVm.setContents below).
  public async checkForkIO(): Promise<boolean> { return true; }
  public async syncFork(): Promise<boolean> { return true; }
  public async createNewBranch(): Promise<boolean> { return true; }
  public async createPullRequest(): Promise<boolean> { return true; }
}
