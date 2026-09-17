/// <mls fileReference="_102033_/l2/shared/chartRuntime.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('chart runtime loads the locally hosted ECharts build without browser bare imports', () => {
  const runtime = readFileSync(new URL('./chartRuntime.ts', import.meta.url), 'utf8');
  const localRuntime = readFileSync(new URL('./chartRuntimeLocal.ts', import.meta.url), 'utf8');
  const build = readFileSync(new URL('../../../scripts/build.mjs', import.meta.url), 'utf8');
  assert.match(runtime, /\/_libs\/echarts\.min\.js/);
  assert.doesNotMatch(runtime, /^import \* as echarts from 'echarts\/core'/mu);
  assert.match(localRuntime, /\/_libs\/echarts\.min\.js/);
  assert.doesNotMatch(localRuntime, /from ['"]echarts(?:\/|['"])/u);
  assert.match(build, /node_modules\/echarts\/dist\/echarts\.min\.js/);
});
