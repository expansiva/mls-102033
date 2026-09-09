/// <mls fileReference="_102033_/l2/cbe/runtimeMessagesEnvironment.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { environment, setEnvironment } from '/_102036_/l2/environmentContract.js';
import { applyRuntimeMessagesEnvironment } from '/_102033_/l2/cbe/runtimeMessagesEnvironment.js';

const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'runtimeMessagesEnvironment.ts'),
    'utf8',
);

type MlsHolder = {
    mls?: {
        events?: { getPushSubscriptionForBackend?: () => Promise<unknown> };
        stor?: unknown;
    };
};

test('after applyRuntimeMessagesEnvironment, notifications are not the inert default', async () => {
    const holder = globalThis as MlsHolder;
    const previousMls = holder.mls;
    const subscription = { endpoint: 'https://push.example/ep', keys: { p256dh: 'p', auth: 'a' } };
    holder.mls = {
        ...(previousMls ?? {}),
        events: { getPushSubscriptionForBackend: async () => subscription },
    };
    setEnvironment({});
    try {
        assert.equal(await environment.notifications.getPushSubscriptionForBackend(), null);

        applyRuntimeMessagesEnvironment();

        assert.deepEqual(
            await environment.notifications.getPushSubscriptionForBackend(),
            subscription,
        );
    } finally {
        setEnvironment({});
        if (previousMls === undefined) delete holder.mls;
        else holder.mls = previousMls;
    }
});

test('runtimeMessagesEnvironment registers notifications (the detector that found the defect)', () => {
    const count = (source.match(/notifications/g) ?? []).length;
    assert.ok(count > 0, `grep -c notifications must be > 0, got ${count}`);
});
