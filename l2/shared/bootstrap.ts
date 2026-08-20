/// <mls fileReference="_102033_/l2/shared/bootstrap.ts" enhancement="_blank" />
import '/_102033_/l2/shared/shell.js';
// cbeMiniCfe is loaded by the shell templates (spa/pwa index.html) as an early
// <head> module script, so the SW install + cbe login start in parallel with
// the app boot — do not import it here or it would run twice (two instances).
import { getTokensCss } from '/_102029_/l2/designSystemBase.js';
import { BFF_UNAUTHENTICATED_EVENT } from '/_102029_/l2/bffClient.js';
import { startCollabLogin } from '/_102033_/l2/cbe/cbeAuth.js';
import {
  listRuntimeDesignSystems,
  resolveRuntimeDesignSystem,
  setRuntimeDesignSystem,
} from '/_102033_/l2/shared/designSystemRuntime.js';

/**
 * Inject the design-system tokens generated from the project's designSystem.js.
 * The server has no root route, so the module path is explicit (/_<project>_/l2/…).
 * DS selection: an optional boot-level `designSystem` (theme name) when present;
 * otherwise the first DS with tokens. Fire-and-forget — the shell mounts regardless,
 * and a project without a design system just gets no tokens (empty css).
 */
async function injectDesignSystemTokens(): Promise<void> {
  try {
    const boot = window.collabBoot;
    const project = boot?.projectId;
    if (!project) return;
    const designSystems = listRuntimeDesignSystems(boot.designSystems);
    const requestedDesignSystem = resolveRuntimeDesignSystem(
      designSystems,
      boot.designSystem ?? '',
    ) ?? designSystems[0];
    if (requestedDesignSystem) {
      await setRuntimeDesignSystem(requestedDesignSystem, designSystems, project);
      return;
    }

    // Compatibility with a config generated before modules[].designSystems existed.
    const dsIndex = boot.designSystem || 1;
    const css = await getTokensCss(dsIndex, `/_${project}_/l2/designSystem.js`);
    if (!css) return;
    let style = document.getElementById('ds-tokens') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'ds-tokens';
      document.head.appendChild(style);
    }
    style.textContent = css;
    if (typeof boot.designSystem === 'string') {
      style.dataset.designSystem = boot.designSystem;
    }
  } catch (e) {
    console.warn('[bootstrap] design system tokens not injected:', e);
  }
}

/**
 * Apply the dark preference before first paint: stored choice wins, OS preference is
 * the fallback. Sets BOTH conventions on <html> — `.dark` (Aura/Tailwind variant) and
 * `data-theme="dark"` (legacy attribute) — matching what the tokens css targets.
 */
function applyThemePreference(): void {
  try {
    let theme = localStorage.getItem('collab_app_theme');
    if (!theme || theme === 'default') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      theme = prefersDark ? 'dark' : 'light';
    }
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch {
    // no-op: theme preference is best-effort
  }
}

function ensureShellRoot() {
  const existing = document.querySelector('collab-aura-shell');
  if (existing) {
    return existing;
  }

  const shell = document.createElement('collab-aura-shell');
  document.body.appendChild(shell);
  return shell;
}

/**
 * A 401 from the single door means the collab-auth session died (or never started). The page cannot fix
 * it — the access token is an httpOnly cookie only the runtime writes — so the shell sends the user
 * through the login that already exists, which returns to this origin. Without this, an expired session
 * showed up as a broken screen with an error toast on every action.
 *
 * Guarded so a storm of parallel calls redirects once.
 */
function installUnauthenticatedRedirect(): void {
  let redirecting = false;
  window.addEventListener(BFF_UNAUTHENTICATED_EVENT, () => {
    if (redirecting) return;
    redirecting = true;
    console.info('[shell] collab-auth session expired; redirecting to login');
    startCollabLogin();
  });
}

/**
 * The environment badge. Read-only: the mode is resolved by the server and arrives in the boot config —
 * the client showing it must never be able to change it. Absent or `production` shows nothing, so a real
 * app carries no chrome; anything else says so, which is the whole point of a presentation database.
 */
function showEnvironmentBadge(): void {
  const mode = (window.collabBoot as { appEnv?: string } | undefined)?.appEnv;
  if (!mode || mode === 'production') return;
  const badge = document.createElement('div');
  badge.id = 'collab-env-badge';
  badge.textContent = mode.toUpperCase();
  badge.setAttribute('aria-label', `environment: ${mode}`);
  badge.style.cssText = [
    'position:fixed', 'right:8px', 'bottom:8px', 'z-index:2147483647',
    'padding:2px 8px', 'border-radius:9999px',
    'font:600 10px/1.6 system-ui,sans-serif', 'letter-spacing:.08em',
    'color:var(--text-muted,#475569)', 'background:var(--surface-subtle,#f1f5f9)',
    'border:1px solid var(--border-default,#cbd5e1)', 'pointer-events:none', 'opacity:.85',
  ].join(';');
  document.body.appendChild(badge);
}

applyThemePreference();
injectDesignSystemTokens();
installUnauthenticatedRedirect();
showEnvironmentBadge();
ensureShellRoot();
