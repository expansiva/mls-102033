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
import { publishEditHost } from '/_102033_/l2/cbe/studioEditSlot.js';
import { loadStudioTools } from '/_102033_/l2/cbe/studioServices.js';

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

  // ─── Studio edit tools (TASK-102033-app-como-preview, -studio-to-102020) ───
  // The DECISION belongs to this service on purpose: it is the one that shows the app, and the whole
  // point of the flow is editing the page you are navigating. The TOOLS do not: they are authoring,
  // they live in the Studio plugin, and they plug in through the slot (studioEditSlot). This service
  // used to own a StudioEditor, which is how authoring code ended up in the master frontend.
  private toolsRequested = false;
  private panelVisible = true;
  private studioModeObserver?: MutationObserver;
  /** Stable reference: mls.events removes a subscriber by identity. */
  private readonly onToolBarSelected = () => { this.publishEditState(); };
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
    this.publishEditState();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.studioModeObserver?.disconnect();
    this.studioModeObserver = undefined;
    // undefined/undefined removes the subscriber from every level and type it was added to.
    mls?.events?.removeEventListener(undefined, undefined, this.onToolBarSelected);
    this.levelSubscribed = false;
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
        this.appendChild(region);
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
