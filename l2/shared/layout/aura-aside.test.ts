/// <mls fileReference="_102033_/l2/shared/layout/aura-aside.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

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
