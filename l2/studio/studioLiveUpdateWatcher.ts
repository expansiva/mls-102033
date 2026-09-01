/// <mls fileReference="_102033_/l2/studio/studioLiveUpdateWatcher.ts" enhancement="_blank" />
// Second trigger for the live-update pipeline (studioLiveUpdate.ts) — edits made through the
// STUDIO'S OWN file editor (ServiceSource100554, mls-100554/l2/serviceSource.ts), as opposed to
// the inline overlay (studioEditor.ts). Both compile through the same pipeline
// (mls-102027/l2/libModel.ts) and land a fresh version in mls.stor.cache — a ServiceSource edit was
// only ever missing something on the app side listening for it.
//
// WHY THIS COULD NOT LIVE INSIDE studioEditor.ts / studioLiveUpdate.ts
// StudioEditor (and therefore applyLiveUpdate) is only reached today when the user arms INLINE
// editing — the "Editar a página" toolbar tool in serviceClientApp.ts. Someone editing exclusively
// through ServiceSource never touches that tool, so this watcher has to run independently, gated
// only on studio mode being on (see serviceClientApp.ts's syncLiveUpdateWatcher).
//
// libModel.ts fires 'statusOrErrorChanged' for a plain .ts file both on a clean compile AND on an
// error (see _changeStatusFile) — storFile.hasError is what tells the two apart here, same gate
// studioLiveUpdateHotSwap's freshModuleUrl uses for the inline path.

import {
  findPageElement,
  resolveEditTarget,
  resolveSharedTarget,
  type IStudioEditTarget,
} from '/_102033_/l2/studio/studioEditTarget.js';
import { applyLiveUpdate } from '/_102033_/l2/studio/studioLiveUpdate.js';

interface IChangedFileRef {
  project: number;
  shortName: string;
  folder: string;
  level?: number;
}

/** What a page's own `loadStyle` (mls-102029/l2/collabLitElement.ts) expects. */
interface IStyleLoadable {
  loadStyle?: (css: string) => void;
}

function sameFile(a: IStudioEditTarget, b: IChangedFileRef): boolean {
  return a.project === b.project && a.shortName === b.shortName && a.folder === b.folder;
}

export class StudioLiveUpdateWatcher {
  private host: HTMLElement | null = null;
  private listening = false;
  /** Bounded to one in flight: a slow compile finishing after a newer edit already started would
   *  apply stale code over fresh — simplest correct guard, since only one page is mounted at a time. */
  private applying = false;

  public start(host: HTMLElement): void {
    if (this.listening) return;
    this.host = host;
    mls.events.addListener(2, 'FileAction', this.onFileAction);
    // '.less' fires a DIFFERENT event ('styleChanged', not 'FileAction' — see onStyleChanged).
    mls.events.addListener(2, 'styleChanged' as mls.events.TypeEvent, this.onStyleChanged);
    this.listening = true;
  }

  public stop(): void {
    if (!this.listening) return;
    mls.events.removeEventListener([2], ['FileAction'], this.onFileAction);
    mls.events.removeEventListener([2], ['styleChanged' as mls.events.TypeEvent], this.onStyleChanged);
    this.listening = false;
    this.host = null;
  }

  private readonly onFileAction = (ev: mls.events.IEvent): void => {
    if (ev.level !== 2 || ev.type !== 'FileAction' || !ev.desc) return;
    const fileAction = JSON.parse(ev.desc) as mls.events.IFileAction;
    // 'editorChanged' never actually fires for a plain .ts file today (libModel.ts only routes it
    // there for .less) — kept in the filter so a future change to that routing is picked up for
    // free instead of silently doing nothing.
    if (fileAction.action !== 'editorChanged' && fileAction.action !== 'statusOrErrorChanged') return;
    if (fileAction.extension !== '.ts') return;
    void this.handle(fileAction);
  };

  private readonly onStyleChanged = (ev: mls.events.IEvent): void => {
    if (ev.level !== 2 || !ev.desc) return;
    let parsed: { storFile?: IChangedFileRef } | null = null;
    try {
      parsed = JSON.parse(ev.desc) as { storFile?: IChangedFileRef };
    } catch {
      return;
    }
    if (!parsed?.storFile) return;
    void this.handleStyleChanged(parsed.storFile);
  };

  /**
   * '.less' -> live <style> refresh, WITHOUT going through applyLiveUpdate.
   *
   * The compiled constructor bakes in `this.loadStyle(css)` with the CSS text hardcoded at compile
   * time (the browser-side equivalent of processCssAfterCompile.mjs, run here via
   * mls.l2.less.compileStyle during _updateModelStatusLess) — a constructor, not a prototype member.
   * hotSwap only patches the PROTOTYPE (patchOwnMembers/relinkBaseClass); a constructor never re-runs
   * for an instance that already exists, so that path can never reach a style-only edit no matter
   * what it copies. Calling the instance's OWN inherited `loadStyle` directly, with the freshly
   * compiled CSS, does the same thing the fresh constructor would have done — loadStyle
   * (mls-102029/l2/collabLitElement.ts) is idempotent, it just replaces the textContent of the
   * existing `<style id={tag}>` by id, so which class version happens to be registered is irrelevant.
   */
  private async handleStyleChanged(ref: IChangedFileRef): Promise<void> {
    const host = this.host;
    if (!host) return;

    const pageEl = findPageElement(host);
    if (!pageEl) return;
    const pageTag = pageEl.tagName.toLowerCase();

    const resolved = await resolveEditTarget(host);
    if (!resolved.ok) return;
    const page = resolved.target;

    let belongsToPage = sameFile(page, ref);
    if (!belongsToPage) {
      const shared = await resolveSharedTarget(page);
      belongsToPage = Boolean(shared && sameFile(shared, ref));
    }
    // Not the mounted page nor its shared base — a .less being edited elsewhere in the studio.
    if (!belongsToPage) return;

    const models = mls.editor.getModels(ref.project, ref.shortName, ref.folder, ref.level ?? 2);
    const styleResults = models?.style?.styleResults;
    // No result yet, or the LESS itself does not compile — never push broken/stale CSS.
    if (!styleResults || styleResults.errors.length > 0) return;

    for (const el of Array.from(document.querySelectorAll(pageTag))) {
      (el as unknown as IStyleLoadable).loadStyle?.(styleResults.css);
    }
  }

  private async handle(ref: IChangedFileRef): Promise<void> {
    if (this.applying) return;
    const host = this.host;
    if (!host) return;

    const pageEl = findPageElement(host);
    if (!pageEl) return;
    const pageTag = pageEl.tagName.toLowerCase();

    const resolved = await resolveEditTarget(host);
    if (!resolved.ok) return;
    const page = resolved.target;

    let edited: IStudioEditTarget | null = null;
    if (sameFile(page, ref)) {
      edited = page;
    } else {
      const shared = await resolveSharedTarget(page);
      if (shared && sameFile(shared, ref)) edited = shared;
    }
    // Not the mounted page nor its shared base — some other file being edited elsewhere in the
    // studio; not ours to react to.
    if (!edited) return;

    // Never swap in broken code — the DOM already shows nothing changed, and the next clean compile
    // fires its own 'statusOrErrorChanged' that will retry this.
    if (edited.storFile.hasError) return;

    this.applying = true;
    try {
      await applyLiveUpdate({ edited, page, pageTag });
    } finally {
      this.applying = false;
    }
  }
}
