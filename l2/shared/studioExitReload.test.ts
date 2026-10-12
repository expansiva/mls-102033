/// <mls fileReference="_102033_/l2/shared/studioExitReload.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { onStudioExit, rememberRelease, shouldReload } from '/_102033_/l2/cbe/studioExitReload.js';

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
});
