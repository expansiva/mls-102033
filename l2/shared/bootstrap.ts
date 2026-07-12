/// <mls fileReference="_102033_/l2/shared/bootstrap.ts" enhancement="_blank" />
import '/_102033_/l2/shared/shell.js';
// cbeMiniCfe is loaded by the shell templates (spa/pwa index.html) as an early
// <head> module script, so the SW install + cbe login start in parallel with
// the app boot — do not import it here or it would run twice (two instances).
import { getTokensCss } from '/_102029_/l2/designSystemBase.js';

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
    const dsIndex = (boot as { designSystem?: string } | undefined)?.designSystem || 1;
    const css = await getTokensCss(dsIndex, `/_${project}_/l2/designSystem.js`);
    if (!css) return;
    let style = document.getElementById('ds-tokens') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'ds-tokens';
      document.head.appendChild(style);
    }
    style.textContent = css;
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

applyThemePreference();
injectDesignSystemTokens();
ensureShellRoot();
