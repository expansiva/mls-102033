/// <mls fileReference="_102033_/l2/cbe/initStudio.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDraftFiles, rememberDraftMain } from '/_102033_/l2/cbe/studioDraftFiles.js';
import { publishDraftL2 } from '/_102033_/l2/cbe/studioDraftL2.js';
import {
  enterStudioDraft,
  handleCollabModeMessage,
  listChangedDraftTs,
  loadProjectDefinitions,
  registerDrivers,
  registerVmDriver,
  resetProjectDefinitions,
  resetVmDriverRegistration,
} from '/_102033_/l2/cbe/initStudio.js';
import { environment, setEnvironment } from '/_102036_/l2/environmentContract.js';
import { ensureRuntimeMessagesEnvironment } from '/_102033_/l2/cbe/runtimeMessagesEnvironment.js';

type AddCall = { driver: unknown; provider: string };

function installDriverHost(opts?: { sourcesFromGitHub?: boolean; throwingStorage?: boolean }) {
  const calls: AddCall[] = [];
  const previous = {
    window: (globalThis as { window?: unknown }).window,
    mls: (globalThis as { mls?: unknown }).mls,
    localStorage: (globalThis as { localStorage?: unknown }).localStorage,
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
  const storage = new Map<string, string>();
  if (opts?.sourcesFromGitHub) storage.set('collabStudioSourcesFromGitHub', '1');
  (globalThis as { localStorage: unknown }).localStorage = opts?.throwingStorage
    ? {
      getItem() { throw new Error('localStorage blocked'); },
      setItem() { throw new Error('localStorage blocked'); },
    }
    : {
      getItem(key: string) { return storage.get(key) ?? null; },
      setItem(key: string, value: string) { storage.set(key, value); },
    };
  return {
    calls,
    slots,
    restore() {
      if (previous.window === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window: unknown }).window = previous.window;
      if (previous.mls === undefined) delete (globalThis as { mls?: unknown }).mls;
      else (globalThis as { mls: unknown }).mls = previous.mls;
      if (previous.localStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
      else (globalThis as { localStorage: unknown }).localStorage = previous.localStorage;
    },
  };
}

test('T6v: registerVmDriver preenche só vm; registerDrivers depois não troca o vm', async () => {
  resetVmDriverRegistration();
  const host = installDriverHost();
  const origInfo = console.info;
  const origWarn = console.warn;
  console.info = () => undefined;
  console.warn = () => undefined;
  try {
    await registerVmDriver();
    assert.equal(host.calls.length, 1, 'só o slot vm');
    assert.equal(host.calls[0]?.provider, 'vm');
    const vm = host.slots.get('vm');
    await registerVmDriver();
    assert.equal(host.calls.length, 1, 'chamada repetida não duplica');
    await registerDrivers();
    assert.equal(host.slots.get('vm'), vm, 'registerDrivers não troca o vm');
    assert.equal(host.calls.filter((c) => c.provider === 'vm').length, 1);
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
    host.restore();
  }
});

test('T6: com a opção ligada, o github fica para o driver real', async () => {
  resetVmDriverRegistration();
  const host = installDriverHost({ sourcesFromGitHub: true });
  const origInfo = console.info;
  const origWarn = console.warn;
  console.info = () => undefined;
  // Os drivers do 100554 não existem fora do browser: o import falha e é logado.
  console.warn = () => undefined;
  try {
    await registerDrivers();
    const vm = host.calls.filter((c) => c.provider === 'vm');
    assert.equal(vm.length, 1, 'o driver da VM entra uma vez, no slot vm');
    const github = host.calls.find((c) => c.provider === 'github');
    const gitlab = host.calls.find((c) => c.provider === 'gitlab');
    assert.equal((github?.driver as { shortName?: string } | undefined)?.shortName, 'github');
    assert.equal((gitlab?.driver as { shortName?: string } | undefined)?.shortName, 'gitlab');
    assert.notEqual((github?.driver as object | undefined)?.constructor.name, 'DriverVm');
    assert.notEqual((github?.driver as object | undefined)?.constructor.name, 'GitSlotVmDriver');
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
    host.restore();
  }
});

test('st38: sem chave, github e gitlab recebem o DriverVm', async () => {
  resetVmDriverRegistration();
  const host = installDriverHost();
  const origInfo = console.info;
  const origWarn = console.warn;
  console.info = () => undefined;
  console.warn = () => undefined;
  try {
    await registerDrivers();
    const { DriverVm } = await import('/_102033_/l2/cbe/driverVm.js');
    const github = host.slots.get('github');
    const gitlab = host.slots.get('gitlab');
    const vm = host.slots.get('vm');
    assert.equal(github instanceof DriverVm, true);
    assert.equal(gitlab instanceof DriverVm, true);
    assert.equal(vm instanceof DriverVm, true);
    assert.equal((github as object).constructor.name, 'GitSlotVmDriver');
    assert.equal((vm as object).constructor.name, 'DriverVm');
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
    host.restore();
  }
});

test('st38: localStorage que lança deixa os slots git na VM e loga o erro', async () => {
  resetVmDriverRegistration();
  const host = installDriverHost({ throwingStorage: true });
  const origInfo = console.info;
  const origWarn = console.warn;
  const origError = console.error;
  const errors: unknown[][] = [];
  console.info = () => undefined;
  console.warn = () => undefined;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    await registerDrivers();
    const { DriverVm } = await import('/_102033_/l2/cbe/driverVm.js');
    assert.equal(host.slots.get('github') instanceof DriverVm, true);
    assert.equal(host.slots.get('gitlab') instanceof DriverVm, true);
    assert.equal(JSON.stringify(errors).includes('collabStudioSourcesFromGitHub'), true);
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
    console.error = origError;
    host.restore();
  }
});

test('st38: setContents no slot git recusa e o slot vm grava', async () => {
  resetVmDriverRegistration();
  const host = installDriverHost();
  const origInfo = console.info;
  const origWarn = console.warn;
  const origError = console.error;
  const previousFetch = globalThis.fetch;
  const fetchUrls: string[] = [];
  console.info = () => undefined;
  console.warn = () => undefined;
  console.error = () => undefined;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchUrls.push(String(input));
    return { ok: true, status: 200, json: async () => ({ statusCode: 200 }) } as Response;
  }) as typeof fetch;
  const deleted = {
    project: 102033,
    folder: 'cbe',
    shortName: 'x',
    extension: '.ts',
    level: 2,
    status: 'deleted',
  } as mls.stor.IFileInfo;
  try {
    await registerDrivers();
    const github = host.slots.get('github') as { setContents: (project: number, files: mls.stor.IFileInfo[], comments: string | null) => Promise<boolean> };
    const vm = host.slots.get('vm') as { setContents: (project: number, files: mls.stor.IFileInfo[], comments: string | null) => Promise<boolean> };
    await assert.rejects(
      () => github.setContents(102033, [deleted], null),
      (err: unknown) => err instanceof Error && err.message.includes('Fetch sources from GitHub'),
    );
    assert.deepEqual(fetchUrls, []);
    const wrote = await vm.setContents(102047, [deleted], null);
    assert.equal(wrote, true);
    assert.deepEqual(fetchUrls, ['/exec']);
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
    console.error = origError;
    globalThis.fetch = previousFetch;
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

test('rt146: o Studio aplica o ambiente do chat uma vez, sem criar o painel', async () => {
  resetVmDriverRegistration();
  const host = installDriverHost();
  const created: string[] = [];
  let asideTag: string | null = 'cafe-flow-messages-aside-102051';
  const previousDocument = (globalThis as { document?: unknown }).document;
  const document = {
    querySelector(selector: string) {
      if (selector !== '[data-region-host="aside"] > *' || !asideTag) return null;
      return { tagName: asideTag };
    },
    createElement(tag: string) {
      created.push(tag);
      return { style: {}, appendChild() {}, setAttribute() {} };
    },
  };
  (globalThis as { document: unknown }).document = document;
  const studioWindow = (globalThis as { window: { location?: { origin: string } } }).window;
  studioWindow.location = { origin: 'https://studio.example' };
  const origInfo = console.info;
  const origWarn = console.warn;
  console.info = () => undefined;
  console.warn = () => undefined;
  const apiUrl = () => environment.config.getApiUrl();
  try {
    await registerDrivers();
    assert.notEqual(apiUrl(), 'https://studio.example/msg');
    assert.deepEqual(created, []);

    asideTag = null;
    resetVmDriverRegistration();
    await registerDrivers();
    assert.equal(apiUrl(), 'https://studio.example/msg');
    assert.equal(created.includes('collab-messages-102025'), false);

    setEnvironment({});
    ensureRuntimeMessagesEnvironment();
    resetVmDriverRegistration();
    await registerDrivers();
    assert.notEqual(apiUrl(), 'https://studio.example/msg');
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
    setEnvironment({});
    if (previousDocument === undefined) delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document: unknown }).document = previousDocument;
    host.restore();
  }
});

test('enterStudioDraft lists the draft and publishes l2 without reload', async () => {
  const calls: string[] = [];
  const previous = (globalThis as { location?: { reload?: () => void } }).location;
  (globalThis as { location: { reload: () => void } }).location = {
    reload: () => { calls.push('reload'); },
  };
  try {
    await enterStudioDraft(102047, 'team-102047', {
      applyFiles: async () => { calls.push('apply'); },
      publishL2: async () => { calls.push('publish'); },
    });
    assert.deepEqual(calls, ['apply', 'publish']);
  } finally {
    (globalThis as { location?: { reload?: () => void } }).location = previous;
  }
});

test('enterStudioDraft reads draftDiff once; publishDraftL2 alone still reads it', async () => {
  const seen: { action?: string; names?: boolean }[] = [];
  const previousFetch = globalThis.fetch;
  const previousError = console.error;
  console.error = () => undefined;
  globalThis.fetch = async (_url: unknown, init?: { body?: unknown }) => {
    const body = JSON.parse(String(init?.body)) as { action?: string; names?: boolean };
    seen.push(body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: 'files', head: 'hhh', files: [] }),
    } as Response;
  };
  const diffCount = () => seen.filter((body) => body.action === 'draftDiff').length;
  try {
    await enterStudioDraft(102047, 'team-102047', {
      applyFiles: (project, slug, diff) => applyDraftFiles(project, slug, undefined, diff),
      publishL2: (project, slug, diff) => publishDraftL2(project, slug, undefined, diff),
      changedTs: (project, slug, diff) => listChangedDraftTs(project, slug, diff),
      applyChanged: async () => undefined,
    });
    assert.equal(diffCount(), 1);
    assert.equal(seen[0]?.names, true);
    await publishDraftL2(102047, 'team-102047');
    assert.equal(diffCount(), 2);
    assert.equal(seen[1]?.action, 'draftDiff');
    assert.equal(seen[1]?.names, true);
  } finally {
    console.error = previousError;
    globalThis.fetch = previousFetch;
  }
});

test('enter swaps each compiled ts; production collab-mode compiles the release then swaps', async () => {
  const calls: string[] = [];
  const previousWindow = (globalThis as { window?: unknown }).window;
  const origWarn = console.warn;
  console.warn = () => undefined;
  (globalThis as { window: unknown }).window = {
    mls: {
      editor: {
        getModels: () => ({
          ts: {
            model: { setValue: (text: string) => { calls.push(`set:${text}`); } },
            storFile: { project: 7 },
            compilerResults: { modelNeedCompile: false },
          },
        }),
      },
      stor: { others: { getDefaultDriver: async () => ({ getHistoryContent: async (_file: unknown, ref: string) => (ref === 'main-sha' ? 'release-text' : null) }) } },
      l2: { typescript: { compileAndPostProcess: async () => { calls.push('compile'); return true; } } },
    },
  };
  rememberDraftMain('main-sha');
  try {
    await enterStudioDraft(7, 'team-7', {
      applyFiles: async () => { calls.push('apply'); },
      publishL2: async () => { calls.push('publish'); },
      changedTs: async () => [
        { project: 7, shortName: 'page11', folder: 'web/page11', level: 2 },
        { project: 7, shortName: 'other', folder: 'web/page12', level: 2 },
      ],
      applyChanged: async (ref) => { calls.push(`swap:${ref.shortName}`); },
    });
    assert.deepEqual(calls, ['apply', 'publish', 'swap:page11', 'swap:other']);
    calls.length = 0;
    await handleCollabModeMessage({ type: 'collab-mode', mode: 'production' });
    assert.deepEqual(calls, [
      'set:release-text', 'compile', 'swap:page11',
      'set:release-text', 'compile', 'swap:other',
    ]);
    await handleCollabModeMessage({ type: 'collab-mode', mode: 'studio' });
    await handleCollabModeMessage({ type: 'nope' });
    assert.equal(calls.length, 6);
  } finally {
    console.warn = origWarn;
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window: unknown }).window = previousWindow;
  }
});

test('production exit does not swap a screen that has no published version', async () => {
  const calls: string[] = [];
  const previousWindow = (globalThis as { window?: unknown }).window;
  const origWarn = console.warn;
  console.warn = () => undefined;
  (globalThis as { window: unknown }).window = {
    mls: {
      editor: {
        getModels: () => ({
          ts: {
            model: { setValue: (text: string) => { calls.push(`set:${text}`); } },
            storFile: { project: 7 },
            compilerResults: { modelNeedCompile: false },
          },
        }),
      },
      stor: { others: { getDefaultDriver: async () => ({ getHistoryContent: async () => null }) } },
      l2: { typescript: { compileAndPostProcess: async () => { calls.push('compile'); return true; } } },
    },
  };
  rememberDraftMain('main-sha');
  try {
    await enterStudioDraft(7, 'team-7', {
      applyFiles: async () => undefined,
      publishL2: async () => undefined,
      changedTs: async () => [{ project: 7, shortName: 'new', folder: 'web/page13', level: 2 }],
      applyChanged: async (ref) => { calls.push(`swap:${ref.shortName}`); },
    });
    calls.length = 0;
    await handleCollabModeMessage({ type: 'collab-mode', mode: 'production' });
    assert.deepEqual(calls, []);
  } finally {
    console.warn = origWarn;
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window: unknown }).window = previousWindow;
  }
});

test('loadProjectDefinitions creates definition models before enterStudioDraft; re-entry keeps them', async () => {
  resetVmDriverRegistration();
  resetProjectDefinitions();
  const host = installDriverHost();
  const calls: string[] = [];
  const origInfo = console.info;
  const origWarn = console.warn;
  console.info = () => undefined;
  console.warn = (msg?: unknown) => {
    if (typeof msg === 'string' && msg.includes('no active draft')) calls.push('enterStudioDraft');
  };
  const win = (globalThis as { window: { mls: {
    editor?: unknown;
    l5?: unknown;
    stor: { others: unknown; localDB?: unknown; LOCALPROJECTNUMBER?: number };
  } } }).window;
  win.mls.editor = {
    getModels: () => ({}),
    createModelProjectDefinition: async () => { calls.push('definitions'); },
  };
  win.mls.l5 = { getProjectDependencies: () => [] };
  win.mls.stor.localDB = { readPrjInfo: async () => ({ indexModules: 'export {}' }) };
  win.mls.stor.LOCALPROJECTNUMBER = 0;
  try {
    await loadProjectDefinitions(102047);
    assert.deepEqual(calls, ['definitions', 'enterStudioDraft']);
    calls.length = 0;
    await loadProjectDefinitions(102047);
    assert.deepEqual(calls, ['enterStudioDraft']);
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
    host.restore();
    resetProjectDefinitions();
  }
});
