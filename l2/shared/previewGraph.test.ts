/// <mls fileReference="_102033_/l2/shared/previewGraph.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPreviewGraph,
  previewGraphRequest,
  previewModule,
  type PreviewGraphResult,
} from '/_102033_/l2/shared/previewGraph.js';
import { getCollabRouteChunkCache, loadAuraRouteChunk } from '/_102033_/l2/shared/routeRuntime.js';

const PAGE = '/_102047_/l2/page.js';
const MID = '/_102047_/l2/mid.js';
const BASE = '/_102047_/l2/base.js';
const OUT = '/_102047_/l2/out.js';
const COMPILED = '20261110120000000';
const SHA = '0123456789abcdef0123456789abcdef01234567';

function pageSource(): string {
  return [
    `import * as base from '${BASE}';`,
    `import * as outside from '${OUT}';`,
    'export const label = base.label + \'+\' + outside.label;',
    'export const baseModule = base;',
    'export const outsideModule = outside;',
  ].join('\n');
}

function baseSource(text: string): string {
  return `export const label = '${text}';`;
}

function outSource(): string {
  return 'export const label = \'out-v1\';';
}

interface LoadedPreview {
  label: string;
  baseModule: { label: string };
  outsideModule: { label: string };
}

function importsIn(source: string): string[] {
  const found: string[] = [];
  const pattern = /\b(?:from|import)\s*(?:\(\s*)?(['"])([^'"]+)\1/g;
  let match: RegExpExecArray | null = pattern.exec(source);
  while (match) {
    found.push(match[2]);
    match = pattern.exec(source);
  }
  return found;
}

async function loadModule(
  key: string,
  sourceOf: (specifier: string) => string,
  cache: Map<string, string>,
  stack: string[],
): Promise<string> {
  const cached = cache.get(key);
  if (cached) return cached;
  if (stack.includes(key)) throw new Error(`[previewGraph.test] cycle at ${key}`);
  stack.push(key);
  const source = sourceOf(key);
  const deps = new Map<string, string>();
  for (const specifier of importsIn(source)) {
    deps.set(specifier, await loadModule(specifier, sourceOf, cache, stack));
  }
  stack.pop();
  let cursor = 0;
  let rewritten = '';
  const pattern = /\b(?:from|import)\s*(?:\(\s*)?(['"])([^'"]+)\1/g;
  let match: RegExpExecArray | null = pattern.exec(source);
  while (match) {
    const specifier = match[2];
    const data = deps.get(specifier);
    if (data === undefined) throw new Error(`[previewGraph.test] missing ${specifier}`);
    const start = match.index + match[0].lastIndexOf(specifier);
    rewritten += source.slice(cursor, start);
    rewritten += data;
    cursor = start + specifier.length;
    match = pattern.exec(source);
  }
  rewritten += source.slice(cursor);
  // encodeURIComponent leaves `'`, which would end the import string.
  const dataUrl = `data:text/javascript,${encodeURIComponent(rewritten).replaceAll('\'', '%27')}`;
  cache.set(key, dataUrl);
  return dataUrl;
}

test('reimported page shows the new base and keeps the module outside the subgraph', async () => {
  const originals = new Map<string, string>([
    [PAGE, pageSource()],
    [BASE, baseSource('base-v1')],
    [OUT, outSource()],
  ]);
  const cache = new Map<string, string>();
  const sourceOfOriginal = (key: string): string => {
    const source = originals.get(key);
    if (source === undefined) throw new Error(`[previewGraph.test] missing ${key}`);
    return source;
  };
  const firstUrl = await loadModule(PAGE, sourceOfOriginal, cache, []);
  const first = await import(firstUrl) as LoadedPreview;

  originals.set(BASE, baseSource('base-v2'));
  const second = buildPreviewGraph(previewGraphRequest([
    previewModule(PAGE, originals.get(PAGE) ?? '', COMPILED),
    previewModule(BASE, originals.get(BASE) ?? '', SHA),
    previewModule(OUT, originals.get(OUT) ?? '', COMPILED),
  ], [BASE], [PAGE], 'team-102047'));
  const page = second.modules.find((item) => item.specifier === PAGE);
  const base = second.modules.find((item) => item.specifier === BASE);
  assert.ok(page);
  assert.ok(base);
  assert.equal(second.modules.some((item) => item.specifier === OUT), false);
  assert.equal(base.url, `/local/_102047_l2/base.js~team-102047?v=${SHA}`);
  assert.equal(page.url, `/local/_102047_l2/page.js~team-102047?v=${COMPILED}`);
  assert.equal(page.source.includes(base.url), true);
  assert.equal(page.source.includes(`'${OUT}'`), true);

  const sourceOfRewritten = (key: string): string => {
    const owned = second.modules.find((item) => item.url === key || item.specifier === key);
    if (owned) return owned.source;
    return sourceOfOriginal(key);
  };
  const secondUrl = await loadModule(page.url, sourceOfRewritten, cache, []);
  const reimported = await import(secondUrl) as LoadedPreview;

  assert.equal(first.label, 'base-v1+out-v1');
  assert.equal(reimported.label, 'base-v2+out-v1');
  assert.equal(reimported.outsideModule, first.outsideModule);
  assert.notEqual(reimported.baseModule, first.baseModule);
});

test('an intermediate module is rewritten up to the open page', () => {
  const result = buildPreviewGraph(previewGraphRequest([
    previewModule(PAGE, `import { label as midLabel } from '${MID}';\nimport { label as outLabel } from '${OUT}';\nexport const label = midLabel + outLabel;\n`, COMPILED),
    previewModule(MID, `import { label as baseLabel } from '${BASE}';\nexport const label = baseLabel;\n`, COMPILED),
    previewModule(BASE, baseSource('base-v2'), SHA),
    previewModule(OUT, outSource(), COMPILED),
  ], [BASE], [PAGE], null));
  const page = result.modules.find((item) => item.specifier === PAGE);
  const mid = result.modules.find((item) => item.specifier === MID);
  const base = result.modules.find((item) => item.specifier === BASE);
  assert.ok(page);
  assert.ok(mid);
  assert.ok(base);
  assert.equal(result.modules.some((item) => item.specifier === OUT), false);
  assert.equal(base.url, `/local/_102047_l2/base.js?v=${SHA}`);
  assert.equal(mid.url, `/local/_102047_l2/mid.js?v=${COMPILED}`);
  assert.equal(mid.source.includes(base.url), true);
  assert.equal(page.source.includes(mid.url), true);
  assert.equal(page.source.includes(`'${OUT}'`), true);
});

test('a dynamic import of a subgraph module points at the versioned URL', () => {
  const result = buildPreviewGraph(previewGraphRequest([
    previewModule(PAGE, `export function load() { return import('${BASE}'); }\n`, COMPILED),
    previewModule(BASE, baseSource('base-v2'), SHA),
  ], [BASE], [PAGE], null));
  const page = result.modules.find((item) => item.specifier === PAGE);
  const base = result.modules.find((item) => item.specifier === BASE);
  assert.ok(page);
  assert.ok(base);
  assert.equal(page.source.includes(`import('${base.url}')`), true);
});

test('a changed module that no open page imports does no work', () => {
  const orphan = '/_102047_/l2/orphan.js';
  const result = buildPreviewGraph(previewGraphRequest([
    previewModule(PAGE, pageSource(), COMPILED),
    previewModule(BASE, baseSource('base-v1'), COMPILED),
    previewModule(OUT, outSource(), COMPILED),
    previewModule(orphan, baseSource('orphan'), SHA),
  ], [orphan], [PAGE], null));
  assert.deepEqual(moduleSpecifiers(result), []);
});

test('a circular import does not hang', () => {
  const left = '/_102047_/l2/left.js';
  const right = '/_102047_/l2/right.js';
  const result = buildPreviewGraph(previewGraphRequest([
    previewModule(PAGE, `import { mark } from '${left}';\nexport const label = mark;\n`, COMPILED),
    previewModule(left, `import { mark as other } from '${right}';\nexport const mark = 'left';\nexport const seen = other;\n`, COMPILED),
    previewModule(right, `import { mark as other } from '${left}';\nexport const mark = 'right';\nexport const seen = other;\n`, SHA),
    previewModule(OUT, outSource(), COMPILED),
  ], [right], [PAGE], null));
  assert.deepEqual(moduleSpecifiers(result), [PAGE, left, right]);
  const leftModule = result.modules.find((item) => item.specifier === left);
  const rightModule = result.modules.find((item) => item.specifier === right);
  assert.ok(leftModule);
  assert.ok(rightModule);
  assert.equal(leftModule.source.includes(rightModule.url), true);
  assert.equal(rightModule.source.includes(leftModule.url), true);
});

test('loadAuraRouteChunk imports again when the entrypoint URL changes', async () => {
  const previous = globalThis.window;
  globalThis.window = {
    collabRouteChunkCache: new Set<string>(),
    collabRouteChunkPromises: new Map<string, Promise<unknown>>(),
  } as Window & typeof globalThis;
  try {
    let importCount = 0;
    const importer = async () => {
      importCount += 1;
    };
    const versioned = `/local/_102047_l2/page.js?v=${SHA}`;
    await loadAuraRouteChunk(PAGE, importer);
    await loadAuraRouteChunk(PAGE, importer);
    await loadAuraRouteChunk(versioned, importer);
    await loadAuraRouteChunk(versioned, importer);
    assert.equal(importCount, 2);
    assert.equal(getCollabRouteChunkCache().has(PAGE), true);
    assert.equal(getCollabRouteChunkCache().has(versioned), true);
  } finally {
    globalThis.window = previous;
  }
});

test('a studio slug that does not match the rule fails out loud', () => {
  const errors: string[] = [];
  const previous = console.error;
  console.error = (message?: unknown) => {
    errors.push(String(message));
  };
  try {
    assert.throws(
      () => buildPreviewGraph(previewGraphRequest([
        previewModule(PAGE, pageSource(), COMPILED),
        previewModule(BASE, baseSource('base-v1'), COMPILED),
        previewModule(OUT, outSource(), COMPILED),
      ], [BASE], [PAGE], 'nope')),
      /draft slug does not match the rule/,
    );
    assert.equal(errors.some((line) => line.includes('draft slug does not match the rule')), true);
  } finally {
    console.error = previous;
  }
});

function moduleSpecifiers(result: PreviewGraphResult): string[] {
  return result.modules.map((item) => item.specifier);
}
