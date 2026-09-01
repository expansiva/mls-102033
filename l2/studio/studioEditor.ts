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
//  - the CHROME (the status toast and the class picker) sits on the BODY too, above the marking
//    (99991/99992 against 99990). It used to be a child of the service element, which is what made
//    it read as feedback from this panel instead of an app-wide notification — but nesting also
//    trapped it: `z-index` only compares inside a stacking context, so a transformed or layered
//    ancestor put the marking OVER the picker. Being where it is drawn is now `positionChrome`'s
//    job, not the parent's: it pins both to the visible part of the app's region (`chromeHost`),
//    which also fixed them hanging below the fold on a page with scroll.

import {
  applyTextEdit,
  findTextOriginByKey,
  findTextOriginByOccurrence,
  pickLocale,
  pickSiblingLocales,
  readSharedKeyMap,
  type TextOrigin,
} from '/_102033_/l2/studio/studioTextEdit.js';
import {
  CLASS_PICKER_TAG,
  type ClassPickerPanel,
  type IPickerApply,
  type IPickerPreview,
} from '/_102033_/l2/studio/classPickerPanel.js';
import { EditHistory } from '/_102033_/l2/studio/studioEditHistory.js';
import { t, tr, type IMessageRef } from '/_102033_/l2/studio/studioMessages.js';
import {
  activeAnimations,
  applyAnimationOption,
  NOT_LOCATED,
  classAttrSpan,
  editScope,
  describeMissingLiteral,
  findClassAttrs,
  parseClassAttr,
  readAnimationState,
  readDesignSystemRoles,
  repeatedRenderWarning,
  resolveAnchor,
  resolveStructuralAnchor,
  scanTemplateTree,
  splitUtilities,
  type IDomPathStep,
  type IUtilityToken,
} from '/_102033_/l2/studio/studioClassEdit.js';
import { builtCssClassNames, isStudioTailwindLive } from '/_102033_/l2/cbe/studioTailwind.js';
import { applyLiveUpdate } from '/_102033_/l2/studio/studioLiveUpdate.js';
import {
  compileAfterEdit,
  currentLanguage,
  findPageElement,
  persistLocalEdit,
  resolveEditTarget,
  resolveOrganismTargets,
  resolveSharedTarget,
  tagToFileInfo,
  type IStudioEditTarget,
} from '/_102033_/l2/studio/studioEditTarget.js';

export type StudioEditMode = 'off' | 'select' | 'text' | 'inspect';

export interface StudioEditorEvents {
  /** Target resolution changed (armed, page navigated, unresolvable). */
  onTarget?: (target: IStudioEditTarget | null, reason: string) => void;
  /**
   * A file was edited LOCALLY (model + local store). Nothing was written to the project's files —
   * that is the save's job — so this is "there is something to save", not "it is saved".
   */
  onEdited?: (target: IStudioEditTarget) => void;
  /**
   * An element was selected (null when the selection was dropped).
   *
   * The class picker itself lives HERE, next to the persistence machinery it needs — this hook is for
   * an owner that wants to mirror the selection in its own chrome.
   */
  onSelect?: (el: HTMLElement | null) => void;
}

const STYLE_ID = 'se-editor-styles';

/** How long a transient toast stays up. Long enough to read the key that was edited. */
const STATUS_TIMEOUT_MS = 5000;

/** Elements the editor itself puts on the page — never selectable, never counted. */
const CONTROL_CLASS = 'se-control';

/**
 * What the current selection resolved to for the class picker.
 *
 * Resolved AT SELECTION TIME, not on the chip click: the user has to know which file changes, and
 * whether the edit is refused, before choosing (the lesson of the `pt` vs `pt-br` round).
 */
/** How to find the literal again in the file: by DOM position, or by counting occurrences. */
type ClassAnchor =
  | { kind: 'structural'; path: IDomPathStep[] }
  | { kind: 'occurrence'; occurrence: number }
  /**
   * The element has NO class attribute: the edit writes one.
   *
   * Only structural — there is no literal to count, and the position in the template is the only
   * thing that identifies the element. The very first write turns it into a `structural` anchor like
   * any other, because by then the element has a literal.
   */
  | { kind: 'insert'; path: IDomPathStep[] };

/**
 * One undoable edit.
 *
 * It carries BOTH directions on purpose. `anchorBefore` finds the text the edit replaced (that is how
 * it is redone) and `anchorAfter` finds what it wrote (that is how it is undone) — and they are not
 * the same anchor: an edit that CREATED the class attribute is undone by removing it (`insert` one
 * way, `structural` the other), and a literal located by counting can be the 3rd `p-2` before and the
 * 1st `p-4` after.
 *
 * The element is a `WeakRef`: a step can outlive the node (a re-render, a navigation), and holding
 * dead DOM for the whole session to show a status line would be a leak. What the file needs to be
 * undone is all text.
 */
type EditStep =
  | {
    kind: 'class';
    file: IStudioEditTarget;
    anchorBefore: ClassAnchor;
    anchorAfter: ClassAnchor;
    before: string;
    after: string;
    what: string;
    el: WeakRef<HTMLElement>;
  }
  | {
    kind: 'text';
    /** Where the text is, as the text editor resolves it: by i18n key, or by occurrence. */
    i18nKey: string | null;
    occurrence: number;
    before: string;
    after: string;
    what: string;
    node: WeakRef<Text>;
    el: WeakRef<HTMLElement>;
  };

interface IClassPanelState {
  el: HTMLElement;
  /** The element's class attribute, exactly as authored — what has to be found in the source. */
  literal: string;
  tokens: IUtilityToken[];
  /** File that receives the edit, or null when nothing was resolved. */
  file: IStudioEditTarget | null;
  /** Null while the element could not be located. */
  anchor: ClassAnchor | null;
  /** What the user must know before choosing: the M = 1 / N > 1 warning. */
  warning?: IMessageRef;
  /** Why the edit cannot happen. The panel is read-only while this is set. */
  refusal?: IMessageRef;
}

export class StudioEditor {

  private host: HTMLElement | null = null;
  private mode: StudioEditMode = 'off';
  private overlayEl: HTMLDivElement | null = null;
  private selectedEl: HTMLElement | null = null;
  private lastHoveredEl: HTMLElement | null = null;
  private target: IStudioEditTarget | null = null;
  /** Why the page's file could not be resolved — the panel says this instead of guessing. */
  private targetFailure: IMessageRef | null = null;
  /**
   * Every edit of this session, newest last.
   *
   * Not the Monaco stack: that one undoes the TEXT and leaves the screen, the compile, the live
   * update and the local copy behind (see studioEditHistory).
   */
  private readonly history = new EditHistory<EditStep>();
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
  /**
   * Where the editor's own chrome (the toast and the class picker) lives — the SERVICE element, not
   * the body. It is only the PARENT: both are `fixed`, so nothing here has to become a containing
   * block, and the client's own styling is left exactly as it was.
   */
  private chromeHost: HTMLElement | null = null;
  private statusEl: HTMLDivElement | null = null;

  /** The class picker (TASK-102033-class-picker): panel element + what the current selection resolved to. */
  private classPanelEl: ClassPickerPanel | null = null;
  private classPanel: IClassPanelState | null = null;
  /** Classes with a rule in the BUILT css, read once per selection (the sheet does not change mid-session). */
  private builtClasses: Set<string> | null = null;
  /** Design system roles, read from the injected `#ds-tokens` css — the vocabulary for arbitrary values. */
  private dsRoles: string[] | null = null;
  /**
   * Live preview of an animation: the element, the class attribute to put back, and the timer.
   *
   * The ELEMENT is held here and not read from the panel state at restore time: a preview has to be
   * undoable after the selection moved or the panel closed, and a preview left applied looks exactly
   * like a class that is not in the source.
   */
  private previewEl: HTMLElement | null = null;
  private previewRestore: string | null = null;
  private previewTimer: number | null = null;
  /** True while an edit is being written: the DOM must not be touched by anything else meanwhile. */
  private applying = false;

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
    this.createClassPanel();
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
      this.hideClassPanel();
      this.events.onSelect?.(null);
      void this.refreshTarget();
    });
    this.hostObserver.observe(host, { childList: true });

    // The overlay is a FIXED layer on the body, so it survives the app panel going away — switching
    // nav3 service left the selection box floating over the other service's content. A hidden panel
    // collapses to a 0-sized box, which this catches for every cause at once (service switch, level
    // change, splitter collapse), independently of the service framework.
    this.hostResizeObserver = new ResizeObserver(() => {
      this.setOverlayVisible(this.isHostVisible());
      // The nav3 splitter changes the region's width without a window resize: the chrome is pinned to
      // that region, so it has to be re-pinned here too.
      this.positionChrome();
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
      this.hideClassPanel();
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
    this.classPanelEl?.remove();
    this.classPanelEl = null;
    this.classPanel = null;
    this.builtClasses = null;
    this.dsRoles = null;
    // The stack is the session's: the models it points at are being dropped right here.
    this.history.clear();
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
      this.hideClassPanel();
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
      this.targetFailure = null;
      this.statusText = '';
      this.events.onTarget?.(this.target, '');
    } else {
      this.target = null;
      this.targetFailure = result.reason;
      // Translated here: the owner gets a sentence it can show, not an id it would have to resolve.
      this.statusText = tr(result.reason);
      this.events.onTarget?.(null, this.statusText);
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
    // CAPTURE, and it stops there: the page underneath and the shell's own Ctrl+Z (the code editor)
    // must never see the editor's undo. Capture also means this runs before anything deeper, which
    // is the only way to be sure of that.
    window.addEventListener('keydown', this.onUndoKey, true);
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
    window.removeEventListener('keydown', this.onUndoKey, true);
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
    this.events.onSelect?.(selectableEl);

    // The picker resolves the source anchor for the SELECTION — the file that would change, and any
    // refusal, are on screen BEFORE a chip is clicked. Async (it may have to open organism models);
    // the text path below does not wait for it.
    void this.showClassPanel(selectableEl);

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

  /**
   * Ctrl+Z / Ctrl+Shift+Z (and Ctrl+Y) while the editor is armed.
   *
   * Two things it must NOT do: fire while the user is typing — a field has its own undo, and taking
   * it over would be the worst kind of surprise — and leak. The typing check reads
   * `composedPath()[0]` rather than `target`, because a field inside the panel's shadow root is
   * retargeted to the panel element by the time the event reaches the window.
   */
  private onUndoKey = (e: KeyboardEvent): void => {
    if (this.currentMode() === 'off') return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    if (this.editSpan || this.isTypingTarget(e)) return;

    e.preventDefault();
    e.stopPropagation();
    void (key === 'y' || e.shiftKey ? this.redo() : this.undo());
  };

  /** Whether the keystroke belongs to something the user is typing into. */
  private isTypingTarget(e: KeyboardEvent): boolean {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const el = (path[0] ?? e.target) as HTMLElement | null;
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  private onScrollResize = (): void => {
    if (this.currentMode() === 'off') return;
    this.drawSelection();
    this.positionChrome();
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
        void this.applyTextEditToSource(oldText, newText, occurrenceIndex, editParent, restoredNode, i18nKey)
          .then((result) => {
            // Only a write that landed goes on the stack: an edit refused as dynamic text changed
            // nothing, and offering to undo it would undo the previous one instead.
            if (!result.ok) return;
            this.history.push({
              kind: 'text',
              i18nKey,
              occurrence: occurrenceIndex,
              before: oldText,
              after: newText,
              what: result.what ?? t('status.textLabel'),
              node: new WeakRef(restoredNode),
              el: new WeakRef(editParent),
            });
          });
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
  /**
   * Writes a text change into whichever file really owns that text.
   *
   * The DOM arguments are optional because this is also the UNDO path: a step can outlive its node
   * (a re-render, a navigation), and the file still has to be put right. When they are there, they
   * are the rollback — the screen already shows the new text, and a failure has to take it back.
   */
  private async applyTextEditToSource(
    oldText: string,
    newText: string,
    occurrenceIndex: number,
    editTarget: HTMLElement | null,
    restoredNode: Text | null,
    i18nKey: string | null,
  ): Promise<{ ok: boolean; what?: string }> {
    const rollback = (message: string): { ok: false } => {
      if (restoredNode) restoredNode.textContent = oldText;
      if (editTarget) this.flashError(editTarget);
      this.setStatus(message);
      return { ok: false };
    };

    if (!this.target) {
      return rollback(this.statusText || t('reason.noTargetFile'));
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
      return rollback(t('status.textIsData'));
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
      return rollback(result.error || t('status.textEditFailed'));
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
    const what = origin.type === 'i18n' ? `i18n "${origin.key}"${localeNote}` : t('status.textLabel');
    const where = editTargetFile === this.target
      ? t('status.onThisPage')
      : t('status.onFile', { file: editTargetFile.shortName, folder: editTargetFile.folder });
    // A shared key reached through the page's `fromShared` mapping is used by every page that maps
    // it — the edit is NOT local to this screen, and the user has no other way to know that.
    const scope = origin.type === 'i18n' && this.isSharedKey(pageSource, origin.key)
      ? ` — ${t('status.sharedKey')}`
      : '';
    // Sticky: it is a progress message, always superseded below. Letting it time out would make the
    // toast blink out and back in whenever the save takes longer than the timeout.
    this.setStatus(`${what} ${where} — ${t('status.applying')}`, true);

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

    // STOPS AT THE LOCAL STORE, on purpose. An edit here writes the model and the local copy
    // (IndexedDB) and nothing else: reaching the project's files is the SAVE's job, not the editor's.
    // An earlier version called `saveTarget` right here, which wrote straight through to the VM — the
    // opposite of what the editing flow wants, and it also made the local copy disappear (the lib's
    // `setContents` clears it after a successful write), so a change never showed up in IndexedDB.
    this.setStatus(`${what} ${where} — ${live.message}${scope} ${t('status.localOnly')}`);
    this.events.onEdited?.(editTargetFile);
    return { ok: true, what };
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

  // --- Class picker (TASK-102033-class-picker / -picker-web-component) ---

  /**
   * The picker panel, next to the status toast, on the BODY.
   *
   * Not in the app's own region: that is the adopted subtree, where nothing may be inserted or the
   * shell remounts the screen on its next render. Not in the marking overlay either — that layer is
   * `pointer-events: none` by design, so it can never carry controls. It is a sibling of the marking
   * instead, one z-index above it, and `positionChrome` puts it over the app's region.
   *
   * It is a WEB COMPONENT (classPickerPanel): the editor feeds it the selection and listens to what the
   * user asked for. Everything about words, chips and screens lives there.
   */
  private createClassPanel(): void {
    if (this.classPanelEl) return;
    this.classPanelEl = document.createElement(CLASS_PICKER_TAG) as ClassPickerPanel;
    this.classPanelEl.hidden = true;
    this.classPanelEl.addEventListener('picker-apply', this.onPickerApply as EventListener);
    this.classPanelEl.addEventListener('picker-preview', this.onPickerPreview as EventListener);
    this.classPanelEl.addEventListener('picker-status', this.onPickerStatus as EventListener);
    this.classPanelEl.addEventListener('picker-close', this.onPickerClose);
    this.classPanelEl.addEventListener('picker-undo', this.onPickerUndo);
    this.classPanelEl.addEventListener('picker-redo', this.onPickerRedo);
    // Same layer as the marking and the toast — see createStatusEl.
    document.body.appendChild(this.classPanelEl);
  }

  private hideClassPanel(): void {
    // Before dropping the state: a preview left on the element would read as a class that is not in
    // the source, and the next selection would say exactly that.
    this.previewAnimation(null);
    this.classPanel = null;
    if (!this.classPanelEl) return;
    this.classPanelEl.hidden = true;
    this.classPanelEl.target = undefined;
  }

  private onPickerApply = (e: CustomEvent<IPickerApply>): void => {
    void this.applyLiteralChange(e.detail.literal, e.detail.what);
  };

  private onPickerPreview = (e: CustomEvent<IPickerPreview | null>): void => {
    const detail = e.detail;
    if (!detail) {
      this.previewLiteral(null);
      return;
    }
    // A paste asks for a whole class attribute; an animation asks for one option, which the editor
    // still has to turn into a literal (and replay, when it is an entrance).
    if (detail.literal !== undefined) {
      this.previewLiteral(detail.literal);
      return;
    }
    this.previewAnimation(detail.option ?? null);
  };

  private onPickerStatus = (e: CustomEvent<string>): void => {
    this.setStatus(e.detail);
  };

  private onPickerClose = (): void => {
    this.hideClassPanel();
  };

  private onPickerUndo = (): void => {
    void this.undo();
  };

  private onPickerRedo = (): void => {
    void this.redo();
  };

  /**
   * Resolves the selection's class anchor and shows the panel.
   *
   * Everything the user needs BEFORE choosing is decided here: which file would change, whether the
   * literal is ambiguous, whether the element belongs to a shared molecule. A chip that appears is a
   * chip that will work.
   */
  private async showClassPanel(el: HTMLElement): Promise<void> {
    if (!this.classPanelEl || this.overlayHidden) return;

    // The anchor is resolved from the element's class attribute, so any preview has to be undone
    // FIRST. Reading it mid-preview was the "classes are not in the source" that appeared right after
    // an edit and went away on the next click: the pointer stays over the chips while the edit is
    // written, a hover starts a preview, and the panel then looked for the previewed classes.
    this.previewAnimation(null);

    const literal = el.getAttribute('class') ?? '';
    const state: IClassPanelState = {
      el,
      literal,
      tokens: splitUtilities(literal),
      file: null,
      anchor: null,
      warning: undefined,
      refusal: undefined,
    };

    const show = (): void => {
      // The selection can move while the models above are being opened; a panel for the previous
      // element would offer chips that edit something the user is no longer looking at.
      if (this.selectedEl !== el) return;
      this.classPanel = state;
      this.renderClassPanel();
    };

    // FIRST, because everything below is judged against this page's own file: without it there is no
    // way to tell a molecule from the page's own element, and the panel would blame the wrong thing.
    // The reason the resolution failed is kept from refreshTarget and shown as it is.
    if (!this.target) {
      state.refusal = this.targetFailure ?? { id: 'reason.noTargetFile' };
      show();
      return;
    }

    // A molecule ANCESTOR means this markup lives in the molecule's own file — shared by every
    // project that renders it, and with no undo anywhere in the chain.
    const ancestorProject = this.foreignProjectOfAncestor(el);
    if (ancestorProject !== null) {
      state.refusal = editScope(`${ancestorProject}`, ancestorProject).refusal;
      show();
      return;
    }

    // Which file, and where in it — structural first, counting as the fallback. An element with NO
    // class attribute goes through here too: it is editable now that the panel can ADD a property,
    // anchored by position alone, and the first write inserts the attribute.
    await this.resolveClassAnchor(el, literal, state);
    show();
  }

  private domPathOf(el: HTMLElement): IDomPathStep[] {
    const page = this.host ? findPageElement(this.host) : null;
    if (!page) return [];

    const chain: HTMLElement[] = [];
    let current: HTMLElement | null = el;
    while (current && current !== page) {
      chain.unshift(current);
      current = current.parentElement;
    }
    // `el` outside the mounted page (the tab bar, say) has no structural path into its template.
    if (current !== page) return [];

    const path: IDomPathStep[] = [];
    for (const node of chain) {
      const parent = node.parentElement;
      if (!parent) return [];
      const siblings = Array.from(parent.children).filter((sibling) => sibling.tagName === node.tagName
        && !sibling.classList.contains('se-edit-span')
        && !sibling.classList.contains(CONTROL_CLASS));
      const index = siblings.indexOf(node);
      if (index < 0) return [];
      path.push({ tag: node.tagName.toLowerCase(), index, count: siblings.length });
    }
    return path;
  }

  /**
   * Where the literal sits in a file, by the anchor resolved at selection time.
   *
   * Re-resolved at APPLY time rather than trusting stored offsets: the model can have changed since
   * the panel was built (another edit, a save), and splicing stale offsets would corrupt the file.
   */
  private locateLiteral(
    file: IStudioEditTarget,
    literal: string,
    anchor: ClassAnchor,
  ): { startOffset: number; endOffset: number; insert?: boolean } | null {
    const source = file.model.model.getValue();

    if (anchor.kind === 'insert') {
      const resolved = resolveStructuralAnchor(scanTemplateTree(source), anchor.path);
      // Still without a class of its own: if one appeared since the panel opened, writing a second
      // attribute would produce `<div class="a" class="b">`.
      if (!resolved.ok || resolved.element.literal !== null || resolved.element.classComputed) return null;
      const at = resolved.element.insertAt;
      return { startOffset: at, endOffset: at, insert: true };
    }

    if (anchor.kind === 'structural') {
      const resolved = resolveStructuralAnchor(scanTemplateTree(source), anchor.path);
      if (!resolved.ok) return null;
      if (resolved.element.literal !== literal) return null;
      return { startOffset: resolved.element.literalStart, endOffset: resolved.element.literalEnd };
    }

    const match = parseClassAttr(source, literal, anchor.occurrence);
    return match ? { startOffset: match.startOffset, endOffset: match.endOffset } : null;
  }

  /**
   * Which file, and where in it, the selected element's classes live.
   *
   * STRUCTURAL FIRST, counting as the fallback. Counting the literal cannot carry the common case:
   * measured over the 102 real pages of the 102046, 63% of `class` attributes belong to a string that
   * repeats in the same file (`p-2` 26 times in one page), and neither narrowing by tag (61% still
   * ambiguous) nor scoping by the nearest unique ancestor (9% resolved) helps. Position does: sibling
   * order in the DOM is sibling order in the template.
   *
   * Counting still earns its place as the fallback — a path that crosses into a helper method's
   * template (reached through a `${this.renderX()}`, invisible structurally) does not resolve, and
   * there the file-wide count is all there is.
   */
  private async resolveClassAnchor(el: HTMLElement, literal: string, state: IClassPanelState): Promise<void> {
    const path = this.domPathOf(el);
    const candidates = await this.resolveCandidates();

    // No class attribute at all: nothing to match on, so the position in the template is the whole
    // anchor. The element found there must have no class of its own — an element whose class is
    // COMPUTED (`class=${classMap(…)}`) already has the attribute and would end up with two.
    if (!literal) {
      for (const candidate of path.length ? candidates : []) {
        const resolved = resolveStructuralAnchor(scanTemplateTree(candidate.model.model.getValue()), path);
        if (!resolved.ok || resolved.element.literal !== null) continue;
        if (resolved.element.classComputed) {
          state.refusal = { id: 'reason.classComputed' };
          return;
        }
        state.file = candidate;
        state.anchor = { kind: 'insert', path };
        state.warning = resolved.renders > 1 ? repeatedRenderWarning(resolved.renders) : undefined;
        return;
      }
      state.refusal = NOT_LOCATED;
      return;
    }

    if (path.length) {
      for (const candidate of candidates) {
        const source = candidate.model.model.getValue();
        const resolved = resolveStructuralAnchor(scanTemplateTree(source), path);
        if (!resolved.ok || resolved.element.literal !== literal) continue;
        state.file = candidate;
        state.anchor = { kind: 'structural', path };
        state.warning = resolved.renders > 1 ? repeatedRenderWarning(resolved.renders) : undefined;
        return;
      }
    }

    const { domCount, domIndex } = this.countLiteralInDom(el, literal);
    for (const candidate of candidates) {
      const count = findClassAttrs(candidate.model.model.getValue(), literal).length;
      if (!count) continue;
      const anchor = resolveAnchor({ sourceCount: count, domCount, domIndex });
      if (!anchor.ok) {
        state.refusal = anchor.reason;
        return;
      }
      state.file = candidate;
      state.anchor = { kind: 'occurrence', occurrence: anchor.occurrence };
      state.warning = anchor.warning;
      return;
    }

    const selfProject = this.foreignProjectOfTag(el);
    state.refusal = selfProject !== null
      // The element IS a molecule and its classes are not in the page: they come from the molecule's
      // own template, so this is the shared-scope case, not a missing literal.
      ? editScope(`${selfProject}`, selfProject).refusal
      : describeMissingLiteral(this.target?.model.model.getValue() ?? '');
  }


  /**
   * Elements rendering this EXACT class literal, and where the selected one sits among them.
   *
   * Counted over the region host (so the page element itself is included — it can be the selection),
   * with the editor's own chrome excluded. This N is what turns "one literal in the source" into
   * either "the only one" or "one inside a `.map()`" (resolveAnchor).
   */
  private countLiteralInDom(el: HTMLElement, literal: string): { domCount: number; domIndex: number } {
    const root = this.host;
    if (!root) return { domCount: 1, domIndex: 0 };
    const matches = Array.from(root.querySelectorAll('[class]'))
      .filter((node) => node.getAttribute('class') === literal && !(node as HTMLElement).closest(`.${CONTROL_CLASS}`));
    return { domCount: matches.length, domIndex: matches.indexOf(el) };
  }

  /**
   * Project a custom-element tag resolves to, when it is NOT this page's project.
   *
   * Nothing is foreign while OUR OWN project is unknown. Without this guard, a page whose file could
   * not be resolved (`target === null`) compared every tag against `undefined` — so the page's own
   * element read as a molecule from another project, and almost every click on that page was refused
   * with "this element comes from a molecule (project 102046)", naming the client's own project.
   * The real problem there is the target, and that is what has to be said.
   */
  private foreignProjectOfTag(el: HTMLElement): number | null {
    const own = this.target?.project;
    if (!own) return null;
    const tag = el.tagName.toLowerCase();
    if (!tag.includes('-')) return null;
    const info = tagToFileInfo(tag);
    if (!info?.project || info.project === own) return null;
    return info.project;
  }

  /**
   * Nearest ANCESTOR from another project — a molecule this element is rendered inside.
   *
   * Any foreign project counts, not only the 102040: the reason to refuse is that the file is shared
   * with whoever imports it, which holds for every cross-project component. The element itself is
   * excluded on purpose — a molecule USED by the page (`<ml-x class="p-3">`) carries the PAGE's own
   * class attribute, and editing that is legitimate.
   */
  private foreignProjectOfAncestor(el: HTMLElement): number | null {
    let current = el.parentElement;
    while (current && current !== this.host) {
      const project = this.foreignProjectOfTag(current);
      if (project !== null) return project;
      current = current.parentElement;
    }
    return null;
  }

  /** Feeds the component: what is selected, and what the vocabulary needs to be honest about. */
  private renderClassPanel(): void {
    const panel = this.classPanelEl;
    const state = this.classPanel;
    if (!panel) return;
    if (!state || this.mode === 'off' || this.overlayHidden) {
      panel.hidden = true;
      panel.target = undefined;
      return;
    }

    // Read once per session: the built sheet is a static file and does not change while the app runs.
    if (!this.builtClasses) this.builtClasses = builtCssClassNames();
    // `#ds-tokens` is rewritten when the user cycles the design system (Ctrl+Alt+D), so it is read per
    // RENDER, not cached for the session: a stale role list would offer tokens that are gone.
    this.dsRoles = readDesignSystemRoles(document.getElementById('ds-tokens')?.textContent ?? '');

    panel.builtClasses = this.builtClasses;
    panel.dsRoles = this.dsRoles;
    panel.jitLive = isStudioTailwindLive();
    panel.resolveVar = (cssVar: string) => this.resolveCssVar(cssVar);
    panel.target = {
      tag: state.el.tagName.toLowerCase(),
      fileLabel: state.file ? `${state.file.shortName} (${state.file.folder})` : '',
      literal: state.literal,
      editable: !state.refusal && Boolean(state.file) && state.anchor !== null,
      refusal: state.refusal,
      warning: state.warning,
      childCount: this.elementChildCount(state.el),
      canRemoveLast: state.anchor?.kind !== 'occurrence',
      undo: this.history.peekUndo()?.what ?? '',
      redo: this.history.peekRedo()?.what ?? '',
    };
    panel.hidden = false;
    // Only measurable once it is showing — and its size depends on what the selection carries.
    this.positionChrome();
  }

  /** Current value of a design-system role, for the swatch and the `var(--role, FALLBACK)` written. */
  private resolveCssVar(cssVar: string): string {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    } catch {
      return '';
    }
  }

  /** Element children, ignoring the editor's own nodes (a text edit leaves a span behind). */
  private elementChildCount(el: HTMLElement): number {
    return Array.from(el.children)
      .filter((child) => !child.classList.contains('se-edit-span') && !child.classList.contains(CONTROL_CLASS))
      .length;
  }

  /**
   * Replays an entrance on the element, without touching anything else.
   *
   * `@starting-style` only applies the FIRST time an element is rendered, so applying "on appear" to
   * something already on screen shows nothing at all — the user would click and conclude it is broken.
   * Leaving and re-entering `display: none` counts as a first render, so the entrance runs again.
   */
  private replayEntrance(el: HTMLElement): void {
    const previous = el.style.display;
    el.style.display = 'none';
    void el.offsetHeight; // forces the reflow: without it the two writes collapse into no change
    el.style.display = previous;
  }

  /** True when the literal carries an entrance (its own or its children's). */
  private hasEntrance(literal: string): boolean {
    return literal.includes('starting:');
  }

  /**
   * Shows an animation option on the selected element for a moment, WITHOUT writing anything.
   *
   * An animation is the one thing in this panel that cannot be judged by its label — and it undoes
   * itself after a moment, because what it shows is motion, not a state.
   *
   * `previewAnimation(null)` is how the rest of the editor CANCELS any preview, whatever kind.
   */
  private previewAnimation(optionId: string | null): void {
    const state = this.classPanel;
    if (!optionId || !state) {
      this.previewLiteral(null);
      return;
    }
    // Already on the element: there is nothing to show that is not already showing.
    if (activeAnimations(state.literal).includes(optionId)) {
      this.previewLiteral(null);
      return;
    }
    this.previewLiteral(applyAnimationOption(state.literal, optionId, readAnimationState(state.literal)), 1500);
  }

  /**
   * Puts a whole class attribute on the selected element for as long as it is being shown.
   *
   * Pure DOM: the previous attribute is put back on cancel (or after the timer, when one is given),
   * and no source, model or file is touched. Without a timer the preview is HELD — which is what a
   * paste needs: the result stays on screen while the pointer is on the button and the eyes are on
   * the summary, instead of vanishing mid-read.
   */
  private previewLiteral(literal: string | null, timeout?: number): void {
    // Cancel first, ALWAYS — even with no panel state left. This is the undo of the previous preview.
    if (this.previewTimer !== null) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    if (this.previewEl && this.previewRestore !== null) {
      this.previewEl.setAttribute('class', this.previewRestore);
    }
    this.previewEl = null;
    this.previewRestore = null;

    const state = this.classPanel;
    if (!literal || !state || this.applying) return;

    this.previewEl = state.el;
    this.previewRestore = state.el.getAttribute('class') ?? '';
    state.el.setAttribute('class', literal);
    // An entrance has to be REPLAYED to be seen: the element is already rendered, and
    // `@starting-style` only applies on a first render.
    if (this.hasEntrance(literal)) this.replayEntrance(state.el);
    if (timeout) this.previewTimer = window.setTimeout(() => this.previewLiteral(null), timeout);
  }

  /**
   * Writes a new class attribute: the live element first, then the source.
   *
   * The order is the point of this whole task — setting the attribute on the live instance shows the
   * result immediately, with no compile and no module re-evaluation. Everything after it is
   * bookkeeping, and any failure puts the old attribute back, so the screen never claims an edit that
   * did not land.
   */
  private async applyLiteralChange(newLiteral: string, what: string): Promise<void> {
    const state = this.classPanel;
    if (!state || !state.file || !state.anchor) return;
    const { el, literal } = state;
    if (newLiteral === literal) return;

    // One edit at a time. A second click during the write would compute its change from the SAME
    // starting literal and overwrite the first one — silently reverting a change the user just made.
    if (this.applying) {
      this.setStatus(t('status.busy'));
      return;
    }
    this.applying = true;
    try {
      await this.writeLiteral(state, newLiteral, what);
    } finally {
      this.applying = false;
    }
    // Re-anchor: the literal, and how often it occurs, just changed in the DOM and in the source.
    await this.showClassPanel(el);
  }

  /** The write itself. Split out so `applying` covers all of it, including the failure paths. */
  private async writeLiteral(state: IClassPanelState, newLiteral: string, what: string): Promise<void> {
    const { el, literal, file, anchor } = state;
    if (!file || !anchor) return;

    // A re-render (or a navigation) can drop the element after the panel was built. Writing the
    // source for something no longer on screen would be an invisible edit — refuse and re-anchor.
    if (!el.isConnected) {
      this.hideClassPanel();
      this.setStatus(t('status.gone'));
      return;
    }

    const result = await this.writeClassLiteral({
      file, anchor, el, from: literal, to: newLiteral, what, warning: state.warning,
    });
    if (!result.ok) return;

    this.history.push({
      kind: 'class',
      file,
      anchorBefore: anchor,
      anchorAfter: this.reverseAnchor(anchor, newLiteral, result.occurrence),
      before: literal,
      after: newLiteral,
      what,
      el: new WeakRef(el),
    });
  }

  /**
   * The ONE place a class literal is written — for a chip, for a paste, and for an undo.
   *
   * Undo taking a shortcut is how the file and the screen drift apart, so it comes through here like
   * everything else: live element first, then the source, the local copy, the compile and the live
   * update. The element is optional because an undo can outlive it (a re-render, a navigation): the
   * file is still put right, and the status says the screen only catches up on a reload.
   */
  private async writeClassLiteral(write: {
    file: IStudioEditTarget;
    anchor: ClassAnchor;
    el: HTMLElement | null;
    /** What the source must hold right now — revalidated, never assumed. */
    from: string;
    to: string;
    what: string;
    warning?: IMessageRef;
  }): Promise<{ ok: boolean; occurrence: number }> {
    const { file, anchor, from, to, what } = write;
    const el = write.el?.isConnected ? write.el : null;
    const failed = { ok: false, occurrence: -1 };

    // A preview in flight would put the OLD attribute back on top of the real change.
    this.previewAnimation(null);

    if (el) {
      // Nothing left means no attribute at all, in the DOM as in the source (see classAttrSpan).
      if (to) el.setAttribute('class', to);
      else el.removeAttribute('class');
      if (this.hasEntrance(to)) this.replayEntrance(el);
      this.drawSelection();
    }

    const source = file.model.model.getValue();
    const match = this.locateLiteral(file, from, anchor);
    if (!match) {
      if (el) {
        if (from) el.setAttribute('class', from);
        else el.removeAttribute('class');
        this.flashError(el);
      }
      this.setStatus(t('status.stale'));
      return failed;
    }

    // An insertion carries the attribute's own syntax; a replacement is just the literal; and an
    // empty result takes the whole attribute out instead of leaving `class=""` behind.
    let { startOffset, endOffset } = match;
    let written = match.insert ? ` class="${to}"` : to;
    if (!to && !match.insert) {
      const span = classAttrSpan(source, match.startOffset, match.endOffset);
      if (span) {
        startOffset = span.start;
        endOffset = span.end;
        written = '';
      }
    }
    const newSource = source.slice(0, startOffset) + written + source.slice(endOffset);
    const model = file.model.model;
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: newSource }],
      () => null,
    );

    // Straight to the local store, ahead of libModel's own debounced listener (see persistLocalEdit).
    await persistLocalEdit(file, newSource);

    const where = file === this.target
      ? t('status.onThisPage')
      : t('status.onFile', { file: file.shortName, folder: file.folder });
    const warning = write.warning ? ` — ${tr(write.warning)}` : '';
    this.setStatus(`${what} ${where} — ${t('status.applying')}`, true);

    await compileAfterEdit(file);
    const live = await applyLiveUpdate({
      edited: file,
      page: this.target ?? file,
      pageTag: this.pageTag() ?? '',
    });

    // STOPS AT THE LOCAL STORE, on purpose: the model and the local copy, never the project's files.
    // Reaching those is the SAVE's job (see saveTarget, which the editor does not call).
    this.setStatus(`${what} ${where} — ${live.message}${warning} ${t('status.localOnly')}`);
    this.events.onEdited?.(file);

    // Where the new literal ended up, so the reverse step can find it by counting as well.
    const literalOffset = match.insert ? startOffset + ' class="'.length : startOffset;
    const occurrence = to
      ? findClassAttrs(newSource, to).findIndex((attr) => attr.startOffset === literalOffset)
      : -1;
    return { ok: true, occurrence };
  }

  // --- Undo (TASK-102033-picker-undo) ---

  /** Undoes the last edit of this session. */
  public async undo(): Promise<void> {
    await this.travel('undo');
  }

  /** Redoes the last undone edit. */
  public async redo(): Promise<void> {
    await this.travel('redo');
  }

  /**
   * One step back or forward, through the SAME write as any other edit.
   *
   * Nothing is popped on faith: the step is peeked, applied — and the write revalidates, because it
   * looks for the exact text the step says the file should hold — and only then does it cross to the
   * other stack. A step that no longer matches takes the whole branch with it (see EditHistory), so a
   * file rewritten from outside is never written over.
   */
  private async travel(direction: 'undo' | 'redo'): Promise<void> {
    if (this.mode === 'off') return;

    const step = direction === 'undo' ? this.history.peekUndo() : this.history.peekRedo();
    if (!step) {
      this.setStatus(t(direction === 'undo' ? 'status.nothingToUndo' : 'status.nothingToRedo'));
      return;
    }
    // The same queue as the chips: undoing on top of a write still in flight would compute from a
    // file that is about to change.
    if (this.applying) {
      this.setStatus(t('status.busy'));
      return;
    }

    this.applying = true;
    let ok = false;
    try {
      ok = await this.applyStep(step, direction);
    } finally {
      this.applying = false;
    }

    if (ok) {
      if (direction === 'undo') this.history.commitUndo();
      else this.history.commitRedo();
    } else {
      if (direction === 'undo') this.history.dropUndo();
      else this.history.dropRedo();
      this.setStatus(t('status.undoStale'));
    }

    // The literal (and where it repeats) just changed: the open panel has to be re-anchored, exactly
    // as after a normal edit.
    const el = step.el.deref();
    if (el?.isConnected && this.selectedEl === el) await this.showClassPanel(el);
    else this.renderClassPanel();
  }

  /** Replays one step in one direction. The two kinds differ only in which writer they call. */
  private async applyStep(step: EditStep, direction: 'undo' | 'redo'): Promise<boolean> {
    const undoing = direction === 'undo';
    const from = undoing ? step.after : step.before;
    const to = undoing ? step.before : step.after;
    const what = t(undoing ? 'status.undone' : 'status.redone', { what: step.what });

    if (step.kind === 'class') {
      const el = step.el.deref() ?? null;
      const result = await this.writeClassLiteral({
        file: step.file,
        anchor: undoing ? step.anchorAfter : step.anchorBefore,
        el,
        from,
        to,
        what,
      });
      // The file was put right but no screen shows it: without saying so, "undone" reads as a lie.
      if (result.ok && !el?.isConnected) this.setStatus(`${this.statusText} — ${t('status.offscreen')}`);
      return result.ok;
    }

    const node = step.node.deref() ?? null;
    // The screen first, like every other edit — and it doubles as the rollback: a failed write puts
    // `from` back into this very node.
    if (node?.isConnected) node.textContent = to;
    const result = await this.applyTextEditToSource(from, to, step.occurrence, step.el.deref() ?? null, node, step.i18nKey);
    if (result.ok && !node?.isConnected) this.setStatus(`${this.statusText} — ${t('status.offscreen')}`);
    return result.ok;
  }

  /**
   * The anchor that finds the OTHER side of an edit.
   *
   * Two things change with the direction. An element that had no class attribute is found by position
   * and nothing else (`insert`), but once the attribute exists it is found like any other literal —
   * and the reverse of a removal is the same, backwards. And a literal found by COUNTING moves: the
   * 3rd `p-2` of the file becomes the 1st `p-4`, so the count has to be the one measured after the
   * write, not the one used before it.
   */
  private reverseAnchor(anchor: ClassAnchor, literal: string, occurrence: number): ClassAnchor {
    if (anchor.kind === 'occurrence') return { kind: 'occurrence', occurrence };
    return literal ? { kind: 'structural', path: anchor.path } : { kind: 'insert', path: anchor.path };
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

      /* A child of the SERVICE element, so it reads as feedback from this panel and not as an
         app-wide notification — but positioned against the VIEWPORT, or a scrolling page would leave
         it at the bottom of the content (see positionChrome). */
      .se-status {
        position: fixed; bottom: 12px; left: 50%;
        transform: translateX(-50%);
        z-index: 99991;
        max-width: 80%;
        background: #1f2933; color: #f5f7fa;
        padding: 6px 12px; font-size: 12px;
        border-radius: 4px;
        font-family: "Segoe UI", sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      }

      /* The picker panel has no css here any more: it is a web component with its own shadow root
         (classPickerPanel), which is also what stopped these rules from leaking into the client page. */

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
    this.statusEl = document.createElement('div');
    this.statusEl.className = `${CONTROL_CLASS} se-status`;
    this.statusEl.hidden = true;
    // On the BODY, like the marking layer: `positionChrome` is what keeps it over the app's region,
    // and being a sibling of the marking is what lets z-index decide which one is on top.
    document.body.appendChild(this.statusEl);
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
    // The text just changed, so the width did too: the centring is recomputed from what it now is.
    this.positionChrome();
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

  /** Distance from the edge of the app's region — the same for both pieces of chrome. */
  private static readonly CHROME_GAP = 12;

  /**
   * Pins the editor's own chrome to the VISIBLE part of the app's region.
   *
   * Both pieces are children of the service element on purpose (a toast on the body reads as an
   * app-wide notification), and they used to be `absolute` in it — which anchors `bottom: 12px` to
   * the bottom of the whole scrollable content. On a page with scroll they were simply below the
   * fold. Now they are `fixed`, and this is what keeps them inside the region instead of in the
   * window's corner: the region's visible rectangle, recomputed on every scroll and resize.
   */
  private positionChrome(): void {
    const host = this.chromeHost;
    if (!host) return;

    const region = host.getBoundingClientRect();
    const right = Math.min(region.right, window.innerWidth);
    const bottom = Math.min(region.bottom, window.innerHeight);
    const left = Math.max(region.left, 0);
    // The region itself can be scrolled out of view; the chrome then goes to the window's own corner
    // rather than following it off-screen.
    const visible = right > 0 && bottom > 0 && left < window.innerWidth;
    const edgeRight = visible ? right : window.innerWidth;
    const edgeBottom = visible ? bottom : window.innerHeight;
    const gap = StudioEditor.CHROME_GAP;

    const panel = this.classPanelEl;
    if (panel && !panel.hidden) {
      this.pin(panel, { right: edgeRight - gap, bottom: edgeBottom - gap });
    }
    const status = this.statusEl;
    if (status && !status.hidden) {
      const centre = visible ? (left + right) / 2 : window.innerWidth / 2;
      this.pin(status, { centre, bottom: edgeBottom - gap });
    }
  }

  /**
   * Puts one element at a viewport position, then CORRECTS it by what it actually got.
   *
   * `fixed` answers to the viewport only while no ancestor has a transform, a filter or `contain` —
   * any of those becomes the containing block and the same numbers land somewhere else. The host here
   * is the shell's, not ours, so instead of forbidding that the element is placed, measured, and
   * shifted by the difference.
   *
   * Anchored by `right`/`bottom` (never `top`/`left`): the panel changes height as the user moves
   * between tabs and screens, and a bottom-anchored box stays put while it grows.
   */
  private pin(el: HTMLElement, target: { right?: number; centre?: number; bottom: number }): void {
    const gap = StudioEditor.CHROME_GAP;
    if (typeof target.right === 'number') el.style.right = `${Math.max(gap, window.innerWidth - target.right)}px`;
    if (typeof target.centre === 'number') el.style.left = `${target.centre}px`;
    el.style.bottom = `${Math.max(gap, window.innerHeight - target.bottom)}px`;

    const rect = el.getBoundingClientRect();
    if (typeof target.right === 'number') {
      const dx = target.right - rect.right;
      if (Math.abs(dx) > 0.5) el.style.right = `${parseFloat(el.style.right) - dx}px`;
    }
    if (typeof target.centre === 'number') {
      const dx = target.centre - (rect.left + rect.width / 2);
      if (Math.abs(dx) > 0.5) el.style.left = `${parseFloat(el.style.left) + dx}px`;
    }
    const dy = target.bottom - rect.bottom;
    if (Math.abs(dy) > 0.5) el.style.bottom = `${parseFloat(el.style.bottom) - dy}px`;
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
