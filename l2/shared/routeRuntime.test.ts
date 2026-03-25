/// <mls fileReference="_102033_/l2/shared/routeRuntime.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuraRouteDefinition } from '/_102033_/l2/shared/contracts/bootstrap.js';
import {
  getCollabRouteChunkCache,
  getCollabRouteChunkPromises,
  loadAuraRouteChunk,
  matchAuraRoute,
} from '/_102033_/l2/shared/routeRuntime.js';

const routes: AuraRouteDefinition[] = [
  {
    path: '/demo',
    aliases: ['/demo/index.html'],
    entrypoint: '/_102030_/l2/demo/routes/overview.js',
    tag: 'demo-overview-page',
    title: 'Overview',
  },
  {
    path: '/demo/items',
    entrypoint: '/_102030_/l2/demo/routes/items.js',
    tag: 'demo-items-page',
    title: 'Items',
    matchMode: 'prefix',
  },
];

test.beforeEach(() => {
  globalThis.window = {
    collabRouteChunkCache: new Set<string>(),
    collabRouteChunkPromises: new Map<string, Promise<unknown>>(),
  } as Window & typeof globalThis;
});

test('matchAuraRoute resolves exact paths and aliases before prefixes', () => {
  assert.equal(matchAuraRoute(routes, '/demo')?.title, 'Overview');
  assert.equal(matchAuraRoute(routes, '/demo/index.html')?.title, 'Overview');
  assert.equal(matchAuraRoute(routes, '/demo/items/42')?.title, 'Items');
});

test('loadAuraRouteChunk caches loaded entrypoints', async () => {
  let importCount = 0;

  await loadAuraRouteChunk('/_102030_/l2/demo/routes/overview.js', async () => {
    importCount += 1;
  });
  await loadAuraRouteChunk('/_102030_/l2/demo/routes/overview.js', async () => {
    importCount += 1;
  });

  assert.equal(importCount, 1);
  assert.equal(getCollabRouteChunkCache().has('/_102030_/l2/demo/routes/overview.js'), true);
});

test('loadAuraRouteChunk reuses concurrent pending loads', async () => {
  let importCount = 0;
  let release!: () => void;
  const blocker = new Promise<void>((resolve) => {
    release = resolve;
  });

  const importer = async () => {
    importCount += 1;
    await blocker;
  };

  const first = loadAuraRouteChunk('/_102030_/l2/demo/routes/items.js', importer);
  const second = loadAuraRouteChunk('/_102030_/l2/demo/routes/items.js', importer);
  assert.equal(getCollabRouteChunkPromises().size, 1);

  release();
  await Promise.all([first, second]);

  assert.equal(importCount, 1);
  assert.equal(getCollabRouteChunkPromises().size, 0);
});
