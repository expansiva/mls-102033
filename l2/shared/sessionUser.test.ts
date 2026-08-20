/// <mls fileReference="_102033_/l2/shared/sessionUser.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSessionUser, userInitials, userLabel } from '/_102033_/l2/shared/sessionUser.js';

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
