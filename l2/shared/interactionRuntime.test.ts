/// <mls fileReference="_102033_/l2/shared/interactionRuntime.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginExpectedNavigationLoad,
  bindExpectedNavigationLoad,
  getInteractionState,
  retryBlockingError,
  runBlockingUiAction,
  subscribeToInteractionState,
} from '/_102033_/l2/shared/interactionRuntime.js';

test.beforeEach(() => {
  globalThis.window = {
    collabAuraInteractionState: undefined,
  } as Window & typeof globalThis;
});

test('runBlockingUiAction transitions from subtle to dimmed and then clears busy state', async () => {
  const phases: string[] = [];
  const unsubscribe = subscribeToInteractionState((state) => {
    phases.push(state.busyPhase);
  });

  await runBlockingUiAction(async () => {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 700));
  });

  unsubscribe();
  assert.equal(phases.includes('subtle'), true);
  assert.equal(phases.includes('dimmed'), true);
  assert.equal(getInteractionState().busy, false);
  assert.equal(getInteractionState().busyPhase, 'idle');
});

test('runBlockingUiAction rejects with TIMEOUT and publishes blocking error', async () => {
  await assert.rejects(
    () => runBlockingUiAction(
      async () => new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 60);
      }),
      {
        timeoutMs: 20,
      },
    ),
    {
      code: 'TIMEOUT',
    },
  );

  assert.equal(getInteractionState().blockingError?.error.code, 'TIMEOUT');
});

test('runBlockingUiAction deduplicates concurrent blocking actions', async () => {
  let executions = 0;
  let release!: () => void;
  const blocker = new Promise<void>((resolve) => {
    release = resolve;
  });

  const first = runBlockingUiAction(async () => {
    executions += 1;
    await blocker;
    return 'ok';
  });
  const second = runBlockingUiAction(async () => {
    executions += 1;
    return 'should-not-run';
  });

  release();
  await Promise.all([first, second]);

  assert.equal(executions, 1);
});

test('retryBlockingError reruns stored retry callback', async () => {
  let retried = false;

  await assert.rejects(
    () => runBlockingUiAction(
      async () => {
        throw {
          code: 'NETWORK_ERROR',
          message: 'offline',
        };
      },
      {
        retry: async () => {
          retried = true;
        },
      },
    ),
  );

  await retryBlockingError();
  assert.equal(retried, true);
});

test('expected navigation load binds resolution to route task', async () => {
  const pending = beginExpectedNavigationLoad();
  const promise = Promise.resolve();

  bindExpectedNavigationLoad(
    {
      consumed: true,
      promise: pending,
      resolve: () => undefined,
      reject: () => undefined,
    },
    promise,
  );

  await assert.doesNotReject(() => promise);
});
