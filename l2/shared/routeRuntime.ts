/// <mls fileReference="_102033_/l2/shared/routeRuntime.ts" enhancement="_blank" />
import type { MasterFrontendRouteDefinition } from '/_102033_/l2/shared/contracts/bootstrap.js';

function normalizeRoutePattern(route: MasterFrontendRouteDefinition) {
  return [
    route.path,
    ...(route.aliases ?? []),
  ];
}

/** Match `/orders/:orderId` and optional `/orders/:orderId?` path segments without changing
 * the route object consumed by the shell. Params are read by generated pages from location. */
function matchesParameterizedPath(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  let pathIndex = 0;
  for (const part of patternParts) {
    const parameter = /^:([A-Za-z][A-Za-z0-9_]*)(\?)?$/.exec(part);
    if (!parameter) {
      if (pathParts[pathIndex] !== part) return false;
      pathIndex++;
      continue;
    }
    if (pathParts[pathIndex]) pathIndex++;
    else if (!parameter[2]) return false;
  }
  return pathIndex === pathParts.length;
}

export function matchAuraRoute(
  routes: MasterFrontendRouteDefinition[],
  pathname: string,
): MasterFrontendRouteDefinition | undefined {
  const exactMatches = routes.flatMap((route) =>
    normalizeRoutePattern(route)
      .filter((pattern) => (route.matchMode ?? 'exact') === 'exact' && pattern === pathname)
      .map(() => route),
  );
  if (exactMatches.length > 0) {
    return exactMatches[0];
  }

  const parameterMatches = routes.flatMap((route) =>
    normalizeRoutePattern(route)
      .filter((pattern) => (route.matchMode ?? 'exact') === 'exact' && matchesParameterizedPath(pattern, pathname))
      .map((pattern) => ({ route, patternLength: pattern.length })),
  );
  parameterMatches.sort((left, right) => right.patternLength - left.patternLength);
  if (parameterMatches.length > 0) return parameterMatches[0].route;

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
