/// <mls fileReference="_102033_/l2/cbe/studioServices.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANONYMOUS_SERVICES,
  RUNTIME_STUDIO_SERVICES,
  SERVICE_APP,
  SERVICE_MESSAGES,
  STUDIO_BASE_PROJECT,
  STUDIO_TOOLS_SCOPE,
  buildStudioServices,
  loadStudioTools,
  resetStudioTools,
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
    `_100554_serviceUser;_100554_servicePreview,${RUNTIME_STUDIO_SERVICES[0]}`,
    '', '', '', '', '', '', '',
  ]);
  assert.deepEqual(studioWidgets(services), [...RUNTIME_STUDIO_SERVICES]);
  assert.equal(widgetsOn(services[0], 'left').includes('_100554_serviceUser'), false);
  assert.equal(widgetsOn(services[0], 'right').includes('_100554_servicePreview'), false);
});

test('serviceSource/serviceUnit survive the scan filter, but only at the level they were placed', () => {
  const services = withRuntimeServices([
    '', '',
    `_100554_serviceSource,_102020_someOtherLeft;_100554_serviceUnit,${RUNTIME_STUDIO_SERVICES[0]}`, // level 2
    '', '', '', '', '',
  ]);
  assert.equal(widgetsOn(services[2], 'left').includes('_100554_serviceSource'), true);
  assert.equal(widgetsOn(services[2], 'right').includes('_100554_serviceUnit'), true);
  for (const [level, entry] of services.entries()) {
    if (level === 2) continue;
    assert.equal(widgetsOn(entry, 'left').includes('_100554_serviceSource'), false, `level ${level} left`);
    assert.equal(widgetsOn(entry, 'right').includes('_100554_serviceUnit'), false, `level ${level} right`);
  }
});

test('anonymous fallback still gets the declared pair on the right of every level', () => {
  const services = withRuntimeServices(ANONYMOUS_SERVICES);
  assert.deepEqual(studioWidgets(services), [...RUNTIME_STUDIO_SERVICES]);
  for (const entry of services) {
    assert.deepEqual(widgetsOn(entry, 'right').slice(0, 1 + RUNTIME_STUDIO_SERVICES.length), [
      SERVICE_APP,
      ...RUNTIME_STUDIO_SERVICES,
    ]);
  }
});

// --- Editing tools (TASK-102033-studio-to-102020) ---

/** A plugin that declares one tool, plus the noise a real scan runs into. */
function toolStub(loaded: string[], asked: string[]): MlsPluginApi {
  return {
    plugin: {
      loadAll: async () => undefined,
      getAllMenuActions: (project, { scope }) => {
        asked.push(`${project}:${scope}`);
        if (scope !== STUDIO_TOOLS_SCOPE) return [];
        if (project !== DEP) return [];
        return [
          { widget: 'brokenWithoutProject', priority: 1 },
          { widget: '_102020_/l2/aura/studio/studioEditTool', priority: 2 },
        ];
      },
    },
    l5: { getProjectDependencies: () => [DEP] },
    stor: { server: { loadProjectInfoIfNeeded: async () => undefined } },
  } satisfies MlsPluginApi & { plugin: { loadAll: unknown } } as MlsPluginApi;
}

test('the runtime asks the PLUGINS which editing tool to load — it never names one', async () => {
  // The whole point of moving the studio folder out: the master frontend must not know that the
  // editor lives in 102020. It asks for the `studioTools` scope and imports whatever comes back.
  resetStudioTools();
  const asked: string[] = [];
  const loaded: string[] = [];

  const result = await loadStudioTools(SITE, toolStub(loaded, asked), async (url) => {
    loaded.push(url);
  });

  assert.deepEqual(loaded, ['/_102020_/l2/aura/studio/studioEditTool.js'], 'the widget IS the path');
  assert.deepEqual(result, ['_102020_/l2/aura/studio/studioEditTool']);
  assert.ok(asked.includes(`${SITE}:${STUDIO_TOOLS_SCOPE}`), 'the site project is scanned');
  assert.ok(asked.includes(`${DEP}:${STUDIO_TOOLS_SCOPE}`), 'and so are its dependencies');
});

test('the same tool is imported once per session', async () => {
  resetStudioTools();
  const loaded: string[] = [];
  const load = async (url: string) => { loaded.push(url); };

  await loadStudioTools(SITE, toolStub(loaded, []), load);
  const second = await loadStudioTools(SITE, toolStub(loaded, []), load);

  assert.deepEqual(second, [], 'nothing new the second time');
  assert.equal(loaded.length, 1);
});

test('no plugin means no tool, and that is not an error', async () => {
  // A client app with no Studio simply has no editing tools — the intended behaviour, not a failure.
  resetStudioTools();
  assert.deepEqual(await loadStudioTools(SITE, {}, async () => undefined), []);
  assert.deepEqual(await loadStudioTools(0, undefined, async () => undefined), []);
});

test('a tool that fails to load does not take the scan down', async () => {
  resetStudioTools();
  const result = await loadStudioTools(SITE, toolStub([], []), async () => {
    throw new Error('404');
  });
  assert.deepEqual(result, [], 'reported as nothing loaded, not thrown');
});
