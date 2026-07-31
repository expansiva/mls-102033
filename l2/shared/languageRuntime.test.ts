/// <mls fileReference="_102033_/l2/shared/languageRuntime.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
