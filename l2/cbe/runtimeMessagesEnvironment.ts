/// <mls fileReference="_102033_/l2/cbe/runtimeMessagesEnvironment.ts" enhancement="_blank" />
// Generic collab-messages environment for ANY client project on the runtime
// VM (extracted from the 102051 messagesAside so projects without their own
// aside — e.g. 102045 — get messages out of the box in the unified nav3):
// same-origin /msg API with cookie credentials, apps menu from the composed
// config.json (monitor.config.load), task details in the nav3 Detail tab,
// and menu mode 'custom' (the nav3 toolbar owns the mode tabs).

import { setEnvironment, type CollabProgramMenu, type CollabProgramMenuItem } from '/_102036_/l2/environmentContract.js';

interface ConfigNavItem { id?: string; label?: string; href?: string }
interface ConfigModule { moduleId?: string; basePath?: string; navigation?: ConfigNavItem[] }

function moduleToMenu(moduleConfig: ConfigModule, project: number): CollabProgramMenu | null {
  if (!moduleConfig.moduleId) return null;
  const basePath = moduleConfig.basePath ?? `/${moduleConfig.moduleId}`;
  const navigation = (moduleConfig.navigation ?? []).filter((nav) => nav.href);
  const menu: CollabProgramMenuItem[] = navigation.length > 0
    ? navigation.map((nav) => ({
        title: nav.label ?? nav.id ?? nav.href ?? '',
        icon: '',
        url: nav.href ?? '',
        pageName: nav.id ?? nav.href ?? '',
      }))
    : [{ title: moduleConfig.moduleId, icon: '', url: basePath, pageName: moduleConfig.moduleId }];
  return { name: moduleConfig.moduleId, icon: '', project, path: basePath, menu };
}

async function callBff<T>(routine: string): Promise<T | undefined> {
  try {
    const response = await fetch('/execBff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ routine, params: {}, meta: { source: 'http' } }),
    });
    const rc = await response.json() as { ok?: boolean; data?: T };
    return rc.ok ? rc.data : undefined;
  } catch {
    return undefined;
  }
}

export async function buildProgramMenu(): Promise<CollabProgramMenu[]> {
  // Preferred: monitor.appsMenu.load — every hosted app with its RESOLVED
  // navigation (includes the master modules monitor/audit/mdm, whose menu
  // lives in module.ts, not in the composed config.json).
  const appsMenu = await callBff<{ apps?: Array<{ projectId?: string | number; moduleId?: string; basePath?: string; navigation?: ConfigNavItem[] }> }>('monitor.appsMenu.load');
  if (appsMenu?.apps?.length) {
    const menus = appsMenu.apps
      .map((app) => moduleToMenu({ moduleId: app.moduleId, basePath: app.basePath, navigation: app.navigation }, Number(app.projectId) || 0))
      .filter((menu): menu is CollabProgramMenu => menu !== null);
    if (menus.length > 0) return menus;
  }

  // Fallback (older backend releases): the composed config.json.
  const config = await callBff<{ projects?: Record<string, { modules?: ConfigModule[] }> }>('monitor.config.load');
  if (config?.projects) {
    const menus: CollabProgramMenu[] = [];
    for (const [projectId, project] of Object.entries(config.projects)) {
      for (const moduleConfig of project.modules ?? []) {
        const menu = moduleToMenu(moduleConfig, Number(projectId) || 0);
        if (menu) menus.push(menu);
      }
    }
    if (menus.length > 0) return menus;
  }
  return [];
}

// The app's tabs/panels live adopted inside serviceClientApp, on the right
// nav3 — if some OTHER right-side service is active (e.g. a studio panel
// selected via the header's own nav2), the region is there but hidden behind
// it. Opening/activating an app must bring serviceClientApp back to front.
function ensureAppServiceVisible(): void {
  const nav3Right = document.querySelector('collab-nav-3[toolbarposition="right"]');
  if (nav3Right && nav3Right.getAttribute('data-service') !== '_102033_/l2/cbe/serviceClientApp') {
    nav3Right.setAttribute('data-service', '_102033_/l2/cbe/serviceClientApp');
  }
}

/**
 * Program navigation for the unified shell:
 * - Pages of the CURRENT app: SPA navigation (pushState + popstate), no reload.
 * - Other apps (monitor, audit, another module): a nav3 content TAB hosting an
 *   iframe — no full-page flicker, each app keeps its own design system in its
 *   own context, and the "several screens as tabs" workflow falls out for free.
 * - Fallback (no nav3 yet): plain navigation.
 */
export async function openProgramUnified(item: { url?: string; pageName?: string }): Promise<void> {
  if (!item.url) return;
  ensureAppServiceVisible();
  const basePath = window.collabBoot?.basePath ?? '';
  if (basePath && item.url.startsWith(basePath)) {
    window.history.pushState({}, '', item.url);
    window.dispatchEvent(new PopStateEvent('popstate'));
    // The app renders in the 'app' tab — bring it to front, or the navigation
    // is invisible while a foreign-module tab (monitor/audit) is active.
    window.collabRuntimeNav3?.activateTab('app');
    return;
  }
  const nav3 = window.collabRuntimeNav3;
  if (nav3) {
    const moduleName = item.url.replace(/^\//u, '').split('/')[0] || item.pageName || 'app';
    const tabId = `app-${moduleName}`;
    const existing = appFrames.get(tabId);
    if (existing?.isConnected) {
      // Same module already open: navigate the live iframe (its own history)
      // and just activate the tab — no teardown, no reload of the whole app.
      try {
        const current = existing.contentWindow?.location;
        if (current && current.pathname + current.search !== item.url) {
          current.href = item.url;
        }
      } catch { /* cross-origin frame — leave it as is */ }
      nav3.activateTab(tabId);
      return;
    }
    const frame = document.createElement('iframe');
    frame.src = item.url;
    frame.style.cssText = 'display:block;width:100%;height:100%;border:0;';
    appFrames.set(tabId, frame);
    nav3.openTab({ id: tabId, title: moduleName, element: frame });
    return;
  }
  window.location.href = item.url;
}

// One iframe per foreign module tab, reused across menu clicks.
const appFrames = new Map<string, HTMLIFrameElement>();

/** Applies the generic runtime environment (call only when self-hosting —
 * a project-provided messages aside brings its own environment). */
export function applyRuntimeMessagesEnvironment(): void {
  setEnvironment({
    config: {
      getMenuMode: () => 'custom',
      getApiUrl: () => `${window.location.origin}/msg`,
      getApiCredentials: () => 'same-origin',
      getDefaultUserName: () => window.collabBoot?.pageTitle ?? 'App',
    },
    apps: {
      getProgramMenu: () => buildProgramMenu(),
      openProgram: (item) => openProgramUnified(item),
    },
    tasks: {
      openTaskDetails: async (messageId, _taskId, task, message) => {
        const nav3 = window.collabRuntimeNav3;
        if (!nav3) return { openLocal: false, element: undefined };
        ensureAppServiceVisible();
        await import('/_102025_/l2/collabMessagesTaskInfo.js');
        const info = document.createElement('collab-messages-task-info-102025') as HTMLElement & { task?: unknown; message?: unknown };
        info.setAttribute('messageId', messageId);
        info.task = task;
        info.message = message;
        const host = document.createElement('service-detail-100554');
        host.style.display = 'block';
        host.style.height = '100%';
        host.appendChild(info);
        nav3.openTab({ id: 'detail', title: 'Detail', element: host });
        return { openLocal: false, element: undefined };
      },
    },
  });
}
