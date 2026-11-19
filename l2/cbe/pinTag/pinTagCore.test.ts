/// <mls fileReference="_102033_/l2/cbe/pinTag/pinTagCore.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupOtherScreens,
  importPins,
  isPinTagShortcut,
  newPinId,
  parsePinList,
  pinsForScreen,
  pinStorageKey,
  readPins,
  screenFor,
  writePins,
  type IPinStorage,
  type IPinTag,
} from '/_102033_/l2/cbe/pinTag/pinTagCore.js';

function pin(overrides: Partial<IPinTag> = {}): IPinTag {
  return {
    id: 'pin_1',
    version: 1,
    kind: 'suggestion',
    text: 'o botão devia ficar no topo',
    status: 'open',
    createdAt: '2026-11-17T14:02:00.000Z',
    updatedAt: '2026-11-17T14:02:00.000Z',
    author: { id: 'u_1', label: 'Ana' },
    screen: { project: 102047, module: 'tarefas', route: '/tarefas/minhas_tarefas', href: '/tarefas/minhas_tarefas?lista=3', title: 'Minhas tarefas' },
    target: { chain: ['tarefas--web--desktop--page11--minhas-tarefas-102047'], selector: 'button', offset: { x: 0.4, y: 0.5 }, label: 'Botão Aceitar' },
    context: { viewport: '1440x900', device: 'desktop' },
    ...overrides,
  };
}

function memoryStorage(): IPinStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
  };
}

test('pins are written and read back under collab:pins:<project>', () => {
  const storage = memoryStorage();
  assert.equal(writePins(storage, 102047, [pin()]), true);
  assert.ok(storage.data.has('collab:pins:102047'));
  assert.equal(pinStorageKey(102047), 'collab:pins:102047');
  const read = readPins(storage, 102047);
  assert.equal(read.ok, true);
  assert.deepEqual(read.pins, [pin()]);
  assert.deepEqual(readPins(storage, 102033).pins, []);
});

test('invalid JSON in the storage reads as no pins, not as an error', () => {
  const storage = memoryStorage();
  storage.data.set('collab:pins:102047', '{nope');
  assert.deepEqual(readPins(storage, 102047), { pins: [], ok: true });
  storage.data.set('collab:pins:102047', JSON.stringify([{ id: 'x' }, null, pin({ id: 'ok' })]));
  assert.deepEqual(readPins(storage, 102047).pins.map((p) => p.id), ['ok']);
});

test('an unavailable storage keeps working and reports it', () => {
  const throwing: IPinStorage = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('QuotaExceeded'); },
  };
  assert.deepEqual(readPins(throwing, 102047), { pins: [], ok: false });
  assert.equal(writePins(throwing, 102047, [pin()]), false);
  assert.deepEqual(readPins(null, 102047), { pins: [], ok: false });
  assert.equal(writePins(null, 102047, []), false);
});

test('a hand-edited pin is normalized: unknown kind, offset out of range, missing status', () => {
  const [p] = parsePinList(JSON.stringify([{ ...pin(), kind: 'x', status: undefined, target: { ...pin().target, offset: { x: 7, y: 'a' } } }]));
  assert.equal(p.kind, 'suggestion');
  assert.equal(p.status, 'open');
  assert.deepEqual(p.target.offset, { x: 1, y: 0.5 });
});

test('screen filter is by route without params', () => {
  const pins = [
    pin({ id: 'a', screen: { ...pin().screen, route: '/tarefas/detalhe/:id', href: '/tarefas/detalhe/42' } }),
    pin({ id: 'b', screen: { ...pin().screen, route: '/tarefas/detalhe/:id', href: '/tarefas/detalhe/7' } }),
    pin({ id: 'c' }),
  ];
  assert.deepEqual(pinsForScreen(pins, '/tarefas/detalhe/:id').map((p) => p.id), ['a', 'b']);
  const groups = groupOtherScreens(pins, '/tarefas/detalhe/:id');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].route, '/tarefas/minhas_tarefas');
  assert.deepEqual(groups[0].pins.map((p) => p.id), ['c']);
});

test('screenFor maps a URL with params to its registered route', () => {
  const boot = {
    clientProjectId: '102047',
    moduleId: 'tarefas',
    routes: [
      { path: '/tarefas/minhas_tarefas', entrypoint: '', tag: 'x-102047', title: 'Minhas tarefas' },
      { path: '/tarefas/detalhe/:id', entrypoint: '', tag: 'y-102047', title: 'Detalhe' },
    ],
  };
  const screen = screenFor(boot, { pathname: '/tarefas/detalhe/42', search: '?a=1', hash: '' });
  assert.deepEqual(screen, {
    project: 102047,
    module: 'tarefas',
    route: '/tarefas/detalhe/:id',
    href: '/tarefas/detalhe/42?a=1',
    title: 'Detalhe',
  });
  const unknown = screenFor(boot, { pathname: '/vendas/pedidos', search: '', hash: '' }, 'Pedidos');
  assert.equal(unknown.route, '/vendas/pedidos');
  assert.equal(unknown.module, 'vendas');
  assert.equal(unknown.title, 'Pedidos');
});

test('import joins by id without duplicating', () => {
  const existing = [pin({ id: 'a', text: 'local' })];
  const incoming = JSON.stringify([pin({ id: 'a', text: 'remote' }), pin({ id: 'b' }), pin({ id: 'b' })]);
  const result = importPins(existing, incoming);
  assert.equal(result.ok, true);
  assert.equal(result.added, 1);
  assert.deepEqual(result.pins.map((p) => [p.id, p.text]), [['a', 'local'], ['b', pin().text]]);
});

test('import of a non-list keeps the pins and reports it', () => {
  const existing = [pin()];
  assert.deepEqual(importPins(existing, '{"a":1}'), { pins: existing, added: 0, ok: false });
  assert.deepEqual(importPins(existing, 'nope'), { pins: existing, added: 0, ok: false });
});

test('ids look like pin_<hex>', () => {
  assert.match(newPinId(), /^pin_[0-9a-f]{8}$/u);
});

test('only plain Ctrl+Shift+P toggles the mode', () => {
  const base = { ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, key: 'P' };
  assert.equal(isPinTagShortcut(base), true);
  assert.equal(isPinTagShortcut({ ...base, key: 'p' }), true);
  assert.equal(isPinTagShortcut({ ...base, altKey: true }), false);
  assert.equal(isPinTagShortcut({ ...base, shiftKey: false }), false);
  assert.equal(isPinTagShortcut({ ...base, key: 'B' }), false);
});
