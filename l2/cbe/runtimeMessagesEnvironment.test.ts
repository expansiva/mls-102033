/// <mls fileReference="_102033_/l2/cbe/runtimeMessagesEnvironment.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { environment, setEnvironment } from '/_102036_/l2/environmentContract.js';
import { applyRuntimeMessagesEnvironment, buildProgramMenu } from '/_102033_/l2/cbe/runtimeMessagesEnvironment.js';

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

test('runtime environment wires agents (the default silently swallowed every @@agent run)', async () => {
    assert.match(source, /agents: runtimeAgents/);

    type AgentsHolder = { mls?: { stor?: { files?: Record<string, unknown> } } };
    const holder = globalThis as AgentsHolder;
    const previousMls = holder.mls;
    const previousWindow = (globalThis as { window?: unknown }).window;
    // A booted-but-empty store: what an app looks like before (or without) the
    // cbeMiniCfe login + preload that fills mls.stor.files.
    holder.mls = { ...(previousMls ?? {}), stor: { files: {} } };
    (globalThis as { window?: unknown }).window = {
        mls: holder.mls,
        location: { origin: 'https://app.example' },
        collabBoot: { pageTitle: 'RuntimeTitle' },
    };

    setEnvironment({});
    try {
        // The defect: the contract default RESOLVES doing nothing, so the chat's
        // fire-and-forget call never fails and the message spins forever.
        assert.equal(
            await environment.agents.executeAgent('agentPlanner1', {} as never),
            undefined,
        );
        assert.equal(await environment.agents.loadAgent('agentPlanner1'), null);

        applyRuntimeMessagesEnvironment();

        // Now it says why it cannot run instead of pretending it did.
        await assert.rejects(
            () => environment.agents.executeAgent('agentPlanner1', {} as never),
            /mls\.stor\.files is empty/,
        );
        await assert.rejects(
            () => environment.agents.loadAgent('agentPlanner1'),
            /mls\.stor\.files is empty/,
        );
    } finally {
        setEnvironment({});
        if (previousMls === undefined) delete holder.mls;
        else holder.mls = previousMls;
        if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
        else (globalThis as { window?: unknown }).window = previousWindow;
    }
});

test('opening a program shows the app pane on a phone — tabs and iframes never pass through popstate', () => {
    const body = source.slice(source.indexOf('export async function openProgramUnified'));
    const close = body.indexOf('closeAuraAside()');
    const firstBranch = body.indexOf('if (basePath && item.url.startsWith(basePath))');
    assert.ok(close > 0 && close < firstBranch, 'closeAuraAside must run before every branch');
});

const SITE = 102047;
const MASTER = 102034;

type AppEntry = {
    projectId: number;
    moduleId: string;
    basePath: string;
    navigation: Array<{ id: string; label: string; href: string }>;
};

const bffApps: AppEntry[] = [
    {
        projectId: MASTER,
        moduleId: 'monitor',
        basePath: '/monitor',
        navigation: [{ id: 'mon', label: 'Monitor', href: '/monitor' }],
    },
    {
        projectId: SITE,
        moduleId: 'orders',
        basePath: '/orders',
        navigation: [{ id: 'old-page', label: 'Old', href: '/orders/old' }],
    },
];

function draftConfig(pageId: string): string {
    return JSON.stringify({
        projects: {
            [String(SITE)]: {
                modules: [{
                    moduleId: 'orders',
                    basePath: '/orders',
                    navigation: [{ id: pageId, label: pageId, href: `/orders/${pageId}` }],
                }],
            },
        },
    });
}

function installDraftMenu(mode: 'studio' | 'production', configBody: string): { errors: unknown[][]; restore: () => void } {
    const host = globalThis as {
        mls?: { stor?: unknown; sites?: { getMode?: () => 'studio' | 'production' } };
        collabBoot?: { projectId?: string };
        fetch?: typeof fetch;
    };
    const previous = { mls: host.mls, boot: host.collabBoot, fetch: host.fetch };
    const errors: unknown[][] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => { errors.push(args); };
    host.collabBoot = { projectId: String(SITE) };
    host.mls = {
        ...(previous.mls ?? {}),
        sites: { getMode: () => mode },
        stor: {
            getKeyToFiles: (project: number, level: number, shortName: string, folder: string, extension: string) =>
                `${project}|${level}|${shortName}|${folder}|${extension}`,
            files: {
                [`${SITE}|5|config||.json`]: {
                    project: SITE,
                    status: 'nochange',
                    inLocalStorage: false,
                    getContent: async () => configBody,
                },
            },
        },
    };
    host.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { routine?: string };
        if (body.routine !== 'monitor.appsMenu.load') {
            throw new Error(`unexpected routine ${String(body.routine)}`);
        }
        return new Response(JSON.stringify({ ok: true, data: { apps: bffApps } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }) as typeof fetch;
    return {
        errors,
        restore() {
            console.error = origError;
            host.mls = previous.mls;
            host.collabBoot = previous.boot;
            host.fetch = previous.fetch;
        },
    };
}

function menuUrls(menus: Array<{ project: number; menu: Array<{ url: string }> }>): string[] {
    return menus.flatMap((menu) => menu.menu.map((item) => `${menu.project}:${item.url}`));
}

test('st39: Studio ligado mostra o item novo do rascunho e mantém o módulo mestre', async () => {
    const env = installDraftMenu('studio', draftConfig('new-page'));
    try {
        const found = menuUrls(await buildProgramMenu());
        assert.deepEqual(found, [`${MASTER}:/monitor`, `${SITE}:/orders/new-page`]);
        assert.equal(env.errors.length, 0);
    } finally {
        env.restore();
    }
});

test('st39: Studio desligado fica só com o menu do BFF', async () => {
    const env = installDraftMenu('production', draftConfig('new-page'));
    try {
        const found = menuUrls(await buildProgramMenu());
        assert.deepEqual(found, [`${MASTER}:/monitor`, `${SITE}:/orders/old`]);
        assert.equal(env.errors.length, 0);
    } finally {
        env.restore();
    }
});

test('st39: config inválido mantém o BFF e avisa no console', async () => {
    const env = installDraftMenu('studio', '{');
    try {
        const found = menuUrls(await buildProgramMenu());
        assert.deepEqual(found, [`${MASTER}:/monitor`, `${SITE}:/orders/old`]);
        assert.equal(JSON.stringify(env.errors).includes('not valid JSON'), true);
    } finally {
        env.restore();
    }
});
