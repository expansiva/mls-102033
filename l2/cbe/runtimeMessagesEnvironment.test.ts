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

test('runtime environment gains bots/getAgents from the base and keeps its own config', async () => {
    assert.match(source, /\.\.\.collabMessagesEnvironmentBase/);

    type MlsHolder = {
        mls?: {
            events?: { getPushSubscriptionForBackend?: () => Promise<unknown> };
            stor?: { files?: Record<string, unknown> };
            bots?: {
                getBotContextVarsBeforeMessageSend?: (thread: unknown, prompt: string) => Promise<string[]>;
                getBotContextVarsBeforeMessageSend2?: (vars: string[], myArgs: Record<string, unknown>) => Promise<unknown[]>;
            };
        };
    };
    const holder = globalThis as MlsHolder;
    const previousMls = holder.mls;
    const previousWindow = (globalThis as { window?: unknown }).window;
    holder.mls = {
        ...(previousMls ?? {}),
        stor: { files: (previousMls as { stor?: { files?: Record<string, unknown> } } | undefined)?.stor?.files ?? {} },
        bots: {
            getBotContextVarsBeforeMessageSend: async () => ['from-base'],
            getBotContextVarsBeforeMessageSend2: async () => [],
        },
    };
    (globalThis as { window?: unknown }).window = {
        location: { origin: 'https://app.example' },
        collabBoot: { pageTitle: 'RuntimeTitle' },
    };

    setEnvironment({});
    try {
        applyRuntimeMessagesEnvironment();

        assert.deepEqual(await environment.getAgents(), []);
        assert.deepEqual(
            await environment.bots.getBotContextVarsBeforeMessageSend({} as never, ''),
            ['from-base'],
        );
        assert.equal(environment.config.getMenuMode(), 'custom');
        assert.equal(environment.config.getApiUrl(), 'https://app.example/msg');
        assert.equal(environment.config.getApiCredentials(), 'same-origin');
        assert.equal(environment.config.getDefaultUserName(), 'RuntimeTitle');
        assert.equal(
            environment.config.generateSvgAvatarEnabled(),
            false,
            'runtime config must win: Studio generateSvgAvatarEnabled must not leak through the base',
        );
    } finally {
        setEnvironment({});
        if (previousMls === undefined) delete holder.mls;
        else holder.mls = previousMls;
        if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
        else (globalThis as { window?: unknown }).window = previousWindow;
    }
});
