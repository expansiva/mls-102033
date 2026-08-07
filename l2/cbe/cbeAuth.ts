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
