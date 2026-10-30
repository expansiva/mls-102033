/// <mls fileReference="_102033_/l2/shared/sessionUser.ts" enhancement="_blank" />

// Who is logged in, for the client chrome (today: the header avatar).
//
// The claims live in an httpOnly cookie, so the browser cannot read them — it ASKS `/session/info`
// (the same endpoint the aside uses for authorities). The request is made ONCE per page: the promise
// is cached, so ten components asking cost one round trip, and a failure resolves to an anonymous
// user instead of throwing — chrome must not break because a session probe failed.
//
// The entry gate uses the same probe through getSessionUserStrict(), which rejects HTTP, network and
// invalid-protocol failures instead of looking anonymous.

export type SessionOnboardingStatus = 'ready' | 'incomplete' | 'pending' | 'unregistered' | 'unavailable';

export interface SessionOnboarding {
  status: SessionOnboardingStatus;
  entryPath: string;
  moduleBasePath: string;
  requestId?: string;
}

export interface SessionUser {
  authenticated: boolean;
  name?: string;
  email?: string;
  /** Avatar URL from the IdP (OIDC `picture`); absent when it does not send one. */
  picture?: string;
  /** Presentation id of the session person. Absent means unknown — not an empty person. */
  person?: { mdmId: string };
  /** Provisioned organization company. Absent when the server sent null or the resource is off. */
  company?: { mdmId: string };
  /** Present only when the server enabled onboarding and the payload is well formed. */
  onboarding?: SessionOnboarding;
  /**
   * `allAuthorities` of the session (`<module>:<actor>`), what the menu filters by. Empty until the
   * token issuer emits them — and absent means "filter nothing" (see visibleNavigation).
   */
  authorities?: string[];
}

const ANONYMOUS: SessionUser = { authenticated: false };
const SESSION_TIMEOUT_MS = 10_000;
const ONBOARDING_STATUS: ReadonlySet<string> = new Set([
  'ready', 'incomplete', 'pending', 'unregistered', 'unavailable',
]);

type SessionProbe = { user: SessionUser } | { error: Error };

let pending: Promise<SessionProbe> | undefined;

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Only http(s) and data: images — a `javascript:` src in an <img> would be a hole. */
function safePicture(value: unknown): string | undefined {
  const url = readString(value);
  if (!url) return undefined;
  return /^(https?:\/\/|data:image\/)/iu.test(url) ? url : undefined;
}

/** Only an authenticated session with a non-empty string mdmId. Anything else is omitted. */
function readId(authenticated: boolean, value: unknown): { mdmId: string } | undefined {
  if (!authenticated || !value || typeof value !== 'object') return undefined;
  const mdmId = readString((value as Record<string, unknown>).mdmId);
  return mdmId ? { mdmId } : undefined;
}

/** A same-origin path: one leading slash, no protocol-relative `//` and no origin. */
function localPath(value: unknown): string | undefined {
  const path = readString(value);
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('://')) return undefined;
  return path;
}

function readOnboarding(authenticated: boolean, value: unknown): SessionOnboarding | undefined {
  if (!authenticated || !value || typeof value !== 'object') return undefined;
  const body = value as Record<string, unknown>;
  const status = body.status;
  const entryPath = localPath(body.entryPath);
  const moduleBasePath = localPath(body.moduleBasePath);
  if (typeof status !== 'string' || !ONBOARDING_STATUS.has(status) || !entryPath || !moduleBasePath) return undefined;
  if (entryPath !== moduleBasePath && !entryPath.startsWith(`${moduleBasePath}/`)) return undefined;
  const onboarding: SessionOnboarding = { status: status as SessionOnboardingStatus, entryPath, moduleBasePath };
  if (body.requestId !== undefined) {
    const requestId = readString(body.requestId);
    if (!requestId) return undefined;
    onboarding.requestId = requestId;
  }
  return onboarding;
}

/**
 * `company` and `onboarding` are checked on their own. A present company is null or a valid id;
 * it does not require a gate. A present gate must parse — a gate the parser would drop is an
 * invalid protocol, never a synthetic `ready`. A legacy body has neither field.
 */
function assertSessionProtocol(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return;
  const info = payload as Record<string, unknown>;
  if (info.authenticated !== true) return;
  if (Object.hasOwn(info, 'company') && info.company != null && !readId(true, info.company)) {
    throw new Error('session/info invalid protocol');
  }
  if (Object.hasOwn(info, 'onboarding') && !readOnboarding(true, info.onboarding)) {
    throw new Error('session/info invalid protocol');
  }
}

export function parseSessionUser(payload: unknown): SessionUser {
  if (!payload || typeof payload !== 'object') return ANONYMOUS;
  const info = payload as Record<string, unknown>;
  const authenticated = info.authenticated === true;
  const user: SessionUser = {
    authenticated,
    name: readString(info.name),
    email: readString(info.email),
    picture: safePicture(info.picture),
  };
  const person = readId(authenticated, info.person);
  if (person) user.person = person;
  const company = readId(authenticated, info.company);
  if (company) user.company = company;
  const onboarding = readOnboarding(authenticated, info.onboarding);
  if (onboarding) user.onboarding = onboarding;
  const authorities = authenticated && Array.isArray(info.allAuthorities)
    ? info.allAuthorities.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];
  if (authorities.length) user.authorities = authorities;
  return user;
}

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('session/info timed out'));
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => {
      reject(signal.reason instanceof Error ? signal.reason : new Error('session/info timed out'));
    }, { once: true });
  });
}

/** Headers and body share one deadline. A late body failure must not surface as unhandled. */
async function readJsonBody(response: Response, signal: AbortSignal): Promise<unknown> {
  const body = response.json().then(
    (payload) => payload,
    (error: unknown) => Promise.reject(error instanceof Error ? error : new Error(String(error))),
  );
  try {
    return await Promise.race([body, rejectOnAbort(signal)]);
  } catch (error) {
    void body.catch(() => undefined);
    throw error;
  }
}

async function readSessionProbe(): Promise<SessionProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error('session/info timed out'));
  }, SESSION_TIMEOUT_MS);
  try {
    const response = await fetch('/session/info', { credentials: 'same-origin', signal: controller.signal });
    if (!response.ok) throw new Error(`session/info HTTP ${response.status}`);
    const payload = await readJsonBody(response, controller.signal);
    assertSessionProtocol(payload);
    return { user: parseSessionUser(payload) };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  } finally {
    clearTimeout(timer);
  }
}

function sessionProbe(): Promise<SessionProbe> {
  pending ??= readSessionProbe();
  return pending;
}

/** The logged user, fetched once per page. Never rejects. */
export async function getSessionUser(): Promise<SessionUser> {
  const probe = await sessionProbe();
  return 'user' in probe ? probe.user : ANONYMOUS;
}

/**
 * Same fetch and parse as getSessionUser. Rejects when the probe fails, a present company is
 * neither null nor a valid id, or a present gate is not a known state with local paths.
 * Never coerces that failure to anonymous.
 */
export async function getSessionUserStrict(): Promise<SessionUser> {
  const probe = await sessionProbe();
  if ('error' in probe) throw probe.error;
  return probe.user;
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
