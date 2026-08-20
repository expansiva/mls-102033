/// <mls fileReference="_102033_/l2/shared/sessionUser.ts" enhancement="_blank" />

// Who is logged in, for the client chrome (today: the header avatar).
//
// The claims live in an httpOnly cookie, so the browser cannot read them — it ASKS `/session/info`
// (the same endpoint the aside uses for authorities). The request is made ONCE per page: the promise
// is cached, so ten components asking cost one round trip, and a failure resolves to an anonymous
// user instead of throwing — chrome must not break because a session probe failed.

export interface SessionUser {
  authenticated: boolean;
  name?: string;
  email?: string;
  /** Avatar URL from the IdP (OIDC `picture`); absent when it does not send one. */
  picture?: string;
}

const ANONYMOUS: SessionUser = { authenticated: false };

let pending: Promise<SessionUser> | undefined;

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Only http(s) and data: images — a `javascript:` src in an <img> would be a hole. */
function safePicture(value: unknown): string | undefined {
  const url = readString(value);
  if (!url) return undefined;
  return /^(https?:\/\/|data:image\/)/iu.test(url) ? url : undefined;
}

export function parseSessionUser(payload: unknown): SessionUser {
  if (!payload || typeof payload !== 'object') return ANONYMOUS;
  const info = payload as Record<string, unknown>;
  return {
    authenticated: info.authenticated === true,
    name: readString(info.name),
    email: readString(info.email),
    picture: safePicture(info.picture),
  };
}

/** The logged user, fetched once per page. Never rejects. */
export async function getSessionUser(): Promise<SessionUser> {
  pending ??= (async () => {
    try {
      const response = await fetch('/session/info', { credentials: 'same-origin' });
      if (!response.ok) return ANONYMOUS;
      return parseSessionUser(await response.json());
    } catch {
      return ANONYMOUS;
    }
  })();
  return pending;
}

/** Test/diagnostic hook: drops the cached probe so the next call asks again. */
export function resetSessionUserCache(): void {
  pending = undefined;
}

/**
 * Initials for the avatar fallback: two from a name ("Guilherme Pereira" -> GP), one from an email
 * ("guilherme@x.dev" -> G), and a neutral dot when there is neither.
 */
export function userInitials(user: SessionUser): string {
  const name = user.name;
  if (name) {
    const words = name.split(/\s+/u).filter(Boolean);
    const initials = words.length > 1
      ? `${words[0][0]}${words[words.length - 1][0]}`
      : words[0].slice(0, 2);
    return initials.toUpperCase();
  }
  const email = user.email;
  if (email) return email[0].toUpperCase();
  return '';
}

/** What the avatar announces to a screen reader and shows on hover. */
export function userLabel(user: SessionUser, anonymousLabel = 'Account'): string {
  return user.name || user.email || anonymousLabel;
}
