/// <mls fileReference="_102033_/l2/shared/onboardingBootstrap.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

type Decision = 'continue' | 'redirected';

class BenchNode {
  tag: string;
  id = '';
  type = '';
  textContent = '';
  disabled = false;
  children: BenchNode[] = [];
  parent: BenchNode | null = null;
  private listeners = new Map<string, Array<() => void>>();

  constructor(tag: string) {
    this.tag = tag;
  }

  append(...nodes: BenchNode[]): void {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }

  appendChild(node: BenchNode): BenchNode {
    this.append(node);
    return node;
  }

  addEventListener(type: string, fn: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  click(): void {
    for (const fn of this.listeners.get('click') ?? []) fn();
  }

  remove(): void {
    const siblings = this.parent?.children;
    if (!siblings) return;
    const index = siblings.indexOf(this);
    if (index >= 0) siblings.splice(index, 1);
    this.parent = null;
  }

  querySelector(selector: string): BenchNode | null {
    if (selector.startsWith('#') && this.id === selector.slice(1)) return this;
    if (this.tag === selector) return this;
    for (const child of this.children) {
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
}

const body = new BenchNode('body');
const documentStub = {
  documentElement: new BenchNode('html'),
  body,
  createElement(tag: string) {
    return new BenchNode(tag);
  },
  getElementById(id: string) {
    return body.querySelector(`#${id}`);
  },
  querySelector(selector: string) {
    return body.querySelector(selector);
  },
  createTreeWalker() {
    return { nextNode: () => null, currentNode: body };
  },
};

Object.assign(globalThis, {
  document: documentStub,
  window: {
    collabBoot: undefined as { onboarding?: { entryPath: string; moduleBasePath: string } } | undefined,
    addEventListener() { /* 401 handler stays installed; this bench does not fire it */ },
    matchMedia() { return { matches: false }; },
    location: { pathname: '/app/home' },
  },
  localStorage: { getItem: () => null },
  customElements: { define() { /* shell registers collab-aura-shell while the module loads */ }, get: () => undefined },
});

let mountClientShell: (boot: unknown, loadEntry?: () => Promise<{
  prepareOnboardingEntry: (boot: unknown) => Promise<Decision>;
  retryOnboardingEntry: (boot: unknown) => Promise<Decision>;
}>) => Promise<void>;

const ready = (async () => {
  ({ mountClientShell } = await import('/_102033_/l2/shared/bootstrap.js'));
})();

const boot = {
  onboarding: { entryPath: '/inicio/inicio_pessoa', moduleBasePath: '/inicio' },
};

function shells(): BenchNode[] {
  return body.children.filter((node) => node.tag === 'collab-aura-shell');
}

function textOf(node: BenchNode): string {
  return node.textContent + node.children.map((child) => textOf(child)).join('');
}

function clearBody(): void {
  body.children.length = 0;
}

test('registry stays the first import', async () => {
  await ready;
  const source = readFileSync(new URL('./bootstrap.ts', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import .+$/gm)].map((match) => match[0]);
  assert.match(imports[0], /elementSwapRegistry\.js/);
});

test('disabled onboarding mounts once and does not load the gate', async () => {
  await ready;
  clearBody();
  let loads = 0;
  await mountClientShell(undefined, async () => {
    loads += 1;
    throw new Error('should not load');
  });
  await mountClientShell({}, async () => {
    loads += 1;
    throw new Error('should not load');
  });
  assert.equal(loads, 0);
  assert.equal(shells().length, 1);
});

test('prepare runs before a single mount', async () => {
  await ready;
  clearBody();
  const order: string[] = [];
  await mountClientShell(boot, async () => ({
    prepareOnboardingEntry: async () => {
      order.push('prepare');
      assert.equal(shells().length, 0);
      return 'continue' as Decision;
    },
    retryOnboardingEntry: async () => 'continue' as Decision,
  }));
  order.push('mounted');
  assert.deepEqual(order, ['prepare', 'mounted']);
  assert.equal(shells().length, 1);
  await mountClientShell(boot, async () => ({
    prepareOnboardingEntry: async () => 'continue' as Decision,
    retryOnboardingEntry: async () => 'continue' as Decision,
  }));
  assert.equal(shells().length, 1);
});

test('redirected does not mount the previous page', async () => {
  await ready;
  clearBody();
  await mountClientShell(boot, async () => ({
    prepareOnboardingEntry: async () => 'redirected' as Decision,
    retryOnboardingEntry: async () => 'continue' as Decision,
  }));
  assert.equal(shells().length, 0);
});

test('failure shows a retry button and mounts once after retry', async () => {
  await ready;
  clearBody();
  let prepares = 0;
  let retries = 0;
  let release: (() => void) | undefined;
  const gate = Promise.resolve({
    prepareOnboardingEntry: async () => {
      prepares += 1;
      throw new Error('mdm secret /session/info HTTP 503');
    },
    retryOnboardingEntry: () => {
      retries += 1;
      return new Promise<Decision>((resolve) => {
        release = () => resolve('continue');
      });
    },
  });
  await mountClientShell(boot, () => gate);
  const box = documentStub.getElementById('collab-onboarding-entry');
  assert.ok(box);
  assert.equal(box.querySelector('p')?.textContent, 'Could not prepare your access.');
  assert.equal(textOf(box).includes('503'), false);
  assert.equal(textOf(box).includes('secret'), false);
  const button = box.querySelector('button');
  assert.equal(button?.textContent, 'Try again');
  assert.equal(button?.disabled, false);
  button?.click();
  assert.equal(button?.disabled, true);
  await Promise.resolve();
  assert.equal(retries, 1);
  assert.equal(prepares, 1);
  assert.equal(shells().length, 0);
  release?.();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(shells().length, 1);
  assert.equal(documentStub.getElementById('collab-onboarding-entry'), null);
  assert.equal(button?.disabled, true);
});
