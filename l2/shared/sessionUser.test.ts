/// <mls fileReference="_102033_/l2/shared/sessionUser.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { mock } from 'node:test';
import { getSessionUser, getSessionUserStrict, parseSessionUser, resetSessionUserCache, userInitials, userLabel } from '/_102033_/l2/shared/sessionUser.js';

test('the session payload is read defensively', () => {
  const user = parseSessionUser({
    authenticated: true,
    name: ' Guilherme Pereira ',
    email: 'guilherme@expansiva.com.br',
    picture: 'https://cdn.example/p.png',
  });
  assert.deepEqual(user, {
    authenticated: true,
    name: 'Guilherme Pereira',
    email: 'guilherme@expansiva.com.br',
    picture: 'https://cdn.example/p.png',
  });

  assert.deepEqual(parseSessionUser(null), { authenticated: false }, 'a bad payload is simply anonymous');
  // The menu filters by these; the header now too.
  assert.deepEqual(
    parseSessionUser({ authenticated: true, allAuthorities: ['tarefas:gestor', '', 3] }).authorities,
    ['tarefas:gestor'],
  );
  assert.equal(parseSessionUser({ authenticated: false, allAuthorities: ['tarefas:gestor'] }).authorities, undefined,
    'an anonymous session has no authorities');
  assert.equal(parseSessionUser({ authenticated: 'yes' }).authenticated, false, 'only a real boolean counts');
  assert.equal(parseSessionUser({ authenticated: true, name: '   ' }).name, undefined);
});

test('a picture that is not an image URL is dropped', () => {
  // The value reaches an <img src>, so a javascript:/blob: payload must not survive the parse.
  assert.equal(parseSessionUser({ picture: 'javascript:alert(1)' }).picture, undefined);
  assert.equal(parseSessionUser({ picture: '/relative/p.png' }).picture, undefined);
  assert.equal(parseSessionUser({ picture: 'data:image/png;base64,AAA' }).picture, 'data:image/png;base64,AAA');
  assert.equal(parseSessionUser({ picture: 'http://cdn/p.png' }).picture, 'http://cdn/p.png');
});

test('initials come from the name, then the email, then nothing', () => {
  assert.equal(userInitials({ authenticated: true, name: 'Guilherme Pereira' }), 'GP');
  assert.equal(userInitials({ authenticated: true, name: 'Maria de Souza Lima' }), 'ML', 'first and last');
  assert.equal(userInitials({ authenticated: true, name: 'Guilherme' }), 'GU');
  assert.equal(userInitials({ authenticated: true, email: 'guilherme@x.dev' }), 'G');
  assert.equal(userInitials({ authenticated: false }), '');
});

test('the label prefers the name, and says Account when anonymous', () => {
  assert.equal(userLabel({ authenticated: true, name: 'Guilherme', email: 'g@x.dev' }), 'Guilherme');
  assert.equal(userLabel({ authenticated: true, email: 'g@x.dev' }), 'g@x.dev');
  assert.equal(userLabel({ authenticated: false }), 'Account');
  assert.equal(userLabel({ authenticated: false }, 'Conta'), 'Conta');
});

test('person.mdmId is kept only for an authenticated non-empty string', () => {
  const user = parseSessionUser({
    authenticated: true,
    name: 'Guilherme Pereira',
    email: 'guilherme@expansiva.com.br',
    picture: 'https://cdn.example/p.png',
    person: { mdmId: ' p1 ', extra: 'drop' },
  });
  assert.deepEqual(user.person, { mdmId: 'p1' });
  assert.equal(user.name, 'Guilherme Pereira');
  assert.equal(user.picture, 'https://cdn.example/p.png');

  const legacy = parseSessionUser({ authenticated: true, name: 'Guilherme' });
  assert.equal(Object.hasOwn(legacy, 'person'), false);

  assert.equal(Object.hasOwn(parseSessionUser({ authenticated: true, person: null }), 'person'), false);
  assert.equal(Object.hasOwn(parseSessionUser({ authenticated: true, person: { mdmId: '  ' } }), 'person'), false);
  assert.equal(Object.hasOwn(parseSessionUser({ authenticated: true, person: { mdmId: 12 } }), 'person'), false);
  assert.equal(Object.hasOwn(parseSessionUser({ authenticated: true, person: 'p1' }), 'person'), false);

  const forged = parseSessionUser({ authenticated: false, person: { mdmId: 'forged' } });
  assert.deepEqual(forged, { authenticated: false, name: undefined, email: undefined, picture: undefined });
  assert.equal(Object.hasOwn(forged, 'person'), false);
});

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function restoreSessionProbe(): void {
  globalThis.fetch = originalFetch;
  resetSessionUserCache();
}

test('concurrent readers share one fetch and receive the person', async () => {
  resetSessionUserCache();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse({ authenticated: true, person: { mdmId: 'mdm-a' } });
  }) as typeof fetch;
  try {
    const [a, b] = await Promise.all([getSessionUser(), getSessionUser()]);
    assert.equal(calls, 1);
    assert.deepEqual(a.person, { mdmId: 'mdm-a' });
    assert.equal(b, a);
  } finally {
    restoreSessionProbe();
  }
});

test('a failed probe does not return a previously seen person', async () => {
  resetSessionUserCache();
  globalThis.fetch = (async () => jsonResponse({ authenticated: true, person: { mdmId: 'old' } })) as typeof fetch;
  try {
    assert.equal((await getSessionUser()).person?.mdmId, 'old');
    resetSessionUserCache();
    globalThis.fetch = (async () => { throw new Error('network'); }) as typeof fetch;
    const offline = await getSessionUser();
    assert.equal(offline.authenticated, false);
    assert.equal(offline.person, undefined);

    resetSessionUserCache();
    globalThis.fetch = (async () => jsonResponse({ authenticated: true, person: { mdmId: 'old' } }, 500)) as typeof fetch;
    const httpError = await getSessionUser();
    assert.equal(httpError.authenticated, false);
    assert.equal(httpError.person, undefined);
  } finally {
    restoreSessionProbe();
  }
});

test('after reset the next probe replaces the cached person', async () => {
  resetSessionUserCache();
  const people = ['mdm-a', 'mdm-b'];
  globalThis.fetch = (async () => jsonResponse({
    authenticated: true,
    person: { mdmId: people.shift() },
  })) as typeof fetch;
  try {
    assert.equal((await getSessionUser()).person?.mdmId, 'mdm-a');
    assert.equal((await getSessionUser()).person?.mdmId, 'mdm-a', 'the page keeps the first probe');
    resetSessionUserCache();
    assert.equal((await getSessionUser()).person?.mdmId, 'mdm-b');
  } finally {
    restoreSessionProbe();
  }
});

const readyGate = {
  company: { mdmId: ' co ' },
  onboarding: {
    status: 'ready',
    entryPath: ' /inicio/inicio_pessoa ',
    moduleBasePath: '/inicio',
  },
};

test('legacy session JSON stays the same shape', () => {
  const legacy = parseSessionUser({
    authenticated: true,
    name: 'Guilherme Pereira',
    email: 'guilherme@expansiva.com.br',
    picture: 'https://cdn.example/p.png',
  });
  assert.deepEqual(legacy, {
    authenticated: true,
    name: 'Guilherme Pereira',
    email: 'guilherme@expansiva.com.br',
    picture: 'https://cdn.example/p.png',
  });
  assert.equal(Object.hasOwn(legacy, 'company'), false);
  assert.equal(Object.hasOwn(legacy, 'onboarding'), false);
});

test('company and onboarding are kept only when authenticated, known and local', () => {
  const user = parseSessionUser({ authenticated: true, ...readyGate, person: { mdmId: 'p1' } });
  assert.deepEqual(user.company, { mdmId: 'co' });
  assert.deepEqual(user.onboarding, {
    status: 'ready',
    entryPath: '/inicio/inicio_pessoa',
    moduleBasePath: '/inicio',
  });

  const pending = parseSessionUser({
    authenticated: true,
    company: null,
    onboarding: {
      status: 'pending',
      entryPath: '/inicio/inicio_pessoa',
      moduleBasePath: '/inicio',
      requestId: ' req-1 ',
    },
  });
  assert.equal(Object.hasOwn(pending, 'company'), false);
  assert.equal(pending.onboarding?.requestId, 'req-1');

  const forged = parseSessionUser({ authenticated: false, ...readyGate });
  assert.deepEqual(forged, { authenticated: false, name: undefined, email: undefined, picture: undefined });
  assert.equal(Object.hasOwn(forged, 'company'), false);
  assert.equal(Object.hasOwn(forged, 'onboarding'), false);
});

test('a malformed gate is not parsed as ready', () => {
  for (const onboarding of [
    { status: 'ready', entryPath: 'https://evil.example/inicio', moduleBasePath: '/inicio' },
    { status: 'ready', entryPath: '//evil.example/inicio', moduleBasePath: '/inicio' },
    { status: 'ready', entryPath: '/outro/pagina', moduleBasePath: '/inicio' },
    { status: 'elsewhere', entryPath: '/inicio/inicio_pessoa', moduleBasePath: '/inicio' },
    { entryPath: '/inicio/inicio_pessoa', moduleBasePath: '/inicio' },
    { status: 'ready', entryPath: '/inicio/inicio_pessoa', moduleBasePath: '/inicio', requestId: '  ' },
  ]) {
    const user = parseSessionUser({ authenticated: true, company: { mdmId: 'co' }, onboarding });
    assert.equal(user.onboarding, undefined, JSON.stringify(onboarding));
    assert.notEqual(user.onboarding?.status, 'ready');
  }
  assert.equal(parseSessionUser({ authenticated: true, company: { mdmId: '  ' } }).company, undefined);
});

test('strict and chrome share one GET, and only strict rejects a failed probe', async () => {
  resetSessionUserCache();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse({ authenticated: true, name: 'Guilherme', person: { mdmId: 'mdm-a' }, ...readyGate });
  }) as typeof fetch;
  try {
    const [chrome, strict] = await Promise.all([getSessionUser(), getSessionUserStrict()]);
    assert.equal(calls, 1);
    assert.equal(chrome, strict);
    assert.equal(strict.onboarding?.status, 'ready');
    assert.equal(strict.company?.mdmId, 'co');

    resetSessionUserCache();
    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error('network');
    }) as typeof fetch;
    const [avatar, rejected] = await Promise.allSettled([getSessionUser(), getSessionUserStrict()]);
    assert.equal(calls, 1);
    assert.equal(avatar.status, 'fulfilled');
    assert.equal(avatar.status === 'fulfilled' && avatar.value.authenticated, false);
    assert.equal(avatar.status === 'fulfilled' && avatar.value.person, undefined);
    assert.equal(rejected.status, 'rejected');

    resetSessionUserCache();
    globalThis.fetch = (async () => jsonResponse({ authenticated: true, name: 'Guilherme' }, 500)) as typeof fetch;
    await assert.rejects(getSessionUserStrict(), /HTTP 500/u);
    assert.equal((await getSessionUser()).authenticated, false);
  } finally {
    restoreSessionProbe();
  }
});

test('an authenticated company without a gate is valid on one shared GET', async () => {
  resetSessionUserCache();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse({ authenticated: true, name: 'Ada', company: { mdmId: ' co ' } });
  }) as typeof fetch;
  try {
    const [chrome, strict] = await Promise.all([getSessionUser(), getSessionUserStrict()]);
    assert.equal(calls, 1);
    assert.equal(chrome, strict);
    assert.equal(strict.authenticated, true);
    assert.deepEqual(strict.company, { mdmId: 'co' });
    assert.equal(Object.hasOwn(strict, 'onboarding'), false);
  } finally {
    restoreSessionProbe();
  }
});

test('null company, a legacy body and an anonymous payload do not invent an id', async () => {
  resetSessionUserCache();
  globalThis.fetch = (async () => jsonResponse({ authenticated: true, company: null })) as typeof fetch;
  try {
    const pending = await getSessionUserStrict();
    assert.equal(pending.authenticated, true);
    assert.equal(Object.hasOwn(pending, 'company'), false);
    assert.equal(Object.hasOwn(pending, 'onboarding'), false);
  } finally {
    restoreSessionProbe();
  }

  resetSessionUserCache();
  globalThis.fetch = (async () => jsonResponse({ authenticated: true, name: 'Ada' })) as typeof fetch;
  try {
    const legacy = await getSessionUserStrict();
    assert.equal(legacy.authenticated, true);
    assert.equal(Object.hasOwn(legacy, 'company'), false);
    assert.equal((await getSessionUser()).name, 'Ada');
  } finally {
    restoreSessionProbe();
  }

  resetSessionUserCache();
  globalThis.fetch = (async () => jsonResponse({
    authenticated: false,
    company: { mdmId: 'co' },
    onboarding: readyGate.onboarding,
  })) as typeof fetch;
  try {
    const anon = await getSessionUserStrict();
    assert.deepEqual(anon, { authenticated: false, name: undefined, email: undefined, picture: undefined });
    assert.equal(Object.hasOwn(anon, 'company'), false);
    assert.equal(Object.hasOwn(anon, 'onboarding'), false);
  } finally {
    restoreSessionProbe();
  }
});

test('an invalid company rejects strict and does not look authenticated', async () => {
  resetSessionUserCache();
  globalThis.fetch = (async () => jsonResponse({ authenticated: true, company: { mdmId: '  ' } })) as typeof fetch;
  try {
    await assert.rejects(getSessionUserStrict(), /invalid protocol/u);
    const avatar = await getSessionUser();
    assert.equal(avatar.authenticated, false);
    assert.equal(avatar.company, undefined);
  } finally {
    restoreSessionProbe();
  }
});

test('an enabled gate with a bad onboarding rejects strict and does not look ready', async () => {
  resetSessionUserCache();
  globalThis.fetch = (async () => jsonResponse({
    authenticated: true,
    name: 'Guilherme',
    company: { mdmId: 'co' },
    onboarding: { status: 'ready', entryPath: 'https://evil.example/in', moduleBasePath: '/inicio' },
  })) as typeof fetch;
  try {
    await assert.rejects(getSessionUserStrict(), /invalid protocol/u);
    const avatar = await getSessionUser();
    assert.equal(avatar.authenticated, false);
    assert.equal(avatar.onboarding, undefined);
  } finally {
    restoreSessionProbe();
  }
});

test('a body that never arrives times out for strict and stays anonymous for chrome', async () => {
  resetSessionUserCache();
  mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  globalThis.fetch = ((_url, init) => {
    calls += 1;
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
    const strict = getSessionUserStrict();
    const chrome = getSessionUser();
    mock.timers.tick(10_000);
    await assert.rejects(strict, /timed out/u);
    assert.equal((await chrome).authenticated, false);
    assert.equal(calls, 1);
    mock.timers.tick(10_000);
    assert.equal(calls, 1, 'the timed-out probe stays cached until reset');
  } finally {
    mock.timers.reset();
    restoreSessionProbe();
  }
});

test('reset after a new identity fetches company and onboarding again', async () => {
  resetSessionUserCache();
  const statuses = ['incomplete', 'ready'] as const;
  globalThis.fetch = (async () => jsonResponse({
    authenticated: true,
    company: { mdmId: 'co' },
    onboarding: {
      status: statuses.shift(),
      entryPath: '/inicio/inicio_pessoa',
      moduleBasePath: '/inicio',
    },
  })) as typeof fetch;
  try {
    assert.equal((await getSessionUserStrict()).onboarding?.status, 'incomplete');
    assert.equal((await getSessionUser()).onboarding?.status, 'incomplete');
    resetSessionUserCache();
    assert.equal((await getSessionUserStrict()).onboarding?.status, 'ready');
  } finally {
    restoreSessionProbe();
  }
});
