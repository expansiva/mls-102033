/// <mls fileReference="_102033_/l2/cbe/studioServices.ts" enhancement="_blank" />
// Service list the runtime nav1/nav2 consume. The runtime DECLARES the studio
// widgets it uses; it does not ask 100554's plugin index what exists.

export const STUDIO_BASE_PROJECT = 100554;

// Same shape CollabInit.anonymousServices uses: 8 levels, 'leftCsv;rightCsv'.
export const ANONYMOUS_SERVICES = ['', '', '', '', '', '', '', ';_100554_serviceDetail,'];

// The runtime pair hosted by the shared nav3s (studioStructure): messages left, app right.
export const SERVICE_MESSAGES = '_102033_/l2/cbe/serviceRuntimeMessages';
export const SERVICE_APP = '_102033_/l2/cbe/serviceClientApp';

// The runtime DECLARES the studio widgets it uses. It does not ask 100554's
// plugin index what exists: that is what brought 16 services (411 KB never
// mounted) into a client app.
export const RUNTIME_STUDIO_SERVICES = ['_100554_serviceDetail', '_100554_serviceReportBug'] as const;

type Nav2State = Element & { state_?: Record<number, Record<string, string>> };

function seedLastService(nav2: Element | null | undefined, level: number, position: 'left' | 'right', widget: string): void {
  const state = (nav2 as Nav2State | null | undefined)?.state_?.[level];
  if (state) state[position] = widget;
}

function dropScannedStudio(csv: string): string {
  return csv.split(',').filter((widget) =>
    widget
    && !widget.endsWith('serviceCollabMessages')
    && !widget.startsWith('_100554_')
  ).join(',');
}

/**
 * Adds the runtime service pair and the declared studio widgets to a scanned
 * list, per level. Declared studio widgets sit on the RIGHT of every level
 * (after the app service), matching the previous UI.
 *
 * BOTH toolbars need it — the content structure's nav2s and the studio header's — because they
 * drive the SAME nav3s. A toolbar without these entries strands the user: switching header
 * profile would leave no way back to the app or the messages.
 *
 * Also drops the studio's own serviceCollabMessages (on the VM it points at the
 * msg.collab.codes endpoints and blanks out — ours is the messages service here) and seeds each
 * nav2's last-service memory, so a level restore lands on the pair.
 */
export function withRuntimeServices(services: string[], nav2Left?: Element | null, nav2Right?: Element | null): string[] {
  const rc = [...services];
  const declaredRight = RUNTIME_STUDIO_SERVICES.join(',');
  for (let level = 0; level <= 7; level += 1) {
    const [rawLeft = '', rawRight = ''] = (rc[level] ?? ';').split(';');
    const left = dropScannedStudio(rawLeft);
    const right = dropScannedStudio(rawRight);
    rc[level] = `${SERVICE_MESSAGES}${left ? `,${left}` : ''};${SERVICE_APP},${declaredRight}${right ? `,${right}` : ''}`;
    seedLastService(nav2Left, level, 'left', SERVICE_MESSAGES);
    seedLastService(nav2Right, level, 'right', SERVICE_APP);
  }
  return rc;
}

export interface MlsPluginApi {
  plugin?: {
    loadAll?: (project: number, force?: boolean) => Promise<unknown>;
    getAllMenuActions?: (project: number, options: { scope: string }) => Array<{ widget?: string; priority?: number }>;
  };
  l5?: { getProjectDependencies?: (project: number, includeBase: boolean) => number[] };
  actual?: Array<{ setFullName: (widget: string) => { path?: string; getStorFileBase?: () => { shortName?: string } | undefined } }>;
  stor?: { server?: { loadProjectInfoIfNeeded?: (project: number) => Promise<unknown> } };
}

function collectScanProjects(siteProject: number, mlsApi: MlsPluginApi): number[] {
  const projectList: number[] = [];
  const add = (project: number) => {
    if (!project || project === STUDIO_BASE_PROJECT || projectList.includes(project)) return;
    projectList.push(project);
  };
  add(siteProject);
  try {
    for (const dep of mlsApi.l5?.getProjectDependencies?.(siteProject, false) ?? []) add(dep);
  } catch { /* dependencies are best-effort */ }
  return projectList;
}

/**
 * Menu actions per level/position from the site project and its dependencies.
 * Does not scan 100554 — studio widgets the runtime uses are declared in
 * RUNTIME_STUDIO_SERVICES and injected by withRuntimeServices.
 */
export async function buildStudioServices(
  siteProject: number,
  api: MlsPluginApi | undefined = (globalThis as unknown as { mls?: MlsPluginApi }).mls,
): Promise<string[]> {
  if (!api?.plugin?.loadAll || !api.plugin.getAllMenuActions) return ANONYMOUS_SERVICES;

  const projectList = collectScanProjects(siteProject, api);

  for (const project of projectList) {
    await api.stor?.server?.loadProjectInfoIfNeeded?.(project);
    await api.plugin.loadAll(project, false);
  }

  const services: string[] = [];
  for (let level = 0; level <= 7; level += 1) {
    const byPosition: Record<'Left' | 'Right', string[]> = { Left: [], Right: [] };
    for (const position of ['Left', 'Right'] as const) {
      const addedShortNames = new Set<string>();
      for (const project of projectList) {
        const actions = api.plugin.getAllMenuActions(project, { scope: `l${level}Services${position}` }) ?? [];
        for (const action of actions.sort((a, b) => (a.priority || 1) - (b.priority || 1))) {
          // Malformed menu actions produce requests like /_1_/l2/undefined.js —
          // only widgets with a real project reference pass.
          if (!action?.widget || !/^_\d{6,}_/u.test(action.widget)) continue;
          const info = api.actual?.[0]?.setFullName(action.widget);
          const shortName = info?.getStorFileBase?.()?.shortName || info?.path?.split('/').pop() || action.widget;
          if (addedShortNames.has(shortName)) continue;
          addedShortNames.add(shortName);
          byPosition[position].push(action.widget);
        }
      }
    }
    services.push(`${byPosition.Left.join(',')};${byPosition.Right.join(',')}`);
  }
  const hasAny = services.some((entry) => entry !== ';');
  return hasAny ? services : ANONYMOUS_SERVICES;
}
