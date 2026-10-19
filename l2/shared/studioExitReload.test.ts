/// <mls fileReference="_102033_/l2/shared/studioExitReload.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { leaveDraftUrl, onStudioExit, rememberRelease, shouldReload } from '/_102033_/l2/cbe/studioExitReload.js';

describe('studio exit reload', { concurrency: false }, () => {
  test('shouldReload is true only when the ids differ', () => {
    assert.equal(shouldReload({ id: 'a' }, { id: 'b' }), true);
    assert.equal(shouldReload({ id: 'a' }, { id: 'a' }), false);
    assert.equal(shouldReload(null, { id: 'b' }), false);
    assert.equal(shouldReload({ id: 'a' }, null), false);
  });

  test('reloads when the release id changed', async () => {
    let current = 'rel-a';
    await rememberRelease(async () => ({ id: current }));
    current = 'rel-b';
    let reloaded = false;
    await onStudioExit(() => {
      reloaded = true;
    });
    assert.equal(reloaded, true);
  });

  test('does not reload when the release id is unchanged', async () => {
    await rememberRelease(async () => ({ id: 'rel-a' }));
    let reloaded = false;
    await onStudioExit(() => {
      reloaded = true;
    });
    assert.equal(reloaded, false);
  });

  test('does not reload when the ping fails, and warns', async () => {
    let calls = 0;
    await rememberRelease(async () => {
      calls += 1;
      if (calls > 1) throw new Error('cbe ping failed: HTTP 500');
      return { id: 'rel-a' };
    });
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    let reloaded = false;
    try {
      await onStudioExit(() => {
        reloaded = true;
      });
    } finally {
      console.warn = original;
    }
    assert.equal(reloaded, false);
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0]?.[0]), /ping failed/);
    assert.match(String(warnings[0]?.[1]), /HTTP 500/);
  });

  test('leaveDraftUrl points at /desenv/sair when the draft cookie is set', () => {
    assert.equal(
      leaveDraftUrl('collab-draft=team-102047', '/agendaClinica?x=1'),
      '/desenv/sair?to=%2FagendaClinica%3Fx%3D1',
    );
    assert.equal(leaveDraftUrl('', '/agendaClinica'), null);
    assert.equal(leaveDraftUrl('other=1', '/agendaClinica'), null);
  });

  test('navigates to /desenv/sair when the draft cookie is set, and does not reload', async () => {
    let current = 'rel-a';
    await rememberRelease(async () => ({ id: current }));
    current = 'rel-b';
    let reloaded = false;
    const urls: string[] = [];
    await onStudioExit(
      () => {
        reloaded = true;
      },
      {
        cookie: 'collab-draft=team-102047',
        path: '/agendaClinica?x=1',
        navigate: (url) => {
          urls.push(url);
        },
      },
    );
    assert.deepEqual(urls, ['/desenv/sair?to=%2FagendaClinica%3Fx%3D1']);
    assert.equal(reloaded, false);
  });

  test('forgets the draft slug before navigating', async () => {
    const order: string[] = [];
    await onStudioExit(() => {}, {
      cookie: 'collab-draft=team-102047',
      path: '/agendaClinica?x=1',
      navigate: () => { order.push('navigate'); },
      forget: async (slug) => {
        order.push('forget-start');
        await Promise.resolve();
        order.push(`forget:${slug}`);
      },
    });
    assert.deepEqual(order, ['forget-start', 'forget:team-102047', 'navigate']);
  });

  test('navigates when forget rejects, and warns', async () => {
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args); };
    const urls: string[] = [];
    try {
      await onStudioExit(() => {}, {
        cookie: 'collab-draft=team-1',
        path: '/',
        navigate: (url) => { urls.push(url); },
        forget: async () => { throw new Error('cache gone'); },
      });
    } finally {
      console.warn = original;
    }
    assert.deepEqual(urls, ['/desenv/sair?to=%2F']);
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0]?.[0]), /forget the draft l2/);
    assert.match(String(warnings[0]?.[1]), /cache gone/);
  });

  test('does not forget or navigate without a draft cookie', async () => {
    await rememberRelease(async () => ({ id: 'rel-stable' }));
    let forgot = false;
    const urls: string[] = [];
    await onStudioExit(() => {}, {
      cookie: '',
      path: '/agendaClinica',
      navigate: (url) => { urls.push(url); },
      forget: async () => { forgot = true; },
    });
    assert.equal(forgot, false);
    assert.deepEqual(urls, []);
  });
});
