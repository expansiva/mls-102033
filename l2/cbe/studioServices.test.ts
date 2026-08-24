/// <mls fileReference="_102033_/l2/cbe/studioServices.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANONYMOUS_SERVICES,
  RUNTIME_STUDIO_SERVICES,
  SERVICE_APP,
  SERVICE_MESSAGES,
  STUDIO_BASE_PROJECT,
  buildStudioServices,
  withRuntimeServices,
  type MlsPluginApi,
} from '/_102033_/l2/cbe/studioServices.js';

const SITE = 102099;
const DEP = 102033;

function widgetsOn(entry: string, side: 'left' | 'right'): string[] {
  const [left = '', right = ''] = entry.split(';');
  return (side === 'left' ? left : right).split(',').filter(Boolean);
}

function studioWidgets(services: string[]): string[] {
  const found: string[] = [];
  for (const entry of services) {
    for (const widget of entry.split(/[;,]/u)) {
      if (widget.startsWith('_100554_') && !found.includes(widget)) found.push(widget);
    }
  }
  return found;
}

test('the constructed list declares only the studio widgets the runtime uses', async () => {
  const loaded: number[] = [];
  const stub: MlsPluginApi = {
    plugin: {
      loadAll: async (project) => {
        loaded.push(project);
      },
      getAllMenuActions: (project, { scope }) => {
        if (project === SITE && scope === 'l0ServicesLeft') {
          return [{ widget: '_102099_serviceOwn', priority: 1 }];
        }
        if (project === STUDIO_BASE_PROJECT) {
          return [
            { widget: '_100554_serviceDetail', priority: 1 },
            { widget: '_100554_serviceSource', priority: 2 },
            { widget: '_100554_serviceUser', priority: 3 },
          ];
        }
        return [];
      },
    },
    l5: {
      getProjectDependencies: () => [DEP, STUDIO_BASE_PROJECT],
    },
    stor: {
      server: {
        loadProjectInfoIfNeeded: async () => undefined,
      },
    },
    actual: [{
      setFullName: (widget: string) => ({
        path: widget,
        getStorFileBase: () => ({ shortName: widget.replace(/^_\d+_/u, '') }),
      }),
    }],
  };

  const services = withRuntimeServices(await buildStudioServices(SITE, stub));

  assert.equal(loaded.includes(STUDIO_BASE_PROJECT), false, '100554 is not scanned');
  assert.deepEqual(loaded, [SITE, DEP]);

  const studio = studioWidgets(services);
  assert.deepEqual(studio, [...RUNTIME_STUDIO_SERVICES]);
  for (const declared of RUNTIME_STUDIO_SERVICES) {
    assert.equal(studio.includes(declared), true, declared);
  }

  assert.equal(services.length, 8);
  for (const [level, entry] of services.entries()) {
    const left = widgetsOn(entry, 'left');
    const right = widgetsOn(entry, 'right');
    assert.equal(left[0], SERVICE_MESSAGES, `level ${level} left prefix`);
    assert.equal(right[0], SERVICE_APP, `level ${level} right prefix`);
    assert.deepEqual(right.slice(1, 1 + RUNTIME_STUDIO_SERVICES.length), [...RUNTIME_STUDIO_SERVICES]);
  }

  assert.equal(widgetsOn(services[0], 'left').includes('_102099_serviceOwn'), true);
});

test('an undeclared _100554_ widget from the scan is dropped, not kept', () => {
  const services = withRuntimeServices([
    `_100554_serviceSource;_100554_servicePreview,${RUNTIME_STUDIO_SERVICES[0]}`,
    '', '', '', '', '', '', '',
  ]);
  assert.deepEqual(studioWidgets(services), [...RUNTIME_STUDIO_SERVICES]);
  assert.equal(widgetsOn(services[0], 'left').includes('_100554_serviceSource'), false);
  assert.equal(widgetsOn(services[0], 'right').includes('_100554_servicePreview'), false);
});

test('anonymous fallback still gets the declared pair on the right of every level', () => {
  const services = withRuntimeServices(ANONYMOUS_SERVICES);
  assert.deepEqual(studioWidgets(services), [...RUNTIME_STUDIO_SERVICES]);
  for (const entry of services) {
    assert.deepEqual(widgetsOn(entry, 'right').slice(0, 3), [
      SERVICE_APP,
      ...RUNTIME_STUDIO_SERVICES,
    ]);
  }
});
