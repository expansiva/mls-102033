/// <mls fileReference="_102033_/l2/shared/onboardingEntry.ts" enhancement="_blank" />

// Entry gate for an enabled onboarding boot. It decides whether the shell may mount the
// requested page. It is not an authorization check: the server already validated the entry
// path, and the registration routes trust the existing session.

import { isInternalModuleHref } from '/_102033_/l2/shared/layout/auraNavigate.js';
import { getSessionUserStrict, resetSessionUserCache, type SessionUser } from '/_102033_/l2/shared/sessionUser.js';

export type OnboardingEntryDecision = 'continue' | 'redirected';

export interface OnboardingEntryBoot {
  onboarding?: {
    entryPath: string;
    moduleBasePath: string;
  };
}

const REGISTER_TIMEOUT_MS = 10_000;
const REGISTER_STATUS = new Set(['ready', 'incomplete', 'pending']);

let registration: Promise<void> | undefined;

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('session/register timed out'));
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => {
      reject(signal.reason instanceof Error ? signal.reason : new Error('session/register timed out'));
    }, { once: true });
  });
}

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

function assertRegistration(payload: unknown): void {
  if (!payload || typeof payload !== 'object') throw new Error('session/register invalid body');
  const body = payload as Record<string, unknown>;
  if (typeof body.status !== 'string' || !REGISTER_STATUS.has(body.status)) {
    throw new Error('session/register invalid body');
  }
  const company = body.company;
  const mdmId = company && typeof company === 'object'
    ? (company as Record<string, unknown>).mdmId
    : undefined;
  if (typeof mdmId !== 'string' || !mdmId.trim()) throw new Error('session/register invalid body');
}

/** One POST per attempt. A failure stays cached until retryOnboardingEntry. */
async function postRegister(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error('session/register timed out'));
  }, REGISTER_TIMEOUT_MS);
  try {
    const response = await fetch('/session/register', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`session/register HTTP ${response.status}`);
    assertRegistration(await readJsonBody(response, controller.signal));
  } finally {
    clearTimeout(timer);
  }
}

function registrationAttempt(): Promise<void> {
  registration ??= postRegister();
  return registration;
}

function place(user: SessionUser): OnboardingEntryDecision {
  const onboarding = user.onboarding;
  if (!onboarding) throw new Error('session/info missing onboarding');
  if (onboarding.status === 'unavailable') throw new Error('onboarding unavailable');
  if (onboarding.status === 'ready') return 'continue';
  if (onboarding.status === 'unregistered') throw new Error('onboarding still unregistered');
  if (onboarding.status !== 'incomplete' && onboarding.status !== 'pending') {
    throw new Error('onboarding unavailable');
  }
  const pathname = window.location.pathname;
  if (isInternalModuleHref(pathname, onboarding.moduleBasePath)) return 'continue';
  window.location.replace(onboarding.entryPath);
  return 'redirected';
}

async function resolveEnabledEntry(): Promise<OnboardingEntryDecision> {
  const user = await getSessionUserStrict();
  if (!user.authenticated) return 'continue';
  if (user.onboarding?.status === 'unregistered') {
    await registrationAttempt();
    resetSessionUserCache();
    const refreshed = await getSessionUserStrict();
    if (!refreshed.authenticated) throw new Error('session/info missing onboarding');
    if (refreshed.onboarding?.status === 'unregistered' || refreshed.onboarding?.status === 'unavailable' || !refreshed.onboarding) {
      throw new Error(refreshed.onboarding?.status === 'unavailable' ? 'onboarding unavailable' : 'onboarding still unregistered');
    }
    return place(refreshed);
  }
  return place(user);
}

/** `'continue'` mounts the requested page. `'redirected'` already replaced the location. */
export async function prepareOnboardingEntry(boot: OnboardingEntryBoot | undefined): Promise<OnboardingEntryDecision> {
  if (!boot?.onboarding) return 'continue';
  return resolveEnabledEntry();
}

/**
 * Drops a failed session probe and the registration attempt, then runs the gate once more.
 * Bootstrap calls this from the explicit retry control.
 */
export async function retryOnboardingEntry(boot: OnboardingEntryBoot | undefined): Promise<OnboardingEntryDecision> {
  resetSessionUserCache();
  registration = undefined;
  return prepareOnboardingEntry(boot);
}
