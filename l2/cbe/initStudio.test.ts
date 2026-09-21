/// <mls fileReference="_102033_/l2/cbe/initStudio.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  registerDrivers,
  resetVmDriverRegistration,
} from '/_102033_/l2/cbe/initStudio.js';

type AddCall = { driver: unknown; provider: string };

function installDriverHost() {
  const calls: AddCall[] = [];
  const previous = {
    window: (globalThis as { window?: unknown }).window,
    mls: (globalThis as { mls?: unknown }).mls,
  };
  class DriverIOBase {}
  (globalThis as { mls: unknown }).mls = {
    istrace: false,
    stor: { others: { DriverIOBase } },
  };
  const slots = new Map<string, unknown>();
  (globalThis as { window: unknown }).window = {
    mls: {
      stor: {
        others: {
          getDriver(provider: string) {
            return slots.get(provider);
          },
          addDriver(driver: unknown, provider: string) {
            slots.set(provider, driver);
            calls.push({ driver, provider });
          },
        },
      },
    },
  };
  return {
    calls,
    slots,
    restore() {
      if (previous.window === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window: unknown }).window = previous.window;
      if (previous.mls === undefined) delete (globalThis as { mls?: unknown }).mls;
      else (globalThis as { mls: unknown }).mls = previous.mls;
    },
  };
}

test('T6: o driver da VM entra no slot vm, e o github fica para o driver real', async () => {
  resetVmDriverRegistration();
  const host = installDriverHost();
  const origInfo = console.info;
  const origWarn = console.warn;
  console.info = () => undefined;
  // Os drivers do 100554 não existem fora do browser: o import falha e é logado.
  console.warn = () => undefined;
  try {
    await registerDrivers();
    const vm = host.calls.filter((c) => c.provider === 'vm');
    assert.equal(vm.length, 1, 'o driver da VM entra uma vez, no slot vm');
    // O que não pode voltar: o DriverVm ocupando o github. Aquele slot é do driver
    // de verdade (mls-100554), e é como um projeto que declara "GitHub" o alcança.
    const github = host.calls.find((c) => c.provider === 'github');
    assert.equal(github?.driver, undefined, 'o slot github não recebe o driver da VM');
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
    host.restore();
  }
});

test('T6b: um slot já ocupado não é substituído', async () => {
  resetVmDriverRegistration();
  const host = installDriverHost();
  const origInfo = console.info;
  const origWarn = console.warn;
  console.info = () => undefined;
  console.warn = () => undefined;
  try {
    const anterior = { shortName: 'vm', project: 0, driverVersion: 'já-estava-aqui' };
    host.slots.set('vm', anterior);
    await registerDrivers();
    assert.equal(
      host.calls.some((c) => c.provider === 'vm'),
      false,
      'addDriver não pode ser chamado para um slot ocupado',
    );
    assert.equal(host.slots.get('vm'), anterior);
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
    host.restore();
  }
});

test('T7: registerDrivers is idempotent on a repeated call', async () => {
  resetVmDriverRegistration();
  const host = installDriverHost();
  const origInfo = console.info;
  const origWarn = console.warn;
  console.info = () => undefined;
  console.warn = () => undefined;
  try {
    await registerDrivers();
    const depoisDaPrimeira = host.calls.length;
    await registerDrivers();
    assert.equal(host.calls.length, depoisDaPrimeira, 'second call must not addDriver again');
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
    host.restore();
  }
});

test('T8: chamadas concorrentes esperam o MESMO registro (o bug do guard booleano)', async () => {
  resetVmDriverRegistration();
  const host = installDriverHost();
  const origInfo = console.info;
  const origWarn = console.warn;
  console.info = () => undefined;
  console.warn = () => undefined;
  try {
    // As duas portas do studio (loadProjectDefinitions e studioHeader) podem
    // disparar juntas. Com um booleano reivindicado antes dos awaits, a segunda
    // resolvia na hora e o chamador seguia com o slot ainda vazio.
    await Promise.all([registerDrivers(), registerDrivers()]);
    assert.equal(host.slots.has('vm'), true, 'ao resolver, o slot vm precisa estar preenchido');
    assert.equal(host.calls.filter((c) => c.provider === 'vm').length, 1, 'sem registro duplicado');
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
    host.restore();
  }
});

test('T9: o segundo chamador só resolve depois do registro terminar', async () => {
  resetVmDriverRegistration();
  const host = installDriverHost();
  const origInfo = console.info;
  const origWarn = console.warn;
  console.info = () => undefined;
  console.warn = () => undefined;
  try {
    const primeira = registerDrivers();
    // Sem esperar a primeira: é exatamente o que o studio faz.
    await registerDrivers();
    assert.equal(host.slots.has('vm'), true, 'o segundo await não pode resolver antes do slot existir');
    await primeira;
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
    host.restore();
  }
});
