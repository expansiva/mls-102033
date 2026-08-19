/// <mls fileReference="_102033_/l2/cbe/driverVm.ts" enhancement="_blank" />
// Storage driver that reads and writes project SOURCES from the runtime VM
// instead of a git host. It answers the cfe's cache misses over the cbe /exec
// endpoint of the very server that serves this page (same origin, session by
// cookie) — no network call ever leaves the VM.
//
// WHY IT REGISTERS AS 'github'
// The cbe login stamps every VM project with the marker
// `{"projectDriver":"GitHub","projectURL":"local"}` (cbeLogin.ts) because the
// cfe REJECTS 'local'/'mls' as a driver name. The lib then resolves the driver
// with a HARDCODED map (mls.js getDefaultDriver): only 'GitHub' -> 'github' and
// 'GitLab' -> 'gitlab' exist; any other name throws. The registry itself is a
// plain `drivers[provider] = driver` map, so the VM takes over the 'github'
// slot — safe here because in the studio client no project lives on GitHub.
// When the lib gains a real 'vm' driver name, only the marker in cbeLogin and
// the key passed to addDriver change; everything below stays.
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

interface IVmFilePayload {
  shortPath: string;
  content: string;
  /** utf8 for text, base64 for binary (l3 assets). */
  encoding: 'utf8' | 'base64';
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
  if (!response.ok) throw new Error(`cbe ${action} failed: HTTP ${response.status}`);
  return await response.json() as T;
}

export class DriverVm extends mls.stor.others.DriverIOBase {

  /** The slot this driver occupies — see the header note. */
  public shortName: mls.cbe.Provider = 'github';
  /** Not bound to a single project: it serves every project the VM hosts. */
  public project: number = 0;
  public driverVersion: string = '1.0.0-vm';

  constructor() {
    super();
    if (mls.istrace) console.info(`vmDriver: ${this.driverVersion}`);
  }

  // ── Implemented ───────────────────────────────────────────────────────────

  public getContents = async (project: number, fileInfos: mls.stor.IFileInfo[]): Promise<mls.stor.IRegGetContents[]> => {
    if (fileInfos.length === 0) return [];
    // The contract guarantees a single project per call — one request, not one per file.
    const byShortPath = new Map<string, mls.stor.IFileInfo>();
    for (const fileInfo of fileInfos) byShortPath.set(toShortPath(fileInfo), fileInfo);

    const rc = await execAction<IVmContentsResponse>('getContents', {
      project,
      shortPaths: [...byShortPath.keys()],
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

  public setContents = async (project: number, fileInfos: mls.stor.IFileInfo[], _comments: string | null): Promise<boolean> => {
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
        const info = fileInfo.getValueInfo ? await fileInfo.getValueInfo() : undefined;
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
    const rc = await execAction<{ statusCode: number; msg?: string }>('setContents', { project, files, deletes });
    if (rc.statusCode !== 200) throw new Error(`setContents: ${rc.msg || 'error'}`);
    return true;
  };

  public async loadFilesInfo(project: number): Promise<mls.cbe.IPrjSourcesFiles[]> {
    const rc = await execAction<IVmFilesInfoResponse>('loadFilesInfo', { project });
    if (rc.statusCode !== 200) throw new Error(`loadFilesInfo: ${rc.msg || 'error'}`);
    return rc.filesInfo ?? [];
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
      if (fileInfo.getValueInfo) content = (await fileInfo.getValueInfo()).content ?? null;
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

  // ── Not supported on the VM ───────────────────────────────────────────────
  // History, branches and pull requests belong to a git host. They return the
  // "nothing here" value of their contract instead of throwing, so the studio
  // UI degrades quietly rather than breaking on a feature the VM has no notion of.

  public async getHistory(_fileInfo: mls.stor.IFileInfo): Promise<mls.stor.IHistory[] | null> { return null; }
  public async getHistoryContent(_fileInfo: mls.stor.IFileInfo, _ref: string): Promise<string | null> { return null; }
  public getUrl(_file: mls.stor.IFileInfo): string { return ''; }
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
