/// <mls fileReference="_102033_/l2/cbe/sitesMenu.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { SITES_MENU_CHANGED, SITES_MENU_LEVELS, createSitesMenuControls } from '/_102033_/l2/cbe/sitesMenu.js';

const MENU = [{ name: 'tarefas', icon: '', project: 102047, path: '/tarefas', menu: [{ title: 'Tarefas', icon: '', url: '/tarefas', pageName: 'tarefas' }] }];

test('getMenu devolve exatamente o que o construtor do menu devolve (mesma fonte, sem cópia de lógica)', async () => {
  let calls = 0;
  const controls = createSitesMenuControls({ buildMenu: async () => { calls += 1; return MENU; } });
  assert.deepEqual(await controls.getMenu(), MENU);
  assert.deepEqual(await controls.getMenu(), MENU);
  assert.equal(calls, 2, 'sem cache: cada chamada pergunta de novo');
});

test('updateMenu dispara SitesMenuChanged nos níveis 0 a 7, com o nome exato, e não grava nada', () => {
  const fired: Array<{ levels: number[]; type: string }> = [];
  const controls = createSitesMenuControls({ fire: () => (levels, type) => { fired.push({ levels, type }); } });
  const result = controls.updateMenu();
  assert.equal(result, undefined);
  assert.deepEqual(fired, [{ levels: [0, 1, 2, 3, 4, 5, 6, 7], type: 'SitesMenuChanged' }]);
  assert.deepEqual(SITES_MENU_LEVELS, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(SITES_MENU_CHANGED, 'SitesMenuChanged');
});

test('updateMenu invalida o cache do menu ANTES de disparar (quando houver cache)', () => {
  const order: string[] = [];
  const controls = createSitesMenuControls({
    invalidate: () => { order.push('invalidate'); },
    fire: () => () => { order.push('fire'); },
  });
  controls.updateMenu();
  assert.deepEqual(order, ['invalidate', 'fire']);
});

test('updateMenu sem mls.events.fire avisa no console e não lança; um fire que rejeita é registrado, não solto', async () => {
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
  try {
    createSitesMenuControls({ fire: () => undefined }).updateMenu();
    assert.match(errors[0], /mls\.events\.fire is not available; SitesMenuChanged was not sent/u);
    createSitesMenuControls({ fire: () => async () => { throw new Error('boom'); } }).updateMenu();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.match(errors.join('\n'), /firing SitesMenuChanged failed/u);
  } finally {
    console.error = original;
  }
});

test('o fire padrão vem de globalThis.mls.events no momento da chamada (a lib carrega depois do shell)', () => {
  const holder = globalThis as { mls?: unknown };
  const previous = holder.mls;
  const fired: string[] = [];
  const controls = createSitesMenuControls();
  try {
    holder.mls = { events: { fire: (_levels: number[], type: string) => { fired.push(type); } } };
    controls.updateMenu();
    assert.deepEqual(fired, ['SitesMenuChanged']);
  } finally {
    holder.mls = previous;
  }
});

test('o shell registra getMenu e updateMenu junto dos outros controles do mls.sites, com o ??= de compatibilidade', () => {
  const shell = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'shell.ts'), 'utf8');
  assert.match(shell, /import \{ createSitesMenuControls \} from '\/_102033_\/l2\/cbe\/sitesMenu\.js';/u);
  assert.match(shell, /const menuControls = createSitesMenuControls\(\);/u);
  assert.match(shell, /\.\.\.menuControls,\n\s*\}\);/u);
  assert.match(shell, /sites\.getMenu \?\?= menuControls\.getMenu;/u);
  assert.match(shell, /sites\.updateMenu \?\?= menuControls\.updateMenu;/u);
  assert.match(shell, /getMenu\?: \(\) => Promise<unknown\[\]>;\n\s*updateMenu\?: \(\) => void;/u);
});

test('o módulo não grava menu: nenhuma escrita (mls.stor, fetch POST, localStorage) no sitesMenu.ts', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'sitesMenu.ts'), 'utf8')
    .split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.ok(!/mls\.stor|fetch\(|localStorage|writeFile|setItem/u.test(source));
});
