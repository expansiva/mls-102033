/// <mls fileReference="_102033_/l2/cbe/cbeAuth.ts" enhancement="_blank" />
// Client-side collab-auth routines for the runtime VM site. The flow mirrors
// the studio (mls-100554 pluginCollabLogin):
//   1. startCollabLogin() redirects to collab-auth, which handles the OAuth
//      provider and returns to THIS origin with the tokens in the URL fragment
//      (#access_token=...&refresh_token=...).
//   2. The mls lib's cbeLogin (cfe handleCollabAuthCallback) hands the tokens
//      to the local cbe module ({action:'authSession'}), which validates the
//      JWT against collab-auth's JWKS and stores httpOnly cookies.
//   3. The login response sets the JS-readable `loginUser` cookie — the only
//      session signal this module reads.
//
// NOTE: the VM origin (e.g. https://102045.collabcodes.com) must be an allowed
// returnTo on collab-auth; localhost is accepted for dev.

const AUTH_BASE_URL = 'https://auth.collab.codes';

export type CollabAuthProvider = 'google';

/** The logged user from the JS-readable `loginUser` cookie ('' when anonymous). */
export function getLoginUser(): string {
  const match = /(?:^|;\s*)loginUser=([^;]*)/u.exec(document.cookie);
  const value = match ? decodeURIComponent(match[1]) : '';
  return value && value !== 'anonymous' ? value : '';
}

export function isLoggedIn(): boolean {
  return getLoginUser() !== '';
}

/** Redirects to collab-auth; it returns to this origin with tokens in the fragment. */
export function startCollabLogin(provider: CollabAuthProvider = 'google'): void {
  const returnTo = `${window.location.origin}/?collabauth=1`;
  window.location.href = `${AUTH_BASE_URL}/auth/login/${provider}?returnTo=${encodeURIComponent(returnTo)}`;
}

/** Clears the VM session cookies (cauth/crefresh/loginUser) and reloads. */
export async function logoutCollab(): Promise<void> {
  try {
    await fetch('/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'authLogout' }),
    });
  } catch (err) {
    console.warn('[cbeAuth] logout request failed:', err);
  }
  window.location.reload();
}

// ── Login gate ───────────────────────────────────────────────────────────────
// Mirrors the on.collab.codes behavior for the runtime VM: on a host that
// requires login (anything that's not localhost/*.local), an anonymous visitor
// gets a full-screen sign-in page instead of a locked, silent studio. The /exec
// 'login' action never authenticates anyone — it only delivers sources — so the
// real login is the collab-auth redirect (startCollabLogin) and this gate is
// merely the UI that triggers it.

/** Same host heuristic as the server's requiresLogin (cbeRoutes). */
function isLoginFreeHost(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host.endsWith('.local') || host === '';
}

const LOGIN_GATE_ID = 'cbe-login-gate';

/**
 * Shows the sign-in page when this host requires a session and there is none.
 * Called by cbeMiniCfe after the login round-trip (the loginUser cookie is the
 * session signal). No-op on localhost and when already signed in.
 */
export function showLoginGateIfNeeded(): void {
  if (isLoginFreeHost() || isLoggedIn()) {
    document.getElementById(LOGIN_GATE_ID)?.remove();
    return;
  }
  // Returning from collab-auth: the tokens are in the URL fragment and the
  // session is about to be established (authSession) — showing the sign-in
  // page again here would flash it at the user mid-login.
  if (window.location.hash.includes('access_token=')) return;
  if (document.getElementById(LOGIN_GATE_ID)) return;
  const gate = document.createElement('div');
  gate.id = LOGIN_GATE_ID;
  gate.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#f7f4ea 0%,#fffdfa 100%);font-family:"Segoe UI",sans-serif;';
  gate.innerHTML = `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 12px 40px rgba(16,42,67,.12);padding:40px 48px;max-width:360px;text-align:center;">
      <div style="font-size:1.6rem;font-weight:700;color:#102a43;margin-bottom:8px;">collab.codes</div>
      <div style="color:#52606d;font-size:.95rem;margin-bottom:28px;">Sign in to access this workspace.</div>
      <button type="button" data-login style="display:inline-flex;align-items:center;gap:10px;padding:10px 22px;border:1px solid #d9e2ec;border-radius:8px;background:#fff;color:#102a43;font-size:.95rem;font-weight:600;cursor:pointer;">
        <span style="font-weight:700;color:#4285F4;">G</span> Continue with Google
      </button>
    </div>`;
  gate.querySelector('[data-login]')?.addEventListener('click', () => startCollabLogin('google'));
  document.body.appendChild(gate);
}

// Global hook so shell/pages (and the console) can drive the session without
// importing this module: window.collabRuntimeAuth.login() / .logout() / .user().
declare global {
  interface Window {
    collabRuntimeAuth?: {
      login: (provider?: CollabAuthProvider) => void;
      logout: () => Promise<void>;
      user: () => string;
    };
  }
}

window.collabRuntimeAuth = {
  login: startCollabLogin,
  logout: logoutCollab,
  user: getLoginUser,
};
