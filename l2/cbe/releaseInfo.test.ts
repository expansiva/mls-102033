/// <mls fileReference="_102033_/l2/cbe/releaseInfo.test.ts" enhancement="_blank" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { readRelease, waitForNewRelease, installReleaseConsoleHelper } from '/_102033_/l2/cbe/releaseInfo.js';

type Ping = { version: string; pid: number; release: { id: string } | null; rebuilding: boolean };

function ping(id: string | null, rebuilding: boolean): Ping {
  return { version: '1.6.0', pid: 1, release: id ? { id } : null, rebuilding };
}

/** Serve as respostas na ordem dada; a última se repete. */
function installFetch(respostas: (Ping | 'erro')[]) {
  const original = globalThis.fetch;
  let i = 0;
  globalThis.fetch = (async () => {
    const atual = respostas[Math.min(i, respostas.length - 1)];
    i += 1;
    if (atual === 'erro') throw new Error('conexão caiu no reload');
    return { ok: true, json: async () => atual } as unknown as Response;
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

test('T1: readRelease devolve o estado do worker que respondeu', async () => {
  const restore = installFetch([ping('20260917101300', false)]);
  try {
    const rc = await readRelease();
    assert.equal(rc.release?.id, '20260917101300');
    assert.equal(rc.rebuilding, false);
  } finally {
    restore();
  }
});

test('T2: release novo depois do build = sucesso', async () => {
  const restore = installFetch([
    ping('20260917101300', false),   // estado inicial
    ping('20260917101300', true),    // build rodando
    ping('20260918120000', false),   // release novo servindo
  ]);
  try {
    const rc = await waitForNewRelease({ timeoutMs: 5000, pollMs: 5 });
    assert.equal(rc.changed, true);
    assert.equal(rc.reason, 'released');
    assert.equal(rc.from, '20260917101300');
    assert.equal(rc.to, '20260918120000');
  } finally {
    restore();
  }
});

test('T3: build terminou e o release NÃO mudou = falhou', async () => {
  // Foi o que aconteceu de verdade: o pm2 reload abortava e nada dizia isso ao browser.
  const restore = installFetch([
    ping('20260917101300', false),
    ping('20260917101300', true),
    ping('20260917101300', false),
  ]);
  try {
    const rc = await waitForNewRelease({ timeoutMs: 5000, pollMs: 5 });
    assert.equal(rc.changed, false);
    assert.equal(rc.reason, 'build-failed');
  } finally {
    restore();
  }
});

test('T4: uma falha de rede no meio do reload não encerra a espera', async () => {
  const restore = installFetch([
    ping('20260917101300', false),
    ping('20260917101300', true),
    'erro',                          // o reload derruba a conexão
    ping('20260918120000', false),
  ]);
  try {
    const rc = await waitForNewRelease({ timeoutMs: 5000, pollMs: 5 });
    assert.equal(rc.changed, true);
  } finally {
    restore();
  }
});

test('T5: sem build nenhum, expira sem inventar resultado', async () => {
  const restore = installFetch([ping('20260917101300', false)]);
  try {
    const rc = await waitForNewRelease({ timeoutMs: 1, pollMs: 5 });
    assert.equal(rc.reason, 'timeout');
    assert.equal(rc.changed, false);
  } finally {
    restore();
  }
});

test('T6: o helper publica collabRelease() com waitForNew', () => {
  const previous = (globalThis as { window?: unknown }).window;
  (globalThis as { window: unknown }).window = {};
  try {
    installReleaseConsoleHelper();
    const api = (globalThis as { window: { collabRelease?: unknown } }).window.collabRelease as
      { (): unknown; waitForNew?: unknown };
    assert.equal(typeof api, 'function');
    assert.equal(typeof api.waitForNew, 'function');
  } finally {
    if (previous === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window: unknown }).window = previous;
  }
});
