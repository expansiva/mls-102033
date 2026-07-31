/// <mls fileReference="_102033_/l2/shared/designSystemRuntime.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getNextRuntimeDesignSystem,
  getRuntimeDesignSystem,
  listRuntimeDesignSystems,
  resolveRuntimeDesignSystem,
  setRuntimeDesignSystem,
} from './designSystemRuntime.js';

function runtimeDocument(active?: string) {
  const styles: Array<{
    id: string;
    textContent: string | null;
    dataset: Record<string, string | undefined>;
  }> = active
    ? [{ id: 'ds-tokens', textContent: 'old css', dataset: { designSystem: active } }]
    : [];

  return {
    styles,
    document: {
      getElementById: (id: string) => styles.find((style) => style.id === id) ?? null,
      createElement: () => ({ id: '', textContent: null, dataset: {} }),
      head: {
        appendChild: (style: (typeof styles)[number]) => {
          styles.push(style);
          return style;
        },
      },
    },
  };
}

test('trims and deduplicates design system names without losing display casing', () => {
  assert.deepEqual(
    listRuntimeDesignSystems([' Default ', 'Natal', 'default', '', 'NATAL']),
    ['Default', 'Natal'],
  );
});

test('resolves names case-insensitively and falls back to the first configured DS', () => {
  const designSystems = ['Default', 'Natal'];
  const runtime = runtimeDocument('natal');

  assert.equal(resolveRuntimeDesignSystem(designSystems, 'NATAL'), 'Natal');
  assert.equal(getRuntimeDesignSystem(designSystems, runtime.document), 'Natal');
  assert.equal(getRuntimeDesignSystem(designSystems, runtimeDocument().document), 'Default');
});

test('cycles design systems in declaration order', () => {
  const designSystems = ['Default', 'Natal'];
  assert.equal(getNextRuntimeDesignSystem(designSystems, 'Default'), 'Natal');
  assert.equal(getNextRuntimeDesignSystem(designSystems, 'natal'), 'Default');
  assert.equal(getNextRuntimeDesignSystem(['Default'], 'Default'), undefined);
});

test('replaces the existing ds-tokens style without a browser refresh', async () => {
  const runtime = runtimeDocument('Default');
  let loadedPath = '';

  await setRuntimeDesignSystem(
    'natal',
    ['Default', 'Natal'],
    '102045',
    runtime.document,
    async (name, path) => {
      loadedPath = path;
      return `:root { --active-ds: "${name}"; }`;
    },
  );

  assert.equal(runtime.styles.length, 1);
  assert.equal(runtime.styles[0].dataset.designSystem, 'Natal');
  assert.equal(runtime.styles[0].textContent, ':root { --active-ds: "Natal"; }');
  assert.equal(loadedPath, '/_102045_/l2/designSystem.js');
});

test('rejects a design system that is not configured', async () => {
  const runtime = runtimeDocument('Default');

  await assert.rejects(
    setRuntimeDesignSystem(
      'Carnaval',
      ['Default', 'Natal'],
      '102045',
      runtime.document,
      async () => 'unused',
    ),
    /design system not available \(valid: Default, Natal\)/u,
  );
});
