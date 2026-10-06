/// <mls fileReference="_102033_/l2/shared/siteProject.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { siteProjectFromBoot } from '/_102033_/l2/shared/siteProject.js';

test('clientProjectId wins over the served module owner', () => {
  assert.equal(siteProjectFromBoot({ projectId: '102034', clientProjectId: '102047' }), 102047);
});

test('projectId is used when clientProjectId is absent', () => {
  assert.equal(siteProjectFromBoot({ projectId: '102034' }), 102034);
});

test('an invalid clientProjectId falls back to projectId', () => {
  assert.equal(siteProjectFromBoot({ projectId: '102034', clientProjectId: 'abc' }), 102034);
  assert.equal(siteProjectFromBoot({ projectId: '102034', clientProjectId: '12' }), 102034);
});

test('nothing valid resolves to 0', () => {
  assert.equal(siteProjectFromBoot(undefined), 0);
  assert.equal(siteProjectFromBoot(null), 0);
  assert.equal(siteProjectFromBoot({}), 0);
});
