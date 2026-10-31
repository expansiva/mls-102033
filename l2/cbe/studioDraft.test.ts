/// <mls fileReference="_102033_/l2/cbe/studioDraft.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeDraft,
  applyCollabModeNotice,
  applyRecordedModeReply,
  defaultDraftFor,
  enterDraft,
  isVmDriver,
  loadRecordedMode,
  modeState,
  requestModeChange,
  resolveDefaultDraft,
  sendServiceWorkerMode,
  type RequestModeChangeDeps,
} from '/_102033_/l2/cbe/studioDraft.js';

const PROJECT = 102056;
const draftBeforeAnyReply = activeDraft();
const stateBeforeAnyReply = modeState();


test('defaultDraftFor keeps a valid slug and falls back to user', () => {
  assert.equal(defaultDraftFor(PROJECT, undefined), 'user');
  assert.equal(defaultDraftFor(PROJECT, 'user'), 'user');
  assert.equal(defaultDraftFor(102047, 'team-102047'), 'team-102047');
  assert.equal(defaultDraftFor(PROJECT, 'user-ana_1'), 'user-ana_1');
  assert.equal(defaultDraftFor(PROJECT, 'team-' + 'a'.repeat(64)), 'team-' + 'a'.repeat(64));
  assert.equal(defaultDraftFor(PROJECT, 'Team-Ana'), 'user');
  assert.equal(defaultDraftFor(PROJECT, 'team-' + 'a'.repeat(65)), 'user');
  assert.equal(defaultDraftFor(PROJECT, 'other-ana'), 'user');
});

test('isVmDriver accepts only a 1.0.0-vm driverVersion prefix', () => {
  assert.equal(isVmDriver({ driverVersion: '1.0.0-vm' }), true);
  assert.equal(isVmDriver({ driverVersion: '1.0.0-vm.2' }), true);
  assert.equal(isVmDriver({ driverVersion: '1.0.0' }), false);
  assert.equal(isVmDriver({ driverVersion: 'github' }), false);
  assert.equal(isVmDriver(null), false);
  assert.equal(isVmDriver({}), false);
});

test('no path writes document.cookie', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('./studioDraft.ts', import.meta.url), 'utf8'),
  );
  assert.equal(/document\.cookie\s*=/.test(source), false);
});

function modeDeps(overrides: Partial<RequestModeChangeDeps> = {}): RequestModeChangeDeps & { calls: string[]; errors: string[] } {
  const calls: string[] = [];
  const errors: string[] = [];
  return {
    calls,
    errors,
    project: 102056,
    resolveDraft: async (project) => {
      calls.push('resolveDraft');
      return `team-${project}`;
    },
    enterDraft: async (_project, slug) => {
      calls.push('draftEnter');
      return { statusCode: 200, ok: true, slug };
    },
    sendToServiceWorker: async (message) => {
      calls.push(`setMode:${message.mode}`);
      if (message.mode === 'studio') return { mode: 'studio', project: message.project, draft: message.draft };
      return { mode: 'production' };
    },
    reportError: (message) => {
      errors.push(message);
    },
    ...overrides,
  };
}

test('studio mode calls draftEnter and then the service worker setMode', async () => {
  const deps = modeDeps();
  const result = await requestModeChange('production', 'studio', deps);
  assert.deepEqual(result, { mode: 'studio' });
  assert.deepEqual(deps.calls, ['resolveDraft', 'draftEnter', 'setMode:studio']);
  assert.deepEqual(deps.errors, []);
});

test('studio mode stores the slug returned by draftEnter', async () => {
  const returned = 'user-aaaaaaaaaaaaaaaa';
  const deps = modeDeps({
    resolveDraft: async () => {
      deps.calls.push('resolveDraft');
      return 'user';
    },
    enterDraft: async (_project, slug) => {
      deps.calls.push('draftEnter');
      assert.equal(slug, 'user');
      return { statusCode: 200, ok: true, slug: returned };
    },
  });
  const result = await requestModeChange('production', 'studio', deps);
  assert.deepEqual(result, { mode: 'studio' });
  assert.deepEqual(deps.calls, ['resolveDraft', 'draftEnter', 'setMode:studio']);
  assert.deepEqual(deps.errors, []);
  assert.equal(activeDraft(), returned);
  assert.equal(modeState().draft, returned);
});

test('production mode calls only the service worker setMode', async () => {
  const deps = modeDeps({
    resolveDraft: async () => { throw new Error('resolveDraft'); },
    enterDraft: async () => { throw new Error('draftEnter'); },
  });
  const result = await requestModeChange('studio', 'production', deps);
  assert.deepEqual(result, { mode: 'production' });
  assert.deepEqual(deps.calls, ['setMode:production']);
  assert.deepEqual(deps.errors, []);
});

test('an Error reply from the service worker undoes the mode and is logged', async () => {
  const deps = modeDeps({
    sendToServiceWorker: async (message) => {
      deps.calls.push(`setMode:${message.mode}`);
      return 'Error: draft cache';
    },
  });
  const entered = await requestModeChange('production', 'studio', deps);
  assert.deepEqual(entered, { mode: 'production' });
  assert.deepEqual(deps.errors, ['Error: draft cache']);
  assert.deepEqual(deps.calls, ['resolveDraft', 'draftEnter', 'setMode:studio']);

  const left = await requestModeChange('studio', 'production', modeDeps({
    sendToServiceWorker: async () => 'Error: busy',
    reportError: (message) => { deps.errors.push(message); },
  }));
  assert.deepEqual(left, { mode: 'studio' });
  assert.deepEqual(deps.errors, ['Error: draft cache', 'Error: busy']);
});

test('a failed draftEnter does not call the service worker', async () => {
  const deps = modeDeps({
    enterDraft: async () => {
      deps.calls.push('draftEnter');
      return { statusCode: 401, ok: false };
    },
  });
  const result = await requestModeChange('production', 'studio', deps);
  assert.deepEqual(result, { mode: 'production' });
  assert.deepEqual(deps.calls, ['resolveDraft', 'draftEnter']);
  assert.deepEqual(deps.errors, ['[shell] draftEnter failed: 401']);
});

test('a session_required draftEnter shows the i18n message and stays out', async () => {
  const deps = modeDeps({
    resolveDraft: async () => {
      deps.calls.push('resolveDraft');
      return 'user';
    },
    enterDraft: async () => {
      deps.calls.push('draftEnter');
      return { statusCode: 401, ok: false, error: 'draft.session_required' };
    },
  });
  const result = await requestModeChange('production', 'studio', deps);
  assert.deepEqual(result, { mode: 'production' });
  assert.deepEqual(deps.calls, ['resolveDraft', 'draftEnter']);
  assert.deepEqual(deps.errors, ['Sign in to open your draft.']);
});

test('collab-mode gives the mode to show and ignores other messages', () => {
  assert.equal(applyCollabModeNotice('production', { type: 'collab-mode', mode: 'studio', project: 102056, draft: 'team-102056' }), 'studio');
  assert.equal(applyCollabModeNotice('studio', { type: 'collab-mode', mode: 'production' }), 'production');
  assert.equal(applyCollabModeNotice('studio', { type: 'collab-mode', mode: 'studio' }), 'studio');
  assert.equal(applyCollabModeNotice('production', { type: 'other', mode: 'studio' }), 'production');
});

test('enterDraft posts draftEnter and keeps a non-ok status', async () => {
  const bodies: unknown[] = [];
  const ok = await enterDraft(102056, 'team-102056', {
    postExec: async (body) => {
      bodies.push(body);
      return { statusCode: 200, ok: true, slug: 'user-ada', head: 'abc' };
    },
  });
  assert.deepEqual(bodies, [{ action: 'draftEnter', project: 102056, draft: 'team-102056' }]);
  assert.deepEqual(ok, { statusCode: 200, ok: true, slug: 'user-ada', head: 'abc' });

  const missing = await enterDraft(102056, 'nope', {
    postExec: async () => { throw new Error('should not post'); },
  });
  assert.deepEqual(missing, { statusCode: 400, ok: false });

  const rejected = await enterDraft(102056, 'team-102056', {
    postExec: async () => ({ statusCode: 503, ok: false }),
  });
  assert.deepEqual(rejected, { statusCode: 503, ok: false });

  const fromUser = await enterDraft(102056, 'user', {
    postExec: async (body) => {
      bodies.push(body);
      return { statusCode: 200, ok: true, slug: 'user-aaaaaaaaaaaaaaaa' };
    },
  });
  assert.deepEqual(bodies[1], { action: 'draftEnter', project: 102056, draft: 'user' });
  assert.deepEqual(fromUser, { statusCode: 200, ok: true, slug: 'user-aaaaaaaaaaaaaaaa' });

  const noReturnedSlug = await enterDraft(102056, 'user', {
    postExec: async () => ({ statusCode: 200, ok: true }),
  });
  assert.deepEqual(noReturnedSlug, { statusCode: 200, ok: false });

  const session = await enterDraft(102056, 'user', {
    postExec: async () => ({ statusCode: 401, ok: false, msg: 'draft.session_required' }),
  });
  assert.deepEqual(session, { statusCode: 401, ok: false, error: 'draft.session_required' });
});

test('resolveDefaultDraft reads studio.defaultDraft and falls back to user', async () => {
  assert.equal(
    await resolveDefaultDraft(102047, { getProjectConf: async () => ({ studio: { defaultDraft: 'team-102047' } }) }),
    'team-102047',
  );
  assert.equal(
    await resolveDefaultDraft(102056, { getProjectConf: async () => ({}) }),
    'user',
  );
  assert.equal(
    await resolveDefaultDraft(102056, { getProjectConf: async () => ({ studio: { defaultDraft: 'user' } }) }),
    'user',
  );
  assert.equal(
    await resolveDefaultDraft(102056, { getProjectConf: async () => ({ studio: { defaultDraft: 'user-ada' } }) }),
    'user-ada',
  );
  assert.equal(
    await resolveDefaultDraft(102056, { getProjectConf: async () => { throw new Error('missing'); } }),
    'user',
  );
});

test('activeDraft is empty before any reply and in production', () => {
  assert.equal(draftBeforeAnyReply, undefined);
  assert.deepEqual(stateBeforeAnyReply, { mode: 'production' });
  applyRecordedModeReply({ mode: 'production', project: PROJECT, draft: 'team-102056' }, () => {});
  assert.equal(activeDraft(), undefined);
  assert.equal(modeState().mode, 'production');
  assert.equal(modeState().draft, undefined);
});

test('a studio reply exposes the slug and collab-mode clears it', () => {
  const state = applyRecordedModeReply(
    { mode: 'studio', project: PROJECT, draft: 'team-102056' },
    () => { throw new Error('studio reply is not an error'); },
  );
  assert.deepEqual(state, { mode: 'studio', project: PROJECT, draft: 'team-102056' });
  assert.equal(activeDraft(), 'team-102056');

  assert.equal(
    applyCollabModeNotice('production', { type: 'collab-mode', mode: 'studio', project: PROJECT, draft: 'user-ada' }),
    'studio',
  );
  assert.equal(activeDraft(), 'user-ada');
  assert.deepEqual(modeState(), { mode: 'studio', project: PROJECT, draft: 'user-ada' });

  assert.equal(applyCollabModeNotice('studio', { type: 'collab-mode', mode: 'production' }), 'production');
  assert.equal(activeDraft(), undefined);
  assert.deepEqual(modeState(), { mode: 'production' });
});

test('boot getMode error leaves production and is logged', () => {
  applyRecordedModeReply({ mode: 'studio', project: PROJECT, draft: 'user-ada' }, () => {});
  const errors: string[] = [];
  const state = applyRecordedModeReply('Error: draft cache', (message) => { errors.push(message); });
  assert.deepEqual(state, { mode: 'production' });
  assert.equal(activeDraft(), undefined);
  assert.equal(modeState().draft, undefined);
  assert.deepEqual(errors, ['Error: draft cache']);

  applyRecordedModeReply({ mode: 'studio', project: PROJECT, draft: 'user-ada' }, () => {});
  const failed = applyRecordedModeReply(new Error('down'), (message) => { errors.push(message); });
  assert.deepEqual(failed, { mode: 'production' });
  assert.equal(activeDraft(), undefined);
  assert.deepEqual(errors, ['Error: draft cache', '[studioDraft] getMode: down']);
});

test('boot getMode posts the action and returns the recorded slug', async () => {
  const errors: string[] = [];
  let sent: unknown;
  const studio = await loadRecordedMode({
    send: async (message) => {
      sent = message;
      return { mode: 'studio', project: PROJECT, draft: 'team-102056' };
    },
    reportError: (message) => { errors.push(message); },
    reportWarning: () => { throw new Error('no warning expected'); },
  });
  assert.deepEqual(sent, { action: 'getMode' });
  assert.deepEqual(errors, []);
  assert.deepEqual(studio, { mode: 'studio', project: PROJECT, draft: 'team-102056' });

  const failed = await loadRecordedMode({
    send: async () => 'Error: draft cache',
    reportError: (message) => { errors.push(message); },
    reportWarning: () => { throw new Error('no warning expected'); },
  });
  assert.deepEqual(failed, { mode: 'production' });
  assert.deepEqual(errors, ['Error: draft cache']);
});

test('boot getMode without a service worker controller is a warning, not an error', async () => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const result = await loadRecordedMode({
    send: (message) => sendServiceWorkerMode(message as { action: 'getMode' }, { MessageChannel: globalThis.MessageChannel }),
    reportError: (message) => { errors.push(message); },
    reportWarning: (message) => { warnings.push(message); },
  });
  assert.deepEqual(result, { mode: 'production' });
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /controller is not available/);
});

test('sendServiceWorkerMode posts setMode through a MessageChannel port', async () => {
  let posted: unknown;
  const result = await sendServiceWorkerMode(
    { action: 'setMode', mode: 'studio', project: 102056, draft: 'team-102056' },
    {
      controller: {
        postMessage(message, transfer) {
          posted = message;
          const port = transfer[0] as MessagePort;
          port.postMessage({ mode: 'studio', project: 102056, draft: 'team-102056' });
        },
      },
      MessageChannel,
    },
  );
  assert.deepEqual(posted, { action: 'setMode', mode: 'studio', project: 102056, draft: 'team-102056' });
  assert.deepEqual(result, { mode: 'studio', project: 102056, draft: 'team-102056' });
});

test('sendServiceWorkerMode posts getMode through a MessageChannel port', async () => {
  let posted: unknown;
  const result = await sendServiceWorkerMode(
    { action: 'getMode' },
    {
      controller: {
        postMessage(message, transfer) {
          posted = message;
          const port = transfer[0] as MessagePort;
          port.postMessage({ mode: 'production' });
        },
      },
      MessageChannel,
    },
  );
  assert.deepEqual(posted, { action: 'getMode' });
  assert.deepEqual(result, { mode: 'production' });
});

test('sendServiceWorkerMode rejects when the service worker does not answer', async () => {
  await assert.rejects(
    () => sendServiceWorkerMode(
      { action: 'setMode', mode: 'production' },
      { controller: { postMessage() { /* stays silent */ } }, MessageChannel, timeoutMs: 30 },
    ),
    /timed out/,
  );
});
