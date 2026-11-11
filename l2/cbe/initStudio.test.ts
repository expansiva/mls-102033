/// <mls fileReference="_102033_/l2/cbe/initStudio.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDraftFiles, draftEntrySeedPending, rememberDraftMain } from '/_102033_/l2/cbe/studioDraftFiles.js';
import { publishDraftL2 } from '/_102033_/l2/cbe/studioDraftL2.js';
import { activeDraft, rememberCollabMode } from '/_102033_/l2/cbe/studioDraft.js';
import { onStudioExit, rememberRelease } from '/_102033_/l2/cbe/studioExitReload.js';
import {
  registerPreviewTabsFailure,
  registerPreviewTabsUpdate,
  resetStudioEditSlot,
} from '/_102033_/l2/cbe/studioEditSlot.js';
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

test('st45: com a chave ligada, github e gitlab ainda recebem o DriverVm', async () => {
  resetVmDriverRegistration();
  const host = installDriverHost({ sourcesFromGitHub: true });
  const origInfo = console.info;
  const origWarn = console.warn;
  console.info = () => undefined;
  console.warn = () => undefined;
  try {
    await registerDrivers();
    const { DriverVm } = await import('/_102033_/l2/cbe/driverVm.js');
    const github = host.slots.get('github');
    const gitlab = host.slots.get('gitlab');
    assert.equal(github instanceof DriverVm, true);
    assert.equal(gitlab instanceof DriverVm, true);
    assert.equal((github as object).constructor.name, 'GitSlotVmDriver');
    assert.equal((gitlab as object).constructor.name, 'GitSlotVmDriver');
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

test('st45: os slots git não leem localStorage', async () => {
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
    assert.equal(JSON.stringify(errors).includes('collabStudioSourcesFromGitHub'), false);
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
      (err: unknown) => err instanceof Error && err.message.includes('lives on GitHub') && !err.message.includes('Fetch sources'),
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

test('st65 s6: enterStudioDraft holds the cover count while it seeds and always releases it', async () => {
  const previousFetch = globalThis.fetch;
  const previousError = console.error;
  console.error = () => undefined;
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response;
  try {
    let heldWhileApplying = false;
    await enterStudioDraft(102047, 'team-102047', {
      applyFiles: async () => { heldWhileApplying = draftEntrySeedPending(); },
      publishL2: async () => undefined,
    });
    assert.equal(heldWhileApplying, true, 'the hold is open while the entry seeds, even when draftDiff failed');
    assert.equal(draftEntrySeedPending(), false, 'a failed draftDiff does not leave the hold open');
    await assert.rejects(enterStudioDraft(102047, 'team-102047', {
      applyFiles: async () => { throw new Error('seed failed'); },
      publishL2: async () => undefined,
    }), /seed failed/);
    assert.equal(draftEntrySeedPending(), false, 'a failed seed does not leave the hold open');
    await enterStudioDraft(102047, undefined, { applyFiles: async () => undefined, publishL2: async () => undefined });
    assert.equal(draftEntrySeedPending(), false, 'no draft, no hold');
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousError;
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

interface ExitModel {
  model: { setValue: (text: string) => void };
  storFile: { project: number };
  compilerResults: { modelNeedCompile: boolean; prodJS: string };
}

function installExitHost(calls: string[], history: (ref: string) => string | null, compileOk: boolean): ExitModel {
  const model: ExitModel = {
    model: { setValue: (text: string) => { calls.push(`set:${text}`); } },
    storFile: { project: 7 },
    compilerResults: { modelNeedCompile: false, prodJS: 'draft-js' },
  };
  (globalThis as { window: unknown }).window = {
    mls: {
      editor: { getModels: () => ({ ts: model }) },
      stor: { others: { getDefaultDriver: async () => ({ getHistoryContent: async (_file: unknown, ref: string) => history(ref) }) } },
      l2: {
        typescript: {
          compileAndPostProcess: async (compiled: ExitModel) => {
            calls.push('compile');
            if (!compileOk) return false;
            compiled.compilerResults.prodJS = 'published-js';
            return true;
          },
        },
      },
    },
  };
  return model;
}

interface ScriptedDiffFile {
  status: string;
  path: string;
  sha: string | null;
}

/** Each `draftDiff` takes the next script. The last one repeats. `fail` throws that message. */
function scriptedDraftDiff(steps: { files?: ScriptedDiffFile[]; fail?: string }[]): () => void {
  const previous = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => {
    const step = steps[Math.min(n, steps.length - 1)];
    n += 1;
    if (!step || step.fail) throw new Error(step?.fail ?? 'draftDiff failed');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'files',
        head: 'hhh',
        main: 'main-sha',
        files: step.files ?? [],
      }),
    } as Response;
  };
  return () => {
    globalThis.fetch = previous;
  };
}

function diffFile(path: string): ScriptedDiffFile {
  return { status: 'M', path, sha: 'abc' };
}

test('st68 s1: exit puts the open tabs on production through the slot; entry puts them back', async () => {
  const calls: string[] = [];
  const shown = new Map<string, string>();
  const openTabs = ['main', 'other'];
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousLocation = (globalThis as { location?: { reload?: () => void } }).location;
  let reloads = 0;
  (globalThis as { location: { reload: () => void } }).location = { reload: () => { reloads += 1; } };
  const origWarn = console.warn;
  console.warn = () => undefined;
  resetStudioEditSlot();
  const model = installExitHost(calls, (ref) => (ref === 'main-sha' ? 'release-text' : null), true);
  const stop = registerPreviewTabsUpdate(async (_project, files) => {
    const slug = activeDraft() ?? null;
    calls.push(`slot:${slug ?? 'null'}:${files.join('+')}`);
    if (slug === null) {
      for (const tab of openTabs) shown.set(tab, model.compilerResults.prodJS);
    }
  });
  rememberDraftMain('main-sha');
  rememberCollabMode({ mode: 'studio', project: 7, draft: 'team-7' });
  const restoreDiff = scriptedDraftDiff([{ files: [diffFile('l2/web/page11/page11.ts')] }]);
  try {
    await enterStudioDraft(7, 'team-7', {
      applyFiles: async () => { calls.push('apply'); },
      publishL2: async () => {
        calls.push('publish');
        model.compilerResults.prodJS = 'draft-js';
      },
      changedTs: async () => [
        { project: 7, shortName: 'page11', folder: 'web/page11', level: 2 },
      ],
    });
    assert.deepEqual(calls, ['apply', 'publish', 'slot:team-7:l2/web/page11/page11.ts']);
    calls.length = 0;
    await handleCollabModeMessage({ type: 'collab-mode', mode: 'production' });
    assert.deepEqual(calls, ['set:release-text', 'compile', 'slot:null:l2/web/page11/page11.ts']);
    assert.equal(shown.get('main'), 'published-js');
    assert.equal(shown.get('other'), 'published-js');
    assert.equal(activeDraft(), undefined);
    assert.equal(reloads, 0);
    await handleCollabModeMessage({ type: 'collab-mode', mode: 'studio' });
    await handleCollabModeMessage({ type: 'nope' });
    assert.equal(reloads, 0);
    assert.equal(calls.length, 3);
    rememberCollabMode({ mode: 'studio', project: 7, draft: 'team-7' });
    calls.length = 0;
    shown.clear();
    await enterStudioDraft(7, 'team-7', {
      applyFiles: async () => { calls.push('apply'); },
      publishL2: async () => {
        calls.push('publish');
        model.compilerResults.prodJS = 'draft-js';
      },
      changedTs: async () => [
        { project: 7, shortName: 'page11', folder: 'web/page11', level: 2 },
      ],
    });
    assert.deepEqual(calls, ['apply', 'publish', 'slot:team-7:l2/web/page11/page11.ts']);
    assert.equal(model.compilerResults.prodJS, 'draft-js');
    assert.equal(reloads, 0);
  } finally {
    restoreDiff();
    stop();
    resetStudioEditSlot();
    rememberCollabMode({ mode: 'production' });
    console.warn = origWarn;
    if (previousLocation === undefined) delete (globalThis as { location?: unknown }).location;
    else (globalThis as { location?: unknown }).location = previousLocation;
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window: unknown }).window = previousWindow;
  }
});

test('st68 s1: the main page alone returns to production without a reload', async () => {
  const calls: string[] = [];
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousLocation = (globalThis as { location?: { reload?: () => void } }).location;
  let reloads = 0;
  (globalThis as { location: { reload: () => void } }).location = { reload: () => { reloads += 1; } };
  const origWarn = console.warn;
  console.warn = () => undefined;
  resetStudioEditSlot();
  const model = installExitHost(calls, () => 'release-text', true);
  let seen: string | null = null;
  const stop = registerPreviewTabsUpdate(async (_project, files) => {
    if (activeDraft() === undefined) seen = `${files.join('+')}:${model.compilerResults.prodJS}`;
  });
  rememberDraftMain('main-sha');
  rememberCollabMode({ mode: 'studio', project: 7, draft: 'team-7' });
  const restoreDiff = scriptedDraftDiff([{ files: [diffFile('l2/web/home/page11.ts')] }]);
  try {
    await enterStudioDraft(7, 'team-7', {
      applyFiles: async () => undefined,
      publishL2: async () => undefined,
      changedTs: async () => [{ project: 7, shortName: 'page11', folder: 'web/home', level: 2 }],
    });
    await handleCollabModeMessage({ type: 'collab-mode', mode: 'production' });
    assert.equal(seen, 'l2/web/home/page11.ts:published-js');
    assert.equal(reloads, 0);
  } finally {
    restoreDiff();
    stop();
    resetStudioEditSlot();
    rememberCollabMode({ mode: 'production' });
    console.warn = origWarn;
    if (previousLocation === undefined) delete (globalThis as { location?: unknown }).location;
    else (globalThis as { location?: unknown }).location = previousLocation;
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window: unknown }).window = previousWindow;
  }
});

test('st68 s1: a slot failure stays on the footer and does not reload', async () => {
  const calls: string[] = [];
  const failures: string[] = [];
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousLocation = (globalThis as { location?: { reload?: () => void } }).location;
  let reloads = 0;
  (globalThis as { location: { reload: () => void } }).location = { reload: () => { reloads += 1; } };
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = () => undefined;
  console.error = () => undefined;
  resetStudioEditSlot();
  installExitHost(calls, () => 'release-text', false);
  const stopFail = registerPreviewTabsFailure((cause) => { failures.push(cause); });
  const stop = registerPreviewTabsUpdate(async () => { calls.push('slot'); });
  rememberDraftMain('main-sha');
  rememberCollabMode({ mode: 'studio', project: 7, draft: 'team-7' });
  const restoreDiff = scriptedDraftDiff([{ files: [diffFile('l2/web/page11/page11.ts')] }]);
  try {
    await enterStudioDraft(7, 'team-7', {
      applyFiles: async () => undefined,
      publishL2: async () => undefined,
      changedTs: async () => [{ project: 7, shortName: 'page11', folder: 'web/page11', level: 2 }],
    });
    calls.length = 0;
    await handleCollabModeMessage({ type: 'collab-mode', mode: 'production' });
    assert.deepEqual(calls, ['set:release-text', 'compile']);
    assert.deepEqual(failures, ['production compile failed']);
    assert.equal(reloads, 0);
  } finally {
    restoreDiff();
    stop();
    stopFail();
    resetStudioEditSlot();
    rememberCollabMode({ mode: 'production' });
    console.warn = origWarn;
    console.error = origError;
    if (previousLocation === undefined) delete (globalThis as { location?: unknown }).location;
    else (globalThis as { location?: unknown }).location = previousLocation;
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window: unknown }).window = previousWindow;
  }
});

test('st68 s1: a thrown slot update stays on the footer and does not reload', async () => {
  const calls: string[] = [];
  const failures: string[] = [];
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousLocation = (globalThis as { location?: { reload?: () => void } }).location;
  let reloads = 0;
  (globalThis as { location: { reload: () => void } }).location = { reload: () => { reloads += 1; } };
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = () => undefined;
  console.error = () => undefined;
  resetStudioEditSlot();
  installExitHost(calls, () => 'release-text', true);
  const stopFail = registerPreviewTabsFailure((cause) => { failures.push(cause); });
  const stop = registerPreviewTabsUpdate(async () => { throw new Error('preview tabs update is not registered'); });
  rememberDraftMain('main-sha');
  rememberCollabMode({ mode: 'studio', project: 7, draft: 'team-7' });
  const restoreDiff = scriptedDraftDiff([{ files: [diffFile('l2/web/page11/page11.ts')] }]);
  try {
    await enterStudioDraft(7, 'team-7', {
      applyFiles: async () => undefined,
      publishL2: async () => undefined,
      changedTs: async () => [{ project: 7, shortName: 'page11', folder: 'web/page11', level: 2 }],
    });
    failures.length = 0;
    await handleCollabModeMessage({ type: 'collab-mode', mode: 'production' });
    assert.deepEqual(failures, ['preview tabs update is not registered']);
    assert.equal(reloads, 0);
  } finally {
    restoreDiff();
    stop();
    stopFail();
    resetStudioEditSlot();
    rememberCollabMode({ mode: 'production' });
    console.warn = origWarn;
    console.error = origError;
    if (previousLocation === undefined) delete (globalThis as { location?: unknown }).location;
    else (globalThis as { location?: unknown }).location = previousLocation;
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window: unknown }).window = previousWindow;
  }
});

function openExitCase(): {
  calls: string[];
  failures: string[];
  infos: string[];
  errors: string[];
  reloads: () => number;
  close: () => void;
} {
  const calls: string[] = [];
  const failures: string[] = [];
  const infos: string[] = [];
  const errors: string[] = [];
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousLocation = (globalThis as { location?: { reload?: () => void } }).location;
  let reloads = 0;
  (globalThis as { location: { reload: () => void } }).location = { reload: () => { reloads += 1; } };
  const origWarn = console.warn;
  const origInfo = console.info;
  const origError = console.error;
  console.warn = () => undefined;
  console.info = (msg?: unknown) => { infos.push(String(msg)); };
  console.error = (msg?: unknown) => { errors.push(String(msg)); };
  resetStudioEditSlot();
  installExitHost(calls, () => 'release-text', true);
  const stopFail = registerPreviewTabsFailure((cause) => { failures.push(cause); });
  const stop = registerPreviewTabsUpdate(async (_project, files) => {
    calls.push(`slot:${files.join('+')}`);
  });
  rememberDraftMain('main-sha');
  rememberCollabMode({ mode: 'studio', project: 7, draft: 'team-7' });
  return {
    calls,
    failures,
    infos,
    errors,
    reloads: () => reloads,
    close() {
      stop();
      stopFail();
      resetStudioEditSlot();
      rememberCollabMode({ mode: 'production' });
      console.warn = origWarn;
      console.info = origInfo;
      console.error = origError;
      if (previousLocation === undefined) delete (globalThis as { location?: unknown }).location;
      else (globalThis as { location?: unknown }).location = previousLocation;
      if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window: unknown }).window = previousWindow;
    },
  };
}

test('st68 s1c: a page saved after entry is restored on the first exit', async () => {
  const host = openExitCase();
  const page = 'l2/web/saved/page.ts';
  const restoreDiff = scriptedDraftDiff([
    { files: [] },
    { files: [diffFile(page)] },
  ]);
  try {
    await enterStudioDraft(7, 'team-7', {
      applyFiles: async () => undefined,
      publishL2: async () => undefined,
      changedTs: async () => [],
    });
    host.calls.length = 0;
    await handleCollabModeMessage({ type: 'collab-mode', mode: 'production' });
    assert.deepEqual(host.calls, ['set:release-text', 'compile', `slot:${page}`]);
    assert.equal(host.calls.filter((call) => call.startsWith('slot:')).length, 1);
    assert.deepEqual(host.failures, []);
    assert.equal(host.reloads(), 0);
  } finally {
    restoreDiff();
    host.close();
  }
});

test('st68 s1c: exit updates the entry file and the one saved later', async () => {
  const host = openExitCase();
  const entry = 'l2/web/page11/page11.ts';
  const saved = 'l2/web/page12/page12.ts';
  const restoreDiff = scriptedDraftDiff([
    { files: [diffFile(entry)] },
    { files: [diffFile(entry), diffFile(saved)] },
  ]);
  try {
    await enterStudioDraft(7, 'team-7', {
      applyFiles: async () => undefined,
      publishL2: async () => undefined,
      changedTs: async () => [{ project: 7, shortName: 'page11', folder: 'web/page11', level: 2 }],
    });
    host.calls.length = 0;
    await handleCollabModeMessage({ type: 'collab-mode', mode: 'production' });
    assert.deepEqual(host.calls, [
      'set:release-text', 'compile',
      'set:release-text', 'compile',
      `slot:${entry}+${saved}`,
    ]);
    assert.equal(host.reloads(), 0);
  } finally {
    restoreDiff();
    host.close();
  }
});

test('st68 s1c: a failed exit diff keeps the entry list and paints the footer', async () => {
  const host = openExitCase();
  const entry = 'l2/web/page11/page11.ts';
  const restoreDiff = scriptedDraftDiff([
    { files: [diffFile(entry)] },
    { fail: 'draftDiff failed' },
  ]);
  try {
    await enterStudioDraft(7, 'team-7', {
      applyFiles: async () => undefined,
      publishL2: async () => undefined,
      changedTs: async () => [{ project: 7, shortName: 'page11', folder: 'web/page11', level: 2 }],
    });
    host.calls.length = 0;
    host.failures.length = 0;
    host.errors.length = 0;
    await handleCollabModeMessage({ type: 'collab-mode', mode: 'production' });
    assert.deepEqual(host.calls, ['set:release-text', 'compile', `slot:${entry}`]);
    assert.deepEqual(host.failures, ['draftDiff failed']);
    assert.equal(host.errors.some((line) => line.includes('draftDiff on exit failed: draftDiff failed')), true);
    assert.equal(host.reloads(), 0);
  } finally {
    restoreDiff();
    host.close();
  }
});

test('st68 s1c: an empty diff on entry and exit changes nothing', async () => {
  const host = openExitCase();
  const restoreDiff = scriptedDraftDiff([{ files: [] }]);
  try {
    await enterStudioDraft(7, 'team-7', {
      applyFiles: async () => undefined,
      publishL2: async () => undefined,
      changedTs: async () => [],
    });
    await handleCollabModeMessage({ type: 'collab-mode', mode: 'production' });
    assert.deepEqual(host.calls, []);
    assert.deepEqual(host.failures, []);
    assert.deepEqual(host.infos, [
      '[initStudio] nada alterado no rascunho',
      '[initStudio] nada alterado no rascunho',
    ]);
    assert.equal(host.reloads(), 0);
  } finally {
    restoreDiff();
    host.close();
  }
});

test('st68 s1: a different release still reloads on studio exit', async () => {
  let current = 'rel-a';
  await rememberRelease(async () => ({ id: current }));
  let reloads = 0;
  await onStudioExit(() => { reloads += 1; });
  assert.equal(reloads, 0);
  current = 'rel-b';
  await onStudioExit(() => { reloads += 1; });
  assert.equal(reloads, 1);
});

test('production exit does not compile a screen that has no published version', async () => {
  const calls: string[] = [];
  const failures: string[] = [];
  const previousWindow = (globalThis as { window?: unknown }).window;
  const origWarn = console.warn;
  console.warn = () => undefined;
  resetStudioEditSlot();
  const model = installExitHost(calls, () => null, true);
  const stopFail = registerPreviewTabsFailure((cause) => { failures.push(cause); });
  const stop = registerPreviewTabsUpdate(async () => { calls.push(`slot:${model.compilerResults.prodJS}`); });
  rememberDraftMain('main-sha');
  rememberCollabMode({ mode: 'studio', project: 7, draft: 'team-7' });
  const restoreDiff = scriptedDraftDiff([{ files: [diffFile('l2/web/page13/new.ts')] }]);
  try {
    await enterStudioDraft(7, 'team-7', {
      applyFiles: async () => undefined,
      publishL2: async () => undefined,
      changedTs: async () => [{ project: 7, shortName: 'new', folder: 'web/page13', level: 2 }],
    });
    calls.length = 0;
    await handleCollabModeMessage({ type: 'collab-mode', mode: 'production' });
    assert.deepEqual(calls, ['slot:draft-js']);
    assert.deepEqual(failures, []);
  } finally {
    restoreDiff();
    stop();
    stopFail();
    resetStudioEditSlot();
    rememberCollabMode({ mode: 'production' });
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
