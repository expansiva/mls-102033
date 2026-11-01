/// <mls fileReference="_102033_/l2/shared/shellDraftMenu.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
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
(globalThis as { HTMLElement?: unknown }).HTMLElement = class TestHTMLElement {};
(globalThis as { customElements?: unknown }).customElements = { define() { /* shell imports the aside */ }, get: () => undefined };
(globalThis as { window?: unknown }).window = globalThis;

const shellModule = import('/_102033_/l2/shared/shell.js');

const SITE = 102047;
const configFile = { project: SITE, level: 5, shortName: 'config', folder: '', extension: '.json' };
const otherFile = { project: SITE, level: 2, shortName: 'page', folder: '', extension: '.ts' };

test('st39: envio do l5/config.json com sucesso pede a releitura', async () => {
  const { attachDraftConfigSendWatch, draftConfigSendSucceeded } = await shellModule;
  const refreshed: number[] = [];
  let studioOn = true;
  let accepted = true;
  const stor = {
    setContents: async () => [{ project: SITE, result: accepted }],
  };
  const stop = attachDraftConfigSendWatch(
    stor,
    (files, results) => studioOn && draftConfigSendSucceeded(files, SITE, results),
    () => { refreshed.push(1); },
  );
  try {
    await stor.setContents([configFile], 'save config');
    assert.equal(refreshed.length, 1);
    studioOn = false;
    await stor.setContents([configFile], 'save while off');
    assert.equal(refreshed.length, 1);
    studioOn = true;
    await stor.setContents([otherFile], 'save a page');
    assert.equal(refreshed.length, 1);
    accepted = false;
    await stor.setContents([configFile], 'refused');
    assert.equal(refreshed.length, 1);
  } finally {
    stop();
  }
});

test('st39: o observador devolve o setContents original', async () => {
  const { attachDraftConfigSendWatch } = await shellModule;
  const original = async () => [{ project: SITE, result: true }];
  const stor = { setContents: original };
  const stop = attachDraftConfigSendWatch(stor, () => false, () => undefined);
  assert.notEqual(stor.setContents, original);
  stop();
  assert.equal(stor.setContents, original);
});

test('st39: mls.stor com setContents só de leitura (export da lib) não derruba a entrada no Studio', async () => {
  const { attachDraftConfigSendWatch } = await shellModule;
  const send = async () => [{ project: 102047, result: true }];
  const stor: { setContents?: typeof send } = {};
  Object.defineProperty(stor, 'setContents', { get: () => send, enumerable: true, configurable: false });
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    const stop = attachDraftConfigSendWatch(stor, () => true, () => undefined);
    stop();
  } finally {
    console.error = original;
  }
  assert.equal(stor.setContents, send, 'o original fica como estava');
  assert.equal(errors.length, 1);
  assert.match(String(errors[0][0]), /read-only/);
});
