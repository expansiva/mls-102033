/// <mls fileReference="_102033_/l2/shared/mobilePane.test.ts" enhancement="_blank" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialMobilePane,
  isModuleRootPath,
  otherMobilePane,
  runtimeSplitFor,
} from '/_102033_/l2/shared/mobilePane.js';

test('the module root and its aliases open on messages', () => {
  for (const path of ['/controleEstoque', '/controleEstoque/', '/controleEstoque/index.html', '/controleEstoque/overview']) {
    assert.equal(initialMobilePane(path, '/controleEstoque'), 'messages', path);
  }
});

test('a link straight to a page opens the page', () => {
  assert.equal(initialMobilePane('/controleEstoque/produtos', '/controleEstoque'), 'app');
});

test('a trailing slash on the base path does not change the answer', () => {
  assert.equal(isModuleRootPath('/controleEstoque/index.html', '/controleEstoque/'), true);
});

test('without a base path only the site root is the entry', () => {
  assert.equal(isModuleRootPath('/', ''), true);
  assert.equal(isModuleRootPath('/index.html', undefined), true);
  assert.equal(isModuleRootPath('/produtos', ''), false);
});

test('the ☰ alternates between the two panes', () => {
  assert.equal(otherMobilePane('messages'), 'app');
  assert.equal(otherMobilePane('app'), 'messages');
});

test('messages live on the left nav3, the app on the right — same sides as desktop', () => {
  assert.equal(runtimeSplitFor('mobile', 'messages'), 'left');
  assert.equal(runtimeSplitFor('mobile', 'app'), 'right');
});

test('desktop always gets the client split, whatever pane a phone session left behind', () => {
  assert.equal(runtimeSplitFor('desktop', 'messages'), 'client');
  assert.equal(runtimeSplitFor('desktop', 'app'), 'client');
});
