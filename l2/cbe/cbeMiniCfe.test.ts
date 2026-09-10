/// <mls fileReference="_102033_/l2/cbe/cbeMiniCfe.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
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
