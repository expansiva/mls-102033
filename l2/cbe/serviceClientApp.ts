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

  public menu: IServiceMenu = {
    title: '',
    main: {},
    tabs: undefined,
    tools: {},
    onClickMain: () => { /* no menu actions yet */ },
  };

  public onServiceClick(_visible: boolean, _reinit: boolean, _el: IToolbarContent | null): void {
    this.adoptAppHost();
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
        region.style.height = '100%';
        this.appendChild(region);
      }
      return;
    }
    if (this.adoptRetriesLeft-- > 0) {
      setTimeout(() => this.adoptAppHost(), 250);
    }
  }

  render() {
    // Content is the adopted app host (light DOM child) — nothing template-driven.
    return html``;
  }
}

if (!customElements.get('cbe--service-client-app-102033')) {
  customElements.define('cbe--service-client-app-102033', ServiceClientApp);
}
