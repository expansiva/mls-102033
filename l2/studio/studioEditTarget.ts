/// <mls fileReference="_102033_/l2/studio/studioEditTarget.ts" enhancement="_blank" />
// Resolves WHICH SOURCE FILE renders the page currently on screen, straight from the DOM
// (TASK-102033-app-como-preview, part 3).
//
// The DOM is the truth here, not the route table: `contentVariantRenderer` (Ctrl+Alt+E) swaps the
// mounted tag at runtime, so reading the tag that is actually mounted picks the right variation for
// free — and needs no shell API (`getActiveContentRenderer` is private there).
//
// Everything is resolved from the tag alone, so this file has no dependency on 102020 (which is not
// part of the app build — see the note in studioTextEdit.ts).

/** A page source resolved from the DOM, ready to edit. */
export interface IStudioEditTarget {
  project: number;
  shortName: string;
  folder: string;
  /** `_<project>_<folder>/<shortName>` — for display. */
  page: string;
  storFile: mls.stor.IFileInfo;
  model: mls.editor.IModelBase;
}

export type StudioEditTargetResult =
  | { ok: true; target: IStudioEditTarget }
  | { ok: false; reason: string };

interface IResolvedFile {
  project: number;
  shortName: string;
  folder: string;
}

/**
 * Tag of a page component -> source file coordinates.
 *
 * PORT of `convertTagToFileName` (`_102020_/l2/utils.ts`), legacy branch only: a page tag always
 * ends with `-<project>`, so the new-format branch (`resolveNewTag`, which needs
 * `mls.actualProject`) can never apply here.
 *
 *   cafe-flow--web--desktop--page11--pos-workspace-102051
 *     -> { project: 102051, shortName: 'posWorkspace', folder: 'cafeFlow/web/desktop/page11' }
 */
export function tagToFileInfo(tag: string): IResolvedFile | undefined {
  const parts = tag.split('--');
  const namePart = parts.pop() || '';
  const folder = parts.join('/').replace(/-(.)/gu, (_, letter: string) => letter.toUpperCase());

  const match = namePart.match(/(.+)-(\d+)$/u);
  if (!match) return undefined;

  const [, rest, number] = match;
  const shortName = rest.replace(/-(.)/gu, (_, letter: string) => letter.toUpperCase());

  return { shortName, project: +number, folder };
}

/** The mounted page element inside a region host, skipping our own overlay chrome. */
export function findPageElement(host: HTMLElement): HTMLElement | null {
  for (const child of Array.from(host.children)) {
    const tag = child.tagName.toLowerCase();
    if (!tag.includes('-')) continue;
    if (child.classList.contains('se-control')) continue;
    return child as HTMLElement;
  }
  return null;
}

/**
 * Current app language, RAW (e.g. `pt-br`).
 *
 * It used to be reduced to the primary subtag, which silently wrote the edit into the wrong catalog:
 * the current generator declares `pt` AND `pt-br` as separate objects, so an app in `pt-br` had its
 * edit applied to `pt` and nothing changed on screen. Matching against the locales a catalog actually
 * declares is `pickLocale`'s job (studioTextEdit) — it needs the unreduced value.
 */
export function currentLanguage(): string {
  return (document.documentElement.lang || 'en').trim().toLowerCase();
}

/**
 * Resolves the page source for the element mounted in `host`.
 *
 * Never guesses: an unresolvable tag or a missing stor entry comes back as `{ ok: false }` with a
 * reason to show, because editing the wrong file is far worse than not editing.
 */
export async function resolveEditTarget(host: HTMLElement): Promise<StudioEditTargetResult> {
  const pageEl = findPageElement(host);
  if (!pageEl) return { ok: false, reason: 'Nenhuma página montada nesta região.' };

  const tag = pageEl.tagName.toLowerCase();
  const info = tagToFileInfo(tag);
  if (!info || !info.project || !info.shortName) {
    return { ok: false, reason: `Não sei qual arquivo é esta tela (tag "${tag}").` };
  }

  const { project, shortName, folder } = info;

  try {
    // Normally already loaded (cbeMiniCfe preloads the site project chain at boot); cheap and
    // idempotent when it is.
    await mls.stor.server.loadProjectInfoIfNeeded(project);
  } catch {
    // A preload failure is not fatal: the stor lookup below is what decides.
  }

  const key = mls.stor.getKeyToFiles(project, 2, shortName, folder, '.ts');
  const storFile = mls.stor.files[key];
  if (!storFile) {
    return { ok: false, reason: `Fonte não encontrada no projeto: ${key}` };
  }

  // Monaco backs the model. The studio switch kicks its download off (loadStudioDefinitions), which
  // can still be in flight when the user arms the editor.
  if (window.monacoReady) {
    try {
      await window.monacoReady;
    } catch {
      return { ok: false, reason: 'Monaco não carregou — edição indisponível.' };
    }
  }

  let model: mls.editor.IModelBase | undefined;
  try {
    const { createModel } = await import('/_102027_/l2/libModel.js');
    model = await createModel(storFile, true, false);
  } catch (err) {
    return { ok: false, reason: `Falha ao abrir o modelo: ${(err as Error).message}` };
  }
  if (!model) return { ok: false, reason: 'Modelo do arquivo não disponível.' };

  return {
    ok: true,
    target: {
      project,
      shortName,
      folder,
      page: `_${project}_${folder ? `${folder}/` : ''}${shortName}`,
      storFile,
      model,
    },
  };
}

/**
 * Folder of the SHARED base class of a page, derived structurally.
 *
 *   <module>/<device>/.../page<N>  ->  <module>/<device>/shared
 *   cafeFlow/web/desktop/page11    ->  cafeFlow/web/shared
 *
 * Generated pages split the component in two: the shared file is the base class and owns the i18n
 * catalog, while the page file owns render(). Editing an i18n text therefore writes to the SHARED
 * file, not to the page.
 *
 * Structural first, `module.js` second (resolveSharedTarget): the convention holds in every project
 * checked (102051, 102043) and costs no request, while 102051 has no `module.ts` at all — so the
 * original preview path (import module.js, read shared[device].sharedPath) would resolve nothing
 * there.
 */
export function deriveSharedFolder(folder: string): string | null {
  const segments = (folder || '').split('/').filter(Boolean);
  if (segments.length < 3) return null;
  if (!/^page\d+$/u.test(segments[segments.length - 1])) return null;
  return `${segments[0]}/${segments[1]}/shared`;
}

/** `sharedPath` declared in the module, normalized to a stor folder. Undefined when absent. */
async function sharedFolderFromModule(project: number, folder: string): Promise<string | undefined> {
  const segments = (folder || '').split('/').filter(Boolean);
  const moduleName = segments[0];
  const device = segments[1];
  if (!moduleName || !device) return undefined;
  try {
    const mod = await import(`/_${project}_/l2/${moduleName}/module.js`) as {
      shared?: Record<string, { sharedPath?: string }>;
    };
    const sharedPath = mod?.shared?.[device]?.sharedPath;
    if (!sharedPath) return undefined;
    return sharedPath.replace(/^\/?_\d+_\/l2\//u, '').replace(/^\/|\/$/gu, '');
  } catch {
    // No module.js (or it does not export `shared`) — the structural rule already covered it.
    return undefined;
  }
}

/**
 * The shared base class of a page target, or null when there is none.
 *
 * Same shortName, different folder. Returns null quietly: a page without a shared base is normal.
 */
/**
 * Organism files of a page: siblings named `<pageShortName>_O<k>.ts`, each with its OWN i18n catalog.
 *
 * The current generator can split a page's organisms into separate modules that export plain render
 * FUNCTIONS (`renderProjectHeader(host)`), called from the page's template
 * (`mls-102045/.../projectDetailWorkspace_O1.ts`). Their text renders inside the page's element but
 * lives in a third file — neither the page nor the shared base — so without them in the chain that
 * text is unreachable.
 *
 * Sorted by index so the chain order is stable.
 */
export async function resolveOrganismTargets(target: IStudioEditTarget): Promise<IStudioEditTarget[]> {
  const { project, shortName, folder } = target;
  const prefix = `${shortName}_O`;

  const candidates = Object.values(mls.stor.files)
    .filter((f) => f.project === project
      && f.level === 2
      && f.folder === folder
      && f.extension === '.ts'
      && f.shortName.startsWith(prefix)
      && /^\d+$/u.test(f.shortName.slice(prefix.length)))
    .sort((a, b) => Number(a.shortName.slice(prefix.length)) - Number(b.shortName.slice(prefix.length)));

  const targets: IStudioEditTarget[] = [];
  for (const storFile of candidates) {
    try {
      const { createModel } = await import('/_102027_/l2/libModel.js');
      const model = await createModel(storFile, true, false);
      if (!model) continue;
      targets.push({
        project,
        shortName: storFile.shortName,
        folder,
        page: `_${project}_${folder ? `${folder}/` : ''}${storFile.shortName}`,
        storFile,
        model,
      });
    } catch (err) {
      console.warn(`[studioEdit] organism model failed for ${storFile.shortName}:`, err);
    }
  }
  return targets;
}

export async function resolveSharedTarget(target: IStudioEditTarget): Promise<IStudioEditTarget | null> {
  const { project, shortName, folder } = target;

  const candidates: string[] = [];
  const derived = deriveSharedFolder(folder);
  if (derived) candidates.push(derived);
  const fromModule = await sharedFolderFromModule(project, folder);
  if (fromModule && !candidates.includes(fromModule)) candidates.push(fromModule);

  for (const sharedFolder of candidates) {
    const key = mls.stor.getKeyToFiles(project, 2, shortName, sharedFolder, '.ts');
    const storFile = mls.stor.files[key];
    if (!storFile) continue;
    try {
      const { createModel } = await import('/_102027_/l2/libModel.js');
      const model = await createModel(storFile, true, false);
      if (!model) continue;
      return {
        project,
        shortName,
        folder: sharedFolder,
        page: `_${project}_${sharedFolder}/${shortName}`,
        storFile,
        model,
      };
    } catch (err) {
      console.warn('[studioEdit] shared model failed:', err);
    }
  }
  return null;
}

/**
 * Writes the edited source into the LOCAL store (IndexedDB), immediately.
 *
 * WHY THIS IS NOT REDUNDANT WITH EDITING THE MODEL
 * libModel wires a listener on model changes (via the MonacoModelCreated event) that ends up calling
 * `localStor.setContent` — but it is DEBOUNCED BY 400ms
 * ([libModel.ts:462](mls-102027/l2/libModel.ts#L462) -> `_checkSameContent`). Saving right after the
 * edit therefore raced it: `DriverVm.readFilePayload` forces `inLocalStorage = true` and calls
 * `getValueInfo()`, which in that state reads `localDB.readFile` — and with no record yet the save
 * died with `Object not found in IndexedDB, key: File_..._.ts`.
 *
 * Doing it eagerly is not a workaround for the debounce: it is the same write, sooner. The late
 * listener recomputes and converges (and `saveTarget` resets the CRC so it converges to CLEAN).
 * `localStor.setContent` sets `inLocalStorage` by itself — hence no manual flag here.
 */
export async function persistLocalEdit(target: IStudioEditTarget, newSource: string): Promise<void> {
  const storFile = target.storFile;
  // Same bookkeeping as libModel's own dirty path, minus the debounce.
  if (storFile.status !== 'new' && storFile.status !== 'renamed') storFile.status = 'changed';
  storFile.updatedAt = new Date().toISOString();
  await mls.stor.localStor.setContent(storFile, { contentType: 'string', content: newSource });
}

/**
 * Recompiles after an edit so the fresh JS lands in the service worker cache.
 *
 * In the studio the editor drives this on every keystroke; here nothing does, and the SW cache is
 * what serves the page module (the premise of this task) — without this, a reload would still get
 * the previous build. Never fatal: the DOM already shows the text edit.
 */
export async function compileAfterEdit(target: IStudioEditTarget): Promise<void> {
  try {
    await mls.l2.typescript.compileAndPostProcess(target.model as mls.editor.IModelTS, true, true);
  } catch (err) {
    console.warn('[studioEdit] compile after edit failed:', err);
  }
}

/** True when the file carries unsaved local edits. */
export function isDirty(target: IStudioEditTarget): boolean {
  return Boolean(target.storFile.inLocalStorage);
}

/**
 * Persists the source through the VM driver (DriverVm.setContents -> /exec -> VM file tree).
 *
 * `inLocalStorage` is deliberately LEFT ALONE (an earlier version cleared it, mirroring serviceSave,
 * which was wrong here): the lib's own `setContents` clears the local copy and lowers the flag itself
 * after a successful write, but ONLY for files still marked as local
 * ([mls.js:8113](static/libs/mls.js#L8113)). Clearing it beforehand skipped that cleanup and left a
 * stale local copy behind.
 *
 * Throws when the write fails, leaving the local edit in place so it can be retried — a failed save
 * must never look like a successful one.
 */
export async function saveTarget(target: IStudioEditTarget, comment: string): Promise<void> {
  const saved = target.model.model.getValue();
  const results = await mls.stor.setContents([target.storFile], comment);
  if (results.some((r) => !r.result)) {
    throw new Error(`Gravação recusada para o projeto ${target.project}.`);
  }
  // The model-change listener is still pending (400ms debounce) and would compare the model against
  // the CRC of the content as it was when the model was created — finding a difference and marking
  // the file dirty again, right after it was saved. Moving the baseline to what we just wrote makes
  // that late pass converge to "no change" and clear the local copy instead.
  target.model.originalCRC = mls.common.crc.crc32(saved).toString(16);
}
