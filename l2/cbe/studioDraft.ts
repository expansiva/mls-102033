/// <mls fileReference="_102033_/l2/cbe/studioDraft.ts" enhancement="_blank" />
// Default draft cookie for Studio on a VM project. The server reads `collab-draft`
// on /exec (st05); the name and the attribute string are the contract.

import { getRuntimeLanguage } from '/_102033_/l2/shared/languageRuntime.js';

const DRAFT_SLUG = /^(team|user)-[a-z0-9_.-]{1,64}$/;

/** Local view of mls: `studio` lives in l5/config.json and is not on the lib type. */
interface DraftMls {
  stor: {
    others: {
      getDefaultDriver: (project: number) => Promise<{ driverVersion?: string } | null | undefined>;
    };
  };
  l5: {
    getProjectConf: (project: number) => Promise<{ studio?: { defaultDraft?: string } } | null | undefined>;
  };
}

export function readDraftCookie(cookieString: string): string | undefined {
  if (!cookieString) return undefined;
  for (const part of cookieString.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== 'collab-draft') continue;
    const value = trimmed.slice(eq + 1).trim();
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}

export function buildDraftCookie(slug: string, secure: boolean): string {
  const cookie = `collab-draft=${slug}; Path=/; SameSite=Lax`;
  return secure ? `${cookie}; Secure` : cookie;
}

export function defaultDraftFor(project: number, defaultDraft?: string): string {
  if (defaultDraft !== undefined && DRAFT_SLUG.test(defaultDraft)) return defaultDraft;
  return `team-${project}`;
}

export function isVmDriver(driver: { driverVersion?: string } | null | undefined): boolean {
  const version = driver?.driverVersion;
  return typeof version === 'string' && version.startsWith('1.0.0-vm');
}

export async function ensureDefaultDraftCookie(project: number): Promise<void> {
  try {
    const api = mls as unknown as DraftMls;
    let driver: { driverVersion?: string } | null | undefined;
    try {
      driver = await api.stor.others.getDefaultDriver(project);
    } catch (err) {
      console.warn('[studioDraft] getDefaultDriver failed; draft cookie not set:', err);
      return;
    }
    if (!isVmDriver(driver)) return;

    const existing = readDraftCookie(document.cookie ?? '');
    let configured: string | undefined;
    if (!existing) {
      try {
        const conf = await api.l5.getProjectConf(project);
        configured = conf?.studio?.defaultDraft;
      } catch (err) {
        console.warn('[studioDraft] getProjectConf failed; using team draft:', err);
      }
    }
    const slug = existing ?? defaultDraftFor(project, configured);

    let detail: string;
    try {
      const response = await fetch(
        '/desenv?draft=' + encodeURIComponent(slug) + '&to=/',
        { redirect: 'manual', credentials: 'same-origin' },
      );
      const accepted =
        response.type === 'opaqueredirect' ||
        (response.status >= 200 && response.status < 300) ||
        response.status === 302;
      if (accepted && readDraftCookie(document.cookie ?? '')) return;
      detail = String(response.status);
    } catch (err) {
      detail = err instanceof Error ? err.message : String(err);
    }
    console.warn('[studio] rascunho indisponível: ' + detail);
    if (!existing) return;
    try {
      await fetch('/desenv/sair', { redirect: 'manual', credentials: 'same-origin' });
    } catch (err) {
      console.warn('[studio] rascunho indisponível: ' + (err instanceof Error ? err.message : String(err)));
    }
  } catch (err) {
    console.warn('[studioDraft] ensureDefaultDraftCookie failed:', err);
  }
}

/** Shown when a page outside Studio is still served from a draft. */
export interface DraftNotice {
  slug: string;
  href: string;
}

export interface DraftNoticeText {
  seeing: string;
  viewProduction: string;
}

const DRAFT_NOTICE_TEXT = {
  en: {
    seeing: 'You are seeing the draft {slug}.',
    viewProduction: 'View production',
  },
  pt: {
    seeing: 'Você está vendo o rascunho {slug}.',
    viewProduction: 'Ver a produção',
  },
} as const;

export function draftNotice(cookieString: string, studioModeOn: boolean, path: string): DraftNotice | null {
  if (studioModeOn) return null;
  const slug = readDraftCookie(cookieString);
  if (!slug) return null;
  return { slug, href: '/desenv/sair?to=' + encodeURIComponent(path) };
}

export function draftNoticeText(slug: string): DraftNoticeText {
  const language = getRuntimeLanguage(Object.keys(DRAFT_NOTICE_TEXT), document.documentElement.lang || 'en');
  const row = DRAFT_NOTICE_TEXT[language as keyof typeof DRAFT_NOTICE_TEXT] ?? DRAFT_NOTICE_TEXT.en;
  return {
    seeing: row.seeing.replace('{slug}', slug),
    viewProduction: row.viewProduction,
  };
}
