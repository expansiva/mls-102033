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

function getterOnlyStor(send: () => Promise<readonly { project: number; result: boolean }[]>): { setContents: typeof send } {
  const stor: { setContents?: typeof send } = {};
  Object.defineProperty(stor, 'setContents', { get: () => send, enumerable: true, configurable: false });
  return stor as { setContents: typeof send };
}

test('st39: envio do l5/config.json com sucesso pede a releitura', async () => {
  const { attachCollabDraftSavedWatch, COLLAB_DRAFT_SAVED, draftSavedShouldRefresh } = await shellModule;
  const target = new EventTarget();
  const refreshed: number[] = [];
  let studioOn = true;
  const stop = attachCollabDraftSavedWatch(target, (detail) => {
    if (draftSavedShouldRefresh(detail, studioOn, SITE)) refreshed.push(1);
  });
  try {
    target.dispatchEvent(new CustomEvent(COLLAB_DRAFT_SAVED, {
      detail: { project: SITE, paths: ['l5/config.json'] },
    }));
    assert.equal(refreshed.length, 1);
    studioOn = false;
    target.dispatchEvent(new CustomEvent(COLLAB_DRAFT_SAVED, {
      detail: { project: SITE, paths: ['l5/config.json'] },
    }));
    assert.equal(refreshed.length, 1);
    studioOn = true;
    target.dispatchEvent(new CustomEvent(COLLAB_DRAFT_SAVED, {
      detail: { project: SITE, paths: ['l2/page.ts'] },
    }));
    assert.equal(refreshed.length, 1);
  } finally {
    stop();
  }
});

test('st39: o observador sai e o mls.stor de só-leitura da lib fica intacto', async () => {
  const { attachCollabDraftSavedWatch, COLLAB_DRAFT_SAVED } = await shellModule;
  const send = async () => [{ project: SITE, result: true }];
  const stor = getterOnlyStor(send);
  const target = new EventTarget();
  const seen: number[] = [];
  const stop = attachCollabDraftSavedWatch(target, () => { seen.push(1); });
  target.dispatchEvent(new CustomEvent(COLLAB_DRAFT_SAVED, {
    detail: { project: SITE, paths: ['l5/config.json'] },
  }));
  assert.equal(seen.length, 1);
  stop();
  target.dispatchEvent(new CustomEvent(COLLAB_DRAFT_SAVED, {
    detail: { project: SITE, paths: ['l5/config.json'] },
  }));
  assert.equal(seen.length, 1);
  assert.equal(stor.setContents, send);
});

test('st39: mls.stor com setContents só de leitura (export da lib) não derruba a escuta', async () => {
  const { attachCollabDraftSavedWatch, COLLAB_DRAFT_SAVED, draftSavedShouldRefresh } = await shellModule;
  const send = async () => [{ project: SITE, result: true }];
  const stor = getterOnlyStor(send);
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  const target = new EventTarget();
  const refreshed: number[] = [];
  try {
    const stop = attachCollabDraftSavedWatch(target, (detail) => {
      if (draftSavedShouldRefresh(detail, true, SITE)) refreshed.push(1);
    });
    target.dispatchEvent(new CustomEvent(COLLAB_DRAFT_SAVED, {
      detail: { project: SITE, paths: ['l5/config.json'] },
    }));
    stop();
  } finally {
    console.error = original;
  }
  assert.equal(stor.setContents, send, 'o original fica como estava');
  assert.equal(refreshed.length, 1);
  assert.equal(errors.length, 0);
});
