/// <mls fileReference="_102033_/l2/cbe/l5Save.ts" enhancement="_blank" />
// Promotes one l5 file from the working copy to the destination the project
// declared (projectSettings.driver). Same promotion as
// serviceSave.onSavenewPullrequest: inLocalStorage = false before setContents,
// otherwise stor.setContents keeps the write on the local copy.
// After a successful write, clearProjectsCache of the whole project:
// cache.setContent(file, null) is a no-op (shouldSkipCacheAdd treats null as
// unusable), and DriverVm.getVersionFromFiles is a stub, so versionRef would
// not bump and a same-session reread would serve the pre-edit content.

function setContentsSucceeded(result: unknown): boolean {
  if (result === false || result == null) return false;
  if (Array.isArray(result)) {
    return result.every((row) => (row as { result?: boolean })?.result !== false);
  }
  return true;
}

/**
 * Tells the Studio shell a draft file was written: the l5 config never goes through the panel's
 * `saveToDraft`, and the lib emits no event. Same name and shape as the panel's `collabDraftSaved`
 * (no import between the two: 102033 shell listens, 102020 panel dispatches).
 */
function dispatchDraftSaved(project: number, shortName: string): void {
  const target = (globalThis as { window?: EventTarget }).window;
  if (!target || typeof target.dispatchEvent !== 'function') return;
  try {
    target.dispatchEvent(new CustomEvent('collabDraftSaved', { detail: { project, paths: [`l5/${shortName}.json`] } }));
  } catch (err) {
    console.error('[l5Save] collabDraftSaved was not dispatched:', err);
  }
}

export async function saveL5File(
  project: number, shortName: string, content: string, comment: string,
): Promise<boolean> {
  const key = mls.stor.getKeyToFile({ project, level: 5, shortName, folder: '', extension: '.json' });
  const file = mls.stor.files[key];
  if (!file) throw new Error(`l5 file not found: project ${project}, ${shortName}.json`);

  await mls.stor.localStor.setContent(file, { contentType: 'string', content });
  file.inLocalStorage = false;

  const saved = await mls.stor.setContents([file], comment);
  if (!setContentsSucceeded(saved)) return false;

  await mls.stor.cache.clearProjectsCache([project]);
  dispatchDraftSaved(project, shortName);
  return true;
}
