/// <mls fileReference="_102033_/l2/shared/shell.ts" enhancement="_blank" />
import type {
  AuraAsideMode,
  AuraBlockingErrorState,
  AuraBootConfig,
  AuraDeviceKind,
  AuraInteractionState,
  AuraRouteDefinition,
} from '/_102033_/l2/shared/contracts/bootstrap.js';
import '/_102033_/l2/shared/layout/aura-aside.js';
import '/_102033_/l2/shared/layout/aura-header.js';
import {
  AURA_CLOSE_ASIDE_EVENT,
  AURA_OPEN_ASIDE_EVENT,
  AURA_TOGGLE_ASIDE_EVENT,
} from '/_102033_/l2/shared/layout/aura-shell-events.js';
import {
  clearBlockingError,
  retryBlockingError,
  subscribeToInteractionState,
} from '/_102033_/l2/shared/interactionRuntime.js';
import { getCollabRouteChunkCache, loadAuraRouteChunk, matchAuraRoute } from '/_102033_/l2/shared/routeRuntime.js';
import { LitElement, html } from 'lit';

function traceLazy(event: string, details?: Record<string, unknown>) {
  if (!window.isTraceLazy) {
    return;
  }
  console.log('[traceLazy][shell]', event, details ?? {});
}

function isAuraBootConfig(value: unknown): value is AuraBootConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.moduleId === 'string' &&
    typeof candidate.basePath === 'string' &&
    typeof candidate.shellMode === 'string' &&
    typeof candidate.device === 'string' &&
    Array.isArray(candidate.routes)
  );
}

type AuraRegionName = 'header' | 'aside' | 'content';
const MOBILE_BREAKPOINT_PX = 768;

const DEFAULT_REGION_TAGS: Record<Exclude<AuraRegionName, 'content'>, string> = {
  header: 'collab-aura-header',
  aside: 'collab-aura-aside',
};

export class CollabAuraShell extends LitElement {
  static properties = {
    bootConfig: { attribute: false },
    statusMessage: { state: true },
    routeStatusMessage: { state: true },
    interactionState: { attribute: false },
    resolvedDevice: { state: true },
    isAsideOpen: { state: true },
    activeRoute: { attribute: false },
  };

  declare bootConfig?: AuraBootConfig;
  declare statusMessage: string;
  routeStatusMessage = '';
  interactionState: AuraInteractionState = {
    busy: false,
    busyPhase: 'idle',
    clearContentWhileBusy: false,
  };
  resolvedDevice: AuraDeviceKind = 'desktop';
  isAsideOpen = false;
  activeRoute?: AuraRouteDefinition;
  private mobileMediaQuery?: MediaQueryList;
  private unsubscribeInteraction?: () => void;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    if (!isAuraBootConfig(window.collabBoot)) {
      this.statusMessage = 'Invalid or missing window.collabBoot.';
      return;
    }

    this.bootConfig = window.collabBoot;
    this.resolvedDevice = this.resolveDevice();
    this.isAsideOpen = this.getDefaultAsideOpen(this.resolvedDevice);
    window.collabAuraShellControls = {
      toggleAside: this.handleToggleAside,
      openAside: this.handleOpenAside,
      closeAside: this.handleCloseAside,
    };
    this.mobileMediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    this.mobileMediaQuery.addEventListener('change', this.handleViewportChange);
    window.addEventListener('resize', this.handleViewportChange);
    window.addEventListener(AURA_TOGGLE_ASIDE_EVENT, this.handleToggleAside as EventListener);
    window.addEventListener(AURA_OPEN_ASIDE_EVENT, this.handleOpenAside as EventListener);
    window.addEventListener(AURA_CLOSE_ASIDE_EVENT, this.handleCloseAside as EventListener);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('popstate', this.handlePopState);
    this.unsubscribeInteraction = subscribeToInteractionState((state) => {
      this.interactionState = state;
      this.requestUpdate();
    });
    void this.mountModuleRoot();
  }

  disconnectedCallback() {
    delete window.collabAuraShellControls;
    this.mobileMediaQuery?.removeEventListener('change', this.handleViewportChange);
    window.removeEventListener('resize', this.handleViewportChange);
    window.removeEventListener(AURA_TOGGLE_ASIDE_EVENT, this.handleToggleAside as EventListener);
    window.removeEventListener(AURA_OPEN_ASIDE_EVENT, this.handleOpenAside as EventListener);
    window.removeEventListener(AURA_CLOSE_ASIDE_EVENT, this.handleCloseAside as EventListener);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('popstate', this.handlePopState);
    this.unsubscribeInteraction?.();
    super.disconnectedCallback();
  }

  private async mountModuleRoot() {
    if (!this.bootConfig) {
      return;
    }

    try {
      await Promise.all([
        this.importRegion('header'),
        this.importRegion('aside'),
      ]);
      await this.loadActiveRoute();
      this.requestUpdate();
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : String(error);
    }
  }

  private readonly handleViewportChange = () => {
    this.syncResolvedDevice();
  };

  private readonly handleToggleAside = () => {
    this.syncResolvedDevice();
    const asideMode = this.getResolvedAsideMode();
    if (asideMode === 'inline' || !this.getBaseRegionVisibility('aside')) {
      return;
    }
    this.isAsideOpen = !this.isAsideOpen;
    this.requestUpdate();
  };

  private readonly handleOpenAside = () => {
    this.syncResolvedDevice();
    if (this.getResolvedAsideMode() === 'inline' || !this.getBaseRegionVisibility('aside')) {
      return;
    }
    this.isAsideOpen = true;
    this.requestUpdate();
  };

  private readonly handleCloseAside = () => {
    this.syncResolvedDevice();
    if (this.getResolvedAsideMode() === 'inline') {
      return;
    }
    this.isAsideOpen = false;
    this.requestUpdate();
  };

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (this.interactionState.busy) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.syncResolvedDevice();
    if (event.key === 'Escape' && this.getResolvedAsideMode() !== 'inline' && this.isAsideOpen) {
      this.isAsideOpen = false;
      this.requestUpdate();
    }
  };

  private readonly handlePopState = () => {
    traceLazy('handlePopState', {
      pathname: window.location.pathname,
    });
    this.syncResolvedDevice();
    if (this.getResolvedAsideMode() !== 'inline') {
      this.isAsideOpen = false;
    }
    void this.loadActiveRoute();
    this.requestUpdate();
  };

  private syncResolvedDevice() {
    const nextDevice = this.resolveDevice();
    if (nextDevice === this.resolvedDevice) {
      return;
    }

    this.resolvedDevice = nextDevice;
    this.isAsideOpen = this.getDefaultAsideOpen(nextDevice);
    this.requestUpdate();
  }

  private resolveDevice(): AuraDeviceKind {
    if (typeof window.matchMedia === 'function') {
      return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches ? 'mobile' : 'desktop';
    }
    return this.bootConfig?.device ?? 'desktop';
  }

  private getDefaultAsideOpen(device: AuraDeviceKind) {
    return this.getAsideModeForDevice(device) === 'inline';
  }

  private getAsideModeForDevice(device: AuraDeviceKind): AuraAsideMode {
    return this.bootConfig?.layout.asideMode[device] ?? (device === 'mobile' ? 'drawer' : 'inline');
  }

  private getResolvedAsideMode(): AuraAsideMode {
    return this.getAsideModeForDevice(this.resolvedDevice);
  }

  private getRenderer(region: AuraRegionName) {
    if (!this.bootConfig) {
      return null;
    }

    if (region === 'content') {
      if (!this.activeRoute?.entrypoint || !this.activeRoute.tag) {
        throw new Error('Aura shell requires an active route renderer in window.collabBoot.');
      }
      return {
        entrypoint: this.activeRoute.entrypoint,
        tag: this.activeRoute.tag,
        fallback: false,
      };
    }

    const entrypoint = region === 'header' ? this.bootConfig.headerEntrypoint : this.bootConfig.asideEntrypoint;
    const tag = region === 'header' ? this.bootConfig.headerTag : this.bootConfig.asideTag;
    if (entrypoint && tag) {
      return {
        entrypoint,
        tag,
        fallback: false,
      };
    }

    return {
      entrypoint: '',
      tag: DEFAULT_REGION_TAGS[region],
      fallback: true,
    };
  }

  private async importRegion(region: AuraRegionName) {
    const renderer = this.getRenderer(region);
    if (!renderer || renderer.fallback) {
      return;
    }

    try {
      traceLazy('importRegion.start', {
        region,
        entrypoint: renderer.entrypoint,
      });
      await loadAuraRouteChunk(renderer.entrypoint);
      traceLazy('importRegion.success', {
        region,
        entrypoint: renderer.entrypoint,
      });
    } catch (error) {
      throw new Error(`Could not load Aura ${region} renderer from ${renderer.entrypoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async loadActiveRoute() {
    if (!this.bootConfig) {
      return;
    }

    traceLazy('loadActiveRoute.start', {
      pathname: window.location.pathname,
    });
    const nextRoute = matchAuraRoute(this.bootConfig.routes, window.location.pathname);
    if (!nextRoute) {
      this.activeRoute = undefined;
      this.routeStatusMessage = `Route not registered for ${window.location.pathname}.`;
      return;
    }

    this.activeRoute = nextRoute;
    const loadedChunks = getCollabRouteChunkCache();
    const shouldShowLoading = !loadedChunks.has(nextRoute.entrypoint);
    traceLazy('loadActiveRoute.matched', {
      path: nextRoute.path,
      entrypoint: nextRoute.entrypoint,
      shouldShowLoading,
    });
    this.routeStatusMessage = shouldShowLoading ? `Loading ${nextRoute.title}...` : '';

    try {
      await this.importRegion('content');
      this.routeStatusMessage = '';
      traceLazy('loadActiveRoute.ready', {
        path: nextRoute.path,
        tag: nextRoute.tag,
      });
      this.requestUpdate();
    } catch (error) {
      this.routeStatusMessage = error instanceof Error ? error.message : String(error);
    }
  }

  private getBaseRegionVisibility(region: AuraRegionName) {
    const visibility = this.bootConfig?.layout.regions[this.resolvedDevice];
    return visibility?.[region] ?? true;
  }

  private getActualAsideOpen() {
    if (!this.getBaseRegionVisibility('aside')) {
      return false;
    }

    return this.getResolvedAsideMode() === 'inline' ? true : this.isAsideOpen;
  }

  private getRegionVisibility(region: AuraRegionName) {
    if (!this.getBaseRegionVisibility(region)) {
      return false;
    }

    const asideMode = this.getResolvedAsideMode();
    const isAsideOpen = this.getActualAsideOpen();

    if (region === 'aside') {
      return isAsideOpen;
    }

    if (asideMode === 'fullscreen' && isAsideOpen) {
      return false;
    }

    return true;
  }

  private mountRegion(region: AuraRegionName) {
    if (!this.bootConfig) {
      return;
    }

    const host = this.querySelector(`[data-region-host="${region}"]`);
    if (!host) {
      return;
    }

    if (!this.getBaseRegionVisibility(region)) {
      host.replaceChildren();
      return;
    }

    if (region === 'content' && !this.activeRoute) {
      host.replaceChildren();
      return;
    }

    const renderer = this.getRenderer(region);
    if (!renderer) {
      host.replaceChildren();
      return;
    }

    const currentTagName = host.firstElementChild?.tagName.toLowerCase();
    if (currentTagName === renderer.tag) {
      traceLazy('mountRegion.reuse', {
        region,
        tag: renderer.tag,
      });
      const currentElement = host.firstElementChild as HTMLElement & { bootConfig?: AuraBootConfig } | null;
      if (currentElement) {
        currentElement.bootConfig = this.bootConfig;
      }
      return;
    }

    traceLazy('mountRegion.replace', {
      region,
      tag: renderer.tag,
    });
    const element = document.createElement(renderer.tag) as HTMLElement & { bootConfig?: AuraBootConfig };
    element.bootConfig = this.bootConfig;
    host.replaceChildren(element);
  }

  updated() {
    if (!this.bootConfig) {
      return;
    }
    this.setAttribute('data-device', this.resolvedDevice);
    this.setAttribute('data-aside-mode', this.getResolvedAsideMode());
    this.setAttribute('data-aside-open', String(this.getActualAsideOpen()));
    this.mountRegion('header');
    this.mountRegion('aside');
    this.mountRegion('content');
  }

  private renderBlockingError(blockingError: AuraBlockingErrorState) {
    return html`
      <section class="shell-error-card" role="alert" aria-live="assertive">
        <p class="shell-error-eyebrow">Falha de carregamento</p>
        <h2>${blockingError.title}</h2>
        <p class="shell-error-message">${blockingError.error.message}</p>
        ${blockingError.error.details ? html`<pre class="shell-error-details">${String(blockingError.error.details)}</pre>` : null}
        <div class="shell-error-actions">
          ${blockingError.canRetry
            ? html`<button type="button" class="shell-primary-button" @click=${() => void retryBlockingError()}>Tentar novamente</button>`
            : null}
          <button type="button" class="shell-secondary-button" @click=${() => clearBlockingError()}>Fechar</button>
        </div>
      </section>
    `;
  }

  render() {
    const styles = html`<style>
      collab-aura-shell {
        display: block;
        min-height: 100vh;
        color: #102a43;
        font-family: "Segoe UI", sans-serif;
        --aura-region-header-display: block;
        --aura-region-aside-display: block;
        --aura-region-content-display: block;
      }

      collab-aura-shell .layout {
        display: grid;
        min-height: 100vh;
        grid-template-rows: auto 1fr;
        background: #fffdfa;
      }

      collab-aura-shell .body {
        display: grid;
        grid-template-columns: 280px minmax(0, 1fr);
        min-height: 0;
        background: #fffdfa;
        position: relative;
      }

      collab-aura-shell .body[data-aside-mode="drawer"],
      collab-aura-shell .body[data-aside-mode="fullscreen"],
      collab-aura-shell .body[data-aside-visible="false"] {
        grid-template-columns: minmax(0, 1fr);
      }

      collab-aura-shell .region {
        min-width: 0;
        min-height: 0;
      }

      collab-aura-shell .region.header {
        display: var(--aura-region-header-display);
      }

      collab-aura-shell .region.aside {
        display: var(--aura-region-aside-display);
        height: 100%;
      }

      collab-aura-shell .body[data-aside-mode="drawer"] .region.aside,
      collab-aura-shell .body[data-aside-mode="fullscreen"] .region.aside {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        z-index: 30;
        max-width: min(320px, calc(100vw - 32px));
        width: 100%;
        box-shadow: 0 20px 50px rgba(15, 23, 42, 0.28);
      }

      collab-aura-shell .body[data-aside-mode="fullscreen"] .region.aside {
        max-width: 100vw;
      }

      collab-aura-shell .region.content {
        display: var(--aura-region-content-display);
        padding: 24px;
        background:
          radial-gradient(circle at top right, rgba(255, 207, 117, 0.28), transparent 26%),
          linear-gradient(180deg, #f7f4ea 0%, #fffdfa 100%);
      }

      collab-aura-shell [data-region-host="aside"] {
        height: 100%;
      }

      collab-aura-shell .backdrop {
        position: fixed;
        inset: 0;
        z-index: 20;
        background: rgba(15, 23, 42, 0.42);
      }

      collab-aura-shell .error {
        margin: 24px;
        padding: 16px 18px;
        border-radius: 14px;
        border: 1px solid #f7c6c7;
        background: #fff1f2;
        color: #7a1f2a;
      }

      collab-aura-shell .shell-guard {
        position: fixed;
        inset: 0;
        z-index: 80;
        pointer-events: auto;
      }

      collab-aura-shell .shell-guard.subtle {
        background: rgba(255, 253, 250, 0.08);
      }

      collab-aura-shell .shell-guard.dimmed {
        background: rgba(15, 23, 42, 0.24);
        backdrop-filter: blur(2px);
      }

      collab-aura-shell .guard-label {
        position: fixed;
        top: 20px;
        right: 24px;
        border-radius: 999px;
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.92);
        color: #102a43;
        font-size: 0.9rem;
        box-shadow: 0 14px 34px rgba(15, 23, 42, 0.14);
      }

      collab-aura-shell .shell-error-card {
        margin: 24px 0;
        border-radius: 28px;
        border: 1px solid #fecaca;
        background: #fff7f7;
        padding: 28px;
        box-shadow: 0 18px 40px rgba(127, 29, 29, 0.08);
      }

      collab-aura-shell .shell-error-eyebrow {
        margin: 0 0 10px;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #b91c1c;
      }

      collab-aura-shell .shell-error-card h2 {
        margin: 0;
        font-size: 1.5rem;
        color: #7f1d1d;
      }

      collab-aura-shell .shell-error-message {
        margin: 14px 0 0;
        color: #7f1d1d;
        line-height: 1.6;
      }

      collab-aura-shell .shell-error-details {
        margin: 16px 0 0;
        overflow-x: auto;
        border-radius: 18px;
        background: #fff;
        padding: 14px;
        font-size: 0.84rem;
        color: #7f1d1d;
      }

      collab-aura-shell .shell-error-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 20px;
      }

      collab-aura-shell .shell-primary-button,
      collab-aura-shell .shell-secondary-button {
        border-radius: 999px;
        padding: 11px 18px;
        font-weight: 600;
        cursor: pointer;
      }

      collab-aura-shell .shell-primary-button {
        border: none;
        background: #102a43;
        color: #fff;
      }

      collab-aura-shell .shell-secondary-button {
        border: 1px solid #d9e2ec;
        background: #fff;
        color: #102a43;
      }
    </style>`;

    if (!this.bootConfig) {
      return html`${styles}<div class="error">${this.statusMessage ?? 'Shell bootstrap was not provided.'}</div>`;
    }

    if (this.statusMessage) {
      return html`${styles}<div class="error">${this.statusMessage}</div>`;
    }

    const headerVisible = this.getRegionVisibility('header');
    const asideVisible = this.getRegionVisibility('aside');
    const contentVisible = this.getRegionVisibility('content');
    const asideMode = this.getResolvedAsideMode();
    const isAsideOpen = this.getActualAsideOpen();
    const blockingError = this.interactionState.blockingError;
    const shellStyle = [
      `--aura-region-header-display: ${headerVisible ? 'block' : 'none'}`,
      `--aura-region-aside-display: ${asideVisible ? 'block' : 'none'}`,
      `--aura-region-content-display: ${contentVisible ? 'block' : 'none'}`,
    ].join('; ');

    return html`
      <div
        style=${shellStyle}
        data-device=${this.resolvedDevice}
        data-aside-mode=${asideMode}
        data-aside-open=${String(isAsideOpen)}
      >
        ${styles}
        ${this.interactionState.busy
          ? html`
              <div class="shell-guard ${this.interactionState.busyPhase}">
                ${this.interactionState.busyPhase === 'dimmed'
                  ? html`<div class="guard-label">${this.interactionState.busyLabel ?? 'Processando...'}</div>`
                  : null}
              </div>
            `
          : null}
        <div class="layout">
          <section class="region header" data-region="header" data-visible=${String(headerVisible)}>
            <div data-region-host="header"></div>
          </section>
          <div
            class="body"
            data-aside-visible=${String(asideVisible)}
            data-device=${this.resolvedDevice}
            data-aside-mode=${asideMode}
            data-aside-open=${String(isAsideOpen)}
          >
            ${asideMode !== 'inline' && isAsideOpen
        ? html`<button class="backdrop" type="button" aria-label="Close aside" @click=${this.handleCloseAside}></button>`
        : null}
            <aside class="region aside" data-region="aside" data-visible=${String(asideVisible)}>
              <div data-region-host="aside"></div>
            </aside>
            <main class="region content" data-region="content" data-visible=${String(contentVisible)}>
              ${blockingError ? this.renderBlockingError(blockingError) : null}
              ${!blockingError && this.routeStatusMessage
        ? html`<div class="error">${this.routeStatusMessage}</div>`
        : null}
              ${blockingError ? null : html`<div data-region-host="content"></div>`}
            </main>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('collab-aura-shell', CollabAuraShell);
