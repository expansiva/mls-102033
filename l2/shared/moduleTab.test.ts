/// <mls fileReference="_102033_/l2/shared/moduleTab.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { MasterFrontendBootConfig } from '/_102029_/l2/contracts/bootstrap.js';
import { openModuleTab } from '/_102033_/l2/shared/moduleTab.js';

interface FakeElement {
  tagName: string;
  style: { cssText: string };
  textContent: string;
  isConnected: boolean;
  bootConfig?: MasterFrontendBootConfig;
  child: FakeElement | null;
  parent: FakeElement | null;
  firstElementChild: FakeElement | null;
  replaceChildren(next?: FakeElement): void;
}

function createElement(tag: string): FakeElement {
  const element: FakeElement = {
    tagName: tag.toUpperCase(),
    style: { cssText: '' },
    textContent: '',
    isConnected: true,
    child: null,
    parent: null,
    get firstElementChild() {
      return element.child;
    },
    replaceChildren(next?: FakeElement) {
      if (element.child) element.child.parent = null;
      element.child = next ?? null;
      if (next) next.parent = element;
    },
  };
  return element;
}

function boot(basePath: string, moduleId: string, path: string, tag: string): MasterFrontendBootConfig {
  return {
    projectId: '1',
    moduleId,
    basePath,
    shellMode: 'spa',
    device: 'desktop',
    routes: [{ path, entrypoint: `${basePath}/page.js`, tag, title: moduleId }],
    layout: {
      regions: {
        desktop: { header: true, aside: true, content: true },
        mobile: { header: true, aside: true, content: true },
      },
      asideMode: { desktop: 'inline', mobile: 'drawer' },
    },
  };
}

describe('module tabs', { concurrency: false }, () => {
test('module tabs are divs, one per module, and a second open only activates', async () => {
  const created: string[] = [];
  const opened: Array<{ id: string; element: FakeElement }> = [];
  const activated: string[] = [];
  const tabs: string[] = [];
  const fetches: string[] = [];
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;

  globalThis.document = {
    createElement(tag: string) {
      created.push(tag);
      return createElement(tag);
    },
  } as unknown as Document;
  globalThis.window = {
    collabRouteChunkCache: new Set<string>(),
    collabRouteChunkPromises: new Map<string, Promise<unknown>>(),
    collabRuntimeNav3: {
      openTab(tab: { id: string; element: FakeElement }) {
        opened.push({ id: tab.id, element: tab.element });
        if (!tabs.includes(tab.id)) tabs.push(tab.id);
      },
      activateTab(id: string) {
        activated.push(id);
      },
      closeTab() {},
      listTabs: () => tabs,
    },
  } as unknown as Window & typeof globalThis;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    fetches.push(url);
    const basePath = new URL(url, 'http://collab.local').searchParams.get('basePath');
    const body = basePath === '/monitor'
      ? boot('/monitor', 'monitor', '/monitor', 'monitor-page')
      : {
        ...boot('/tarefas', 'tarefas', '/tarefas', 'tarefas-page'),
        routes: [
          { path: '/tarefas', entrypoint: '/tarefas/page.js', tag: 'tarefas-page', title: 'tarefas' },
          { path: '/tarefas/lista', entrypoint: '/tarefas/lista.js', tag: 'tarefas-lista', title: 'lista' },
        ],
      };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;

  const importer = async () => ({});
  try {
    await openModuleTab('/monitor', '/monitor', importer);
    await openModuleTab('/tarefas', '/tarefas', importer);
    await openModuleTab('/tarefas', '/tarefas', importer);

    assert.equal(opened.length, 2);
    assert.deepEqual(opened.map((tab) => tab.id), ['mod-/monitor', 'mod-/tarefas']);
    assert.equal(created.includes('iframe'), false);
    for (const tab of opened) {
      assert.equal(tab.element.tagName, 'DIV');
      assert.equal(tab.element.child?.tagName === 'IFRAME', false);
    }
    assert.equal(opened[0].element.child?.tagName, 'MONITOR-PAGE');
    assert.equal(opened[1].element.child?.tagName, 'TAREFAS-PAGE');
    assert.deepEqual(activated, ['mod-/tarefas']);
    await openModuleTab('/tarefas', '/tarefas/lista', importer);
    assert.equal(opened.length, 2);
    assert.equal(opened[1].element.child?.tagName, 'TAREFAS-LISTA');
    const before = fetches.length;
    await openModuleTab('/tarefas', '/tarefas', importer);
    assert.equal(fetches.length, before);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});

test('an unknown route shows the error in the tab', async () => {
  const opened: Array<{ element: FakeElement }> = [];
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const errors: unknown[] = [];
  const previousError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };

  globalThis.document = { createElement } as unknown as Document;
  globalThis.window = {
    collabRouteChunkCache: new Set<string>(),
    collabRouteChunkPromises: new Map<string, Promise<unknown>>(),
    collabRuntimeNav3: {
      openTab(tab: { element: FakeElement }) {
        opened.push({ element: tab.element });
      },
      activateTab() {},
      closeTab() {},
      listTabs: () => [],
    },
  } as unknown as Window & typeof globalThis;
  globalThis.fetch = (async () => new Response(JSON.stringify(
    boot('/monitor', 'monitor', '/monitor', 'monitor-page'),
  ), { status: 200 })) as typeof fetch;

  try {
    await openModuleTab('/monitor', '/monitor/missing', async () => ({}));
    assert.equal(opened.length, 1);
    assert.match(opened[0].element.textContent, /Route not registered for \/monitor\/missing/);
    assert.equal(opened[0].element.child, null);
    assert.equal(errors.length > 0, true);
  } finally {
    console.error = previousError;
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});
});
