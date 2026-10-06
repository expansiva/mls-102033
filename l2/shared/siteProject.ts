/// <mls fileReference="_102033_/l2/shared/siteProject.ts" enhancement="_blank" />

/**
 * The site's CLIENT project id from the boot config (0 when absent/invalid).
 *
 * `clientProjectId` first, `projectId` only as fallback: `projectId` is the owner of the served
 * module, so a platform page (monitor/mdm/audit) fed `mls.actualProject` with the master backend's
 * id — measured 102034 on 102047.collabcodes.com in 23/09/2026. The fallback keeps a server that
 * does not send the new field working.
 */
export function siteProjectFromBoot(boot: { projectId?: string | number; clientProjectId?: string | number } | undefined | null): number {
  const clientProjectId = Number(boot?.clientProjectId) || 0;
  if (clientProjectId >= 100000) return clientProjectId;
  const projectId = Number(boot?.projectId) || 0;
  return projectId >= 100000 ? projectId : 0;
}
