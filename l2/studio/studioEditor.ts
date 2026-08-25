/// <mls fileReference="_102033_/l2/studio/studioEditor.ts" enhancement="_blank" />
// In-place visual editor for the page the user is navigating (TASK-102033-app-como-preview, part 2).
//
// PORT of `_102020_/l2/aura/services/preview/previewEditorL3.ts`. The copy exists because 102020 is
// not part of the app build (see studioTextEdit.ts). What it does differently:
//
//  1. HOST-BOUND, not a wrapper. The original is a custom element whose CHILDREN are the page; here
//     the editor attaches to an existing host — `[data-region-host="content"]`. That is mandatory:
//     the shell's `mountRegion` reuses the mounted element by comparing
//     `host.firstElementChild.tagName` to the route's tag and runs on EVERY shell render, so a node
//     inserted between host and page would make the shell remount (and reset) the screen. Being
//     host-bound also means it needs no Lit and no custom element: the original never rendered a
//     template anyway (`createRenderRoot() { return this }` + direct DOM work).
//  2. `off` IS THE DEFAULT and registers NO listeners. The original stops propagation in every mode
//     ("Page NEVER receives pointer events in any mode") — fine inside a preview iframe, fatal in
//     the client app, where the user has to navigate before editing.
//  3. The source comes from `studioEditTarget` (the DOM tag), not from `preview.service` state.
//  4. The language comes from the app runtime (`documentElement.lang`), not `preview.language`.
//  5. No postMessage: the owner gets a callback.
//
// TWO SEPARATE LAYERS, on purpose:
//  - the MARKING (hover/selection/box model) is a `position: fixed` layer on the body, using viewport
//    coordinates. It cannot sit inside the page subtree (rule 1), and on the body it never inherits a
//    clipping or transformed ancestor.
//  - the STATUS toast lives INSIDE the service element (`chromeHost`), absolutely positioned. On the
//    body it rendered as an app-wide notification, escaping the panel it reports about.

import {
  applyTextEdit,
  findTextOriginByKey,
  findTextOriginByOccurrence,
  pickLocale,
  pickSiblingLocales,
  readSharedKeyMap,
  type TextOrigin,
} from '/_102033_/l2/studio/studioTextEdit.js';
import { applyLiveUpdate } from '/_102033_/l2/studio/studioLiveUpdate.js';
import {
  compileAfterEdit,
  currentLanguage,
  findPageElement,
  persistLocalEdit,
  resolveEditTarget,
  resolveOrganismTargets,
  resolveSharedTarget,
  saveTarget,
  type IStudioEditTarget,
} from '/_102033_/l2/studio/studioEditTarget.js';

export type StudioEditMode = 'off' | 'select' | 'text' | 'inspect';

export interface StudioEditorEvents {
  /** Target resolution changed (armed, page navigated, unresolvable). */
  onTarget?: (target: IStudioEditTarget | null, reason: string) => void;
  /** A file was written to the VM. There is no save step — every edit persists immediately. */
  onSaved?: (target: IStudioEditTarget) => void;
}

const STYLE_ID = 'se-editor-styles';

/** How long a transient toast stays up. Long enough to read the key that was edited. */
const STATUS_TIMEOUT_MS = 5000;

/** Elements the editor itself puts on the page — never selectable, never counted. */
const CONTROL_CLASS = 'se-control';

export class StudioEditor {

  private host: HTMLElement | null = null;
  private mode: StudioEditMode = 'off';
  private overlayEl: HTMLDivElement | null = null;
  private selectedEl: HTMLElement | null = null;
  private lastHoveredEl: HTMLElement | null = null;
  private target: IStudioEditTarget | null = null;
  /**
   * Files that can hold this page's text, resolved lazily: page, organism files, shared base class.
   * Null until the first edit needs it.
   */
  private candidates: IStudioEditTarget[] | null = null;
  private statusText = '';
  private statusTimer: number | null = null;
  private events: StudioEditorEvents;

  private editSpan: HTMLSpanElement | null = null;
  private moleculeUnlockTimer: number | null = null;
  private hostObserver: MutationObserver | null = null;
  private hostResizeObserver: ResizeObserver | null = null;
  private overlayHidden = false;
  private lastPageTag = '';
  /** Where the editor's own chrome (the status toast) lives — the SERVICE element, not the body. */
  private chromeHost: HTMLElement | null = null;
  private statusEl: HTMLDivElement | null = null;
  private chromePositionPatched = false;

  constructor(events: StudioEditorEvents = {}) {
    this.events = events;
  }

  // --- Public API ---

  /**
   * Binds to a region host. Idempotent; rebinding to a new host detaches from the old one.
   *
   * @param host - the region host the editor watches and captures events on.
   * @param chromeHost - where the editor's own UI (the status toast) is mounted. Pass the SERVICE
   *        element: a toast on the body reads as an app-wide notification and escapes the panel. It
   *        must NOT be the region host — nothing may sit between it and the page element.
   */
  public attach(host: HTMLElement, chromeHost?: HTMLElement): void {
    if (this.host === host) return;
    this.detach();
    this.host = host;
    this.chromeHost = chromeHost ?? null;
    this.injectStyles();
    this.createOverlay();
    this.createStatusEl();
    // The target is resolved when the editor is armed (setMode), not here: attaching while `off`
    // must not build a Monaco model nobody asked for.
    this.watchHost(host);
  }

  /**
   * Re-resolves the target when the mounted page changes.
   *
   * Without this, navigating with the editor armed would write into the PREVIOUS page's source —
   * the one thing this flow must never do. The shell swaps the host's child on navigation and on a
   * variation swap, so watching childList covers both.
   */
  private watchHost(host: HTMLElement): void {
    this.lastPageTag = this.pageTag() ?? '';
    this.hostObserver = new MutationObserver(() => {
      const tag = this.pageTag() ?? '';
      if (tag === this.lastPageTag) return;
      this.lastPageTag = tag;
      this.selectedEl = null;
      this.lastHoveredEl = null;
      void this.refreshTarget();
    });
    this.hostObserver.observe(host, { childList: true });

    // The overlay is a FIXED layer on the body, so it survives the app panel going away — switching
    // nav3 service left the selection box floating over the other service's content. A hidden panel
    // collapses to a 0-sized box, which this catches for every cause at once (service switch, level
    // change, splitter collapse), independently of the service framework.
    this.hostResizeObserver = new ResizeObserver(() => {
      this.setOverlayVisible(this.isHostVisible());
    });
    this.hostResizeObserver.observe(host);
  }

  private isHostVisible(): boolean {
    return !!this.host && this.host.getClientRects().length > 0;
  }

  /**
   * Shows/hides the overlay without changing the armed state.
   *
   * Hiding CLEARS the selection: coming back to a panel whose page may have been replaced, a kept
   * selection would point at a stale element — and a marking that survives what it marks is exactly
   * the bug this guards against.
   */
  public setOverlayVisible(visible: boolean): void {
    const hidden = !visible;
    if (hidden === this.overlayHidden) return;
    this.overlayHidden = hidden;
    if (hidden) {
      this.selectedEl = null;
      this.lastHoveredEl = null;
      this.clearOverlay();
    } else {
      this.drawSelection();
    }
  }

  /** Unbinds completely: listeners, overlay and injected CSS all go. */
  public detach(): void {
    this.setMode('off');
    this.hostObserver?.disconnect();
    this.hostObserver = null;
    this.hostResizeObserver?.disconnect();
    this.hostResizeObserver = null;
    this.overlayHidden = false;
    this.host = null;
    this.selectedEl = null;
    this.lastHoveredEl = null;
    this.target = null;
    this.overlayEl?.remove();
    this.overlayEl = null;
    if (this.statusTimer !== null) {
      clearTimeout(this.statusTimer);
      this.statusTimer = null;
    }
    this.statusEl?.remove();
    this.statusEl = null;
    // Only undo what we changed: the service's own styling must survive disarming.
    if (this.chromePositionPatched && this.chromeHost) this.chromeHost.style.position = '';
    this.chromePositionPatched = false;
    this.chromeHost = null;
    // The head belongs to the CLIENT app: leaving editor CSS behind after disarming is a leak.
    document.getElementById(STYLE_ID)?.remove();
  }

  public getMode(): StudioEditMode {
    return this.mode;
  }

  public getTarget(): IStudioEditTarget | null {
    return this.target;
  }

  /** Shows a message on the editor's own status strip. */
  public showStatus(text: string, sticky = false): void {
    this.setStatus(text, sticky);
  }

  /**
   * Arms or disarms the editor.
   *
   * `off` REMOVES the listeners — while armed the page cannot be used normally (every pointer event
   * is captured), so this is the switch between "navigating" and "editing".
   */
  public setMode(mode: StudioEditMode): void {
    if (this.mode === mode) return;

    const wasOff = this.mode === 'off';
    this.mode = mode;

    if (mode === 'off') {
      // Disarming mid-edit must not leave an orphan contenteditable span in the CLIENT app: blur
      // commits (or reverts) it through the normal onBlur path first.
      this.editSpan?.blur();
      this.removeListeners();
      this.clearOverlay();
      this.selectedEl = null;
      this.lastHoveredEl = null;
      return;
    }

    if (wasOff) {
      this.addListeners();
      void this.refreshTarget();
    }
    this.applyCursor();
  }

  /** Re-resolves the page source — call after the app navigates or swaps variation. */
  public async refreshTarget(): Promise<void> {
    if (!this.host) return;

    const result = await resolveEditTarget(this.host);
    // A new page means a new chain of candidate files.
    this.candidates = null;
    if (result.ok) {
      this.target = result.target;
      this.statusText = '';
      this.events.onTarget?.(this.target, '');
    } else {
      this.target = null;
      this.statusText = result.reason;
      this.events.onTarget?.(null, result.reason);
    }
    this.drawStatusOnly();
  }

  // --- Listeners ---

  private addListeners(): void {
    const host = this.host;
    if (!host) return;
    host.addEventListener('click', this.onHostClick, true);
    host.addEventListener('pointerdown', this.onHostPointerDown, true);
    host.addEventListener('mousedown', this.onHostPointerDown, true);
    host.addEventListener('mousemove', this.onHostMouseMove);
    host.addEventListener('mouseleave', this.onHostMouseLeave);
    // Capture phase, unlike the original: in the app the page scrolls inside the nav3 panel, and a
    // scroll on an inner element never bubbles to window — it only passes through on capture. The
    // fixed-position highlights would drift away from the element otherwise.
    window.addEventListener('scroll', this.onScrollResize, true);
    window.addEventListener('resize', this.onScrollResize);
  }

  private removeListeners(): void {
    const host = this.host;
    if (host) {
      host.removeEventListener('click', this.onHostClick, true);
      host.removeEventListener('pointerdown', this.onHostPointerDown, true);
      host.removeEventListener('mousedown', this.onHostPointerDown, true);
      host.removeEventListener('mousemove', this.onHostMouseMove);
      host.removeEventListener('mouseleave', this.onHostMouseLeave);
      host.style.cursor = '';
    }
    window.removeEventListener('scroll', this.onScrollResize, true);
    window.removeEventListener('resize', this.onScrollResize);
  }

  /**
   * The mode, self-healed.
   *
   * `text` is only real while the edit span is alive. It can die without a blur — a Lit re-render of
   * the page drops the span, and element removal does not reliably fire blur — and every handler
   * short-circuits in `text` mode, so a stale `text` froze the editor: no hover, no selection, and
   * no way back short of disarming. Recovering here keeps that unreachable.
   */
  private currentMode(): StudioEditMode {
    if (this.mode === 'text' && (!this.editSpan || !this.editSpan.isConnected)) {
      this.editSpan = null;
      this.mode = 'select';
      this.applyCursor();
    }
    return this.mode;
  }

  private onHostPointerDown = (e: Event): void => {
    // While armed the page must not react to the pointer — otherwise clicking a button to edit its
    // label would submit the form. In `off` mode this handler is not even registered.
    e.stopPropagation();

    if (this.currentMode() !== 'text' || !(e instanceof MouseEvent) || !this.editSpan) return;

    // Text mode: reposition the caret, or end the edit when clicking away.
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (range && this.editSpan.contains(range.startContainer)) {
      this.editSpan.focus();
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else {
      this.editSpan.blur();
    }
  };

  private onHostClick = (e: MouseEvent): void => {
    e.stopPropagation();
    e.preventDefault(); // no link navigation, no default browser action

    if (this.currentMode() === 'text') return;

    const target = e.target as HTMLElement | null;
    if (!target || this.isControl(target) || target === this.host) return;

    // A new click means the user moved on from whatever the last message said.
    this.statusText = '';

    const selectableEl = this.resolveSelectableElement(target);
    this.selectedEl = selectableEl;
    // Forget the hover cache: the mousemove handler skips redraws while the pointer stays on the
    // same element, so without this the hover outline would not come back over the element just
    // clicked.
    this.lastHoveredEl = null;
    this.drawSelection();

    const textResult = this.findClickedTextNode(e, target);
    if (!textResult) return;

    // Preferred path: the i18n key emitted by the t() helper (data-i18n-key) — deterministic, no
    // occurrence counting. Fallback: occurrence heuristics over the intact DOM.
    const i18nKey = this.resolveI18nKey(textResult.textNode);
    let occurrenceIndex = 0;
    if (!i18nKey) {
      const clickedText = (textResult.textNode.textContent || '').trim();
      occurrenceIndex = this.getTextOccurrenceIndex(textResult.textNode, clickedText);
    }

    // Only enter text mode once the span really exists: enableTextEdit can bail out, and a `text`
    // mode with no span freezes every handler (see currentMode).
    if (this.enableTextEdit(textResult.textNode, textResult.offset, occurrenceIndex, i18nKey)) {
      this.mode = 'text';
      this.applyCursor();
    }
  };

  private onHostMouseMove = (e: MouseEvent): void => {
    // Hover stays alive in EVERY armed mode, `text` included. The original bailed out while editing
    // (it was written for a preview iframe), which read as "the hover broke after I selected
    // something" — clicking a text enters text mode immediately, so the outline vanished until the
    // span lost focus.
    if (this.currentMode() === 'off') return;

    const target = e.target as HTMLElement | null;
    if (!target || target === this.lastHoveredEl) return;
    if (this.isControl(target) || target === this.host) return;
    // The span being edited already has its own outline; a hover box on top just fights it.
    if (this.editSpan && (target === this.editSpan || this.editSpan.contains(target))) return;

    this.lastHoveredEl = target;
    if (this.mode === 'inspect') this.drawBoxModel(target);
    else this.drawHover(target);
  };

  private onHostMouseLeave = (): void => {
    if (this.currentMode() === 'off') return;
    this.lastHoveredEl = null;
    this.drawSelection();
  };

  private onScrollResize = (): void => {
    if (this.currentMode() === 'off') return;
    this.drawSelection();
  };

  // --- Element resolution ---

  private isControl(el: HTMLElement): boolean {
    return el.closest(`.${CONTROL_CLASS}`) !== null;
  }

  /**
   * Walks up to the nearest custom element that is NOT the page component itself, so selecting
   * inside a molecule selects the molecule and not its internal markup.
   */
  private resolveSelectableElement(target: HTMLElement): HTMLElement {
    const pageTag = this.pageTag();
    let current: HTMLElement | null = target;

    while (current && current !== this.host) {
      const parent: HTMLElement | null = current.parentElement;
      if (!parent || parent === this.host) break;

      const parentTag = parent.tagName.toLowerCase();
      if (parentTag.includes('-') && pageTag && parentTag !== pageTag) {
        return parent;
      }
      current = parent;
    }

    return target;
  }

  private pageTag(): string | null {
    if (!this.host) return null;
    return findPageElement(this.host)?.tagName.toLowerCase() ?? null;
  }

  // --- Text nodes ---

  private findClickedTextNode(e: MouseEvent, el: HTMLElement): { textNode: Text; offset: number } | null {
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
      const text = (range.startContainer.textContent || '').trim();
      if (text) return { textNode: range.startContainer as Text, offset: range.startOffset };
    }

    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE && (child.textContent || '').trim()) {
        return { textNode: child as Text, offset: 0 };
      }
    }
    return null;
  }

  /** The i18n key of the nearest ancestor carrying data-i18n-key (emitted by the t() helper). */
  private resolveI18nKey(textNode: Text): string | null {
    let el: HTMLElement | null = textNode.parentElement;
    while (el && el !== this.host) {
      const key = el.getAttribute('data-i18n-key');
      if (key) return key;
      el = el.parentElement;
    }
    return null;
  }

  /**
   * Index of this text node among the nodes with the same value, in document order.
   *
   * When at least one match is Lit-bound, the universe narrows to the bound ones so incidental
   * static text does not inflate the index — but the target itself always enters, by identity.
   */
  private getTextOccurrenceIndex(targetTextNode: Text, text: string): number {
    const pageEl = this.host ? findPageElement(this.host) : null;
    if (!pageEl) return 0;

    const normalizedText = text.trim();
    const matches: { node: Text; litBound: boolean }[] = [];
    const walker = document.createTreeWalker(pageEl, NodeFilter.SHOW_TEXT, null);
    let node: Node | null = walker.nextNode();
    while (node) {
      if ((node.textContent || '').trim() === normalizedText) {
        matches.push({ node: node as Text, litBound: this.isLitBoundTextNode(node as Text) });
      }
      node = walker.nextNode();
    }

    const anyBound = matches.some((m) => m.litBound);
    const universe = anyBound
      ? matches.filter((m) => m.litBound || m.node === targetTextNode)
      : matches;

    const idx = universe.findIndex((m) => m.node === targetTextNode);
    return idx >= 0 ? idx : 0;
  }

  private isLitBoundTextNode(node: Text): boolean {
    const prev = node.previousSibling;
    return !!prev
      && prev.nodeType === Node.COMMENT_NODE
      && (prev as Comment).data.startsWith('?lit$');
  }

  // --- Inline text edit ---

  /**
   * Isolates the clicked text node in a temporary contenteditable span.
   *
   * The span (rather than making the parent editable) is what stops a native button from treating
   * Space as a click: focus goes to the span, not the button.
   *
   * @returns true when the span was created — the caller only switches to `text` mode then.
   */
  private enableTextEdit(
    textNode: Text,
    caretOffset: number,
    occurrenceIndex: number,
    i18nKey: string | null,
  ): boolean {
    const oldText = (textNode.textContent || '').trim();
    if (!oldText) return false;

    const editParent = textNode.parentElement;
    if (!editParent) return false;

    if (this.moleculeUnlockTimer !== null) {
      clearTimeout(this.moleculeUnlockTimer);
      this.moleculeUnlockTimer = null;
    }

    const moleculeHost = this.findMoleculeHost(editParent);
    if (moleculeHost) moleculeHost._mutationLock = true;

    const span = document.createElement('span');
    span.className = 'se-edit-span';
    span.contentEditable = 'true';
    span.textContent = oldText;
    editParent.replaceChild(span, textNode);
    this.editSpan = span;

    span.focus();

    const innerTextNode = span.firstChild;
    if (innerTextNode && document.createRange) {
      const range = document.createRange();
      const clampedOffset = Math.min(caretOffset, (innerTextNode.textContent || '').length);
      range.setStart(innerTextNode, clampedOffset);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    const onBlur = () => {
      const newText = (span.textContent || '').trim();

      // Optimistic: show the new text immediately. On a dynamic origin the source edit fails and
      // restoredNode is reverted below.
      const restoredNode = document.createTextNode(newText !== oldText ? newText : oldText);
      span.parentElement?.replaceChild(restoredNode, span);
      this.editSpan = null;

      this.mode = 'select';
      this.applyCursor();

      if (newText !== oldText) {
        void this.applyTextEditToSource(oldText, newText, occurrenceIndex, editParent, restoredNode, i18nKey);
      }

      span.removeEventListener('blur', onBlur);
      span.removeEventListener('keydown', onKeydown);

      this.moleculeUnlockTimer = window.setTimeout(() => {
        this.moleculeUnlockTimer = null;
        if (moleculeHost) moleculeHost._mutationLock = false;
      }, 50);
    };

    const onKeydown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        span.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        span.textContent = oldText; // blur() below persists whatever is in the span
        span.blur();
      }
    };

    span.addEventListener('blur', onBlur);
    span.addEventListener('keydown', onKeydown);
    return true;
  }

  /** Nearest ancestor that is a molecule (they expose `_mutationLock`), or null. */
  private findMoleculeHost(el: HTMLElement): { _mutationLock: boolean } | null {
    let current: HTMLElement | null = el.parentElement;
    while (current && current !== this.host) {
      if (typeof (current as unknown as { _mutationLock?: boolean })._mutationLock === 'boolean') {
        return current as unknown as { _mutationLock: boolean };
      }
      current = current.parentElement;
    }
    return null;
  }

  /**
   * Writes the edit into the page source.
   *
   * With a data-i18n-key present the origin is resolved deterministically by key; otherwise by
   * occurrence. A `dynamic` origin means the text is DATA, not code — very common in the app (the
   * preview runs with empty data, the app with real data), so it is reported as information, not as
   * a failure.
   */
  private async applyTextEditToSource(
    oldText: string,
    newText: string,
    occurrenceIndex: number,
    editTarget: HTMLElement,
    restoredNode: Text,
    i18nKey: string | null,
  ): Promise<void> {
    if (!this.target) {
      restoredNode.textContent = oldText;
      this.flashError(editTarget);
      this.setStatus(this.statusText || 'Sem arquivo-fonte resolvido para esta tela.');
      return;
    }

    const pageSource = this.target.model.model.getValue();
    const documentLang = currentLanguage();

    const resolve = (src: string): TextOrigin => (i18nKey
      ? findTextOriginByKey(i18nKey, src, documentLang)
      // Messages come from `src`, but the ORDER of the matches comes from the page template — on
      // generated pages those are two different files.
      : findTextOriginByOccurrence(oldText, src, occurrenceIndex, documentLang, pageSource));

    // The text can live in THREE places, and the order is what makes the right one win:
    //  1. the page file — the current generator gives it its own catalog with short keys, part of them
    //     literals of its own;
    //  2. an organism file (`<name>_O<k>.ts`) — same structure, its own catalog;
    //  3. the shared base class — the long dotted keys, where the mapped text really lives.
    // The page comes first because its catalog is what the template reads: when the same value exists
    // both there and in the shared, the page is the one on screen.
    let origin: TextOrigin = { type: 'dynamic', reason: 'not resolved' };
    let editTargetFile = this.target;
    let activeSource = pageSource;

    for (const candidate of await this.resolveCandidates()) {
      const src = candidate.model.model.getValue();
      const found = resolve(src);
      if (found.type === 'dynamic') continue;
      origin = found;
      editTargetFile = candidate;
      activeSource = src;
      break;
    }

    if (origin.type === 'dynamic') {
      restoredNode.textContent = oldText;
      this.flashError(editTarget);
      this.setStatus('Esse texto é conteúdo (vem dos dados), não código — não há o que editar na fonte.');
      return;
    }

    // Against the locales the catalog DECLARES, not the document language reduced to its primary
    // subtag: the current generator declares `pt` and `pt-br` separately, and editing the wrong one
    // changes the file while the screen keeps the old text.
    const lang = origin.type === 'i18n'
      ? pickLocale(origin.languages.map((l) => l.lang), documentLang)
      : documentLang;

    // Reaches same-language siblings that hold the SAME text: the app can offer `pt` AND `pt-br` in the
    // language cycle, and editing only the displayed one made the change look like it vanished when the
    // user cycled back into the sibling. A sibling with DIFFERENT text is a real translation and is left
    // alone.
    const locales = origin.type === 'i18n' && lang ? pickSiblingLocales(origin, lang) : lang;

    const result = applyTextEdit(origin, newText, activeSource, locales);
    if (!result.success || !result.newSource) {
      restoredNode.textContent = oldText;
      this.flashError(editTarget);
      this.setStatus(result.error || 'Não foi possível aplicar a edição na fonte.');
      return;
    }

    const model = editTargetFile.model.model;
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: result.newSource }],
      () => null,
    );

    // Straight to the local store: the lib's own listener would do it, but 400ms later, and the save
    // below reads the local copy — that race is what failed with "Object not found in IndexedDB".
    await persistLocalEdit(editTargetFile, result.newSource);

    // The locale is part of the identity of what was edited: without it, an edit that lands on a
    // sibling locale looks like it did nothing when the language cycles.
    const localeNote = origin.type === 'i18n' && Array.isArray(locales) && locales.length > 0
      ? ` (${locales.join(', ')})`
      : '';
    const what = origin.type === 'i18n' ? `i18n "${origin.key}"${localeNote}` : 'texto';
    const where = editTargetFile === this.target
      ? ' nesta página'
      : ` em ${editTargetFile.shortName} (${editTargetFile.folder})`;
    // A shared key reached through the page's `fromShared` mapping is used by every page that maps
    // it — the edit is NOT local to this screen, and the user has no other way to know that.
    const scope = origin.type === 'i18n' && this.isSharedKey(pageSource, origin.key)
      ? ' — atenção: essa chave é compartilhada, muda em toda página que a usa'
      : '';
    // Sticky: it is a progress message, always superseded below. Letting it time out would make the
    // toast blink out and back in whenever the save takes longer than the timeout.
    this.setStatus(`${what} editado${where} — salvando...`, true);

    // Compiles first: it fills `compilerResults.prodJS` (what the live update evaluates) and puts the
    // fresh JS in the SW cache (what a reload would serve).
    await compileAfterEdit(editTargetFile);

    // Reaches the RUNNING app. The DOM already shows the new text, but the registered class still
    // holds the old code — without this, navigating away and back brings the old text back. Which
    // strategy does it is a swappable mode (see studioLiveUpdate).
    const live = await applyLiveUpdate({
      edited: editTargetFile,
      page: this.target,
      pageTag: this.pageTag() ?? '',
    });

    // Persisted right away: there is no save step. Editing the model alone would only touch the
    // browser (IndexedDB + SW cache) — the lib has no autosave hook, so without this the VM file
    // tree, which is what publish syncs, would never see the edit.
    try {
      await saveTarget(editTargetFile, `studio edit: ${editTargetFile.page}`);
      this.setStatus(`${what} salvo${where} — ${live.message}${scope}`);
      this.events.onSaved?.(editTargetFile);
    } catch (err) {
      // saveTarget puts the dirty flag back, so the edit survives in the browser for a retry.
      this.setStatus(`${what} editado${where}, mas FALHOU ao salvar: ${(err as Error).message}`, true);
    }
  }

  /** The shared base class of the current page, resolved once per page. */
  /**
   * Files that can hold the text of the mounted page, in resolution order: page, organisms, shared.
   *
   * Resolved once per page and cached — each entry costs a Monaco model.
   */
  private async resolveCandidates(): Promise<IStudioEditTarget[]> {
    if (!this.target) return [];
    if (this.candidates) return this.candidates;

    const chain: IStudioEditTarget[] = [this.target];
    chain.push(...await resolveOrganismTargets(this.target));
    const shared = await resolveSharedTarget(this.target);
    if (shared) chain.push(shared);

    this.candidates = chain;
    return chain;
  }

  /** True when the key is one the page maps out of the shared catalog (`fromShared`). */
  private isSharedKey(pageSource: string, key: string): boolean {
    try {
      const mapped = readSharedKeyMap(pageSource);
      // Either the SHORT key the page declares, or the LONG key it points at.
      if (mapped.has(key)) return true;
      for (const long of mapped.values()) if (long === key) return true;
      // No mapping at all means the previous generator's shape: the catalog lives only in the shared
      // base, so any i18n key there is shared by construction.
      return mapped.size === 0 && key.includes('.');
    } catch {
      return false;
    }
  }

  // --- Overlay ---

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .se-overlay {
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none; z-index: 99990;
      }

      .se-hover-highlight {
        outline: 2px dashed rgba(66,135,245,0.6);
        background: rgba(66,135,245,0.05);
      }

      .se-select-highlight {
        outline: 2px solid #4287f5;
        background: rgba(66,135,245,0.08);
      }

      .se-select-label {
        position: absolute; top: -22px; left: -1px;
        background: #4287f5; color: white;
        padding: 2px 8px; font-size: 11px;
        border-radius: 3px 3px 0 0;
        font-family: monospace;
        white-space: nowrap;
      }

      /* Absolute inside the SERVICE element, not fixed on the viewport: a toast on the body reads as
         an app-wide notification instead of feedback from this panel. */
      .se-status {
        position: absolute; bottom: 12px; left: 50%;
        transform: translateX(-50%);
        z-index: 99991;
        max-width: 80%;
        background: #1f2933; color: #f5f7fa;
        padding: 6px 12px; font-size: 12px;
        border-radius: 4px;
        font-family: "Segoe UI", sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      }

      .se-edit-span {
        display: inline;
        min-width: 1ch;
        outline: 2px solid #f5a623 !important;
        background: rgba(245, 166, 35, 0.08) !important;
        border-radius: 2px;
        padding: 0 2px;
      }

      @keyframes se-error-flash {
        0%, 100% { outline: 2px solid transparent; background: transparent; }
        20%, 60% { outline: 2px solid #e53935; background: rgba(229,57,53,0.12); }
      }
      .se-edit-error {
        animation: se-error-flash 600ms ease;
        border-radius: 2px;
      }
    `;
    document.head.appendChild(style);
  }

  private createOverlay(): void {
    if (this.overlayEl) return;
    this.overlayEl = document.createElement('div');
    this.overlayEl.classList.add(CONTROL_CLASS, 'se-overlay');
    // On the BODY, not inside the host: nothing may sit between the region host and the page
    // element, or the shell remounts the screen on its next render.
    document.body.appendChild(this.overlayEl);
  }

  private clearOverlay(): void {
    if (this.overlayEl) this.overlayEl.innerHTML = '';
    this.renderStatus();
  }

  /**
   * Creates the status toast INSIDE the service element.
   *
   * Deliberately not part of the fixed overlay on the body: there it rendered as a viewport-level
   * notification, outside the panel it belongs to. Absolute inside the service keeps it scoped —
   * which also means it needs the service to be a positioned ancestor.
   */
  private createStatusEl(): void {
    if (this.statusEl) return;
    const container = this.chromeHost;
    if (!container) return;

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
      this.chromePositionPatched = true;
    }

    this.statusEl = document.createElement('div');
    this.statusEl.className = `${CONTROL_CLASS} se-status`;
    this.statusEl.hidden = true;
    container.appendChild(this.statusEl);
  }

  /**
   * Shows a message on the toast.
   *
   * Transient by default: it fades after STATUS_TIMEOUT_MS so the panel is not left with a permanent
   * strip over the content. `sticky` is for the messages the user must not miss — a failed save, where
   * the edit is still pending and vanishing feedback would look like success.
   */
  private setStatus(text: string, sticky = false): void {
    if (this.statusTimer !== null) {
      clearTimeout(this.statusTimer);
      this.statusTimer = null;
    }
    this.statusText = text;
    this.renderStatus();
    this.drawSelection();

    if (!text || sticky) return;
    this.statusTimer = window.setTimeout(() => {
      this.statusTimer = null;
      this.statusText = '';
      this.renderStatus();
    }, STATUS_TIMEOUT_MS);
  }

  private renderStatus(): void {
    if (!this.statusEl) return;
    const visible = Boolean(this.statusText) && this.mode !== 'off' && !this.overlayHidden;
    this.statusEl.hidden = !visible;
    this.statusEl.textContent = visible ? this.statusText : '';
  }

  private drawStatusOnly(): void {
    this.renderStatus();
  }

  private drawHover(el: HTMLElement): void {
    if (!this.overlayEl || this.overlayHidden) return;
    let html = this.selectionHtml();

    if (el !== this.selectedEl) {
      const rect = el.getBoundingClientRect();
      html += `<div class="se-hover-highlight" style="
        position:fixed;
        top:${rect.top}px; left:${rect.left}px;
        width:${rect.width}px; height:${rect.height}px;
      "></div>`;
    }

    // The status lives in its own element inside the service — never in this overlay.
    this.overlayEl.innerHTML = html;
  }

  private drawSelection(): void {
    if (!this.overlayEl || this.overlayHidden) return;
    this.overlayEl.innerHTML = this.selectionHtml();
  }

  private selectionHtml(): string {
    if (!this.selectedEl || !this.selectedEl.isConnected) return '';
    // `isConnected` is not enough: a hidden panel keeps its elements in the document, they just stop
    // being rendered. Without this the box would be drawn at a stale (or zeroed) position.
    if (this.selectedEl.getClientRects().length === 0) return '';
    const rect = this.selectedEl.getBoundingClientRect();
    const tag = this.selectedEl.tagName.toLowerCase();
    return `<div class="se-select-highlight" style="
      position:fixed;
      top:${rect.top}px; left:${rect.left}px;
      width:${rect.width}px; height:${rect.height}px;
    ">
      <span class="se-select-label">${escapeHtml(tag)}</span>
    </div>`;
  }

  private drawBoxModel(el: HTMLElement): void {
    if (!this.overlayEl || this.overlayHidden) return;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const mt = parseFloat(cs.marginTop);
    const mr = parseFloat(cs.marginRight);
    const mb = parseFloat(cs.marginBottom);
    const ml = parseFloat(cs.marginLeft);
    const pt = parseFloat(cs.paddingTop);
    const pr = parseFloat(cs.paddingRight);
    const pb = parseFloat(cs.paddingBottom);
    const pl = parseFloat(cs.paddingLeft);

    this.overlayEl.innerHTML = `
      <div style="position:fixed;
        top:${rect.top - mt}px; left:${rect.left - ml}px;
        width:${rect.width + ml + mr}px; height:${rect.height + mt + mb}px;
        background:rgba(246,178,107,0.3);
        pointer-events:none;"></div>
      <div style="position:fixed;
        top:${rect.top}px; left:${rect.left}px;
        width:${rect.width}px; height:${rect.height}px;
        border-top:${pt}px solid rgba(147,196,125,0.4);
        border-right:${pr}px solid rgba(147,196,125,0.4);
        border-bottom:${pb}px solid rgba(147,196,125,0.4);
        border-left:${pl}px solid rgba(147,196,125,0.4);
        box-sizing:border-box;
        pointer-events:none;"></div>
      <div style="position:fixed;
        top:${rect.top + pt}px; left:${rect.left + pl}px;
        width:${rect.width - pl - pr}px; height:${rect.height - pt - pb}px;
        background:rgba(66,135,245,0.1);
        pointer-events:none;"></div>
    `;
  }

  private flashError(el: HTMLElement): void {
    el.classList.add('se-edit-error');
    setTimeout(() => el.classList.remove('se-edit-error'), 650);
  }

  private applyCursor(): void {
    if (!this.host) return;
    const cursors: Record<StudioEditMode, string> = {
      off: '',
      select: 'default',
      text: 'text',
      inspect: 'crosshair',
    };
    this.host.style.cursor = cursors[this.mode];
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
