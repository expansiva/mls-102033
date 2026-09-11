/// <mls fileReference="_102033_/l2/cbe/initStudio.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  registerVmDriver,
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
  (globalThis as { window: unknown }).window = {
    mls: {
      stor: {
        others: {
          addDriver(driver: unknown, provider: string) {
            calls.push({ driver, provider });
          },
        },
      },
    },
  };
  return {
    calls,
    restore() {
      if (previous.window === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window: unknown }).window = previous.window;
      if (previous.mls === undefined) delete (globalThis as { mls?: unknown }).mls;
      else (globalThis as { mls: unknown }).mls = previous.mls;
    },
  };
}

test('T6: registerVmDriver adds the same instance to vm and github', async () => {
  resetVmDriverRegistration();
  const host = installDriverHost();
  const origInfo = console.info;
  console.info = () => undefined;
  try {
    await registerVmDriver();
    assert.equal(host.calls.length, 2);
    assert.equal(host.calls[0]?.provider, 'vm');
    assert.equal(host.calls[1]?.provider, 'github');
    assert.equal(host.calls[0]?.driver, host.calls[1]?.driver);
  } finally {
    console.info = origInfo;
    host.restore();
  }
});

test('T7: registerVmDriver is idempotent on a repeated call', async () => {
  resetVmDriverRegistration();
  const host = installDriverHost();
  const origInfo = console.info;
  console.info = () => undefined;
  try {
    await registerVmDriver();
    await registerVmDriver();
    assert.equal(host.calls.length, 2, 'second call must not addDriver again');
  } finally {
    console.info = origInfo;
    host.restore();
  }
});
