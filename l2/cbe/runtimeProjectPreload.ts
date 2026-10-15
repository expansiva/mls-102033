/// <mls fileReference="_102033_/l2/cbe/runtimeProjectPreload.ts" enhancement="_blank" />

const MIN_PROJECT_ID = 100_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function projectIdOf(project: unknown): number | undefined {
  if (!isRecord(project)) return undefined;
  const id = project.id;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < MIN_PROJECT_ID) return undefined;
  return id;
}

/** Unique project ids announced in `mls.stor.orgs[*].sett.projects`, first-seen order. */
export function announcedProjectIds(orgs: unknown): number[] {
  if (!isRecord(orgs)) return [];
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const org of Object.values(orgs)) {
    if (!isRecord(org)) continue;
    const sett = org.sett;
    if (!isRecord(sett) || !Array.isArray(sett.projects)) continue;
    for (const project of sett.projects) {
      const id = projectIdOf(project);
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Loads every announced project into `stor.files` via the existing metadata reader.
 * A failure names the project and rejects; callers must not mark the environment ready.
 */
export async function preloadAnnouncedProjects(
  orgs: unknown,
  loadProjectInfoIfNeeded: (project: number) => Promise<unknown>,
): Promise<readonly number[]> {
  const ids = announcedProjectIds(orgs);
  for (const id of ids) {
    try {
      await loadProjectInfoIfNeeded(id);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`[cbeMiniCfe] preload of stor.files failed for project ${id}: ${detail}`);
    }
  }
  return ids;
}

/** Login first, then the announced preload, then the ready signal. Either failure skips the signal. */
export async function runAnnouncedPreloadAfterLogin(args: {
  login: () => Promise<unknown>;
  orgs: () => unknown;
  loadProjectInfoIfNeeded: (project: number) => Promise<unknown>;
  markReady: () => void;
}): Promise<void> {
  await args.login();
  await preloadAnnouncedProjects(args.orgs(), args.loadProjectInfoIfNeeded);
  args.markReady();
}
