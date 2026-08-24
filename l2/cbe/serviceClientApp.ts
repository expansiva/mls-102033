/// <mls fileReference="_102033_/l2/cbe/serviceClientApp.ts" enhancement="_blank" />
// Runtime service that hosts the CLIENT APP inside the right collab-nav-3 —
// the unified on.collab.codes structure (see nav3_unificado_plano.md). The
// nav3 instances this element when its data-service points at
// `_102033_/l2/cbe/serviceClientApp` (tag below follows the studio naming
// convention: cbe--service-client-app-102033). On connect it ADOPTS the shell's
// existing content host ([data-region-host="content"]) — the app keeps its
// state; nothing re-renders. ServiceBase provides the msize/visible contract
// (height cascades from collab-page exactly like on the studio).

import { html } from 'lit';
import { ServiceBase, type IService, type IServiceMenu, type IToolbarContent } from '/_102027_/l2/serviceBase.js';
// TYPE-ONLY: erased at compile time, so the studio editor is never pulled into the client-mode
// path. The runtime import is dynamic, inside armEditor().
import type { StudioEditor } from '/_102033_/l2/studio/studioEditor.js';

/**
 * The nav1 level that means "editing the page".
 *
 * There is no button: entering L3 arms the editor and leaving it disarms. The level is the intent
 * already — L3 is the page level of the aura flow — so a separate toggle was one more state to keep in
 * sync with it.
 */
const EDIT_LEVEL = 3;

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

  // ─── Studio edit mode (TASK-102033-app-como-preview) ───────────────────────
  // The mode belongs to THIS service on purpose: it is the one that shows the app, and the whole
  // point of the flow is editing the page you are navigating. A separate service would just be the
  // preview again, in another panel.
  private editor?: StudioEditor;
  private editArmed = false;
  private editArming = false;
  private studioModeObserver?: MutationObserver;
  /** Stable reference: mls.events removes a subscriber by identity. */
  private readonly onToolBarSelected = () => { void this.syncEditMode(); };
  private levelSubscribed = false;

  public menu: IServiceMenu = {
    title: '',
    main: {},
    tabs: undefined,
    tools: {},
    onClickMain: () => { /* no menu actions yet */ },
  };

  public onServiceClick(visible: boolean, _reinit: boolean, _el: IToolbarContent | null): void {
    this.adoptAppHost();
    // The editor overlay is a fixed layer on the body, so it does not disappear with this panel:
    // switching nav3 service used to leave the selection box floating over the other service.
    this.editor?.setOverlayVisible(visible);
    // The nav3 sets `level` and `visible` together when it hands a level's service over, so this is
    // also the moment a level switch becomes observable.
    void this.syncEditMode();
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
    void this.syncEditMode();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.studioModeObserver?.disconnect();
    this.studioModeObserver = undefined;
    // undefined/undefined removes the subscriber from every level and type it was added to.
    mls?.events?.removeEventListener(undefined, undefined, this.onToolBarSelected);
    this.levelSubscribed = false;
    this.editor?.detach();
    this.editor = undefined;
    this.editArmed = false;
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
    this.studioModeObserver = new MutationObserver(() => { void this.syncEditMode(); });
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
   * `syncEditMode` is idempotent: it also fires when the user picks another service in the same level
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
   * The region host the editor binds to.
   *
   * NOT the page element and NOT a wrapper around it: `mountRegion` reuses the mounted element by
   * comparing `host.firstElementChild.tagName` with the route tag, so anything inserted in between
   * makes the shell remount the screen on its next render.
   */
  private regionHost(): HTMLElement | null {
    return this.querySelector('[data-region-host="content"]');
  }

  /**
   * Arms the editor while on the edit level, disarms otherwise. The single decision point.
   *
   * Studio mode is required on top of the level: leaving studio mode (Ctrl+Alt+S) does NOT reset the
   * nav3 level, so without that condition the editor would stay armed in a client session — capturing
   * every pointer event and making the app unusable.
   */
  private async syncEditMode(): Promise<void> {
    const wanted = this.isStudioMode() && this.level === EDIT_LEVEL;

    if (!wanted) {
      if (this.editArmed) {
        this.editArmed = false;
        this.editor?.setMode('off');
      }
      return;
    }

    if (this.editArmed || this.editArming) return;

    const host = this.regionHost();
    if (!host) return;

    // Guard against re-entrancy: loading the editor is async and the observers can fire again
    // meanwhile (the nav3 sets `level` and `visible` in the same pass).
    this.editArming = true;
    try {
      if (!this.editor) {
        // Dynamic on purpose: the studio editor only loads when someone actually reaches the level.
        const { StudioEditor } = await import('/_102033_/l2/studio/studioEditor.js');
        this.editor = new StudioEditor();
      }
      // Re-check: the level may have changed while the import was in flight.
      if (!this.isStudioMode() || this.level !== EDIT_LEVEL) return;

      // `this` is the chrome host: the editor's status toast mounts inside the SERVICE, so feedback
      // stays scoped to this panel instead of floating over the whole app.
      this.editor.attach(host, this);
      this.editArmed = true;
      this.editor.setMode('select');
      // With no button, this is the only signal that clicks now select instead of reaching the app.
      this.editor.showStatus(`Modo edição (L${EDIT_LEVEL}) — clique num texto para editar`);
    } finally {
      this.editArming = false;
    }
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
        this.appendChild(region);
        this.applyRegionHeight();
        // The editor binds to the region host, so an arming attempt that ran BEFORE the adoption found
        // nothing to bind to and gave up. Connecting straight on the edit level is exactly that order.
        void this.syncEditMode();
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
    let height = parseFloat((this.getAttribute('msize') || '').split(',')[1] || '');
    if (!Number.isFinite(height) || height <= 0) height = parseFloat(this.style.height || '');
    const region = this.querySelector('main[data-region="content"]') as HTMLElement | null;
    if (!region) return;
    region.style.height = Number.isFinite(height) && height > 0 ? `${height}px` : '100%';
  }

  render() {
    // Content is the adopted app host (light DOM child) — nothing template-driven.
    return html``;
  }
}

if (!customElements.get('cbe--service-client-app-102033')) {
  customElements.define('cbe--service-client-app-102033', ServiceClientApp);
}
