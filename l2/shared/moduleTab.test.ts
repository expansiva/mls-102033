/// <mls fileReference="_102033_/l2/shared/moduleTab.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  isModuleTabPinned,
  moduleTabPinLabel,
  mountModuleTabOnActivate,
  pinBasePathForTab,
  navigateModuleTab,
  moduleDisplayName,
  moduleNameFromId,
  openModuleTab,
  readShellRoute,
  restorePinnedModuleTabs,
  revealModuleTabForLocation,
  settleClosedContentTab,
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
    assert.equal(moduleTabPinLabel('/pin-a', 'en'), 'Pin tab');
    assert.equal(moduleTabPinLabel('/pin-a', 'pt-BR'), 'Fixar aba');
    toggleModuleTabPin('/pin-a');
    toggleModuleTabPin('/pin-b');
    assert.equal(moduleTabPinLabel('/pin-a', ''), 'Unpin tab');
    const saved = JSON.parse(store.get('collabTabs') ?? '{}') as { pinned: Array<{ basePath: string; route: string }> };
    assert.deepEqual(saved.pinned, [
      { basePath: '/pin-a', route: '/pin-a' },
      { basePath: '/pin-b', route: '/pin-b/item' },
    ]);
    await openModuleTab('/pin-b', '/pin-b', async () => ({}));
    const stayed = JSON.parse(store.get('collabTabs') ?? '{}') as { pinned: Array<{ route: string }> };
    assert.equal(stayed.pinned[1].route, '/pin-b/item');
    toggleModuleTabPin('/pin-a');
    toggleModuleTabPin('/pin-a');
    const repinned = JSON.parse(store.get('collabTabs') ?? '{}') as { pinned: Array<{ basePath: string }> };
    assert.deepEqual(repinned.pinned.map((item) => item.basePath), ['/pin-b', '/pin-a']);
    toggleModuleTabPin('/pin-a');

    location.pathname = '/pin-b/item';
    installWindow();
    await restorePinnedModuleTabs(async () => ({}));
    assert.deepEqual(opened, ['mod-/pin-b#1']);
    assert.equal(activated.at(-1), 'mod-/pin-b#1');

    location.pathname = '/home';
    installWindow();
    await restorePinnedModuleTabs(async () => ({}));
    assert.deepEqual(opened, ['mod-/pin-b#1']);
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

test('r1: restoring pins keeps stored pins and mounts only the one that matches the address', async () => {
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
    return new Response(JSON.stringify({
      ...boot(basePath, basePath, basePath, 'skip-page'),
      routes: [
        { path: basePath, entrypoint: `${basePath}/page.js`, tag: 'skip-page', title: basePath },
        { path: `${basePath}/x`, entrypoint: `${basePath}/x.js`, tag: 'skip-x', title: 'x' },
      ],
    }), { status: 200 });
  }) as typeof fetch;
  try {
    await restorePinnedModuleTabs(async () => ({}));
    assert.deepEqual(opened, ['mod-/skip-a#1', 'mod-/skip-home#1', 'mod-/skip-b#1']);
    assert.equal(store.get('collabTabs'), stored);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});

test('r2: the first open of a module tab already points the URL at it, even before Lit connects the div', async () => {
  const location = { pathname: '/home', search: '', hash: '' };
  const tabs: string[] = [];
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const apply = (url: string) => {
    const parsed = new URL(url, 'http://collab.local');
    location.pathname = parsed.pathname;
    location.search = parsed.search;
    location.hash = parsed.hash;
  };
  // The real shell renders the new tab asynchronously: right after openTab the div is not in the document.
  globalThis.document = {
    createElement(tag: string) {
      const element = createElement(tag);
      element.isConnected = false;
      return element;
    },
  } as unknown as Document;
  globalThis.window = {
    collabRouteChunkCache: new Set<string>(['/r2tab/page.js']),
    collabRouteChunkPromises: new Map<string, Promise<unknown>>(),
    collabBoot: { basePath: '/home' },
    location,
    history: { replaceState(_state: unknown, _title: string, url: string) { apply(url); } },
    collabRuntimeNav3: {
      openTab(tab: { id: string }) { if (!tabs.includes(tab.id)) tabs.push(tab.id); },
      activateTab() {},
      closeTab() {},
      listTabs: () => ['app', ...tabs],
    },
  } as unknown as Window & typeof globalThis;
  globalThis.fetch = (async () => new Response(JSON.stringify(
    boot('/r2tab', 'r2tab', '/r2tab', 'r2-page'),
  ), { status: 200 })) as typeof fetch;
  try {
    await openModuleTab('/r2tab', '/r2tab', async () => ({}));
    assert.equal(location.pathname, '/r2tab');
    assert.equal(readShellRoute(), '/home');
    assert.deepEqual(findModuleTabForPath('/r2tab'), { basePath: '/r2tab', route: '/r2tab' });
    tabs.length = 0;
    assert.equal(findModuleTabForPath('/r2tab'), undefined);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});

test('r3: the URL follows the active tab in every transition — open, activate and close', async () => {
  const location = { pathname: '/home', search: '', hash: '' };
  const tabs: string[] = [];
  let active = 'app';
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const apply = (url: string) => {
    const parsed = new URL(url, 'http://collab.local');
    location.pathname = parsed.pathname;
    location.search = parsed.search;
    location.hash = parsed.hash;
  };
  globalThis.document = {
    createElement(tag: string) {
      const element = createElement(tag);
      element.isConnected = false;
      return element;
    },
  } as unknown as Document;
  // Same contract as the shell handlers: openTab activates (openModuleTab syncs), activateTab and closeTab sync.
  globalThis.window = {
    collabRouteChunkCache: new Set<string>(['/r3a/page.js', '/r3b/page.js']),
    collabRouteChunkPromises: new Map<string, Promise<unknown>>(),
    collabBoot: { basePath: '/home' },
    location,
    history: { replaceState(_state: unknown, _title: string, url: string) { apply(url); } },
    collabRuntimeNav3: {
      openTab(tab: { id: string }) {
        if (!tabs.includes(tab.id)) tabs.push(tab.id);
        active = tab.id;
      },
      activateTab(id: string) {
        syncHistoryForContentTab(id);
        active = id;
      },
      closeTab(id: string) {
        const index = tabs.indexOf(id);
        if (index >= 0) tabs.splice(index, 1);
        if (active === id) {
          active = tabs.length > 0 ? tabs[tabs.length - 1] : 'app';
          syncHistoryForContentTab(active);
        }
      },
      listTabs: () => ['app', ...tabs],
    },
  } as unknown as Window & typeof globalThis;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const basePath = new URL(String(input), 'http://collab.local').searchParams.get('basePath') ?? '';
    return new Response(JSON.stringify(boot(basePath, basePath.slice(1), basePath, 'r3-page')), { status: 200 });
  }) as typeof fetch;
  try {
    await openModuleTab('/r3a', '/r3a', async () => ({}));
    assert.equal(location.pathname, '/r3a', 'open A');
    await openModuleTab('/r3b', '/r3b', async () => ({}));
    assert.equal(location.pathname, '/r3b', 'open B');

    window.collabRuntimeNav3!.activateTab('mod-/r3a');
    assert.equal(location.pathname, '/r3a', 'activate A');
    window.collabRuntimeNav3!.activateTab('app');
    assert.equal(location.pathname, '/home', 'activate app');
    window.collabRuntimeNav3!.activateTab('mod-/r3b');
    assert.equal(location.pathname, '/r3b', 'activate B');

    window.collabRuntimeNav3!.closeTab('mod-/r3a');
    assert.equal(location.pathname, '/r3b', 'closing a tab that is not active keeps the URL');
    window.collabRuntimeNav3!.closeTab('mod-/r3b');
    assert.equal(location.pathname, '/home', 'closing the active tab goes to the tab that stays (app)');
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});

test('r3: the shell handlers for the three transitions all sync the URL (class guard on the source)', () => {
  const shell = readFileSync(new URL('./shell.ts', import.meta.url), 'utf8');
  const handler = (name: string): string => {
    const start = shell.indexOf(`private readonly ${name} = `);
    assert.ok(start >= 0, `${name} not found in shell.ts`);
    return shell.slice(start, shell.indexOf('\n  };', start));
  };
  assert.match(handler('activateContentTab'), /syncHistoryForContentTab\(id\)/u);
  assert.match(handler('closeContentTab'), /syncHistoryForContentTab\(this\.activeContentTabId\)/u);
  // Opening: the shell only activates; the URL is pointed at the tab by openModuleTab itself.
  assert.match(handler('openContentTab'), /moduleTabOpenActivates\(\)/u);
});

test('rt161: two pins keep their pages, a link opens the free tab, unpin renumbers and drops the older free tab', async () => {
  const store = new Map<string, string>();
  const tabs: string[] = [];
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  globalThis.document = { createElement } as unknown as Document;
  globalThis.window = {
    collabRouteChunkCache: new Set<string>(),
    collabRouteChunkPromises: new Map<string, Promise<unknown>>(),
    collabBoot: { basePath: '/home' },
    location: { pathname: '/home', search: '', hash: '' },
    history: { replaceState() {} },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    },
    collabRuntimeNav3: {
      openTab(tab: { id: string }) { if (!tabs.includes(tab.id)) tabs.push(tab.id); },
      activateTab() {},
      closeTab(id: string) {
        const index = tabs.indexOf(id);
        if (index >= 0) tabs.splice(index, 1);
      },
      listTabs: () => tabs,
    },
  } as unknown as Window & typeof globalThis;
  globalThis.fetch = (async () => new Response(JSON.stringify({
      ...boot('/rt161', 'tarefas', '/rt161', 'rt161-page'),
      routes: [
        { path: '/rt161', entrypoint: '/rt161/page.js', tag: 'rt161-page', title: 'Tarefas' },
        { path: '/rt161/minhas', entrypoint: '/rt161/minhas.js', tag: 'rt161-minhas', title: 'Minhas' },
        { path: '/rt161/outras', entrypoint: '/rt161/outras.js', tag: 'rt161-outras', title: 'Outras' },
      ],
    }), { status: 200 })) as typeof fetch;
  try {
    await openModuleTab('/rt161', '/rt161/minhas', async () => ({}));
    toggleModuleTabPin('/rt161');
    await openModuleTab('/rt161', '/rt161/outras', async () => ({}));
    toggleModuleTabPin('/rt161');
    const pinned = JSON.parse(store.get('collabTabs') ?? '{}') as { pinned: Array<{ basePath: string; route: string }> };
    assert.deepEqual(pinned.pinned, [
      { basePath: '/rt161', route: '/rt161/minhas' },
      { basePath: '/rt161', route: '/rt161/outras' },
    ]);
    assert.deepEqual(tabs.filter((id) => id.startsWith('mod-/rt161')), ['mod-/rt161#1', 'mod-/rt161#2']);
    await openModuleTab('/rt161', '/rt161', async () => ({}));
    assert.equal(tabs.includes('mod-/rt161'), true);
    assert.deepEqual(findModuleTabForPath('/rt161'), { basePath: '/rt161', route: '/rt161' });
    const saved = store.get('collabTabs');
    await navigateModuleTab('/rt161', '/rt161/minhas', async () => ({}));
    assert.equal(store.get('collabTabs'), saved);
    toggleModuleTabPin('/rt161', '/rt161/minhas');
    const after = JSON.parse(store.get('collabTabs') ?? '{}') as { pinned: Array<{ basePath: string; route: string }> };
    assert.deepEqual(after.pinned, [{ basePath: '/rt161', route: '/rt161/outras' }]);
    assert.equal(tabs.includes('mod-/rt161#2'), false);
    assert.equal(tabs.includes('mod-/rt161#1'), true);
    assert.equal(tabs.includes('mod-/rt161'), true);
    assert.equal(findModuleTabForPath('/rt161')?.route, '/rt161/minhas');
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});

test('rt161: restore creates pins without rendering and mounts the active one; an old collabTabs entry still loads', async () => {
  const stored = JSON.stringify({
    pinned: [
      { basePath: '/old', route: '/old/a' },
      { basePath: '/rt161b', route: '/rt161b/one' },
      { basePath: '/rt161b', route: '/rt161b/two' },
    ],
  });
  const store = new Map<string, string>([['collabTabs', stored]]);
  const tabs: string[] = [];
  const elements = new Map<string, FakeElement>();
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  globalThis.document = { createElement } as unknown as Document;
  globalThis.window = {
    collabRouteChunkCache: new Set<string>(),
    collabRouteChunkPromises: new Map<string, Promise<unknown>>(),
    collabBoot: { basePath: '/home' },
    location: { pathname: '/home', search: '', hash: '' },
    history: { replaceState() {} },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    },
    collabRuntimeNav3: {
      openTab(tab: { id: string; element: FakeElement }) {
        if (!tabs.includes(tab.id)) tabs.push(tab.id);
        elements.set(tab.id, tab.element);
      },
      activateTab() {},
      closeTab() {},
      listTabs: () => tabs,
    },
  } as unknown as Window & typeof globalThis;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const basePath = new URL(String(input), 'http://collab.local').searchParams.get('basePath') ?? '';
    return new Response(JSON.stringify({
      ...boot(basePath, basePath, basePath, 'lazy-page'),
      routes: [
        { path: basePath, entrypoint: `${basePath}/page.js`, tag: 'lazy-page', title: basePath },
        { path: `${basePath}/a`, entrypoint: `${basePath}/a.js`, tag: 'lazy-a', title: 'a' },
        { path: `${basePath}/one`, entrypoint: `${basePath}/one.js`, tag: 'lazy-one', title: 'one' },
        { path: `${basePath}/two`, entrypoint: `${basePath}/two.js`, tag: 'lazy-two', title: 'two' },
      ],
    }), { status: 200 });
  }) as typeof fetch;
  try {
    await restorePinnedModuleTabs(async () => ({}));
    assert.deepEqual(tabs, ['mod-/old#1', 'mod-/rt161b#1', 'mod-/rt161b#2']);
    assert.equal(elements.get('mod-/old#1')?.child ?? null, null);
    assert.equal(elements.get('mod-/rt161b#1')?.child ?? null, null);
    assert.equal(elements.get('mod-/rt161b#2')?.child ?? null, null);
    assert.equal(store.get('collabTabs'), stored);
    await mountModuleTabOnActivate('mod-/rt161b#2', async () => ({}));
    assert.equal(elements.get('mod-/rt161b#2')?.child?.tagName, 'LAZY-TWO');
    assert.equal(elements.get('mod-/rt161b#1')?.child ?? null, null);
    await mountModuleTabOnActivate('mod-/old#1', async () => ({}));
    assert.equal(elements.get('mod-/old#1')?.child?.tagName, 'LAZY-A');
    assert.equal(pinBasePathForTab('mod-/rt161b#2', '/home'), '/rt161b');
    assert.equal(isModuleTabPinned('/old'), true);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});
});

describe('rt154 s1: one tab is enough, the app tab closes, the active cursor is default', () => {
  test('the bar is on with a single app tab, the app tab has the same close, the active cursor is default', () => {
    const shell = readFileSync(new URL('./shell.ts', import.meta.url), 'utf8');
    assert.match(shell, /data-has-tabs=\$\{String\(!this\.isEmbedded\)\}/u);
    assert.match(shell, /closeContentTab\('app'\)/u);
    assert.match(shell, /\.nav3-tab\[data-active="true"\] \{[^}]*cursor:\s*default;/u);
    assert.match(shell, /\.nav3-tab-close \{[^}]*cursor:\s*pointer;/u);
    assert.match(shell, /if \(!this\.appTabOpen \|\| this\.activeContentTabId\.startsWith\('mod-'\)\) this\.activateContentTab\('app'\)/u);
    const reopen = shell.slice(shell.indexOf('reopenAppAtBootRoute'), shell.indexOf('private readonly activateContentTab'));
    assert.match(reopen, /this\.bootConfig\?\.basePath/u);
    assert.match(reopen, /syncHistoryForContentTab\('app'\)/u);
    assert.match(reopen, /this\.loadActiveRoute\(\)/u);
  });

  test('closing the app tab activates the neighbor; closing the last tab reopens the app', () => {
    const withNeighbor = settleClosedContentTab({
      closedId: 'app',
      appOpen: true,
      activeId: 'app',
      tabIds: ['mod-/tarefas'],
    });
    assert.deepEqual(withNeighbor, {
      appOpen: false,
      activeId: 'mod-/tarefas',
      tabIds: ['mod-/tarefas'],
      reopenInitial: false,
      syncUrl: true,
    });
    const onlyApp = settleClosedContentTab({
      closedId: 'app',
      appOpen: true,
      activeId: 'app',
      tabIds: [],
    });
    assert.equal(onlyApp?.reopenInitial, true);
    assert.equal(onlyApp?.activeId, 'app');
    assert.equal(onlyApp?.appOpen, true);
    const lastModule = settleClosedContentTab({
      closedId: 'mod-/tarefas',
      appOpen: false,
      activeId: 'mod-/tarefas',
      tabIds: ['mod-/tarefas'],
    });
    assert.equal(lastModule?.reopenInitial, true);
    const inactive = settleClosedContentTab({
      closedId: 'mod-/a',
      appOpen: true,
      activeId: 'mod-/b',
      tabIds: ['mod-/a', 'mod-/b'],
    });
    assert.equal(inactive?.syncUrl, false);
    assert.equal(inactive?.activeId, 'mod-/b');
    assert.deepEqual(inactive?.tabIds, ['mod-/b']);
  });
});

describe('rt154 s2: pin lives on the nav3 menu, including the app tab', () => {
  test('the tab text no longer pins, and the service menu toggles the active tab', () => {
    const shell = readFileSync(new URL('./shell.ts', import.meta.url), 'utf8');
    const service = readFileSync(new URL('../cbe/serviceClientApp.ts', import.meta.url), 'utf8');
    assert.equal(shell.includes('nav3-tab-pin'), false);
    assert.match(shell, /activeTab: \(\) => this\.activeContentTabId/u);
    assert.match(shell, /togglePin: this\.toggleContentTabPin/u);
    assert.match(shell, /isPinned:/u);
    assert.match(service, /pinMenuText\(\)/u);
    assert.match(service, /nav\.togglePin\(nav\.activeTab\(\)\)/u);
    assert.match(service, /this\.menu\.refresh\?\.\(\)/u);
    const mount = shell.slice(shell.indexOf('async mountModuleRoot'), shell.indexOf('private readonly handleViewportChange'));
    const restoreAt = mount.indexOf('restorePinnedModuleTabs');
    const loadAt = mount.indexOf('loadActiveRoute');
    assert.ok(restoreAt >= 0 && loadAt > restoreAt);
  });

  test('pinning the app tab and a module tab follows the active tab and survives reload at the root', async () => {
    const store = new Map<string, string>();
    const location = { pathname: '/home/now', search: '', hash: '' };
    const opened: string[] = [];
    const replaced: string[] = [];
    const tabs = ['app'];
    let active = 'app';
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
      collabRouteChunkCache: new Set<string>(['/tasks/page.js', '/home/now.js']),
      collabRouteChunkPromises: new Map<string, Promise<unknown>>(),
      collabBoot: { basePath: '/home' },
      location,
      history: { replaceState(_s: unknown, _t: string, url: string) { replaced.push(url); apply(url); } },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
      },
      collabRuntimeNav3: {
        openTab(tab: { id: string }) {
          if (!tabs.includes(tab.id)) tabs.push(tab.id);
          opened.push(tab.id);
        },
        activateTab(id: string) { active = id; },
        closeTab() {},
        listTabs: () => tabs,
        activeTab: () => active,
        togglePin(id: string) {
          const basePath = pinBasePathForTab(id, '/home');
          const route = id === 'app' ? `${location.pathname}${location.search}${location.hash}` : undefined;
          toggleModuleTabPin(basePath, route);
        },
        isPinned: (id: string) => isModuleTabPinned(pinBasePathForTab(id, '/home')),
      },
    } as unknown as Window & typeof globalThis;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const basePath = new URL(String(input), 'http://collab.local').searchParams.get('basePath') ?? '';
      const config = boot(basePath, basePath, basePath, 'pin-page');
      if (basePath === '/home') {
        config.routes.push({ path: '/home/now', entrypoint: '/home/now.js', tag: 'pin-now', title: 'Now' });
      }
      return new Response(JSON.stringify(config), { status: 200 });
    }) as typeof fetch;
    try {
      const nav = window.collabRuntimeNav3!;
      assert.equal(moduleTabPinLabel(pinBasePathForTab(nav.activeTab(), '/home'), 'pt'), 'Fixar aba');
      nav.togglePin('app');
      assert.equal(nav.isPinned('app'), true);
      assert.equal(moduleTabPinLabel('/home', 'en'), 'Unpin tab');
      const saved = JSON.parse(store.get('collabTabs') ?? '{}') as { pinned: Array<{ basePath: string; route: string }> };
      assert.deepEqual(saved.pinned, [{ basePath: '/home', route: '/home/now' }]);

      await openModuleTab('/tasks', '/tasks', async () => ({}));
      active = 'mod-/tasks';
      assert.equal(moduleTabPinLabel(pinBasePathForTab(nav.activeTab(), '/home'), 'pt-BR'), 'Fixar aba');
      nav.togglePin('mod-/tasks');
      assert.equal(nav.isPinned('mod-/tasks'), true);
      assert.equal(moduleTabPinLabel('/tasks', 'en'), 'Unpin tab');
      nav.togglePin('mod-/tasks');
      assert.equal(nav.isPinned('mod-/tasks'), false);

      location.pathname = '/home';
      opened.length = 0;
      await restorePinnedModuleTabs(async () => ({}));
      assert.equal(location.pathname, '/home');
      assert.equal(tabs.includes('app'), true);
      assert.equal(tabs.includes('mod-/home#1'), true);
      assert.equal(readShellRoute(), '/home');

      location.pathname = '/home/stay';
      await restorePinnedModuleTabs(async () => ({}));
      assert.equal(location.pathname, '/home/stay');
    } finally {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.fetch = previousFetch;
    }
  });
});

describe('rt161 s3: pinning the app tab hosts the boot module and leaves app free', () => {
  test('pin creates mod-<base>#1, a boot link stays on app, and reload restores the pin unmounted', async () => {
    const store = new Map<string, string>();
    const tabs: string[] = ['app'];
    const elements = new Map<string, FakeElement>();
    let active = 'app';
    const location = { pathname: '/desk/minhas', search: '', hash: '' };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousFetch = globalThis.fetch;
    globalThis.document = { createElement } as unknown as Document;
    globalThis.window = {
      collabRouteChunkCache: new Set<string>(['/desk/page.js', '/desk/minhas.js', '/desk/outras.js']),
      collabRouteChunkPromises: new Map<string, Promise<unknown>>(),
      collabBoot: { basePath: '/desk' },
      location,
      history: { replaceState() {} },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
      },
      collabRuntimeNav3: {
        openTab(tab: { id: string; element: FakeElement }) {
          if (!tabs.includes(tab.id)) tabs.push(tab.id);
          elements.set(tab.id, tab.element);
          active = tab.id;
        },
        activateTab(id: string) { active = id; },
        closeTab(id: string) {
          const index = tabs.indexOf(id);
          if (index >= 0) tabs.splice(index, 1);
        },
        listTabs: () => tabs,
        activeTab: () => active,
      },
    } as unknown as Window & typeof globalThis;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      ...boot('/desk', 'desk', '/desk', 'desk-page'),
      routes: [
        { path: '/desk', entrypoint: '/desk/page.js', tag: 'desk-page', title: 'Desk' },
        { path: '/desk/minhas', entrypoint: '/desk/minhas.js', tag: 'desk-minhas', title: 'Minhas' },
        { path: '/desk/outras', entrypoint: '/desk/outras.js', tag: 'desk-outras', title: 'Outras' },
      ],
    }), { status: 200 })) as typeof fetch;
    try {
      toggleModuleTabPin('/desk', '/desk/minhas');
      assert.equal(tabs.includes('app'), true);
      assert.equal(tabs.includes('mod-/desk#1'), true);
      const saved = store.get('collabTabs');
      assert.equal(await revealModuleTabForLocation('/desk/outras'), false);
      assert.equal(active, 'mod-/desk#1');
      assert.equal(tabs.includes('app'), true);
      const shell = readFileSync(new URL('./shell.ts', import.meta.url), 'utf8');
      const pop = shell.slice(shell.indexOf('const ownedByBoot'), shell.indexOf('this.requestUpdate();', shell.indexOf('const ownedByBoot')));
      assert.match(pop, /ownedByBoot \? undefined : findModuleTabForPath/u);
      assert.match(pop, /this\.activateContentTab\('app'\)/u);
      assert.equal(findModuleTabForPath('/desk/outras'), undefined);
      assert.equal(store.get('collabTabs'), saved);

      for (const id of [...tabs]) {
        if (id !== 'app') window.collabRuntimeNav3?.closeTab(id);
      }
      tabs.splice(0, tabs.length, 'app');
      active = 'app';
      elements.clear();
      location.pathname = '/desk';
      await restorePinnedModuleTabs(async () => ({}));
      assert.equal(tabs.includes('mod-/desk#1'), true);
      assert.equal(tabs.includes('app'), true);
      assert.equal(elements.get('mod-/desk#1')?.child ?? null, null);
      await mountModuleTabOnActivate('mod-/desk#1', async () => ({}));
      assert.equal(elements.get('mod-/desk#1')?.child?.tagName, 'DESK-MINHAS');
    } finally {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.fetch = previousFetch;
    }
  });
});

describe('rt161 r1: tab title is the module name', () => {
  test('last path segment, capitalized, and the boot moduleId when it is the boot base', () => {
    const previousWindow = globalThis.window;
    const shell = readFileSync(new URL('./shell.ts', import.meta.url), 'utf8');
    const start = shell.indexOf('export function contentTabPinNumber');
    const end = shell.indexOf('export function contentTabMarkAction');
    const chunk = shell.slice(start, end).replace(/^export /gmu, '').replace(/: number \| undefined/gu, '').replace(/: string/gu, '');
    const load = new Function(`${chunk}\nreturn { contentTabLabel };`);
    const contentTabLabel = load().contentTabLabel as (title: string, tabId: string) => string;
    globalThis.window = { collabBoot: { basePath: '/desk', moduleId: 'tarefas' } } as unknown as Window & typeof globalThis;
    try {
      assert.equal(moduleDisplayName('/tarefas'), 'Tarefas');
      assert.equal(moduleDisplayName('/monitor'), 'Monitor');
      assert.equal(moduleDisplayName('/a/b/'), 'B');
      assert.equal(moduleDisplayName('/tarefas').startsWith('/'), false);
      assert.equal(contentTabLabel(moduleDisplayName('/tarefas'), 'mod-/tarefas#1'), 'Tarefas #1');
      assert.equal(moduleDisplayName('/desk'), 'Tarefas');
      assert.equal(moduleDisplayName('/desk').startsWith('/'), false);
      // The title the mounted page reports (renderRoute) uses the same formatting: never the raw moduleId.
      assert.equal(moduleNameFromId('tarefas'), 'Tarefas');
      assert.equal(moduleNameFromId('controleChamados'), 'ControleChamados');
      assert.equal(moduleNameFromId(''), '');
    } finally {
      globalThis.window = previousWindow;
    }
  });
});
