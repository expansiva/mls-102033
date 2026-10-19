/// <mls fileReference="_102033_/l2/cbe/studioExitReload.ts" enhancement="_blank" />

import { readRelease as pingRelease } from '/_102033_/l2/cbe/releaseInfo.js';
import { readDraftCookie } from '/_102033_/l2/cbe/studioDraft.js';

export interface IStudioReleaseId {
  id: string;
}

export function studioReleaseId(id: string): IStudioReleaseId {
  return { id };
}

/** True only when both sides have an id and they differ. A missing id is not a change. */
export function shouldReload(before: IStudioReleaseId | null, now: IStudioReleaseId | null): boolean {
  if (before === null || now === null) return false;
  return before.id !== now.id;
}

let readRelease: (() => Promise<IStudioReleaseId | null>) | null = null;
let captured: Promise<IStudioReleaseId | null> | null = null;

/** Store the reader and the entry ping. Exit awaits this promise, so a fast toggle still sees the entry id. */
export function rememberRelease(read: () => Promise<IStudioReleaseId | null>): Promise<IStudioReleaseId | null> {
  readRelease = read;
  const pending = Promise.resolve().then(read);
  captured = pending.then(
    (release) => release,
    (error: unknown) => {
      console.warn('studio: failed to read the release on enter', error);
      return null;
    },
  );
  return captured;
}

/** `/desenv/sair?to=<path>` when a draft cookie is set; null when the page is already on production. */
export function leaveDraftUrl(cookieString: string, path: string): string | null {
  if (readDraftCookie(cookieString) === undefined) return null;
  return '/desenv/sair?to=' + encodeURIComponent(path);
}

/** Fresh ping against the entry id. Reload only when they differ; a failed ping warns and does not reload.
 *  With a draft cookie, forget that draft's l2 marker and cache, then navigate to `/desenv/sair`.
 *  A failing forget warns and still navigates. That response already loads the current release. */
export async function onStudioExit(
  reload: () => void,
  leave?: {
    cookie: string;
    path: string;
    navigate: (url: string) => void;
    forget?: (slug: string) => Promise<void>;
  },
): Promise<void> {
  if (leave !== undefined) {
    const url = leaveDraftUrl(leave.cookie, leave.path);
    if (url !== null) {
      const slug = readDraftCookie(leave.cookie);
      if (slug !== undefined) {
        try {
          await leave.forget?.(slug);
        } catch (error: unknown) {
          console.warn('studio: failed to forget the draft l2', error);
        }
      }
      leave.navigate(url);
      return;
    }
  }
  const read = readRelease;
  const beforePromise = captured;
  if (read === null || beforePromise === null) {
    console.warn('studio: exit without a remembered release; not reloading');
    return;
  }
  const before = await beforePromise;
  let now: IStudioReleaseId | null;
  try {
    now = await read();
  } catch (error) {
    console.warn('studio: ping failed on exit; not reloading', error);
    return;
  }
  if (shouldReload(before, now)) reload();
}

/** Current release id from the same ping `collabRelease` exposes (`readRelease`). */
export async function readCollabReleaseId(): Promise<IStudioReleaseId | null> {
  const id = (await pingRelease()).release?.id;
  return typeof id === 'string' ? studioReleaseId(id) : null;
}
