/// <mls fileReference="_102033_/l2/shared/onboardingEntry.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { resetSessionUserCache } from '/_102033_/l2/shared/sessionUser.js';
import { prepareOnboardingEntry, retryOnboardingEntry } from '/_102033_/l2/shared/onboardingEntry.js';

const boot = { onboarding: { entryPath: '/inicio/inicio_pessoa', moduleBasePath: '/inicio' } };
const originalFetch = globalThis.fetch;
const replacements: string[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function session(status: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    authenticated: true,
    company: { mdmId: 'co' },
    onboarding: {
      status,
      entryPath: '/inicio/inicio_pessoa',
      moduleBasePath: '/inicio',
      ...extra,
    },
  };
}

function registered(status: 'ready' | 'incomplete' | 'pending'): Record<string, unknown> {
  return {
    status,
    person: status === 'pending' ? undefined : { mdmId: 'p1' },
    requestId: status === 'pending' ? 'req-1' : undefined,
    company: { mdmId: 'co' },
  };
}

function installLocation(pathname: string): void {
  replacements.length = 0;
  Object.assign(globalThis, {
    window: {
      location: {
        pathname,
        replace(href: string) {
          replacements.push(href);
          this.pathname = href;
        },
      },
    },
  });
}

async function restore(): Promise<void> {
  globalThis.fetch = originalFetch;
  await retryOnboardingEntry(undefined);
  replacements.length = 0;
}

test('a boot without onboarding does not fetch', async () => {
  resetSessionUserCache();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse(session('ready'));
  }) as typeof fetch;
  try {
    assert.equal(await prepareOnboardingEntry(undefined), 'continue');
    assert.equal(await prepareOnboardingEntry({}), 'continue');
    assert.equal(calls, 0);
  } finally {
    await restore();
  }
});

test('an anonymous session continues without register or login', async () => {
  resetSessionUserCache();
  installLocation('/app/home');
  const calls: string[] = [];
  globalThis.fetch = (async (url) => {
    calls.push(String(url));
    return jsonResponse({ authenticated: false });
  }) as typeof fetch;
  try {
    assert.equal(await prepareOnboardingEntry(boot), 'continue');
    assert.deepEqual(calls, ['/session/info']);
    assert.deepEqual(replacements, []);
  } finally {
    await restore();
  }
});

test('ready keeps the requested route', async () => {
  resetSessionUserCache();
  installLocation('/outro/alvo');
  globalThis.fetch = (async () => jsonResponse(session('ready'))) as typeof fetch;
  try {
    assert.equal(await prepareOnboardingEntry(boot), 'continue');
    assert.deepEqual(replacements, []);
  } finally {
    await restore();
  }
});

test('incomplete and pending outside the module replace the session entry once', async () => {
  for (const status of ['incomplete', 'pending'] as const) {
    resetSessionUserCache();
    installLocation('/outro/alvo');
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return jsonResponse(session(status, status === 'pending' ? { requestId: 'req-1' } : {}));
    }) as typeof fetch;
    assert.equal(await prepareOnboardingEntry(boot), 'redirected');
    assert.deepEqual(replacements, ['/inicio/inicio_pessoa']);
    assert.equal(calls, 1);
    assert.equal(await prepareOnboardingEntry(boot), 'continue', 'the entry page is inside the module');
    assert.equal(calls, 1);
  }
  await restore();
});

test('a child page of the entry module does not redirect', async () => {
  resetSessionUserCache();
  installLocation('/inicio/meu_cadastro');
  globalThis.fetch = (async () => jsonResponse(session('incomplete'))) as typeof fetch;
  try {
    assert.equal(await prepareOnboardingEntry(boot), 'continue');
    assert.deepEqual(replacements, []);
  } finally {
    await restore();
  }
});

test('unregistered posts once and follows the refreshed session', async () => {
  for (const created of ['incomplete', 'pending'] as const) {
    await retryOnboardingEntry(undefined);
    resetSessionUserCache();
    installLocation(created === 'pending' ? '/inicio/fila' : '/outro/alvo');
    const posts: Array<{ body: string; credentials?: RequestCredentials }> = [];
    const gets: unknown[] = [session('unregistered'), session(created, created === 'pending' ? { requestId: 'req-1' } : {})];
    globalThis.fetch = (async (url, init) => {
      if (String(url) === '/session/register') {
        posts.push({ body: String(init?.body), credentials: init?.credentials });
        return jsonResponse(registered(created));
      }
      return jsonResponse(gets.shift());
    }) as typeof fetch;
    const decision = await prepareOnboardingEntry(boot);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].credentials, 'same-origin');
    assert.equal(posts[0].body, '{}');
    assert.equal(decision, created === 'pending' ? 'continue' : 'redirected');
    const again = prepareOnboardingEntry(boot);
    assert.equal(posts.length, 1, 'a second call does not register again');
    await again;
  }
  await restore();
});

test('concurrent entry calls share one register', async () => {
  resetSessionUserCache();
  installLocation('/outro/alvo');
  let posts = 0;
  let info = 0;
  globalThis.fetch = (async (url) => {
    if (String(url) === '/session/register') {
      posts += 1;
      return jsonResponse(registered('incomplete'));
    }
    info += 1;
    return jsonResponse(info === 1 ? session('unregistered') : session('incomplete'));
  }) as typeof fetch;
  try {
    const [a, b] = await Promise.all([prepareOnboardingEntry(boot), prepareOnboardingEntry(boot)]);
    assert.equal(posts, 1);
    assert.ok(info >= 2 && info <= 3);
    assert.ok(a === 'redirected' || b === 'redirected');
    assert.deepEqual(replacements, ['/inicio/inicio_pessoa']);
  } finally {
    await restore();
  }
});

test('a registration that stays unregistered or unavailable is an error and does not recurse', async () => {
  for (const after of ['unregistered', 'unavailable'] as const) {
    await retryOnboardingEntry(undefined);
    resetSessionUserCache();
    installLocation('/outro/alvo');
    let posts = 0;
    let info = 0;
    globalThis.fetch = (async (url) => {
      if (String(url) === '/session/register') {
        posts += 1;
        return jsonResponse(registered('pending'));
      }
      info += 1;
      return jsonResponse(info === 1 ? session('unregistered') : session(after, after === 'pending' ? { requestId: 'req-1' } : {}));
    }) as typeof fetch;
    await assert.rejects(prepareOnboardingEntry(boot), after === 'unavailable' ? /unavailable/u : /unregistered/u);
    assert.equal(posts, 1);
    await assert.rejects(prepareOnboardingEntry(boot), after === 'unavailable' ? /unavailable/u : /unregistered/u);
    assert.equal(posts, 1, 'the failed attempt is not posted again');
  }
  await restore();
});

test('register and session failures stay failed until an explicit retry', async () => {
  resetSessionUserCache();
  installLocation('/outro/alvo');
  let posts = 0;
  globalThis.fetch = (async (url) => {
    if (String(url) === '/session/register') {
      posts += 1;
      return jsonResponse({ status: 'nope' }, 500);
    }
    return jsonResponse(session('unregistered'));
  }) as typeof fetch;
  try {
    await assert.rejects(prepareOnboardingEntry(boot), /HTTP 500/u);
    await assert.rejects(prepareOnboardingEntry(boot), /HTTP 500/u);
    assert.equal(posts, 1);
    globalThis.fetch = (async (url) => {
      if (String(url) === '/session/register') {
        posts += 1;
        return jsonResponse({ ok: true });
      }
      return jsonResponse(session('unregistered'));
    }) as typeof fetch;
    await assert.rejects(retryOnboardingEntry(boot), /invalid body/u);
    assert.equal(posts, 2);
  } finally {
    await restore();
  }
});

test('a session probe error is observable and a retry reads again', async () => {
  resetSessionUserCache();
  installLocation('/outro/alvo');
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) return jsonResponse({ authenticated: true }, 503);
    return jsonResponse(session('ready'));
  }) as typeof fetch;
  try {
    await assert.rejects(prepareOnboardingEntry(boot), /HTTP 503/u);
    assert.equal(await retryOnboardingEntry(boot), 'continue');
    assert.equal(calls, 2);
  } finally {
    await restore();
  }
});

test('an authenticated session without onboarding is a protocol error', async () => {
  resetSessionUserCache();
  installLocation('/outro/alvo');
  globalThis.fetch = (async () => jsonResponse({ authenticated: true, name: 'Ada' })) as typeof fetch;
  try {
    await assert.rejects(prepareOnboardingEntry(boot), /missing onboarding/u);
    assert.deepEqual(replacements, []);
  } finally {
    await restore();
  }
});

test('a register body that never arrives times out and can be retried', async () => {
  resetSessionUserCache();
  installLocation('/outro/alvo');
  mock.timers.enable({ apis: ['setTimeout'] });
  let posts = 0;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    if (String(url) !== '/session/register') return Promise.resolve(jsonResponse(session('unregistered')));
    posts += 1;
    const stream = new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () => {
          controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      },
    });
    return Promise.resolve(new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } }));
  }) as typeof fetch;
  try {
    const pending = prepareOnboardingEntry(boot);
    await new Promise((resolve) => setImmediate(resolve));
    mock.timers.tick(10_000);
    await assert.rejects(pending, /timed out/u);
    assert.equal(posts, 1);
    mock.timers.tick(10_000);
    assert.equal(posts, 1);
  } finally {
    mock.timers.reset();
    await restore();
  }
});

test('after a completed registration, reset reads ready and stays on the route', async () => {
  resetSessionUserCache();
  installLocation('/outro/alvo');
  const bodies = [session('unregistered'), session('incomplete'), session('ready')];
  let posts = 0;
  globalThis.fetch = (async (url) => {
    if (String(url) === '/session/register') {
      posts += 1;
      return jsonResponse(registered('incomplete'));
    }
    return jsonResponse(bodies.shift());
  }) as typeof fetch;
  try {
    assert.equal(await prepareOnboardingEntry(boot), 'redirected');
    assert.deepEqual(replacements, ['/inicio/inicio_pessoa']);
    resetSessionUserCache();
    installLocation('/outro/alvo');
    assert.equal(await prepareOnboardingEntry(boot), 'continue');
    assert.equal(posts, 1);
    assert.deepEqual(replacements, []);
  } finally {
    await restore();
  }
});
