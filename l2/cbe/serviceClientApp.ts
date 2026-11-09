/// <mls fileReference="_102033_/l2/cbe/serviceClientApp.ts" enhancement="_blank" />
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

function pinMenuText(): string {
  const nav = window.collabRuntimeNav3;
  const pinned = Boolean(nav?.isPinned?.(nav.activeTab?.() ?? 'app'));
  return tabPinLabel(pinned, document.documentElement?.lang || 'en');
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
}

/** Studio, with unsaved work, and not the page level (editing happens on the preview). */
export function previewCoverVisible(input: IPreviewCoverInput): boolean {
  return input.studio === true && input.level !== EDIT_LEVEL && input.count > 0;
}
// preview-cover-decision:end

/** Window events. The studio plugin publishes them; this service does not import it. */
const COLLAB_DRAFT_PENDING = 'collabDraftPending';
const COLLAB_DRAFT_SAVE_REQUEST = 'collabDraftSaveRequest';
const COLLAB_DRAFT_SAVED = 'collabDraftSaved';

interface IDraftPendingDetail {
  project: number;
  count: number;
}

interface IPreviewCoverCopy {
  before: string;
  save: string;
  after: string;
}

const PREVIEW_COVER_COPY: Record<'en' | 'pt' | 'es', IPreviewCoverCopy> = {
  en: {
    before: 'There are unsaved draft changes. Use ',
    save: 'Save',
    after: ' to update this preview.',
  },
  pt: {
    before: 'Há alterações no rascunho. Use ',
    save: 'Salvar',
    after: ' para atualizar este preview.',
  },
  es: {
    before: 'Hay cambios en el borrador. Use ',
    save: 'Guardar',
    after: ' para actualizar esta vista previa.',
  },
};

function previewCoverCopy(language: string): IPreviewCoverCopy {
  const code = language.trim().toLowerCase();
  if (code.startsWith('pt')) return PREVIEW_COVER_COPY.pt;
  if (code.startsWith('es')) return PREVIEW_COVER_COPY.es;
  return PREVIEW_COVER_COPY.en;
}

function readPendingDetail(value: unknown): IDraftPendingDetail | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { project?: unknown; count?: unknown };
  if (typeof record.project !== 'number' || !Number.isInteger(record.project) || record.project <= 0) return null;
  if (typeof record.count !== 'number' || !Number.isFinite(record.count) || record.count < 0) return null;
  return { project: record.project, count: record.count };
}

function readSavedProject(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const project = (value as { project?: unknown }).project;
  if (typeof project !== 'number' || !Number.isInteger(project) || project <= 0) return null;
  return project;
}

function blockPreviewScroll(event: Event): void {
  event.preventDefault();
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

  // ─── Studio edit tools (TASK-102033-app-como-preview, -studio-to-102020) ───
  // The DECISION belongs to this service on purpose: it is the one that shows the app, and the whole
  // point of the flow is editing the page you are navigating. The TOOLS do not: they are authoring,
  // they live in the Studio plugin, and they plug in through the slot (studioEditSlot). This service
  // used to own a StudioEditor, which is how authoring code ended up in the master frontend.
  private toolsRequested = false;
  private panelVisible = true;
  private studioModeObserver?: MutationObserver;
  private draftWatchOn = false;
  private pendingCount = 0;
  private reportedMissingProject = false;
  private reportedMissingRegion = false;
  private coverEl?: HTMLElement;
  private coverBefore?: Text;
  private coverAfter?: Text;
  private coverButton?: HTMLButtonElement;
  /** Stable reference: mls.events removes a subscriber by identity. */
  private readonly onToolBarSelected = () => { this.publishEditState(); };
  private levelSubscribed = false;

  public menu: IServiceMenu = {
    title: '',
    main: {
      pin: {
        get text() { return pinMenuText(); },
      },
    },
    tabs: undefined,
    tools: {},
    onClickMain: (value: string) => {
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
      window.removeEventListener(COLLAB_DRAFT_SAVED, this.onDraftSaved);
      this.draftWatchOn = false;
    }
    this.dropCover();
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
   * The region host a tool binds to.
   *
   * NOT the page element and NOT a wrapper around it: `mountRegion` reuses the mounted element by
   * comparing `host.firstElementChild.tagName` with the route tag, so anything inserted in between
   * makes the shell remount the screen on its next render.
   */
  private regionHost(): HTMLElement | null {
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
    region.style.height = height != null ? `${height}px` : '100%';
  }

  /**
   * The preview stays on the last saved copy until Save. The cover sits beside the adopted
   * region (never inside it: the shell remounts when the region host's first child changes)
   * and is moved to the end on every sync, because adopting the region appends it.
   */
  private syncPreviewCover(): void {
    const show = previewCoverVisible({
      studio: this.isStudioMode(),
      level: this.level,
      count: this.pendingCount,
    });
    if (!show) {
      this.dropCover();
      return;
    }
    this.classList.add('preview-draft-locked');
    const region = this.querySelector('main[data-region="content"]');
    if (region instanceof HTMLElement) {
      region.setAttribute('inert', '');
    } else if (!this.reportedMissingRegion) {
      this.reportedMissingRegion = true;
      console.error('[preview] draft cover has no content region');
    }
    this.paintCoverCopy();
    this.append(this.ensureCover());
  }

  private ensureCover(): HTMLElement {
    if (this.coverEl) return this.coverEl;
    const cover = document.createElement('div');
    cover.className = 'preview-draft-cover';
    cover.setAttribute('role', 'status');
    cover.addEventListener('wheel', blockPreviewScroll, { passive: false });
    cover.addEventListener('touchmove', blockPreviewScroll, { passive: false });
    const before = document.createTextNode('');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preview-draft-cover-save';
    button.addEventListener('click', this.onCoverSave);
    const after = document.createTextNode('');
    const line = document.createElement('p');
    line.append(before, button, after);
    cover.append(line);
    this.coverEl = cover;
    this.coverBefore = before;
    this.coverAfter = after;
    this.coverButton = button;
    return cover;
  }

  private paintCoverCopy(): void {
    const copy = previewCoverCopy(document.documentElement?.lang || 'en');
    if (this.coverBefore) this.coverBefore.data = copy.before;
    if (this.coverAfter) this.coverAfter.data = copy.after;
    if (this.coverButton) this.coverButton.textContent = copy.save;
  }

  private dropCover(): void {
    this.coverEl?.remove();
    this.coverEl = undefined;
    this.coverBefore = undefined;
    this.coverAfter = undefined;
    this.coverButton = undefined;
    this.classList.remove('preview-draft-locked');
    const region = this.querySelector('main[data-region="content"]');
    if (region instanceof HTMLElement) region.removeAttribute('inert');
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
    window.addEventListener(COLLAB_DRAFT_SAVED, this.onDraftSaved);
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
    this.syncPreviewCover();
  }

  private readonly onDraftSaved = (event: Event): void => {
    const project = readSavedProject((event as CustomEvent<unknown>).detail);
    if (project === null) {
      console.error('[preview] collabDraftSaved detail is invalid; preview was not reloaded');
      return;
    }
    const site = this.siteProject();
    if (!this.isStudioMode() || site === null || project !== site) return;
    this.reloadPreview();
  };

  /** `collabRuntimeNav3` has no per-tab reload, so a saved draft reloads the open page. */
  private reloadPreview(): void {
    if (typeof window.location?.reload !== 'function') {
      console.error('[preview] collabDraftSaved: location.reload is missing; preview was not reloaded');
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
