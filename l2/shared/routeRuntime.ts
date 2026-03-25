/// <mls fileReference="_102033_/l2/shared/routeRuntime.ts" enhancement="_blank" />
import type { AuraRouteDefinition } from '/_102033_/l2/shared/contracts/bootstrap.js';

function normalizeRoutePattern(route: AuraRouteDefinition) {
  return [
    route.path,
    ...(route.aliases ?? []),
  ];
}

export function matchAuraRoute(
  routes: AuraRouteDefinition[],
  pathname: string,
): AuraRouteDefinition | undefined {
  const exactMatches = routes.flatMap((route) =>
    normalizeRoutePattern(route)
      .filter((pattern) => (route.matchMode ?? 'exact') === 'exact' && pattern === pathname)
      .map(() => route),
  );
  if (exactMatches.length > 0) {
    return exactMatches[0];
  }

  const prefixMatches = routes.flatMap((route) =>
    normalizeRoutePattern(route)
      .filter((pattern) => (route.matchMode ?? 'exact') === 'prefix' && pathname.startsWith(`${pattern}/`))
      .map((pattern) => ({ route, patternLength: pattern.length })),
  );

  prefixMatches.sort((left, right) => right.patternLength - left.patternLength);
  return prefixMatches[0]?.route;
}

export function getCollabRouteChunkCache() {
  if (!globalThis.window) {
    return new Set<string>();
  }

  window.collabRouteChunkCache ??= new Set<string>();
  return window.collabRouteChunkCache;
}

export function getCollabRouteChunkPromises() {
  if (!globalThis.window) {
    return new Map<string, Promise<unknown>>();
  }

  window.collabRouteChunkPromises ??= new Map<string, Promise<unknown>>();
  return window.collabRouteChunkPromises;
}

export async function loadAuraRouteChunk(
  entrypoint: string,
  importer: (specifier: string) => Promise<unknown> = (specifier) => import(specifier),
) {
  const loadedChunks = getCollabRouteChunkCache();
  const pendingLoads = getCollabRouteChunkPromises();

  if (loadedChunks.has(entrypoint)) {
    return;
  }

  const cachedPromise = pendingLoads.get(entrypoint);
  if (cachedPromise) {
    await cachedPromise;
    return;
  }

  const pending = importer(entrypoint)
    .then(() => {
      loadedChunks.add(entrypoint);
    })
    .finally(() => {
      pendingLoads.delete(entrypoint);
    });

  pendingLoads.set(entrypoint, pending);
  await pending;
}
