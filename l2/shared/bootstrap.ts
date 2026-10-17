/// <mls fileReference="_102033_/l2/shared/bootstrap.ts" enhancement="_blank" />
// THIS IMPORT MUST STAY FIRST — it is not alphabetical, it is load-bearing.
// elementSwapRegistry replaces `customElements.define` so every tag gets a swappable stand-in
// (TASK-102020-live-update-stand-in). A tag already registered can never be adopted afterwards, so
// arriving late means that tag is out of the live update for the whole session. Import order is
// evaluation order, so anything moved above this line takes its own defines out of reach. The two
// module scripts the shell templates load before this one (telemetry.js, cbeMiniCfe.js) register no
// custom element, which is what makes the first line here early enough. Inert without the studio
// flag: a client session keeps the native `define`.
import '/_102033_/l2/shared/elementSwapRegistry.js';
import '/_102033_/l2/shared/shell.js';
// brings the global Window.collabBoot declaration into every program that compiles this file
import type { MasterFrontendBootConfig } from '/_102029_/l2/contracts/bootstrap.js';
// cbeMiniCfe is loaded by the shell templates (spa/pwa index.html) as an early
// <head> module script, so the SW install + cbe login start in parallel with
// the app boot — do not import it here or it would run twice (two instances).
import { getTokens, getTokensCss } from '/_102029_/l2/designSystemBase.js';
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
    const path = `/_${project}_/l2/designSystem.js`;
    const css = await getTokensCss(dsIndex, path);
    if (!css) return;
    let style = document.getElementById('ds-tokens') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'ds-tokens';
      document.head.appendChild(style);
    }
    style.textContent = css;
    // Stamp WHICH theme is on screen (same pick as getTokensCss, first theme as fallback): the
    // L5 → UI live preview only repaints the active DS, and mls.sites.getDS reads it from here.
    const themes = await getTokens(path).catch(() => []);
    const active = typeof dsIndex === 'string'
      ? themes.find((theme) => theme.themeName === dsIndex)
      : themes.find((theme) => theme.dsIndex === String(dsIndex));
    const themeName = (active ?? themes[0])?.themeName;
    if (themeName) style.dataset.designSystem = themeName;
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

const ONBOARDING_FAILURE_ID = 'collab-onboarding-entry';
const ONBOARDING_FAILURE_TEXT = 'Could not prepare your access.';

type OnboardingEntryModule = {
  prepareOnboardingEntry: (boot: MasterFrontendBootConfig) => Promise<'continue' | 'redirected'>;
  retryOnboardingEntry: (boot: MasterFrontendBootConfig) => Promise<'continue' | 'redirected'>;
};

function loadOnboardingEntry(): Promise<OnboardingEntryModule> {
  return import('/_102033_/l2/shared/onboardingEntry.js');
}

function showOnboardingFailure(
  boot: MasterFrontendBootConfig,
  loadEntry: () => Promise<OnboardingEntryModule>,
): void {
  if (document.getElementById(ONBOARDING_FAILURE_ID)) return;
  const box = document.createElement('div');
  box.id = ONBOARDING_FAILURE_ID;
  const message = document.createElement('p');
  message.textContent = ONBOARDING_FAILURE_TEXT;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Try again';
  button.addEventListener('click', () => {
    if (button.disabled) return;
    button.disabled = true;
    void finishOnboarding(boot, loadEntry, true).then((mounted) => {
      if (mounted) return;
      button.disabled = false;
    });
  });
  box.append(message, button);
  document.body.appendChild(box);
}

/** Resolves true when the shell was mounted. A redirect or a shown failure resolves false. */
async function finishOnboarding(
  boot: MasterFrontendBootConfig,
  loadEntry: () => Promise<OnboardingEntryModule>,
  retry: boolean,
): Promise<boolean> {
  try {
    const entry = await loadEntry();
    const decision = retry
      ? await entry.retryOnboardingEntry(boot)
      : await entry.prepareOnboardingEntry(boot);
    if (decision === 'redirected') return false;
    document.getElementById(ONBOARDING_FAILURE_ID)?.remove();
    ensureShellRoot();
    return true;
  } catch {
    showOnboardingFailure(boot, loadEntry);
    return false;
  }
}

/**
 * Waits for the entry gate before the shell exists. No onboarding keeps the synchronous mount
 * and does not load the gate module.
 */
export async function mountClientShell(
  boot: MasterFrontendBootConfig | undefined,
  loadEntry: () => Promise<OnboardingEntryModule> = loadOnboardingEntry,
): Promise<void> {
  if (!boot?.onboarding) {
    ensureShellRoot();
    return;
  }
  await finishOnboarding(boot, loadEntry, false);
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

if (typeof document !== 'undefined') {
  applyThemePreference();
  injectDesignSystemTokens();
  installUnauthenticatedRedirect();
  showEnvironmentBadge();
  void mountClientShell(window.collabBoot);
}
