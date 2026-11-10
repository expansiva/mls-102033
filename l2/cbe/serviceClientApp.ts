/// <mls fileReference="_102033_/l2/cbe/serviceClientApp.ts" enhancement="_102027_/l2/enhancementLit" />
// Runtime service that hosts the CLIENT APP inside the right collab-nav-3 —
// the unified on.collab.codes structure (see nav3_unificado_plano.md). The
// nav3 instances this element when its data-service points at
// `_102033_/l2/cbe/serviceClientApp` (tag below follows the studio naming
// convention: cbe--service-client-app-102033). On connect it ADOPTS the shell's
// existing content host ([data-region-host="content"]) — the app keeps its
// state; nothing re-renders. ServiceBase provides the msize/visible contract
// (height cascades from collab-page exactly like on the studio).

import '/_102029_/l2/contracts/bootstrap.js';
import { html } from 'lit';
import { ServiceBase, type IService, type IServiceMenu, type IToolbarContent } from '/_102027_/l2/serviceBase.js';
import { moveConnectedRegion } from '/_102033_/l2/shared/connectedRegionMove.js';
import { parseMsizeHeight } from '/_102033_/l2/shared/regionMsize.js';
import { publishEditHost } from '/_102033_/l2/cbe/studioEditSlot.js';
import { loadStudioTools } from '/_102033_/l2/cbe/studioServices.js';
import { tabPinLabel } from '/_102033_/l2/shared/moduleTab.js';
import { siteProjectFromBoot } from '/_102033_/l2/shared/siteProject.js';
// Installs the bug collectors and Ctrl+Shift+B at load; the panel itself loads only when opened.
import { captureAndOpenReportBug } from '/_102033_/l2/cbe/reportBug/reportBugCore.js';
import { NAV3_TAB_CHANGE_EVENT } from '/_102033_/l2/shared/nav3ActiveTab.js';

function pinMenuText(): string {
  const nav = window.collabRuntimeNav3;
  const pinned = Boolean(nav?.isPinned?.(nav.activeTab?.() ?? 'app'));
  return tabPinLabel(pinned, document.documentElement?.lang || 'en');
}

/** Same text the report tab shows as its title (reportBug.ts), kept here to not load the panel for a label. */
function reportBugMenuText(): string {
  return (document.documentElement?.lang || 'en').toLowerCase().startsWith('pt') ? 'Reportar bug' : 'Report bug';
}

/**
 * The nav1 level that means "editing the page".
 *
 * There is no button: entering L3 arms the editor and leaving it disarms. The level is the intent
 * already — L3 is the page level of the aura flow — so a separate toggle was one more state to keep in
 * sync with it.
 */
// preview-cover-decision:start
const EDIT_LEVEL = 3;

export interface IPreviewCoverInput {
  studio: boolean;
  level: number;
  count: number;
  /** Files Save refuses. The cover stays up when these are the only ones left. */
  blocked?: number;
  /** Save failed and refused no file. Keeps the cover up so the message is visible. */
  failure?: string;
}

export interface IPreviewCoverBlockedInput {
  count: number;
  blocked?: number;
}

export interface IPreviewCoverBlockedDecision {
  /** Cover stays when something is still unsaved or still refused. */
  show: boolean;
  /** Files named on the second line. Null hides that line. */
  line: number | null;
}

/**
 * Count is every unsaved file. Blocked is the subset Save refuses.
 * A refused save with nothing else pending still covers the preview.
 */
export function previewCoverBlockedDecision(input: IPreviewCoverBlockedInput): IPreviewCoverBlockedDecision {
  const blocked = typeof input.blocked === 'number' && input.blocked > 0 ? input.blocked : 0;
  const count = input.count > 0 ? input.count : 0;
  return { show: count > 0 || blocked > 0, line: blocked > 0 ? blocked : null };
}

/** `{n}` is the only placeholder. The catalog owns the sentence. */
export function previewCoverBlockedText(template: string, line: number): string {
  return template.split('{n}').join(String(line));
}

export interface IPreviewCoverLineInput {
  count: number;
  blocked?: number;
  failure?: string;
}

/**
 * Second line of the cover. Refused files own it. A save that failed without refusing a file
 * shows that message instead. Anything else leaves the line off.
 */
export function previewCoverSecondLine(input: IPreviewCoverLineInput, blockedTemplate: string): string | null {
  const blocked = typeof input.blocked === 'number' && input.blocked > 0 ? input.blocked : 0;
  if (blocked > 0) return previewCoverBlockedText(blockedTemplate, blocked);
  if (typeof input.failure === 'string' && input.failure.length > 0) return input.failure;
  return null;
}

/** Studio, with unsaved or refused work, on every level including the page editor. */
export function previewCoverVisible(input: IPreviewCoverInput): boolean {
  return input.studio === true
    && (previewCoverBlockedDecision(input).show || previewCoverSecondLine(input, '{n}') !== null);
}
// preview-cover-decision:end

// preview-reload-decision:start
export interface IPreviewReloadState {
  studio: boolean;
  site: number | null;
  /** Project whose Discard is inside `saveL5File`. A save for it does not reload. */
  hold: number | null;
  reloads: number;
}

export type PreviewDraftNotice =
  | { kind: 'saved'; project: number | null }
  | { kind: 'hold'; project: number | null; hold: boolean }
  | { kind: 'discarded'; project: number | null };

/**
 * One reload when Discard was accepted. A save while that discard holds does not reload.
 * A failed discard never sends `discarded`, so the count stays. Reloading does not discard again.
 */
export function applyPreviewDraftNotice(state: IPreviewReloadState, notice: PreviewDraftNotice): IPreviewReloadState {
  if (notice.kind === 'hold') {
    if (notice.project === null || state.site === null || notice.project !== state.site) return state;
    const hold = notice.hold ? notice.project : (state.hold === notice.project ? null : state.hold);
    return { studio: state.studio, site: state.site, hold, reloads: state.reloads };
  }
  if (!state.studio || state.site === null || notice.project === null || notice.project !== state.site) return state;
  if (notice.kind === 'saved') {
    if (state.hold === state.site) return state;
    return { studio: state.studio, site: state.site, hold: state.hold, reloads: state.reloads + 1 };
  }
  return { studio: state.studio, site: state.site, hold: null, reloads: state.reloads + 1 };
}
// preview-reload-decision:end

/** Window events. The studio plugin publishes them; this service does not import it. */
const COLLAB_DRAFT_PENDING = 'collabDraftPending';
const COLLAB_DRAFT_SAVE_REQUEST = 'collabDraftSaveRequest';
const COLLAB_DRAFT_SAVE_RESULT = 'collabDraftSaveResult';
const COLLAB_DRAFT_SAVED = 'collabDraftSaved';
const COLLAB_DRAFT_DISCARDED = 'collabDraftDiscarded';
const COLLAB_DRAFT_DISCARD_HOLD = 'collabDraftDiscardHold';

interface IDraftPendingDetail {
  project: number;
  count: number;
  blocked: number;
}

interface IDraftSaveResultDetail {
  project: number;
  saved: boolean;
  blocked: number;
  message?: string;
}

interface IPreviewCoverCopy {
  before: string;
  save: string;
  after: string;
  /** Template with `{n}`, or the finished line after substitution. */
  blocked: string;
}

const PREVIEW_COVER_COPY: Record<'en' | 'pt' | 'es', IPreviewCoverCopy> = {
  en: {
    before: 'This page may be out of date: there are unsaved changes. ',
    save: 'Save',
    after: '',
    blocked: '{n} file(s) with errors were not saved: fix them.',
  },
  pt: {
    before: 'Esta página pode estar desatualizada: há alterações não salvas. ',
    save: 'Salvar',
    after: '',
    blocked: '{n} arquivo(s) com erro não foram salvos: corrija-os.',
  },
  es: {
    before: 'Esta página puede estar desactualizada: hay cambios sin guardar. ',
    save: 'Guardar',
    after: '',
    blocked: '{n} archivo(s) con error no se guardaron: corríjalos.',
  },
};

function previewCoverCopy(language: string): IPreviewCoverCopy {
  const code = language.trim().toLowerCase();
  if (code.startsWith('pt')) return PREVIEW_COVER_COPY.pt;
  if (code.startsWith('es')) return PREVIEW_COVER_COPY.es;
  return PREVIEW_COVER_COPY.en;
}

export interface IPreviewCoverText {
  data: string;
}

export interface IPreviewCoverButton {
  textContent: string | null;
}

export interface IPreviewCoverBreak {
  hidden: boolean;
}

export interface IPreviewCoverNodes {
  before?: IPreviewCoverText;
  after?: IPreviewCoverText;
  button?: IPreviewCoverButton;
  blocked?: IPreviewCoverText;
  blockedBreak?: IPreviewCoverBreak;
}

// preview-cover-paint:start
export function applyPreviewCoverCopy(nodes: IPreviewCoverNodes, copy: IPreviewCoverCopy): void {
  if (nodes.before) nodes.before.data = copy.before;
  if (nodes.after) nodes.after.data = copy.after;
  if (nodes.button) nodes.button.textContent = copy.save;
  const blocked = typeof copy.blocked === 'string' ? copy.blocked : '';
  if (nodes.blocked) nodes.blocked.data = blocked;
  if (nodes.blockedBreak) nodes.blockedBreak.hidden = blocked.length === 0;
}

/** First show: the nodes exist only after create. Paint before that leaves the cover empty. */
export function fillPreviewCoverOnFirstSync(create: () => IPreviewCoverNodes, copy: IPreviewCoverCopy): IPreviewCoverNodes {
  const nodes = create();
  applyPreviewCoverCopy(nodes, copy);
  return nodes;
}
// preview-cover-paint:end

// preview-cover-footer:start
export interface IPreviewCoverChrome {
  /** The strip informs. It never freezes the preview. */
  inert: boolean;
  blockScroll: boolean;
  pointerEvents: string;
  /** Pixels kept under the preview so the page end stays reachable. */
  reservedPx: number;
}

export function previewCoverChrome(stripPx: number): IPreviewCoverChrome {
  const reservedPx = typeof stripPx === 'number' && Number.isFinite(stripPx) && stripPx > 0
    ? Math.round(stripPx)
    : 0;
  return { inert: false, blockScroll: false, pointerEvents: 'auto', reservedPx };
}

export interface IPreviewCoverRegionStyle {
  pointerEvents: string;
  height: string;
}

export interface IPreviewCoverRegionEl {
  removeAttribute(name: string): void;
  setAttribute(name: string, value: string): void;
  style: IPreviewCoverRegionStyle;
}

/** The region stays active. Its height leaves the strip's pixels free at the bottom. */
export function applyPreviewCoverChrome(
  region: IPreviewCoverRegionEl,
  chrome: IPreviewCoverChrome | null,
  heightPx: number | null,
): void {
  if (chrome !== null && chrome.inert) region.setAttribute('inert', '');
  else region.removeAttribute('inert');
  region.style.pointerEvents = chrome === null ? '' : chrome.pointerEvents;
  const reserved = chrome === null ? 0 : chrome.reservedPx;
  if (heightPx == null) {
    region.style.height = reserved > 0 ? `calc(100% - ${reserved}px)` : '100%';
    return;
  }
  region.style.height = `${Math.max(0, heightPx - reserved)}px`;
}
// preview-cover-footer:end

function readNonNegative(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function readPendingDetail(value: unknown): IDraftPendingDetail | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { project?: unknown; count?: unknown; blocked?: unknown };
  if (typeof record.project !== 'number' || !Number.isInteger(record.project) || record.project <= 0) return null;
  const count = readNonNegative(record.count);
  const blocked = readNonNegative(record.blocked);
  if (count === null || blocked === null) return null;
  return { project: record.project, count, blocked };
}

function readSaveResult(value: unknown): IDraftSaveResultDetail | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { project?: unknown; saved?: unknown; blocked?: unknown; message?: unknown };
  if (typeof record.project !== 'number' || !Number.isInteger(record.project) || record.project <= 0) return null;
  if (typeof record.saved !== 'boolean') return null;
  const blocked = readNonNegative(record.blocked);
  if (blocked === null) return null;
  const detail: IDraftSaveResultDetail = { project: record.project, saved: record.saved, blocked };
  if (typeof record.message === 'string' && record.message.length > 0) detail.message = record.message;
  return detail;
}

function readSavedProject(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const project = (value as { project?: unknown }).project;
  if (typeof project !== 'number' || !Number.isInteger(project) || project <= 0) return null;
  return project;
}

function readDiscardHold(value: unknown): { project: number; hold: boolean } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { project?: unknown; hold?: unknown };
  const project = readSavedProject(record);
  if (project === null || typeof record.hold !== 'boolean') return null;
  return { project, hold: record.hold };
}

/** Last count seen, including one that arrived before this service connected. */
let latestPending: IDraftPendingDetail | null = null;

function rememberPending(event: Event): void {
  const detail = readPendingDetail((event as CustomEvent<unknown>).detail);
  if (detail) latestPending = detail;
}

function armPendingLatch(): void {
  const target = (globalThis as { window?: EventTarget }).window;
  if (!target || typeof target.addEventListener !== 'function') return;
  target.addEventListener(COLLAB_DRAFT_PENDING, rememberPending);
}

armPendingLatch();

export class ServiceClientApp extends ServiceBase {
  public details: IService = {
    icon: '&#xf3fd;',
    state: 'foreground',
    position: 'right',
    tooltip: 'App',
    visible: true,
    widget: '_102033_/l2/cbe/serviceClientApp',
    level: [0, 1, 2, 3, 4, 5, 6, 7],
  };

  // ─── Studio edit tools ───
  // The DECISION belongs to this service on purpose: it is the one that shows the app, and the whole
  // point of the flow is editing the page you are navigating. The TOOLS do not: they are authoring,
  // they live in the Studio plugin, and they plug in through the slot (studioEditSlot). This service
  // used to own a StudioEditor, which is how authoring code ended up in the master frontend.
  private toolsRequested = false;
  private panelVisible = true;
  private studioModeObserver?: MutationObserver;
  private draftWatchOn = false;
  /** Set while Discard is inside `saveL5File` for the site project. */
  private discardHold: number | null = null;
  private pendingCount = 0;
  private pendingBlocked = 0;
  /** Last save failure shown when no file was refused. A new pending count, or a result that saved or has no message, clears it. */
  private saveFailure = '';
  private reportedMissingProject = false;
  private reportedMissingRegion = false;
  private coverEl?: HTMLElement;
  private coverBefore?: Text;
  private coverAfter?: Text;
  private coverButton?: HTMLButtonElement;
  private coverBlocked?: Text;
  private coverBlockedBreak?: HTMLBRElement;
  /** Stable reference: mls.events removes a subscriber by identity. */
  private readonly onToolBarSelected = () => { this.publishEditState(); };
  /** Another nav3 tab on screen: the tools move to the page it hosts. */
  private readonly onTabChange = () => { this.publishEditState(); };
  private levelSubscribed = false;

  public menu: IServiceMenu = {
    title: '',
    main: {
      pin: {
        get text() { return pinMenuText(); },
      },
      reportBug: {
        get text() { return reportBugMenuText(); },
      },
    },
    tabs: undefined,
    tools: {},
    onClickMain: (value: string) => {
      if (value === 'reportBug') {
        // Screenshot first (the screen still shows the bug), then the report opens in its own tab.
        void captureAndOpenReportBug();
        return;
      }
      if (value !== 'pin') return;
      const nav = window.collabRuntimeNav3;
      if (!nav?.togglePin || !nav.activeTab) return;
      nav.togglePin(nav.activeTab());
      this.menu.refresh?.();
    },
  };

  public onServiceClick(visible: boolean, _reinit: boolean, _el: IToolbarContent | null): void {
    this.adoptAppHost();
    // A tool's overlay is a fixed layer on the body, so it does not disappear with this panel:
    // switching nav3 service used to leave the selection box floating over the other service.
    this.panelVisible = visible;
    // The nav3 sets `level` and `visible` together when it hands a level's service over, so this is
    // also the moment a level switch becomes observable.
    this.publishEditState();
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // Custom elements default to display:inline, which ignores the height +
    // overflow:auto the nav3 layout applies — block makes the panel scroll.
    this.style.display = 'block';
    this.adoptAppHost();
    this.watchStudioMode();
    this.watchLevel();
    this.watchDraft();
    window.addEventListener(NAV3_TAB_CHANGE_EVENT, this.onTabChange);
    this.publishEditState();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.studioModeObserver?.disconnect();
    this.studioModeObserver = undefined;
    // undefined/undefined removes the subscriber from every level and type it was added to.
    mls?.events?.removeEventListener(undefined, undefined, this.onToolBarSelected);
    this.levelSubscribed = false;
    if (this.draftWatchOn) {
      window.removeEventListener(COLLAB_DRAFT_PENDING, this.onPendingEvent);
      window.removeEventListener(COLLAB_DRAFT_SAVE_RESULT, this.onSaveResult);
      window.removeEventListener(COLLAB_DRAFT_SAVED, this.onDraftSaved);
      window.removeEventListener(COLLAB_DRAFT_DISCARDED, this.onDraftDiscarded);
      window.removeEventListener(COLLAB_DRAFT_DISCARD_HOLD, this.onDiscardHold);
      this.draftWatchOn = false;
    }
    this.dropCover();
    window.removeEventListener(NAV3_TAB_CHANGE_EVENT, this.onTabChange);
    // Whoever plugged in tears itself down: the app region is going away.
    publishEditHost(null);
  }

  /**
   * Follows the shell's `data-studio-mode` so the edit tools appear/disappear with Ctrl+Alt+S.
   *
   * Without this the toolbar would only pick the change up on the next onServiceClick, so entering
   * studio mode would show no edit affordance until the user reclicked the service icon.
   *
   * It also DISARMS on the way out: leaving the editor armed in client mode would swallow every
   * pointer event and make the app unusable.
   */
  private watchStudioMode(): void {
    if (this.studioModeObserver) return;
    const shell = this.closest('collab-aura-shell');
    if (!shell) return;
    this.studioModeObserver = new MutationObserver(() => {
      this.publishEditState();
    });
    this.studioModeObserver.observe(shell, { attributes: true, attributeFilter: ['data-studio-mode'] });
  }

  /**
   * Follows the level through `ToolBarSelected`, the lib's own channel.
   *
   * There is no level event in `mls.events` (`TypeEvent` is a closed union); `ToolBarSelected` is a
   * SERVICE SELECTION event that carries the level, and a level switch ends in one: nav1 writes the
   * level, nav2 flags the change and restores the level's last service
   * ([collab-nav-2.ts:371](mls-102041/l2/collab-nav-2.ts#L371)), which fires it
   * ([collab-nav-2.ts:254](mls-102041/l2/collab-nav-2.ts#L254)). Same channel serviceHistories and
   * serviceCollabFileSystem already use.
   *
   * ALL levels, not just the edit one: the event is fired at the level being entered, so subscribing
   * only to 3 would arm the editor and never disarm it.
   *
   * Two consequences of using a selection event as a level signal, both acceptable because
   * `publishEditState` is idempotent: it also fires when the user picks another service in the level
   * (a free re-sync), and `fire` debounces 200ms by default, so arming lags the switch slightly. What
   * it does NOT cover: a level whose restore finds nothing to select emits no event at all — hence the
   * re-check in adoptAppHost, and `onServiceClick` calling the same sync.
   */
  private watchLevel(): void {
    // connectedCallback can run again (the element is moved between containers), and mls.events has no
    // dedup — a second add would sync twice per event.
    if (this.levelSubscribed) return;
    const levels: mls.Level[] = [0, 1, 2, 3, 4, 5, 6, 7];
    mls?.events?.addEventListener(levels, ['ToolBarSelected'], this.onToolBarSelected);
    this.levelSubscribed = true;
  }

  // ─── Studio edit mode ──────────────────────────────────────────────────────

  /** True only in studio mode: the shell publishes it, so no shell change is needed. */
  private isStudioMode(): boolean {
    return this.closest('collab-aura-shell')?.getAttribute('data-studio-mode') === 'true';
  }

  /**
   * The host a tool binds to: the one of the nav3 tab on screen — the app region host on the `app` tab, the element
   * a module tab renders its page into otherwise. Both have the page as their direct child.
   *
   * NOT the page element and NOT a wrapper around it: `mountRegion` reuses the mounted element by
   * comparing `host.firstElementChild.tagName` with the route tag, so anything inserted in between
   * makes the shell remount the screen on its next render.
   *
   * Falls back to the app region host while the tab's element is not there yet: a null host would tear the tools down.
   */
  private regionHost(): HTMLElement | null {
    const active = window.collabRuntimeNav3?.activeTabElement?.();
    if (active instanceof HTMLElement) return active;
    return this.querySelector('[data-region-host="content"]');
  }

  /**
   * Publishes where the app is and what the user is doing. The single decision point.
   *
   * Studio mode is required on top of the level: leaving studio mode (Ctrl+Alt+S) does NOT reset the
   * nav3 level, so without that condition a tool would stay armed in a client session — capturing
   * every pointer event and making the app unusable.
   *
   * `editLevel` and `studioMode` are separate because the tools are: the in-place editor wants the
   * level, and the live-update bridge does not (someone editing exclusively through the studio's own
   * file editor never arms the overlay, and the hot swap must still reach the running page).
   */
  private publishEditState(): void {
    this.syncPreviewCover();
    const host = this.regionHost();
    if (!host || !this.isStudioMode()) {
      publishEditHost(null);
      return;
    }

    // The scan costs a plugin load, so it happens ONCE, and only for someone who reached studio mode.
    // A client session never pays for it — and never loads a tool.
    if (!this.toolsRequested) {
      this.toolsRequested = true;
      void loadStudioTools();
    }

    publishEditHost({
      host,
      chromeHost: this,
      studioMode: true,
      editLevel: this.level === EDIT_LEVEL,
      level: EDIT_LEVEL,
      panelVisible: this.panelVisible,
    });
  }

  // Bounded retry: the structure can now upgrade before the classic content
  // region finishes mounting (see shell.ts maybeUpgradeStructure) — without
  // this, a miss on the first connectedCallback call left the app host
  // stranded in the hidden legacy .body until the user re-clicked the tab.
  private adoptRetriesLeft = 20;

  private adoptAppHost(): void {
    // Adopt the whole content REGION (tab bar + panels + app host), not just
    // the app host: collabRuntimeNav3.openTab renders its tabs/panels as
    // siblings of the app host inside this region — adopting only the host
    // would leave those tabs in the hidden legacy .body. Lit keeps its
    // bindings on the moved nodes, so the shell keeps re-rendering them here.
    const region = document.querySelector('main[data-region="content"]') as HTMLElement | null;
    if (region) {
      if (region.parentElement !== this) {
        moveConnectedRegion(this, region);
        this.applyRegionHeight();
        // The editor binds to the region host, so an arming attempt that ran BEFORE the adoption found
        // nothing to bind to and gave up. Connecting straight on the edit level is exactly that order.
        this.publishEditState();
      }
      return;
    }
    if (this.adoptRetriesLeft-- > 0) {
      setTimeout(() => this.adoptAppHost(), 250);
    }
  }

  // Same pattern as serviceRuntimeMessages: ServiceBase sets `this.style.height`
  // in px from the msize attribute the nav3 layout cascades, but a `height:100%`
  // on the adopted region only resolves against that if every ancestor in
  // between also has a resolved (non-auto) height — not guaranteed for every
  // route the client app navigates to internally (e.g. opening Monitor/Tests
  // left it collapsed at 0). Forwarding the same px value directly removes
  // the dependency on that cascade.
  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    super.attributeChangedCallback(name, oldValue ?? '', newValue ?? '');
    if (name === 'msize') this.applyRegionHeight();
  }

  private applyRegionHeight(): void {
    const height = parseMsizeHeight(this.getAttribute('msize'), this.style.height);
    if (height != null) this.style.height = `${height}px`;
    const region = this.querySelector('main[data-region="content"]') as HTMLElement | null;
    if (!region) return;
    const chrome = this.coverEl ? previewCoverChrome(this.coverEl.offsetHeight) : null;
    applyPreviewCoverChrome(region, chrome, height);
  }

  /**
   * The preview stays on the last saved copy until Save. The notice is a footer strip
   * beside the adopted region (never inside it: the shell remounts when the region host's
   * first child changes) and is moved to the end on every sync, because adopting the
   * region appends it. The strip stays in normal flow under the page, and the region
   * height shrinks by the strip, so the strip never covers a pixel of the page.
   */
  private syncPreviewCover(): void {
    const pending = { count: this.pendingCount, blocked: this.pendingBlocked, failure: this.saveFailure };
    const show = previewCoverVisible({
      studio: this.isStudioMode(),
      level: this.level,
      count: pending.count,
      blocked: pending.blocked,
      failure: pending.failure,
    });
    if (!show) {
      this.dropCover();
      return;
    }
    const region = this.querySelector('main[data-region="content"]');
    if (!(region instanceof HTMLElement) && !this.reportedMissingRegion) {
      this.reportedMissingRegion = true;
      console.error('[preview] draft cover has no content region');
    }
    const phrase = previewCoverCopy(document.documentElement?.lang || 'en');
    const line = previewCoverSecondLine(pending, phrase.blocked);
    const copy: IPreviewCoverCopy = {
      ...phrase,
      blocked: line === null ? '' : line,
    };
    const cover = fillPreviewCoverOnFirstSync(() => {
      this.ensureCover();
      return {
        before: this.coverBefore,
        after: this.coverAfter,
        button: this.coverButton,
        blocked: this.coverBlocked,
        blockedBreak: this.coverBlockedBreak,
      };
    }, copy);
    if (!cover.before || !cover.button || !cover.blocked) {
      console.error('[preview] draft cover was created without its text nodes');
    }
    if (this.coverEl) this.append(this.coverEl);
    this.applyRegionHeight();
  }

  private ensureCover(): HTMLElement {
    if (this.coverEl) return this.coverEl;
    const cover = document.createElement('div');
    cover.className = 'preview-draft-cover';
    cover.setAttribute('role', 'status');
    const before = document.createTextNode('');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preview-draft-cover-save';
    button.addEventListener('click', this.onCoverSave);
    const after = document.createTextNode('');
    const blockedBreak = document.createElement('br');
    blockedBreak.hidden = true;
    const blocked = document.createTextNode('');
    const line = document.createElement('p');
    line.append(before, button, after, blockedBreak, blocked);
    cover.append(line);
    this.coverEl = cover;
    this.coverBefore = before;
    this.coverAfter = after;
    this.coverButton = button;
    this.coverBlocked = blocked;
    this.coverBlockedBreak = blockedBreak;
    return cover;
  }

  private dropCover(): void {
    this.coverEl?.remove();
    this.coverEl = undefined;
    this.coverBefore = undefined;
    this.coverAfter = undefined;
    this.coverButton = undefined;
    this.coverBlocked = undefined;
    this.coverBlockedBreak = undefined;
    this.applyRegionHeight();
  }

  private readonly onCoverSave = (): void => {
    const project = this.siteProject();
    if (project === null) {
      console.error('[preview] collabDraftSaveRequest was not sent: site project is missing');
      return;
    }
    const detail: { project: number } = { project };
    window.dispatchEvent(new CustomEvent(COLLAB_DRAFT_SAVE_REQUEST, { detail }));
  };

  private watchDraft(): void {
    if (this.draftWatchOn) return;
    if (typeof window.addEventListener !== 'function') {
      console.error('[preview] draft cover was not armed: window is missing');
      return;
    }
    window.addEventListener(COLLAB_DRAFT_PENDING, this.onPendingEvent);
    window.addEventListener(COLLAB_DRAFT_SAVE_RESULT, this.onSaveResult);
    window.addEventListener(COLLAB_DRAFT_SAVED, this.onDraftSaved);
    window.addEventListener(COLLAB_DRAFT_DISCARDED, this.onDraftDiscarded);
    window.addEventListener(COLLAB_DRAFT_DISCARD_HOLD, this.onDiscardHold);
    this.draftWatchOn = true;
    if (latestPending) this.applyPending(latestPending);
  }

  private readonly onPendingEvent = (event: Event): void => {
    const detail = readPendingDetail((event as CustomEvent<unknown>).detail);
    if (!detail) {
      console.error('[preview] collabDraftPending detail is invalid; cover was not updated');
      return;
    }
    this.applyPending(detail);
  };

  private applyPending(detail: IDraftPendingDetail): void {
    const project = this.siteProject();
    if (project === null || detail.project !== project) return;
    this.pendingCount = detail.count;
    this.pendingBlocked = detail.blocked;
    this.saveFailure = '';
    this.syncPreviewCover();
  }

  private readonly onSaveResult = (event: Event): void => {
    const detail = readSaveResult((event as CustomEvent<unknown>).detail);
    if (!detail) {
      console.error('[preview] collabDraftSaveResult detail is invalid; cover was not updated');
      return;
    }
    const project = this.siteProject();
    if (project === null || detail.project !== project || !this.isStudioMode()) return;
    if (!detail.saved && detail.blocked <= 0) {
      console.error('[preview] collabDraftSaveResult refused the save', detail.message ?? '(no message)');
      this.saveFailure = detail.message ?? '';
    } else {
      this.saveFailure = '';
    }
    this.pendingBlocked = detail.blocked;
    this.syncPreviewCover();
  };

  private readonly onDraftSaved = (event: Event): void => {
    const project = readSavedProject((event as CustomEvent<unknown>).detail);
    if (project === null) {
      console.error('[preview] collabDraftSaved detail is invalid; preview was not reloaded');
      return;
    }
    if (this.applyDraftNotice({ kind: 'saved', project }) > 0) this.reloadPreview('collabDraftSaved');
  };

  private readonly onDiscardHold = (event: Event): void => {
    const detail = readDiscardHold((event as CustomEvent<unknown>).detail);
    if (!detail) {
      console.error('[preview] collabDraftDiscardHold detail is invalid; discard hold was not changed');
      return;
    }
    this.applyDraftNotice({ kind: 'hold', project: detail.project, hold: detail.hold });
  };

  private readonly onDraftDiscarded = (event: Event): void => {
    const project = readSavedProject((event as CustomEvent<unknown>).detail);
    if (project === null) {
      console.error('[preview] collabDraftDiscarded detail is invalid; preview was not reloaded');
      return;
    }
    if (this.applyDraftNotice({ kind: 'discarded', project }) > 0) this.reloadPreview('collabDraftDiscarded');
  };

  /** Applies one notice and keeps the hold. Returns how many preview reloads that notice asked for. */
  private applyDraftNotice(notice: PreviewDraftNotice): number {
    const next = applyPreviewDraftNotice({
      studio: this.isStudioMode(),
      site: this.siteProject(),
      hold: this.discardHold,
      reloads: 0,
    }, notice);
    this.discardHold = next.hold;
    return next.reloads;
  }

  /** `collabRuntimeNav3` has no per-tab reload, so a saved or discarded draft reloads the open page. */
  private reloadPreview(reason: 'collabDraftSaved' | 'collabDraftDiscarded'): void {
    if (typeof window.location?.reload !== 'function') {
      console.error(`[preview] ${reason}: location.reload is missing; preview was not reloaded`);
      return;
    }
    window.location.reload();
  }

  /** The site project. `mls.actualProject` only when the boot config has no client id. */
  private siteProject(): number | null {
    const boot = (window as { collabBoot?: { projectId?: string | number; clientProjectId?: string | number } }).collabBoot;
    const fromBoot = siteProjectFromBoot(boot);
    if (fromBoot > 0) return fromBoot;
    const actual = mls?.actualProject;
    if (typeof actual === 'number' && Number.isInteger(actual) && actual > 0) return actual;
    if (!this.reportedMissingProject) {
      this.reportedMissingProject = true;
      console.error('[preview] site project is missing; draft cover stays off');
    }
    return null;
  }

  render() {
    // Content is the adopted app host (light DOM child) — nothing template-driven.
    return html``;
  }
}

if (!customElements.get('cbe--service-client-app-102033')) {
  customElements.define('cbe--service-client-app-102033', ServiceClientApp);
}
