/// <mls fileReference="_102033_/l2/shared/connectedRegionMove.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { moveConnectedRegion } from '/_102033_/l2/shared/connectedRegionMove.js';

// The l2 runner cannot construct ServiceClientApp: importing it evaluates Lit field decorators.
// The method body below is the one in serviceClientApp.ts, called against a stand-in host.
function loadAdoptAppHost(): (this: unknown) => void {
  const source = readFileSync(new URL('../cbe/serviceClientApp.ts', import.meta.url), 'utf8');
  const start = source.indexOf('private adoptAppHost(): void {');
  const end = source.indexOf('attributeChangedCallback', start);
  const chunk = source.slice(start, end);
  const body = chunk.slice(chunk.indexOf('{') + 1, chunk.lastIndexOf('}'))
    .replace(/ as HTMLElement \| null/g, '');
  return new Function(
    'moveConnectedRegion',
    `return function adoptAppHost() {${body}}`,
  )(moveConnectedRegion) as (this: unknown) => void;
}

type FakeNode = {
  nodeType: number;
  ownerDocument: object | null;
  parentNode: FakeNode | null;
  isConnected: boolean;
  children: FakeNode[];
  appendCalls: FakeNode[];
  moveBeforeCalls: Array<{ node: FakeNode; child: FakeNode | null }>;
  moveBefore?: (node: FakeNode, child: FakeNode | null) => void;
  appendChild: (node: FakeNode) => FakeNode;
};

function makeNode(ownerDocument: object, connected: boolean): FakeNode {
  const node: FakeNode = {
    nodeType: 1,
    ownerDocument,
    parentNode: null,
    isConnected: connected,
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
  node.moveBefore = (child, before) => {
    node.moveBeforeCalls.push({ node: child, child: before });
  };
  return node;
}

test('no-op when the node is already in the destination', () => {
  const owner = {};
  const destination = withMoveBefore(makeNode(owner, true));
  const node = makeNode(owner, true);
  const child = makeNode(owner, true);
  node.children.push(child);
  node.parentNode = destination;
  destination.children.push(node);

  moveConnectedRegion(destination as unknown as ParentNode, node as unknown as Node);

  assert.equal(destination.moveBeforeCalls.length, 0);
  assert.equal(destination.appendCalls.length, 0);
  assert.equal(node.children[0], child);
});

test('connected same-document move uses moveBefore and keeps the node', () => {
  const owner = {};
  const destination = withMoveBefore(makeNode(owner, true));
  const node = makeNode(owner, true);
  const child = makeNode(owner, true);
  node.children.push(child);
  const previous = makeNode(owner, true);
  previous.appendChild(node);

  moveConnectedRegion(destination as unknown as ParentNode, node as unknown as Node);

  assert.equal(destination.moveBeforeCalls.length, 1);
  assert.equal(destination.moveBeforeCalls[0].node, node);
  assert.equal(destination.moveBeforeCalls[0].child, null);
  assert.equal(destination.appendCalls.length, 0);
  assert.equal(node.children[0], child);
  assert.equal(previous.children[0], node);
});

test('initial insertion of a disconnected node uses appendChild', () => {
  const owner = {};
  const destination = withMoveBefore(makeNode(owner, true));
  const node = makeNode(owner, false);

  moveConnectedRegion(destination as unknown as ParentNode, node as unknown as Node);

  assert.equal(destination.moveBeforeCalls.length, 0);
  assert.equal(destination.appendCalls.length, 1);
  assert.equal(destination.children[0], node);
  assert.equal(node.parentNode, destination);
});

test('a disconnected destination uses appendChild even when moveBefore exists', () => {
  const owner = {};
  const destination = withMoveBefore(makeNode(owner, false));
  const node = makeNode(owner, true);

  moveConnectedRegion(destination as unknown as ParentNode, node as unknown as Node);

  assert.equal(destination.moveBeforeCalls.length, 0);
  assert.equal(destination.children[0], node);
});

test('another document uses appendChild', () => {
  const destination = withMoveBefore(makeNode({}, true));
  const node = makeNode({}, true);
  const child = makeNode({}, true);
  node.children.push(child);

  moveConnectedRegion(destination as unknown as ParentNode, node as unknown as Node);

  assert.equal(destination.moveBeforeCalls.length, 0);
  assert.equal(destination.children[0], node);
  assert.equal(node.children[0], child);
  assert.equal(node.ownerDocument, destination.ownerDocument);
});

test('missing moveBefore uses appendChild for a connected pair', () => {
  const owner = {};
  const destination = makeNode(owner, true);
  const node = makeNode(owner, true);

  moveConnectedRegion(destination as unknown as ParentNode, node as unknown as Node);

  assert.equal(destination.appendCalls.length, 1);
  assert.equal(destination.children[0], node);
});

test('a real moveBefore or appendChild error stays visible', () => {
  const owner = {};
  const destination = makeNode(owner, true);
  destination.moveBefore = () => {
    throw new Error('move-failed');
  };
  const node = makeNode(owner, true);

  assert.throws(
    () => moveConnectedRegion(destination as unknown as ParentNode, node as unknown as Node),
    /move-failed/,
  );
});

test('adoptAppHost moves the whole content region and keeps the later steps', () => {
  const adoptAppHost = loadAdoptAppHost();
  const owner = {};
  const region = makeNode(owner, true);
  const tabBar = makeNode(owner, true);
  region.children.push(tabBar);
  const calls: string[] = [];
  const host = withMoveBefore(makeNode(owner, true));
  host.moveBefore = (node) => {
    calls.push('move');
    assert.equal(node, region);
    assert.equal(node.children[0], tabBar);
  };
  const self = {
    adoptRetriesLeft: 20,
    applyRegionHeight() { calls.push('height'); },
    publishEditState() { calls.push('publish'); },
    ...host,
    moveBefore: host.moveBefore,
  };
  const previousQuery = (document as { querySelector?: (selector: string) => unknown }).querySelector;
  (document as { querySelector: (selector: string) => unknown }).querySelector = (selector) => (
    selector === 'main[data-region="content"]' ? region : null
  );
  try {
    adoptAppHost.call(self);
  } finally {
    if (previousQuery) (document as { querySelector: typeof previousQuery }).querySelector = previousQuery;
  }

  assert.deepEqual(calls, ['move', 'height', 'publish']);
  assert.equal(region.children[0], tabBar);
});

test('adoptAppHost leaves an adopted region in place and retries a missing one', () => {
  const adopt = loadAdoptAppHost();
  const region = makeNode({}, true);
  const calls: string[] = [];
  const self = {
    adoptRetriesLeft: 2,
    applyRegionHeight() { calls.push('height'); },
    publishEditState() { calls.push('publish'); },
  };
  region.parentNode = self as unknown as FakeNode;
  (region as FakeNode & { parentElement: unknown }).parentElement = self;
  const previousQuery = (document as { querySelector?: (selector: string) => unknown }).querySelector;
  let found: unknown = region;
  (document as { querySelector: (selector: string) => unknown }).querySelector = () => found;
  const previousTimeout = globalThis.setTimeout;
  let scheduled = 0;
  globalThis.setTimeout = (() => {
    scheduled += 1;
    return 0;
  }) as unknown as typeof setTimeout;
  try {
    adopt.call(self);
    assert.deepEqual(calls, []);
    assert.equal(scheduled, 0);

    found = null;
    adopt.call(self);
    assert.equal(self.adoptRetriesLeft, 1);
    assert.equal(scheduled, 1);
  } finally {
    globalThis.setTimeout = previousTimeout;
    if (previousQuery) (document as { querySelector: typeof previousQuery }).querySelector = previousQuery;
  }
});
