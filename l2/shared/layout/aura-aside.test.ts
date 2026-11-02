/// <mls fileReference="_102033_/l2/shared/layout/aura-aside.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { describe } from 'node:test';

const doc = globalThis.document as {
  documentElement: { lang: string };
  cookie?: string;
  createTreeWalker?: () => { currentNode: null; nextNode: () => null };
  createElement?: (tag: string) => object;
  createComment?: () => object;
  createTextNode?: (text: string) => object;
};
doc.cookie = '';
doc.createTreeWalker = () => ({ currentNode: null, nextNode: () => null });
doc.createElement = () => ({
  tagName: 'TEMPLATE',
  innerHTML: '',
  content: { firstChild: null, childNodes: [], replaceWith() { /* lit svg branch */ } },
  setAttribute() { /* attribute part */ },
  removeAttribute() { /* attribute part */ },
  getAttribute: () => null,
  getAttributeNames: () => [],
  hasAttributes: () => false,
  append() { /* text part */ },
  textContent: '',
});
doc.createComment = () => ({});
doc.createTextNode = (text: string) => ({ data: text });

class TestHTMLElement {}
(globalThis as { HTMLElement?: unknown }).HTMLElement = TestHTMLElement;
(globalThis as { customElements?: unknown }).customElements = { define() { /* aside registers on import */ }, get: () => undefined };
(globalThis as { window?: unknown }).window = globalThis;

const asideModule = import('/_102033_/l2/shared/layout/aura-aside.js');

const here = dirname(fileURLToPath(import.meta.url));
const asideSource = readFileSync(join(here, 'aura-aside.ts'), 'utf8');
const shellSource = readFileSync(join(here, '../shell.ts'), 'utf8');

const SITE = 102047;

function draftText(pages: string[]): string {
  return JSON.stringify({
    projects: {
      [String(SITE)]: {
        modules: [{
          moduleId: 'orders',
          basePath: '/orders',
          navigation: pages.map((page) => ({ id: page, label: page, href: `/orders/${page}` })),
        }],
      },
    },
  });
}

function install(body: string): { errors: unknown[][]; setBody: (next: string) => void; restore: () => void } {
  const host = globalThis as { mls?: { stor?: unknown } };
  const previous = host.mls;
  const errors: unknown[][] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  let text = body;
  host.mls = {
    ...(previous ?? {}),
    stor: {
      getKeyToFiles: (project: number, level: number, shortName: string, folder: string, extension: string) =>
        `${project}|${level}|${shortName}|${folder}|${extension}`,
      files: {
        [`${SITE}|5|config||.json`]: {
          project: SITE,
          status: 'nochange',
          inLocalStorage: false,
          getContent: async () => text,
        },
      },
    },
  };
  return {
    errors,
    setBody(next: string) { text = next; },
    restore() {
      console.error = origError;
      if (previous === undefined) delete host.mls;
      else host.mls = previous;
    },
  };
}

const release = [{ id: 'old', label: 'Old', href: '/orders/old' }];
const boot = { projectId: String(SITE), moduleId: 'orders', navigation: release };

test('st39: entrar no Studio mostra o item novo do config do rascunho', async () => {
  const { readAsideNavigation } = await asideModule;
  const env = install(draftText(['old', 'new-page']));
  try {
    const found = await readAsideNavigation(true, boot);
    assert.equal(found.source, 'draft');
    assert.deepEqual(found.items.map((item) => item.href), ['/orders/old', '/orders/new-page']);
    assert.equal(env.errors.length, 0);
  } finally {
    env.restore();
  }
});

test('st39: sair do Studio volta ao menu da release', async () => {
  const { readAsideNavigation } = await asideModule;
  const env = install(draftText(['old', 'new-page']));
  try {
    const found = await readAsideNavigation(false, boot);
    assert.equal(found.source, 'release');
    assert.deepEqual(found.items.map((item) => item.href), ['/orders/old']);
    assert.equal(env.errors.length, 0);
  } finally {
    env.restore();
  }
});

test('st39: depois do envio do config o menu relê o rascunho', async () => {
  const { readAsideNavigation } = await asideModule;
  const env = install(draftText(['old']));
  try {
    const before = await readAsideNavigation(true, boot);
    assert.deepEqual(before.items.map((item) => item.href), ['/orders/old']);
    env.setBody(draftText(['old', 'sent-page']));
    const after = await readAsideNavigation(true, boot);
    assert.equal(after.source, 'draft');
    assert.deepEqual(after.items.map((item) => item.href), ['/orders/old', '/orders/sent-page']);
    assert.equal(env.errors.length, 0);
  } finally {
    env.restore();
  }
});

test('st39: config inválido mantém a release e avisa', async () => {
  const { readAsideNavigation } = await asideModule;
  const env = install('{');
  try {
    const found = await readAsideNavigation(true, boot);
    assert.equal(found.source, 'release');
    assert.deepEqual(found.items.map((item) => item.href), ['/orders/old']);
    assert.equal(JSON.stringify(env.errors).includes('not valid JSON'), true);
  } finally {
    env.restore();
  }
});

test('st39: o aside pinta o rascunho e o shell relê na entrada, na saída e no envio', () => {
  assert.match(asideSource, /draftNavigation \?\? release/);
  assert.match(asideSource, /readAsideNavigation\(studioOn, liveBoot\(this\.bootConfig\)\)/);
  assert.match(shellSource, /refreshAsideNavigation\('mode'\)/);
  assert.match(shellSource, /refreshAsideNavigation\('send'\)/);
  const leave = shellSource.indexOf("refreshAsideNavigation('mode')");
  const enter = shellSource.indexOf('After initStudio');
  assert.ok(leave > 0 && enter > leave, 'leaving Studio restores the menu before the draft is read again on entry');
});

test('st39: o projeto do site é o clientProjectId, não o projectId do módulo de lib', async () => {
  const { asideProjectId } = await asideModule;
  assert.equal(asideProjectId({ projectId: '102033', clientProjectId: '102047' }), 102047);
  assert.equal(asideProjectId({ projectId: '102047' }), 102047);
  assert.equal(asideProjectId({}), null);
  assert.equal(asideProjectId(undefined), null);
});

const menu = [
  { id: 'all', label: 'All', href: '/orders/all' },
  { id: 'mgr', label: 'Mgr', href: '/orders/mgr', actors: ['projectManager'] },
  { id: 'field', label: 'Field', href: '/orders/field', actors: ['fieldWorker'] },
];

function templateText(node: unknown, found: string[]): void {
  if (typeof node === 'string') {
    found.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const entry of node) templateText(entry, found);
    return;
  }
  if (node && typeof node === 'object' && 'values' in node) {
    templateText((node as { values: unknown }).values, found);
  }
}

/** The test document is not a DOM. Skip Lit's commit so the session probe is what we measure. */
function holdUpdates<T extends object>(Ctor: new () => T): T {
  const proto = Ctor.prototype as { requestUpdate: (...args: unknown[]) => unknown };
  const original = proto.requestUpdate;
  proto.requestUpdate = () => undefined;
  try {
    const element = new Ctor();
    (element as { requestUpdate: () => void }).requestUpdate = () => { /* no commit */ };
    return element;
  } finally {
    proto.requestUpdate = original;
  }
}

function withPage<T>(run: (errors: unknown[][]) => Promise<T>): Promise<T> {
  const host = globalThis as {
    addEventListener?: (...args: unknown[]) => void;
    removeEventListener?: (...args: unknown[]) => void;
    location?: { pathname: string };
  };
  const doc = globalThis.document as { head?: { appendChild: (node: unknown) => void } };
  const previous = {
    fetch: globalThis.fetch,
    error: console.error,
    add: host.addEventListener,
    remove: host.removeEventListener,
    location: host.location,
    head: doc.head,
  };
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith('[aura-aside]')) errors.push(args);
  };
  host.addEventListener = () => { /* popstate */ };
  host.removeEventListener = () => { /* popstate */ };
  host.location = { pathname: '/orders/all' };
  doc.head = { appendChild() { /* header band style */ } };
  return run(errors).finally(() => {
    globalThis.fetch = previous.fetch;
    console.error = previous.error;
    host.addEventListener = previous.add;
    host.removeEventListener = previous.remove;
    host.location = previous.location;
    doc.head = previous.head;
  });
}

describe('st43: o menu lateral usa a sessão já lida', { concurrency: false }, () => {
  test('aside e header na mesma página pedem /session/info uma vez e as authorities filtram', async () => {
    const { AuraAside } = await asideModule;
    const { AuraHeader } = await import('/_102033_/l2/shared/layout/aura-header.js');
    const { resetSessionUserCache } = await import('/_102033_/l2/shared/sessionUser.js');
    resetSessionUserCache();
    const calls: string[] = [];
    await withPage(async (errors) => {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return new Response(JSON.stringify({
          authenticated: true,
          allAuthorities: ['orders:projectManager', 3, ''],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch;
      const aside = holdUpdates(AuraAside);
      aside.bootConfig = {
        moduleId: 'orders',
        basePath: '/orders',
        navigation: menu,
        layout: { asideMode: { mobile: 'inline' } },
      } as typeof aside.bootConfig;
      const header = holdUpdates(AuraHeader);
      header.regionProps = { actions: ['user'] };
      header.bootConfig = aside.bootConfig;
      aside.connectedCallback();
      header.connectedCallback();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepEqual(calls, ['/session/info']);
      assert.deepEqual(aside.authorities, ['orders:projectManager']);
      const labels: string[] = [];
      templateText(aside.render(), labels);
      assert.equal(labels.includes('All'), true);
      assert.equal(labels.includes('Mgr'), true);
      assert.equal(labels.includes('Field'), false);
      assert.deepEqual(errors, []);
    });
  });

  test('falha da sessão deixa o menu sem filtro e avisa', async () => {
    const { AuraAside } = await asideModule;
    const { resetSessionUserCache } = await import('/_102033_/l2/shared/sessionUser.js');
    resetSessionUserCache();
    await withPage(async (errors) => {
      globalThis.fetch = (async () => {
        throw new Error('network down');
      }) as typeof fetch;
      const aside = holdUpdates(AuraAside);
      aside.bootConfig = {
        moduleId: 'orders',
        basePath: '/orders',
        navigation: menu,
        layout: { asideMode: { mobile: 'inline' } },
      } as typeof aside.bootConfig;
      aside.connectedCallback();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepEqual(aside.authorities, []);
      const labels: string[] = [];
      templateText(aside.render(), labels);
      assert.equal(labels.includes('All'), true);
      assert.equal(labels.includes('Mgr'), true);
      assert.equal(labels.includes('Field'), true);
      assert.equal(errors.some((args) => args[0] === '[aura-aside] session read failed; menu stays unfiltered' && args[1] instanceof Error), true);
    });
  });
});
