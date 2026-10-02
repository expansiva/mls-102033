/// <mls fileReference="_102033_/l2/shared/topBandScroll.test.ts" enhancement="_blank" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTopBandState } from '/_102033_/l2/shared/topBandScroll.js';

test('descer além de 24px esconde a faixa', () => {
  const result = nextTopBandState({
    state: 'visible',
    prevScrollTop: 100,
    scrollTop: 130,
    accumulated: 0,
  });
  assert.equal(result.state, 'hidden');
});

test('descer menos de 24px mantém a faixa visível', () => {
  const result = nextTopBandState({
    state: 'visible',
    prevScrollTop: 100,
    scrollTop: 110,
    accumulated: 0,
  });
  assert.equal(result.state, 'visible');
  assert.equal(result.accumulated, 10);
});

test('subir além de 24px mostra a faixa de novo', () => {
  const result = nextTopBandState({
    state: 'hidden',
    prevScrollTop: 400,
    scrollTop: 370,
    accumulated: 0,
  });
  assert.equal(result.state, 'visible');
});

test('perto do topo a faixa fica visível mesmo descendo', () => {
  const result = nextTopBandState({
    state: 'visible',
    prevScrollTop: 10,
    scrollTop: 40,
    accumulated: 0,
  });
  assert.equal(result.state, 'visible');
  assert.equal(result.accumulated, 0);
});

test('rolagem só horizontal (scrollTop igual) não muda nada', () => {
  const result = nextTopBandState({
    state: 'visible',
    prevScrollTop: 200,
    scrollTop: 200,
    accumulated: 5,
  });
  assert.equal(result.state, 'visible');
  assert.equal(result.accumulated, 5);
});

test('acumula na mesma direção até o limiar, sem tremer com rolagem curta', () => {
  let acc = { state: 'visible' as const, accumulated: 0 };
  let prev = 100;
  for (const step of [108, 116, 120]) {
    acc = nextTopBandState({ state: acc.state, prevScrollTop: prev, scrollTop: step, accumulated: acc.accumulated });
    prev = step;
  }
  // 8 + 8 + 4 = 20px acumulados, abaixo do limiar de 24 — ainda visível.
  assert.equal(acc.state, 'visible');
  const final = nextTopBandState({ state: acc.state, prevScrollTop: prev, scrollTop: prev + 6, accumulated: acc.accumulated });
  // +6 fecha os 24px.
  assert.equal(final.state, 'hidden');
});

test('troca de direção reinicia o acúmulo', () => {
  const afterDown = nextTopBandState({ state: 'visible', prevScrollTop: 100, scrollTop: 115, accumulated: 0 });
  assert.equal(afterDown.state, 'visible');
  assert.equal(afterDown.accumulated, 15);
  const afterReversal = nextTopBandState({ state: afterDown.state, prevScrollTop: 115, scrollTop: 110, accumulated: afterDown.accumulated });
  // Reverteu: o acúmulo passa a contar só os 5px da subida, não 15-5.
  assert.equal(afterReversal.accumulated, -5);
  assert.equal(afterReversal.state, 'visible');
});
