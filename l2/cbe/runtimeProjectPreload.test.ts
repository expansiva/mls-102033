/// <mls fileReference="_102033_/l2/cbe/runtimeProjectPreload.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  announcedProjectIds,
  preloadAnnouncedProjects,
  runAnnouncedPreloadAfterLogin,
} from '/_102033_/l2/cbe/runtimeProjectPreload.js';

function project(id: number, extra: Record<string, unknown> = {}) {
  return { id, prj_dependencies: [], ...extra };
}

function orgsWith(...groups: { slug: string; projects: unknown[] }[]) {
  const orgs: Record<string, unknown> = {};
  for (const group of groups) {
    orgs[group.slug] = { sett: { projects: group.projects } };
  }
  return orgs;
}

test('empty dependency lists still preload every announced project', async () => {
  const orgs = orgsWith({
    slug: 'workspace',
    projects: [project(102056), project(102033), project(102034)],
  });
  const loaded: number[] = [];
  const ids = await preloadAnnouncedProjects(orgs, async (id) => {
    loaded.push(id);
    return true;
  });
  assert.deepEqual(ids, [102056, 102033, 102034]);
  assert.deepEqual(loaded, [102056, 102033, 102034]);
});

test('the same id announced by two orgs is loaded once', () => {
  const orgs = orgsWith(
    { slug: 'a', projects: [project(102033), project(102034)] },
    { slug: 'b', projects: [project(102034), project(102056)] },
  );
  assert.deepEqual(announcedProjectIds(orgs), [102033, 102034, 102056]);
});

test('invalid ids and unknown shapes are skipped', () => {
  const orgs = {
    ok: { sett: { projects: [project(102033), { id: '102034' }, { id: 12 }, { id: 102033.5 }, { name: 'x' }, null, '102056'] } },
    broken: { sett: { projects: 'nope' } },
    missing: { name: 'no sett' },
    junk: 4,
  };
  assert.deepEqual(announcedProjectIds(orgs), [102033]);
  assert.deepEqual(announcedProjectIds(null), []);
  assert.deepEqual(announcedProjectIds([]), []);
});

test('a project absent from the login list is not preloaded', async () => {
  const loaded: number[] = [];
  await preloadAnnouncedProjects(
    orgsWith({ slug: 'workspace', projects: [project(102056)] }),
    async (id) => {
      loaded.push(id);
    },
  );
  assert.deepEqual(loaded, [102056]);
  assert.equal(loaded.includes(102033), false);
  assert.equal(loaded.includes(100554), false);
});

test('a login error does not mark ready and does not preload', async () => {
  let ready = false;
  let loads = 0;
  await assert.rejects(
    () => runAnnouncedPreloadAfterLogin({
      login: async () => { throw new Error('login required'); },
      orgs: () => orgsWith({ slug: 'workspace', projects: [project(102033)] }),
      loadProjectInfoIfNeeded: async () => { loads += 1; },
      markReady: () => { ready = true; },
    }),
    /login required/,
  );
  assert.equal(ready, false);
  assert.equal(loads, 0);
});

test('one preload failure names the project and stays before ready', async () => {
  const order: string[] = [];
  let ready = false;
  await assert.rejects(
    () => runAnnouncedPreloadAfterLogin({
      login: async () => { order.push('login'); },
      orgs: () => orgsWith({
        slug: 'workspace',
        projects: [project(102033), project(102034)],
      }),
      loadProjectInfoIfNeeded: async (id) => {
        order.push(`load:${id}`);
        if (id === 102034) throw new Error('indexed body missing');
      },
      markReady: () => {
        order.push('ready');
        ready = true;
      },
    }),
    /preload of stor.files failed for project 102034: indexed body missing/,
  );
  assert.equal(ready, false);
  assert.deepEqual(order, ['login', 'load:102033', 'load:102034']);
});

test('ready is signaled only after every announced preload resolves', async () => {
  let releaseSecond: () => void = () => {};
  const second = new Promise<void>((resolve) => { releaseSecond = resolve; });
  const order: string[] = [];
  const pending = runAnnouncedPreloadAfterLogin({
    login: async () => { order.push('login'); },
    orgs: () => orgsWith({
      slug: 'workspace',
      projects: [project(102056), project(102033), project(102034)],
    }),
    loadProjectInfoIfNeeded: async (id) => {
      order.push(`start:${id}`);
      if (id === 102034) await second;
      order.push(`end:${id}`);
    },
    markReady: () => { order.push('ready'); },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(order.includes('ready'), false);
  assert.deepEqual(order, ['login', 'start:102056', 'end:102056', 'start:102033', 'end:102033', 'start:102034']);
  releaseSecond();
  await pending;
  assert.deepEqual(order.at(-1), 'ready');
});
