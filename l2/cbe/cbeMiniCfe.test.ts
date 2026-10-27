/// <mls fileReference="_102033_/l2/cbe/cbeMiniCfe.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadMlsScript } from '/_102033_/l2/cbe/cbeMiniCfeLoad.js';

type ScriptEl = {
  id: string;
  type: string;
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
};

function installScriptHost(latest: { libs?: string } | undefined) {
  const byId = new Map<string, ScriptEl>();
  const appended: ScriptEl[] = [];
  const document = {
    getElementById: (id: string) => byId.get(id) ?? null,
    createElement: (_tag: string): ScriptEl => ({
      id: '',
      type: '',
      src: '',
      onload: null,
      onerror: null,
    }),
    head: {
      appendChild(el: ScriptEl) {
        byId.set(el.id, el);
        appended.push(el);
        return el;
      },
    },
  };
  const win = { latest, mls: undefined as unknown, document };
  const previous = {
    window: (globalThis as { window?: unknown }).window,
    document: (globalThis as { document?: unknown }).document,
  };
  (globalThis as { window: unknown }).window = win;
  (globalThis as { document: unknown }).document = document;
  return {
    appended,
    win,
    restore() {
      if (previous.window === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window: unknown }).window = previous.window;
      if (previous.document === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document: unknown }).document = previous.document;
    },
  };
}

test('loadMlsScript sem window.latest emite warn e ainda carrega o pin', async () => {
  const host = installScriptHost(undefined);
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    const pending = loadMlsScript();
    assert.match(warnings.join('\n'), /window\.latest/);
    assert.match(warnings.join('\n'), /pin/);
    assert.equal(host.appended.length, 1);
    assert.equal(host.appended[0].src, '/libs/mls.js');
    assert.equal(host.appended[0].id, 'cbe-mls-lib');
    host.win.mls = { ready: true };
    host.appended[0].onload?.();
    await pending;
  } finally {
    console.warn = origWarn;
    host.restore();
  }
});

test('boot registers the vm driver right after the lib loads and before the login, and not the git drivers', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'cbeMiniCfe.ts'), 'utf8');
  const lib = src.indexOf('await loadMlsScript()');
  const vm = src.indexOf('await registerVmDriver()');
  const login = src.indexOf('await mls.api.cbeLogin()');
  assert.ok(lib >= 0 && vm > lib, 'registerVmDriver must run after the mls lib is loaded (DriverVm extends a lib class)');
  assert.ok(login > vm, 'registerVmDriver must run before the login, so any read can find the driver');
  assert.equal(src.includes('registerDrivers'), false, 'the git drivers stay on demand: boot must not call registerDrivers');
  assert.equal(/driverGit(hub|lab)/iu.test(src), false, 'boot must not import the git drivers');
});
