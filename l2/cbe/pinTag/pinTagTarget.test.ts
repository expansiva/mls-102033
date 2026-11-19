/// <mls fileReference="_102033_/l2/cbe/pinTag/pinTagTarget.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySelector,
  buildChain,
  buildSelector,
  buildTarget,
  componentName,
  readableLabel,
  resolveTarget,
  selectorSteps,
  type INodeLike,
} from '/_102033_/l2/cbe/pinTag/pinTagTarget.js';

const P = 102047;

/** A tiny element tree: enough for parent/children/shadow walks. */
class FakeEl implements INodeLike {
  parentElement: FakeEl | null = null;
  children: FakeEl[] = [];
  shadowRoot: { children: FakeEl[]; host: FakeEl } | null = null;
  textContent: string | null = null;
  private attrs: Record<string, string> = {};
  private shadowOf: { host: FakeEl } | null = null;

  constructor(public tagName: string, attrs: Record<string, string> = {}, text?: string) {
    this.tagName = tagName.toUpperCase();
    this.attrs = attrs;
    if (text !== undefined) this.textContent = text;
  }

  getAttribute(name: string): string | null { return this.attrs[name] ?? null; }

  getRootNode(): unknown {
    let node: FakeEl = this;
    while (node.parentElement) node = node.parentElement;
    return node.shadowOf ?? node;
  }

  add(...kids: FakeEl[]): this {
    for (const kid of kids) { kid.parentElement = this; this.children.push(kid); }
    return this;
  }

  attachShadow(...kids: FakeEl[]): this {
    const root = { children: kids, host: this };
    this.shadowRoot = root;
    for (const kid of kids) { kid.parentElement = null; kid.shadowOf = root; }
    return this;
  }
}

const PAGE = 'tarefas--web--desktop--page11--minhas-tarefas-102047';
const WIDGET = 'tarefas--web--shared--pendencias-agora-102047';

function tree() {
  const accept = new FakeEl('button', {}, '  Aceitar ');
  const reject = new FakeEl('button', {}, 'Recusar');
  const widget = new FakeEl(WIDGET).add(
    new FakeEl('section').add(new FakeEl('h2', {}, 'Pendências')),
    new FakeEl('section').add(new FakeEl('div').add(accept, reject)),
  );
  const shell = new FakeEl('collab-aura-shell-102033');
  const page = new FakeEl(PAGE).add(new FakeEl('header'), widget);
  const html = new FakeEl('html').add(new FakeEl('body').add(shell.add(new FakeEl('main').add(page))));
  return { html, page, widget, accept, reject };
}

test('the chain holds only project tags, from the page inward', () => {
  const { accept } = tree();
  assert.deepEqual(buildChain(accept, P), [PAGE, WIDGET]);
});

test('the selector starts at the nearest component and resolves back', () => {
  const { html, widget, accept, reject } = tree();
  const selector = buildSelector(accept, widget);
  assert.equal(selector, 'section:nth-of-type(2) > div > button:nth-of-type(1)');
  assert.equal(applySelector(widget, selector), accept);
  assert.equal(resolveTarget(html, { chain: [PAGE, WIDGET], selector: buildSelector(reject, widget) }, P), reject);
});

test('the element that is the component itself has an empty selector', () => {
  const { html, widget } = tree();
  const target = buildTarget(widget, { left: 0, top: 0, width: 100, height: 50 }, 25, 25, P, 'pt');
  if (!target) throw new Error('no target');
  assert.equal(target.selector, '');
  assert.equal(target.label, 'Pendencias agora');
  assert.equal(resolveTarget(html, target, P), widget);
});

test('a target whose element is gone resolves to null', () => {
  const { html } = tree();
  assert.equal(resolveTarget(html, { chain: [PAGE, WIDGET], selector: 'section:nth-of-type(3) > div' }, P), null);
  assert.equal(resolveTarget(html, { chain: [PAGE, 'outra--coisa-102047'], selector: '' }, P), null);
  assert.equal(resolveTarget(html, { chain: [], selector: '' }, P), null);
});

test('the same component twice: the one with the matching chain wins', () => {
  const { html, page } = tree();
  const other = new FakeEl('dialog--x-102047').add(new FakeEl(WIDGET).add(new FakeEl('p', {}, 'outro')));
  (html.children[0] as FakeEl).add(other);
  const el = resolveTarget(html, { chain: ['dialog--x-102047', WIDGET], selector: 'p' }, P);
  assert.equal(el?.textContent, 'outro');
  assert.ok(page);
});

test('shadow roots are crossed with >>>', () => {
  const button = new FakeEl('button', {}, 'Salvar');
  const widget = new FakeEl(WIDGET).attachShadow(new FakeEl('div').add(button));
  const html = new FakeEl('html').add(new FakeEl(PAGE).add(widget));
  const selector = buildSelector(button, widget);
  assert.equal(selector, '>>> div > button');
  assert.deepEqual(selectorSteps(selector), ['>>>', 'div', 'button']);
  assert.deepEqual(buildChain(button, P), [PAGE, WIDGET]);
  assert.equal(resolveTarget(html, { chain: [PAGE, WIDGET], selector }, P), button);
});

test('a click outside any project component gives no target', () => {
  const lone = new FakeEl('div');
  new FakeEl('body').add(lone);
  assert.equal(buildTarget(lone, { left: 0, top: 0, width: 10, height: 10 }, 5, 5, P), null);
});

test('offset is a clamped fraction of the element', () => {
  const { accept } = tree();
  const target = buildTarget(accept, { left: 100, top: 200, width: 80, height: 20 }, 120, 210, P);
  assert.deepEqual(target?.offset, { x: 0.25, y: 0.5 });
  const outside = buildTarget(accept, { left: 100, top: 200, width: 80, height: 20 }, 500, 0, P);
  assert.deepEqual(outside?.offset, { x: 1, y: 0 });
});

test('readable labels use the visible text, never the technical tag', () => {
  const { accept, html } = tree();
  assert.equal(readableLabel(accept, P, 'pt'), 'Botão Aceitar');
  assert.equal(readableLabel(accept, P, 'en'), 'Button Aceitar');
  assert.equal(readableLabel(new FakeEl('button', { 'aria-label': 'Fechar' }, 'x'), P, 'pt'), 'Botão Fechar');
  const empty = new FakeEl('div');
  (html.children[0].children[0].children[0].children[0] as FakeEl).add(empty);
  assert.equal(readableLabel(empty, P, 'pt'), 'Minhas tarefas');
  assert.equal(componentName(PAGE, P), 'Minhas tarefas');
  const long = new FakeEl('p', {}, 'a'.repeat(80));
  assert.equal(readableLabel(long, P).length, 40);
});
