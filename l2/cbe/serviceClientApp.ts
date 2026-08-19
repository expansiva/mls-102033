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

// Tool id in the nav3 toolbar. There is no save tool: every edit persists immediately (the studio
// editor writes through to the VM right after applying it).
const TOOL_EDIT = 'studioEdit';

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
  private editPage = '';
  private studioModeObserver?: MutationObserver;

  public menu: IServiceMenu = {
    title: '',
    main: {},
    tabs: undefined,
    tools: {},
    onClickMain: () => { /* no menu actions yet */ },
    onClickTools: (op: string) => { void this.onClickTools(op); },
  };

  public onServiceClick(visible: boolean, _reinit: boolean, _el: IToolbarContent | null): void {
    this.adoptAppHost();
    // The editor overlay is a fixed layer on the body, so it does not disappear with this panel:
    // switching nav3 service used to leave the selection box floating over the other service.
    this.editor?.setOverlayVisible(visible);
    this.syncTools();
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
    this.syncTools();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.studioModeObserver?.disconnect();
    this.studioModeObserver = undefined;
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
    this.studioModeObserver = new MutationObserver(() => {
      if (!this.isStudioMode() && this.editArmed) {
        this.editArmed = false;
        this.editor?.setMode('off');
      }
      this.syncTools();
    });
    this.studioModeObserver.observe(shell, { attributes: true, attributeFilter: ['data-studio-mode'] });
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
   * Rebuilds the toolbar tools for the current state.
   *
   * In client mode there are NO edit tools at all — a client session must not even see the affordance.
   */
  private syncTools(): void {
    const tools: IServiceMenu['tools'] = {};

    if (this.isStudioMode()) {
      tools[TOOL_EDIT] = {
        type: 'cycle',
        selected: this.editArmed ? 1 : 0,
        options: [
          { text: 'Editar a página', icon: 'f044' },
          { text: this.editPage ? `Editando ${this.editPage}` : 'Editando', icon: 'f00d' },
        ],
      };
    }

    this.menu.tools = tools;
    this.menu.refresh?.('tools');
  }

  private async onClickTools(op: string): Promise<void> {
    if (op === TOOL_EDIT) await this.toggleEdit();
  }

  private async toggleEdit(): Promise<void> {
    if (this.editArmed) {
      this.editArmed = false;
      this.editor?.setMode('off');
      this.syncTools();
      return;
    }

    const host = this.regionHost();
    if (!host) return;

    if (!this.editor) {
      // Dynamic on purpose: the studio editor only loads when someone actually arms it.
      const { StudioEditor } = await import('/_102033_/l2/studio/studioEditor.js');
      this.editor = new StudioEditor({
        onTarget: (target) => {
          this.editPage = target?.page ?? '';
          this.syncTools();
        },
      });
    }
    // `this` is the chrome host: the editor's status toast mounts inside the SERVICE, so feedback
    // stays scoped to this panel instead of floating over the whole app.
    this.editor.attach(host, this);
    this.editArmed = true;
    this.editor.setMode('select');
    this.syncTools();
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
