/// <mls fileReference="_102033_/l2/shared/moduleTab.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { MasterFrontendBootConfig } from '/_102029_/l2/contracts/bootstrap.js';
import { auraNavigate } from '/_102033_/l2/shared/layout/auraNavigate.js';
import {
  bindExpectedNavigationLoad,
  consumeExpectedNavigationLoad,
} from '/_102033_/l2/shared/interactionRuntime.js';
import {
  findModuleTabForPath,
  isModuleRegistered,
  moduleTabPinLabel,
  navigateModuleTab,
  openModuleTab,
  readShellRoute,
  restorePinnedModuleTabs,
  revealModuleTabForLocation,
  syncHistoryForContentTab,
  toggleModuleTabPin,
} from '/_102033_/l2/shared/moduleTab.js';

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

test('navigation stays in the module tab, back returns there, and activating a tab sets the URL', async () => {
  const opened: Array<{ id: string; element: FakeElement }> = [];
  const tabs: string[] = [];
  const stack = ['/home'];
  let index = 0;
  const location = { pathname: '/home', search: '', hash: '' };
  const main = createElement('main-page');
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;

  const apply = (url: string) => {
    const parsed = new URL(url, 'http://collab.local');
    location.pathname = parsed.pathname;
    location.search = parsed.search;
    location.hash = parsed.hash;
  };

  globalThis.document = { createElement } as unknown as Document;
  globalThis.window = {
    collabRouteChunkCache: new Set<string>(['/tarefas/page.js', '/tarefas/lista.js']),
    collabRouteChunkPromises: new Map<string, Promise<unknown>>(),
    collabBoot: { basePath: '/home' },
    location,
    history: {
      pushState(_state: unknown, _title: string, url: string) {
        stack.splice(index + 1);
        stack.push(url);
        index += 1;
        apply(url);
      },
      replaceState(_state: unknown, _title: string, url: string) {
        stack[index] = url;
        apply(url);
      },
      back() {
        if (index > 0) index -= 1;
        apply(stack[index]);
        window.dispatchEvent(new Event('popstate'));
      },
    },
    collabRuntimeNav3: {
      openTab(tab: { id: string; element: FakeElement }) {
        opened.push({ id: tab.id, element: tab.element });
        if (!tabs.includes(tab.id)) tabs.push(tab.id);
      },
      activateTab(id: string) {
        syncHistoryForContentTab(id);
      },
      closeTab() {},
      listTabs: () => tabs,
    },
    addEventListener(type: string, fn: EventListener) {
      if (type === 'popstate') {
        const previous = (window as unknown as { onpop?: EventListener }).onpop;
        (window as unknown as { onpop?: EventListener }).onpop = (event: Event) => {
          previous?.(event);
          fn(event);
        };
      }
    },
    dispatchEvent(event: Event) {
      const onpop = (window as unknown as { onpop?: EventListener }).onpop;
      if (event.type === 'popstate') onpop?.(event);
      return true;
    },
  } as unknown as Window & typeof globalThis;

  window.addEventListener('popstate', () => {
    const pending = consumeExpectedNavigationLoad();
    const href = `${location.pathname}${location.search}${location.hash}`;
    const ownedByBoot = href === '/home' || href.startsWith('/home/');
    const work = !ownedByBoot && findModuleTabForPath(href)
      ? revealModuleTabForLocation(href)
      : Promise.resolve();
    bindExpectedNavigationLoad(pending, work);
  });

  globalThis.fetch = (async () => new Response(JSON.stringify({
    ...boot('/tarefas', 'tarefas', '/tarefas', 'tarefas-page'),
    routes: [
      { path: '/tarefas', entrypoint: '/tarefas/page.js', tag: 'tarefas-page', title: 'tarefas' },
      { path: '/tarefas/lista', entrypoint: '/tarefas/lista.js', tag: 'tarefas-lista', title: 'lista' },
    ],
  }), { status: 200 })) as typeof fetch;

  const flush = async () => {
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  };

  try {
    await openModuleTab('/tarefas', '/tarefas', async () => ({}));
    syncHistoryForContentTab('mod-/tarefas');
    assert.equal(location.pathname, '/tarefas');
    assert.equal(readShellRoute(), '/home');
    const tarefas = opened[0].element;
    assert.equal(main.child, null);

    assert.equal(auraNavigate('/tarefas/lista', { basePath: '/tarefas' }), true);
    await flush();
    assert.equal(tarefas.child?.tagName, 'TAREFAS-LISTA');
    assert.equal(main.child, null);
    assert.equal(location.pathname, '/tarefas/lista');

    window.history.back();
    await flush();
    assert.equal(location.pathname, '/tarefas');
    assert.equal(tarefas.child?.tagName, 'TAREFAS-PAGE');
    assert.equal(main.child, null);

    syncHistoryForContentTab('app');
    assert.equal(location.pathname, '/home');
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});

test('pin writes one localStorage variable, unpin removes, and a reload restores only pinned tabs', async () => {
  const store = new Map<string, string>();
  const opened: string[] = [];
  const activated: string[] = [];
  const tabs: string[] = [];
  const location = { pathname: '/home', search: '', hash: '' };
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;

  const installWindow = () => {
    opened.length = 0;
    activated.length = 0;
    tabs.length = 0;
    globalThis.window = {
      collabRouteChunkCache: new Set<string>(['/pin-a/page.js', '/pin-b/page.js', '/pin-b/item.js', '/pin-c/page.js']),
      collabRouteChunkPromises: new Map<string, Promise<unknown>>(),
      collabBoot: { basePath: '/home' },
      location,
      history: { replaceState() {} },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
      },
      collabRuntimeNav3: {
        openTab(tab: { id: string }) {
          opened.push(tab.id);
          if (!tabs.includes(tab.id)) tabs.push(tab.id);
        },
        activateTab(id: string) { activated.push(id); },
        closeTab() {},
        listTabs: () => tabs,
      },
    } as unknown as Window & typeof globalThis;
  };

  globalThis.document = { createElement } as unknown as Document;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const basePath = new URL(String(input), 'http://collab.local').searchParams.get('basePath') ?? '';
    const body = basePath === '/pin-b'
      ? {
        ...boot(basePath, basePath, basePath, 'pin-page'),
        routes: [
          { path: '/pin-b', entrypoint: '/pin-b/page.js', tag: 'pin-page', title: 'pin-b' },
          { path: '/pin-b/item', entrypoint: '/pin-b/item.js', tag: 'pin-item', title: 'item' },
        ],
      }
      : boot(basePath, basePath, basePath, 'pin-page');
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;

  try {
    installWindow();
    await openModuleTab('/pin-a', '/pin-a', async () => ({}));
    await openModuleTab('/pin-b', '/pin-b/item', async () => ({}));
    await openModuleTab('/pin-c', '/pin-c', async () => ({}));
    assert.equal(moduleTabPinLabel('/pin-a', 'en'), 'Pin');
    assert.equal(moduleTabPinLabel('/pin-a', 'pt-BR'), 'Fixar');
    toggleModuleTabPin('/pin-a');
    toggleModuleTabPin('/pin-b');
    assert.equal(moduleTabPinLabel('/pin-a', ''), 'Unpin');
    const saved = JSON.parse(store.get('collabTabs') ?? '{}') as { pinned: Array<{ basePath: string; route: string }> };
    assert.deepEqual(saved.pinned, [
      { basePath: '/pin-a', route: '/pin-a' },
      { basePath: '/pin-b', route: '/pin-b/item' },
    ]);
    await navigateModuleTab('/pin-b', '/pin-b', async () => ({}));
    const moved = JSON.parse(store.get('collabTabs') ?? '{}') as { pinned: Array<{ route: string }> };
    assert.equal(moved.pinned[1].route, '/pin-b');
    toggleModuleTabPin('/pin-a');
    toggleModuleTabPin('/pin-a');
    const repinned = JSON.parse(store.get('collabTabs') ?? '{}') as { pinned: Array<{ basePath: string }> };
    assert.deepEqual(repinned.pinned.map((item) => item.basePath), ['/pin-b', '/pin-a']);
    toggleModuleTabPin('/pin-a');

    location.pathname = '/pin-b';
    installWindow();
    await restorePinnedModuleTabs(async () => ({}));
    assert.deepEqual(opened, ['mod-/pin-b']);
    assert.equal(activated.at(-1), 'mod-/pin-b');

    location.pathname = '/home';
    installWindow();
    await restorePinnedModuleTabs(async () => ({}));
    assert.deepEqual(opened, ['mod-/pin-b']);
    assert.equal(activated.at(-1), 'app');
    assert.equal(opened.includes('mod-/pin-c'), false);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});

test('missing localStorage does not break opening a module tab', async () => {
  const errors: unknown[] = [];
  const previousError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  globalThis.document = { createElement } as unknown as Document;
  globalThis.window = {
    collabRouteChunkCache: new Set<string>(),
    collabRouteChunkPromises: new Map<string, Promise<unknown>>(),
    location: { pathname: '/solo', search: '', hash: '' },
    history: { replaceState() {} },
    localStorage: {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    },
    collabRuntimeNav3: {
      openTab() {},
      activateTab() {},
      closeTab() {},
      listTabs: () => ['mod-/solo'],
    },
  } as unknown as Window & typeof globalThis;
  globalThis.fetch = (async () => new Response(JSON.stringify(
    boot('/solo', 'solo', '/solo', 'solo-page'),
  ), { status: 200 })) as typeof fetch;
  try {
    await openModuleTab('/solo', '/solo', async () => ({}));
    toggleModuleTabPin('/solo');
    await restorePinnedModuleTabs(async () => ({}));
    assert.equal(errors.length > 0, true);
  } finally {
    console.error = previousError;
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});

test('r1: a link that is not a registered module is a full page load, never a tab with an error', async () => {
  const opened: string[] = [];
  const pushed: string[] = [];
  const location = { pathname: '/home', search: '', hash: '', href: '' };
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  globalThis.document = { createElement } as unknown as Document;
  globalThis.window = {
    collabRouteChunkCache: new Set<string>(),
    collabRouteChunkPromises: new Map<string, Promise<unknown>>(),
    collabBoot: { basePath: '/home' },
    location,
    history: { pushState(_s: unknown, _t: string, url: string) { pushed.push(url); }, replaceState() {} },
    collabRuntimeNav3: {
      openTab(tab: { id: string }) { opened.push(tab.id); },
      activateTab() {},
      closeTab() {},
      listTabs: () => [],
    },
    addEventListener() {},
    dispatchEvent() { return true; },
  } as unknown as Window & typeof globalThis;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const basePath = new URL(String(input), 'http://collab.local').searchParams.get('basePath') ?? '';
    if (basePath === '/r1broken') return new Response('boom', { status: 500 });
    if (basePath === '/r1known') return new Response(JSON.stringify(boot('/r1known', 'r1known', '/r1known', 'r1-page')), { status: 200 });
    return new Response(JSON.stringify({ statusCode: 404, msg: 'Not found' }), { status: 404 });
  }) as typeof fetch;
  const flush = async () => {
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  };
  try {
    assert.equal(await isModuleRegistered('/r1known'), true);
    assert.equal(await isModuleRegistered('/r1missing'), false);
    await assert.rejects(isModuleRegistered('/r1broken'), /Module boot failed for \/r1broken: 500/);

    assert.equal(auraNavigate('/', { basePath: '/home' }), true);
    await flush();
    assert.equal(location.href, '/');
    assert.equal(opened.length, 0);
    assert.equal(pushed.length, 0);

    location.href = '';
    assert.equal(auraNavigate('/r1missing/page', { basePath: '/home' }), true);
    await flush();
    assert.equal(location.href, '/r1missing/page');
    assert.equal(opened.length, 0);
    assert.equal(pushed.length, 0);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});

test('r1: restoring pins skips the module the boot already opened and keeps its pin stored', async () => {
  const stored = JSON.stringify({
    pinned: [
      { basePath: '/skip-a', route: '/skip-a' },
      { basePath: '/skip-home', route: '/skip-home/x' },
      { basePath: '/skip-b', route: '/skip-b' },
    ],
  });
  const store = new Map<string, string>([['collabTabs', stored]]);
  const opened: string[] = [];
  const tabs: string[] = [];
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  globalThis.document = { createElement } as unknown as Document;
  globalThis.window = {
    collabRouteChunkCache: new Set<string>(['/skip-a/page.js', '/skip-b/page.js', '/skip-home/page.js']),
    collabRouteChunkPromises: new Map<string, Promise<unknown>>(),
    collabBoot: { basePath: '/skip-home' },
    location: { pathname: '/skip-home/x', search: '', hash: '' },
    history: { replaceState() {} },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    },
    collabRuntimeNav3: {
      openTab(tab: { id: string }) { opened.push(tab.id); if (!tabs.includes(tab.id)) tabs.push(tab.id); },
      activateTab() {},
      closeTab() {},
      listTabs: () => tabs,
    },
  } as unknown as Window & typeof globalThis;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const basePath = new URL(String(input), 'http://collab.local').searchParams.get('basePath') ?? '';
    return new Response(JSON.stringify(boot(basePath, basePath, basePath, 'skip-page')), { status: 200 });
  }) as typeof fetch;
  try {
    await restorePinnedModuleTabs(async () => ({}));
    assert.deepEqual(opened, ['mod-/skip-a', 'mod-/skip-b']);
    assert.equal(store.get('collabTabs'), stored);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});
});
