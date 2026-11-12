/// <mls fileReference="_102033_/l2/shared/headerTabBoot.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { headerBootForTab } from './headerTabBoot.js';

const app: any = {
  projectId: '102047', clientProjectId: '102047', moduleId: 'tarefas', basePath: '/tarefas', pageTitle: 'tarefas',
  shellMode: 'spa', device: 'desktop', languages: ['pt-BR'], designSystems: ['Default', 'Canteiro'],
  routes: [{ path: '/tarefas' }], navigation: [{ label: 'Início', href: '/tarefas' }],
  moduleLinks: [{ label: 'monitor', href: '/monitor' }, { label: 'agendaClinica', href: '/agendaClinica' }],
  layout: { regions: {} }, clientShell: { regions: { header: { activeProfile: 'teste' } } },
  headerTag: 'layout--app-header-teste-102047',
};
const monitor: any = {
  projectId: '102034', moduleId: 'monitor', basePath: '/monitor', pageTitle: 'Monitor', shellMode: 'spa', device: 'desktop',
  languages: ['en'], designSystems: [], routes: [{ path: '/monitor' }], navigation: [{ label: 'Overview', href: '/monitor' }],
  moduleLinks: [{ label: 'audit', href: '/audit' }], layout: { regions: { other: true } },
  clientShell: { regions: { header: { activeProfile: 'platform' } } }, headerTag: 'platform-header',
};

test('on the app tab (or no module boot) the header keeps the app boot', () => {
  assert.equal(headerBootForTab(app, undefined), app);
  assert.equal(headerBootForTab(app, { ...app }), app, 'a module boot of the app module itself');
});

test('on a module tab: the module fields come from the tab, the identity stays the app', () => {
  const boot: any = headerBootForTab(app, monitor);
  assert.equal(boot.moduleId, 'monitor');
  assert.equal(boot.basePath, '/monitor');
  assert.equal(boot.pageTitle, 'Monitor');
  assert.deepEqual(boot.navigation, monitor.navigation);
  assert.deepEqual(boot.routes, monitor.routes);
  // the app's identity
  assert.equal(boot.projectId, '102047');
  assert.deepEqual(boot.clientShell, app.clientShell);
  assert.equal(boot.headerTag, app.headerTag);
  assert.deepEqual(boot.languages, ['pt-BR']);
  assert.deepEqual(boot.designSystems, ['Default', 'Canteiro']);
  assert.deepEqual(boot.layout, app.layout);
});

test("the switcher's other modules are the app's: its own module back in, the tab's module out", () => {
  const boot: any = headerBootForTab(app, monitor);
  assert.deepEqual(boot.moduleLinks, [{ label: 'tarefas', href: '/tarefas' }, { label: 'agendaClinica', href: '/agendaClinica' }]);
  assert.deepEqual(headerBootForTab(app, { ...monitor, basePath: '/monitor/' }).moduleLinks.map((l: any) => l.href), ['/tarefas', '/agendaClinica']);
});
