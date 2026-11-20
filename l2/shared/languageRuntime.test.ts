/// <mls fileReference="_102033_/l2/shared/languageRuntime.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  applyBootLanguage,
  getNextRuntimeLanguage,
  getRuntimeLanguage,
  listRuntimeLanguages,
  resolveRuntimeLanguage,
  setRuntimeLanguage,
} from '/_102033_/l2/shared/languageRuntime.js';

test('normalizes and deduplicates configured languages', () => {
  assert.deepEqual(listRuntimeLanguages(['en', 'pt-BR', 'pt_br', 'EN']), ['en', 'pt-br']);
});

test('resolves a regional document language to its configured primary language', () => {
  const languages = ['en', 'pt'];
  assert.equal(resolveRuntimeLanguage(languages, 'pt-BR'), 'pt');
  assert.equal(getRuntimeLanguage(languages, 'fr'), 'en');
});

test('cycles configured languages in declaration order', () => {
  const languages = ['en', 'pt'];
  assert.equal(getNextRuntimeLanguage(languages, 'en'), 'pt');
  assert.equal(getNextRuntimeLanguage(languages, 'pt-BR'), 'en');
  assert.equal(getNextRuntimeLanguage(['en'], 'en'), undefined);
});

test('sets the html language and requests component updates', () => {
  let updates = 0;
  const runtimeDocument = {
    documentElement: { lang: 'en' },
    querySelectorAll: () => [
      { requestUpdate: () => { updates += 1; } },
      {},
      { requestUpdate: () => { updates += 1; } },
    ],
  };

  setRuntimeLanguage('pt-BR', ['en', 'pt'], runtimeDocument);

  assert.equal(runtimeDocument.documentElement.lang, 'pt');
  assert.equal(updates, 2);
});

test('rejects a language that is not configured', () => {
  const runtimeDocument = {
    documentElement: { lang: 'en' },
    querySelectorAll: () => [],
  };

  assert.throws(
    () => setRuntimeLanguage('fr', ['en', 'pt'], runtimeDocument),
    /language not available \(valid: en, pt\)/u,
  );
});

function bootDocument(lang: string) {
  return { documentElement: { lang }, querySelectorAll: () => [] };
}

test('boot: a product with only en leaves a pt-BR document in en', () => {
  const runtimeDocument = bootDocument('pt-BR');
  assert.equal(applyBootLanguage(['en'], runtimeDocument), 'en');
  assert.equal(runtimeDocument.documentElement.lang, 'en');
});

test('boot: a product with pt and en keeps a pt-BR document in pt', () => {
  const runtimeDocument = bootDocument('pt-BR');
  assert.equal(applyBootLanguage(['pt', 'en'], runtimeDocument), 'pt');
  assert.equal(runtimeDocument.documentElement.lang, 'pt');
});

test('boot: an empty document language starts on the first configured language', () => {
  const first = bootDocument('');
  assert.equal(applyBootLanguage(['pt', 'en'], first), 'pt');
  assert.equal(first.documentElement.lang, 'pt');
  const second = bootDocument('');
  assert.equal(applyBootLanguage(['en', 'pt'], second), 'en');
  assert.equal(second.documentElement.lang, 'en');
});

test('boot: no configured language leaves the document untouched and does not throw', () => {
  const runtimeDocument = bootDocument('pt-BR');
  assert.equal(applyBootLanguage([], runtimeDocument), undefined);
  assert.equal(runtimeDocument.documentElement.lang, 'pt-BR');
});

test('the spa and pwa templates carry no lang on the html tag', () => {
  for (const template of ['spa/index.html', 'pwa/index.html']) {
    const html = readFileSync(new URL(`./${template}`, import.meta.url), 'utf8');
    const tag = html.match(/<html\b[^>]*>/iu)?.[0] ?? '';
    assert.ok(tag, `${template} has an html tag`);
    assert.doesNotMatch(tag, /\blang\s*=/iu, template);
  }
});
