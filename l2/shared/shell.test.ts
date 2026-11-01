/// <mls fileReference="_102033_/l2/shared/shell.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

function loadTabMark() {
  const shell = readFileSync(new URL('./shell.ts', import.meta.url), 'utf8');
  const start = shell.indexOf('export function contentTabPinNumber');
  const end = shell.indexOf('function traceLazy');
  const chunk = shell.slice(start, end)
    .replace(/^export /gmu, '')
    .replace(/: Record<string, \{ unpin: string; close: string \}>/gu, '')
    .replace(/: 'unpin' \| 'close'/gu, '')
    .replace(/: number \| undefined/gu, '')
    .replace(/: string/gu, '');
  const load = new Function(`${chunk}\nreturn { contentTabPinNumber, contentTabLabel, contentTabMarkAction, contentTabMarkTitle };`);
  return { shell, ...(load() as {
    contentTabPinNumber: (tabId: string) => number | undefined;
    contentTabLabel: (title: string, tabId: string) => string;
    contentTabMarkAction: (tabId: string) => 'unpin' | 'close';
    contentTabMarkTitle: (tabId: string, language: string) => string;
  }) };
}

describe('rt161 s2: pinned tab shows its number and a pin mark', () => {
  test('a pinned tab renders the pin and the number; the first click unpins and the next closes', () => {
    const { contentTabLabel, contentTabMarkAction, contentTabMarkTitle, contentTabPinNumber } = loadTabMark();
    assert.equal(contentTabPinNumber('mod-/tarefas#1'), 1);
    assert.equal(contentTabLabel('Tarefas', 'mod-/tarefas#1'), 'Tarefas #1');
    assert.equal(contentTabLabel('Tarefas', 'mod-/tarefas#2'), 'Tarefas #2');
    assert.equal(contentTabLabel('Tarefas', 'mod-/tarefas'), 'Tarefas');
    assert.equal(contentTabMarkTitle('mod-/tarefas#1', 'pt'), 'Desafixar');
    assert.equal(contentTabMarkTitle('mod-/tarefas#1', 'en'), 'Unpin');
    assert.equal(contentTabMarkTitle('mod-/tarefas', 'pt-BR'), 'Fechar');

    let id = 'mod-/tarefas#1';
    let open = true;
    const click = () => {
      if (contentTabMarkAction(id) === 'unpin') {
        id = 'mod-/tarefas';
        return;
      }
      open = false;
    };
    click();
    assert.equal(open, true);
    assert.equal(contentTabLabel('Tarefas', id), 'Tarefas');
    click();
    assert.equal(open, false);
  });

  test('the bar wires the mark, activation mounts, and the nav3 menu still toggles the pin', () => {
    const { shell } = loadTabMark();
    assert.match(shell, /contentTabLabel\(tab\.title, tab\.id\)/u);
    assert.match(shell, /data-pinned=\$\{String\(pinned\)\}/u);
    assert.match(shell, /fa-solid fa-thumbtack/u);
    assert.match(shell, /aria-label=\$\{contentTabMarkTitle\(id, language\)\}/u);
    assert.equal(shell.includes('📌'), false);
    assert.match(shell, /if \(pinned\) this\.toggleContentTabPin\(id\)/u);
    assert.match(shell, /else this\.closeContentTab\(id\)/u);
    assert.match(shell, /closeContentTab\('app'\)/u);
    assert.match(shell, /togglePin: this\.toggleContentTabPin/u);
    assert.match(shell, /isPinned:/u);
    const activate = shell.slice(shell.indexOf('private readonly activateContentTab'), shell.indexOf('private scheduleRegionMsizeSync'));
    assert.match(activate, /mountModuleTabOnActivate\(id\)/u);
  });
});
