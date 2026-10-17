/// <mls fileReference="_102033_/l2/shared/sessionUser.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { getSessionUser, parseSessionUser, resetSessionUserCache, userInitials, userLabel } from '/_102033_/l2/shared/sessionUser.js';

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
