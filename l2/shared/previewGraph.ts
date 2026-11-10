/// <mls fileReference="_102033_/l2/shared/previewGraph.ts" enhancement="_blank" />

/** Bare specifier the compiler emits: `/_<project>_/<path>.js`. */
export interface PreviewModuleRecord {
  specifier: string;
  source: string;
  /** 17-digit compile stamp or the sync sha. Both go in the same `?v=`. */
  version: string;
}

export interface PreviewGraphRequest {
  modules: readonly PreviewModuleRecord[];
  /** Bare specifiers of the files Save, Discard or Bring-published changed. */
  changed: readonly string[];
  /** Bare specifiers of the page mounted in each open preview tab. */
  pages: readonly string[];
  /** Studio slug, or null when the worker serves the production key. */
  draftSlug: string | null;
}

export interface PreviewModuleUrl {
  specifier: string;
  /** `/local/_<project>_<path>.js[~<slug>]?v=<version>` — the URL the worker already serves. */
  url: string;
  /** Source with subgraph specifiers rewritten to `url`. Specifiers outside stay bare. */
  source: string;
}

export interface PreviewGraphResult {
  /** Empty when no changed file is imported by an open page. */
  modules: readonly PreviewModuleUrl[];
}

interface SpecifierHit {
  specifier: string;
  start: number;
  end: number;
}

const BARE_SPECIFIER = /^\/_(\d+)_\/(.+\.js)$/;
const DRAFT_SLUG = /^(team|user)-[a-z0-9_.-]{1,64}$/;

export function previewModule(specifier: string, source: string, version: string): PreviewModuleRecord {
  return { specifier, source, version };
}

export function previewGraphRequest(
  modules: readonly PreviewModuleRecord[],
  changed: readonly string[],
  pages: readonly string[],
  draftSlug: string | null = null,
): PreviewGraphRequest {
  return { modules, changed, pages, draftSlug };
}

function fail(message: string): never {
  console.error(`[previewGraph] ${message}`);
  throw new Error(`[previewGraph] ${message}`);
}

function checkedSlug(draftSlug: string | null): string | null {
  if (draftSlug === null) return null;
  if (!DRAFT_SLUG.test(draftSlug)) fail(`draft slug does not match the rule: ${draftSlug}`);
  return draftSlug;
}

function isVersion(version: string): boolean {
  return version.length > 0 && !/[\s?#&]/.test(version);
}

function servedUrl(specifier: string, version: string, draftSlug: string | null): string {
  const match = BARE_SPECIFIER.exec(specifier);
  if (!match) fail(`not a bare specifier: ${specifier}`);
  if (!isVersion(version)) fail(`version is empty or breaks ?v=: ${specifier}`);
  const cachePath = `_${match[1]}_${match[2]}`;
  const keyed = draftSlug === null ? cachePath : `${cachePath}~${draftSlug}`;
  return `/local/${keyed}?v=${version}`;
}

function specifierHits(source: string): SpecifierHit[] {
  const hits: SpecifierHit[] = [];
  const pattern = /\b(?:from|import)\s*(?:\(\s*)?(['"])(\/_\d+_\/[^'"\n]+\.js)\1/g;
  let match: RegExpExecArray | null = pattern.exec(source);
  while (match) {
    const specifier = match[2];
    if (BARE_SPECIFIER.test(specifier)) {
      const start = match.index + match[0].lastIndexOf(specifier);
      hits.push({ specifier, start, end: start + specifier.length });
    }
    match = pattern.exec(source);
  }
  return hits;
}

function importedSpecifiers(source: string): string[] {
  const seen = new Set<string>();
  for (const hit of specifierHits(source)) seen.add(hit.specifier);
  return [...seen];
}

function rewriteSource(source: string, urls: ReadonlyMap<string, string>): string {
  const hits = specifierHits(source);
  if (hits.length === 0) return source;
  let cursor = 0;
  let out = '';
  for (const hit of hits) {
    out += source.slice(cursor, hit.start);
    out += urls.get(hit.specifier) ?? hit.specifier;
    cursor = hit.end;
  }
  return out + source.slice(cursor);
}

function walk(start: readonly string[], next: (node: string) => readonly string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...start];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    for (const neighbor of next(current)) {
      if (!seen.has(neighbor)) stack.push(neighbor);
    }
  }
  return seen;
}

function indexModules(records: readonly PreviewModuleRecord[]): Map<string, PreviewModuleRecord> {
  const modules = new Map<string, PreviewModuleRecord>();
  for (const record of records) {
    if (!BARE_SPECIFIER.test(record.specifier)) fail(`not a bare specifier: ${record.specifier}`);
    if (modules.has(record.specifier)) fail(`duplicate specifier: ${record.specifier}`);
    modules.set(record.specifier, record);
  }
  return modules;
}

/**
 * Modules on a path from a changed file up to an open page, with their imports
 * rewritten to the versioned URL the service worker serves.
 *
 * A changed file that no open page imports yields an empty result.
 * The walk keeps a seen-set, so a cycle cannot hang.
 */
export function buildPreviewGraph(request: PreviewGraphRequest): PreviewGraphResult {
  const draftSlug = checkedSlug(request.draftSlug);
  const modules = indexModules(request.modules);
  const knownPages = request.pages.filter((page) => {
    if (modules.has(page)) return true;
    console.error(`[previewGraph] open page is not in the module list: ${page}`);
    return false;
  });

  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  for (const record of modules.values()) {
    const targets = importedSpecifiers(record.source).filter((specifier) => modules.has(specifier));
    forward.set(record.specifier, targets);
    for (const target of targets) {
      const importers = reverse.get(target);
      if (importers) importers.push(record.specifier);
      else reverse.set(target, [record.specifier]);
    }
  }

  const fromPages = walk(knownPages, (node) => forward.get(node) ?? []);
  const changedInPages = request.changed.filter((specifier) => {
    if (!modules.has(specifier)) {
      console.error(`[previewGraph] changed file is not a module specifier: ${specifier}`);
      return false;
    }
    return fromPages.has(specifier);
  });
  if (changedInPages.length === 0) return { modules: [] };

  const fromChanged = walk(changedInPages, (node) => reverse.get(node) ?? []);
  const selected: { specifier: string; url: string; source: string }[] = [];
  for (const record of request.modules) {
    if (!fromPages.has(record.specifier) || !fromChanged.has(record.specifier)) continue;
    selected.push({
      specifier: record.specifier,
      url: servedUrl(record.specifier, record.version, draftSlug),
      source: record.source,
    });
  }
  const urls = new Map(selected.map((item) => [item.specifier, item.url]));
  return {
    modules: selected.map((item) => ({
      specifier: item.specifier,
      url: item.url,
      source: rewriteSource(item.source, urls),
    })),
  };
}
