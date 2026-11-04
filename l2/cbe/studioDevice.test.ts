/// <mls fileReference="_102033_/l2/cbe/studioDevice.test.ts" enhancement="_blank" />
// The studio's Desktop | Mobile pick: remembered on its own key, and only ever a choice of PAGE
// variant — without a pick the width decides, in both directions.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STUDIO_DEVICE_KEY,
  contentDevice,
  isStudioDevice,
  readStudioDevice,
  rememberStudioDevice,
  type IDeviceStorage,
} from '/_102033_/l2/cbe/studioDevice.js';

function fakeStorage(initial: Record<string, string> = {}): IDeviceStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

test('without a pick the width decides', () => {
  assert.equal(contentDevice(null, 'desktop'), 'desktop');
  assert.equal(contentDevice(null, 'mobile'), 'mobile');
});

test('a pick wins over the width, both ways', () => {
  assert.equal(contentDevice('mobile', 'desktop'), 'mobile');
  assert.equal(contentDevice('desktop', 'mobile'), 'desktop');
});

test('the pick is remembered on its own key', () => {
  const storage = fakeStorage();
  assert.equal(readStudioDevice(storage), null);
  rememberStudioDevice('mobile', storage);
  assert.equal(storage.data[STUDIO_DEVICE_KEY], 'mobile');
  assert.equal(readStudioDevice(storage), 'mobile');
});

test('a stored value that is not a device is no pick', () => {
  assert.equal(readStudioDevice(fakeStorage({ [STUDIO_DEVICE_KEY]: 'tablet' })), null);
  assert.equal(isStudioDevice('ios'), false);
});

test('blocked storage reads as no pick and does not throw on write', () => {
  const blocked: IDeviceStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  assert.equal(readStudioDevice(blocked), null);
  assert.doesNotThrow(() => rememberStudioDevice('desktop', blocked));
});
