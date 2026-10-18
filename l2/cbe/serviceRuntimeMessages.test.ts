/// <mls fileReference="_102033_/l2/cbe/serviceRuntimeMessages.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { moveConnectedRegion } from '/_102033_/l2/shared/connectedRegionMove.js';

// Importing ServiceRuntimeMessages evaluates Lit field decorators, which the l2 runner rejects.
// The body below is the one in serviceRuntimeMessages.ts, called against a stand-in host.
// Dynamic imports are redirected so the self-hosted branch does not load the messages bundle.
function loadEnsureMessages(moves: { count: number }, localDeps: Deps = deps): (this: unknown) => Promise<void> {
  const source = readFileSync(new URL('./serviceRuntimeMessages.ts', import.meta.url), 'utf8');
  const start = source.indexOf('private async ensureMessages(): Promise<void> {');
  const end = source.indexOf('attributeChangedCallback', start);
  const chunk = source.slice(start, end);
  const body = chunk.slice(chunk.indexOf('{') + 1, chunk.lastIndexOf('}'))
    .replace(' as HTMLElement & { activeTab?: string }', '')
    .replace(
      "await import('/_102033_/l2/cbe/runtimeMessagesEnvironment.js')",
      'await deps.loadEnvironment()',
    )
    .replace(
      "await import('/_102025_/l2/collabMessages.js')",
      'await deps.loadMessages()',
    );
  const trackingMove = (destination: ParentNode, node: Node) => {
    moves.count += 1;
    moveConnectedRegion(destination, node);
  };
  return new Function(
    'moveConnectedRegion',
    'deps',
    `return async function ensureMessages() {${body}}`,
  )(trackingMove, localDeps) as (this: unknown) => Promise<void>;
}

type Deps = {
  loadEnvironment: () => Promise<{ applyRuntimeMessagesEnvironment: () => void }>;
  loadMessages: () => Promise<void>;
};

const deps: Deps = {
  async loadEnvironment() {
    return { applyRuntimeMessagesEnvironment() { /* replaced per test */ } };
  },
  async loadMessages() { /* replaced per test */ },
};

type FakeNode = {
  nodeType: number;
  ownerDocument: object | null;
  parentNode: FakeNode | null;
  isConnected: boolean;
  tagName: string;
  children: FakeNode[];
  appendCalls: FakeNode[];
  moveBeforeCalls: FakeNode[];
  moveBefore?: (node: FakeNode, child: FakeNode | null) => void;
  appendChild: (node: FakeNode) => FakeNode;
};

function makeNode(ownerDocument: object, connected: boolean, tagName = 'DIV'): FakeNode {
  const node: FakeNode = {
    nodeType: 1,
    ownerDocument,
    parentNode: null,
    isConnected: connected,
    tagName,
    children: [],
    appendCalls: [],
    moveBeforeCalls: [],
    appendChild(child) {
      node.appendCalls.push(child);
      if (child.parentNode) {
        child.parentNode.children = child.parentNode.children.filter((item) => item !== child);
      }
      child.parentNode = node;
      child.ownerDocument = node.ownerDocument;
      child.isConnected = node.isConnected;
      node.children.push(child);
      return child;
    },
  };
  return node;
}

function withMoveBefore(node: FakeNode): FakeNode {
  node.moveBefore = (child) => {
    node.moveBeforeCalls.push(child);
    node.appendChild(child);
  };
  return node;
}

type Host = FakeNode & {
  ensuring: boolean;
  tabNames: string[];
  initialTabIndex: () => number;
  applyInnerHeight: () => void;
  setMessagesTab: (index: number) => void;
  saveLastTab: (name: string) => void;
  querySelector: (selector: string) => FakeNode | null;
};

function makeHost(ownerDocument: object, connected: boolean, move: boolean): Host {
  const node = makeNode(ownerDocument, connected);
  if (move) withMoveBefore(node);
  return Object.assign(node, {
    ensuring: false,
    tabNames: ['CRM', 'CONNECT', 'MOMENTS', 'APPS'],
    initialTabIndex: () => 3,
    applyInnerHeight() { /* recorded by the test when replaced */ },
    setMessagesTab(_index: number) { /* recorded by the test when replaced */ },
    saveLastTab(_name: string) { /* recorded by the test when replaced */ },
    querySelector: (_selector: string) => null as FakeNode | null,
  });
}

test('ensureMessages adopts the existing aside once and keeps height, tab, and the lock', async () => {
  const moves = { count: 0 };
  const opened: string[] = [];
  const ensureMessages = loadEnsureMessages(moves, {
    async loadEnvironment() { opened.push('env'); return { applyRuntimeMessagesEnvironment() {} }; },
    async loadMessages() { opened.push('module'); },
  });
  const owner = {};
  const aside = makeNode(owner, true, 'CAFE-FLOW-MESSAGES-ASIDE-102051');
  const previousParent = makeNode(owner, true);
  previousParent.appendChild(aside);
  const host = makeHost(owner, true, true);
  const steps: string[] = [];
  host.applyInnerHeight = () => { steps.push('height'); };
  host.setMessagesTab = (index: number) => { steps.push(`tab:${index}`); };
  const previousQuery = document.querySelector;
  document.querySelector = ((selector: string) => (
    selector === '[data-region-host="aside"] > *' ? aside : null
  )) as typeof document.querySelector;
  try {
    await ensureMessages.call(host);
  } finally {
    document.querySelector = previousQuery;
  }

  assert.equal(moves.count, 1);
  assert.deepEqual(host.moveBeforeCalls, [aside]);
  assert.equal(aside.parentNode, host);
  assert.deepEqual(steps, ['height', 'tab:3']);
  assert.equal(host.ensuring, false);
  assert.deepEqual(opened, []);
});

test('ensureMessages leaves an aside that is already in the host', async () => {
  const moves = { count: 0 };
  const ensureMessages = loadEnsureMessages(moves);
  const owner = {};
  const host = makeHost(owner, true, true);
  const aside = makeNode(owner, true, 'PROJECT-MESSAGES-ASIDE');
  host.appendChild(aside);
  host.moveBeforeCalls = [];
  host.appendCalls = [];
  const steps: string[] = [];
  host.applyInnerHeight = () => { steps.push('height'); };
  host.setMessagesTab = (index: number) => { steps.push(`tab:${index}`); };
  const previousQuery = document.querySelector;
  document.querySelector = ((selector: string) => (
    selector === '[data-region-host="aside"] > *' ? aside : null
  )) as typeof document.querySelector;
  try {
    await ensureMessages.call(host);
  } finally {
    document.querySelector = previousQuery;
  }

  assert.equal(moves.count, 1);
  assert.deepEqual(host.moveBeforeCalls, []);
  assert.deepEqual(host.appendCalls, []);
  assert.equal(aside.parentNode, host);
  assert.deepEqual(steps, ['height', 'tab:3']);
});

test('ensureMessages appends the existing aside when moveBefore is absent', async () => {
  const moves = { count: 0 };
  const ensureMessages = loadEnsureMessages(moves);
  const owner = {};
  const aside = makeNode(owner, true, 'PROJECT-MESSAGES-ASIDE');
  makeNode(owner, true).appendChild(aside);
  const host = makeHost(owner, true, false);
  const previousQuery = document.querySelector;
  document.querySelector = ((selector: string) => (
    selector === '[data-region-host="aside"] > *' ? aside : null
  )) as typeof document.querySelector;
  try {
    await ensureMessages.call(host);
  } finally {
    document.querySelector = previousQuery;
  }

  assert.equal(moves.count, 1);
  assert.equal(host.moveBefore, undefined);
  assert.deepEqual(host.appendCalls, [aside]);
  assert.equal(aside.parentNode, host);
});

test('ensureMessages creates one self-hosted element and does not move it', async () => {
  const moves = { count: 0 };
  const envCalls: string[] = [];
  const ensureMessages = loadEnsureMessages(moves, {
    async loadEnvironment() {
      return { applyRuntimeMessagesEnvironment() { envCalls.push('env'); } };
    },
    async loadMessages() { envCalls.push('module'); },
  });
  const owner = {};
  const host = makeHost(owner, true, true);
  const created: Array<FakeNode & { activeTab?: string }> = [];
  const saved: string[] = [];
  host.applyInnerHeight = () => { envCalls.push('height'); };
  host.saveLastTab = (name: string) => { saved.push(name); };
  host.querySelector = (selector: string) => {
    if (selector !== 'collab-messages-102025') return null;
    return host.children.find((child) => child.tagName === 'COLLAB-MESSAGES-102025') ?? null;
  };
  const holder = globalThis as { window?: { mls?: object; dispatchEvent: (event: { type: string }) => boolean }; customElements?: { get: (name: string) => unknown } };
  const previousWindow = holder.window;
  const previousCustom = holder.customElements;
  const previousQuery = document.querySelector;
  const previousCreate = document.createElement;
  const opened: string[] = [];
  holder.window = {
    mls: {},
    dispatchEvent(event) { opened.push(event.type); return true; },
  };
  holder.customElements = { get: () => function CollabMessages() { /* already defined */ } };
  document.querySelector = (() => null) as typeof document.querySelector;
  document.createElement = ((tag: string) => {
    const element = makeNode(owner, false, tag.toUpperCase()) as FakeNode & { activeTab?: string };
    created.push(element);
    return element as unknown as HTMLElement;
  }) as typeof document.createElement;
  try {
    await ensureMessages.call(host);
    await ensureMessages.call(host);
  } finally {
    document.querySelector = previousQuery;
    document.createElement = previousCreate;
    if (previousWindow === undefined) delete holder.window;
    else holder.window = previousWindow;
    if (previousCustom === undefined) delete holder.customElements;
    else holder.customElements = previousCustom;
  }
  assert.deepEqual(opened, []);

  assert.equal(created.length, 1);
  assert.equal(created[0].tagName, 'COLLAB-MESSAGES-102025');
  assert.equal(created[0].activeTab, 'APPS');
  assert.deepEqual(saved, ['APPS']);
  assert.deepEqual(envCalls, ['env', 'module', 'height']);
  assert.equal(moves.count, 0);
  assert.deepEqual(host.moveBeforeCalls, []);
  assert.equal(host.children[0], created[0]);
  assert.equal(host.ensuring, false);
});

test('the ensuring lock skips a second entry', async () => {
  const moves = { count: 0 };
  const ensureMessages = loadEnsureMessages(moves);
  const host = makeHost({}, true, false);
  host.ensuring = true;
  let queried = false;
  const previousQuery = document.querySelector;
  document.querySelector = (() => {
    queried = true;
    return null;
  }) as typeof document.querySelector;
  try {
    await ensureMessages.call(host);
  } finally {
    document.querySelector = previousQuery;
  }
  assert.equal(queried, false);
  assert.equal(moves.count, 0);
  assert.equal(host.ensuring, true);
});

type TabHost = { tabNames: string[]; loadStorageRecord(): Record<string, unknown> };

function loadInitialTabIndex(): (this: TabHost) => number {
  const source = readFileSync(new URL('./serviceRuntimeMessages.ts', import.meta.url), 'utf8');
  const chunk = source.slice(source.indexOf('private initialTabIndex(): number {'), source.indexOf('public menu:'));
  const body = chunk.slice(chunk.indexOf('{') + 1, chunk.lastIndexOf('}'));
  return new Function(body) as (this: TabHost) => number;
}

test('initialTabIndex maps a saved TASK onto APPS', () => {
  const initialTabIndex = loadInitialTabIndex();
  const tabNames = ['CRM', 'CONNECT', 'MOMENTS', 'APPS'];
  assert.equal(tabNames.indexOf('TASK'), -1);
  assert.equal(initialTabIndex.call({ tabNames, loadStorageRecord: () => ({ lastTab: 'TASK' }) }), tabNames.indexOf('APPS'));
  assert.equal(initialTabIndex.call({ tabNames, loadStorageRecord: () => ({ lastTab: 'MOMENTS' }) }), tabNames.indexOf('MOMENTS'));
});
