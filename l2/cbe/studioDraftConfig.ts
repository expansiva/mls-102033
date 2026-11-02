/// <mls fileReference="_102033_/l2/cbe/studioDraftConfig.ts" enhancement="_blank" />

export interface ConfigNavItem { id?: string; label?: string; href?: string; icon?: string }

export interface ConfigModule { moduleId?: string; basePath?: string; navigation?: ConfigNavItem[] }

interface DraftProjectsConfig {
  projects?: Record<string, { modules?: ConfigModule[] } | undefined>;
}

const CONFIG_LEVEL = 5;
const CONFIG_NAME = 'config';
const CONFIG_EXTENSION = '.json';

/** Local edit when `inLocalStorage` is set; otherwise the copy `mls.stor` already resolved (the draft in Studio). */
async function configText(file: mls.stor.IFileInfo): Promise<string | null> {
  if (file.inLocalStorage) {
    if (!file.getValueInfo) return null;
    const local = await file.getValueInfo();
    return typeof local.content === 'string' ? local.content : null;
  }
  const content = await file.getContent();
  return typeof content === 'string' ? content : null;
}

function modulesFromText(text: string, project: number): ConfigModule[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    console.error(`[studioDraftConfig] l5/config.json is not valid JSON for project ${project}:`, err);
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error(`[studioDraftConfig] l5/config.json is not an object for project ${project}`);
    return null;
  }
  const entry = (parsed as DraftProjectsConfig).projects?.[String(project)];
  if (!entry || !Array.isArray(entry.modules)) {
    console.error(`[studioDraftConfig] l5/config.json has no modules for project ${project}`);
    return null;
  }
  return entry.modules;
}

/** `projects[project].modules` from that project's `l5/config.json`. Missing or invalid JSON returns null. */
export async function readDraftModules(project: number): Promise<ConfigModule[] | null> {
  if (!Number.isInteger(project) || project <= 0) {
    console.error('[studioDraftConfig] project is missing; l5/config.json was not read:', project);
    return null;
  }
  try {
    const key = mls.stor.getKeyToFiles(project, CONFIG_LEVEL, CONFIG_NAME, '', CONFIG_EXTENSION);
    const file = mls.stor.files[key];
    if (!file || file.status === 'deleted') {
      console.error(`[studioDraftConfig] l5/config.json is missing for project ${project}`);
      return null;
    }
    const text = await configText(file);
    if (text === null) {
      console.error(`[studioDraftConfig] l5/config.json has no text for project ${project}`);
      return null;
    }
    const modules = modulesFromText(text, project);
    console.info('[studioDraftConfig] read l5/config.json', { project, fromLocalCopy: file.inLocalStorage === true, length: text.length, modules: modules?.length ?? null });
    return modules;
  } catch (err) {
    console.error(`[studioDraftConfig] failed to read l5/config.json for project ${project}:`, err);
    return null;
  }
}
