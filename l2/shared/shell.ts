/// <mls fileReference="_102033_/l2/shared/shell.ts" enhancement="_blank" />
import type {
  MasterFrontendAsideMode,
  MasterFrontendBlockingErrorState,
  MasterFrontendBootConfig,
  MasterFrontendDeviceKind,
  MasterFrontendDynamicRegionConfig,
  MasterFrontendInteractionState,
  MasterFrontendRegionName,
  MasterFrontendRegionRendererConfig,
  MasterFrontendRouteDefinition,
} from '/_102033_/l2/shared/contracts/bootstrap.js';
import '/_102033_/l2/shared/layout/aura-aside.js';
import '/_102033_/l2/shared/layout/aura-header.js';
import {
  AURA_CLOSE_ASIDE_EVENT,
  AURA_OPEN_ASIDE_EVENT,
  AURA_TOGGLE_ASIDE_EVENT,
} from '/_102033_/l2/shared/layout/aura-shell-events.js';
import {
  bindExpectedNavigationLoad,
  clearBlockingError,
  consumeExpectedNavigationLoad,
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

function isAuraBootConfig(value: unknown): value is MasterFrontendBootConfig {
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

const MOBILE_BREAKPOINT_PX = 768;
type AuraDynamicRegionName = Exclude<MasterFrontendRegionName, 'content'>;
type AuraRegionRendererState = MasterFrontendRegionRendererConfig & { fallback?: boolean };
type AuraRegionElement = HTMLElement & {
  bootConfig?: MasterFrontendBootConfig;
  regionProps?: Record<string, unknown>;
};

const DEFAULT_REGION_TAGS: Record<Exclude<MasterFrontendRegionName, 'content'>, string> = {
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

  declare bootConfig?: MasterFrontendBootConfig;
  declare statusMessage: string;
  routeStatusMessage = '';
  interactionState: MasterFrontendInteractionState = {
    busy: false,
    busyPhase: 'idle',
    clearContentWhileBusy: false,
  };
  resolvedDevice: MasterFrontendDeviceKind = 'desktop';
  isAsideOpen = false;
  activeRoute?: MasterFrontendRouteDefinition;
  private mobileMediaQuery?: MediaQueryList;
  private unsubscribeInteraction?: () => void;
  private dynamicRegionRenderers: Partial<Record<AuraDynamicRegionName, AuraRegionRendererState>> = {};
  private dynamicRegionProps: Partial<Record<AuraDynamicRegionName, Record<string, unknown>>> = {};
  private activeAsideWidthPx?: number;
  // Ctrl+E cycles the content page through its UX variants (genome page11 -> page21 -> page31 -> ...).
  // Override the content renderer with the picked variant; tied to the active route so navigation resets it.
  private contentVariantRenderer?: { tag: string; entrypoint: string; routeKey: string };

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
    this.initializeDynamicRegions();
    window.collabMasterFrontendShellControls = {
      toggleAside: this.handleToggleAside,
      openAside: this.handleOpenAside,
      closeAside: this.handleCloseAside,
      setHeaderRenderer: this.setHeaderRenderer,
      setAsideRenderer: this.setAsideRenderer,
      setShellProfile: this.setShellProfile,
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
    delete window.collabMasterFrontendShellControls;
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

  private readonly setHeaderRenderer = async (
    renderer: MasterFrontendRegionRendererConfig,
    props?: Record<string, unknown>,
  ) => {
    await this.setRegionRenderer('header', renderer, props);
  };

  private readonly setAsideRenderer = async (
    renderer: MasterFrontendRegionRendererConfig,
    props?: Record<string, unknown>,
  ) => {
    const widthPx = typeof props?.widthPx === 'number' ? props.widthPx : undefined;
    await this.setRegionRenderer('aside', renderer, props, widthPx);
  };

  private readonly setShellProfile = async (profileName: string) => {
    if (!profileName) {
      return;
    }

    const changes: Array<Promise<void>> = [];
    if (this.getRegionProfile('header', profileName)) {
      changes.push(this.setRegionProfile('header', profileName));
    }
    if (this.getRegionProfile('aside', profileName)) {
      changes.push(this.setRegionProfile('aside', profileName));
    }

    if (changes.length === 0) {
      throw new Error(`Shell profile "${profileName}" is not configured.`);
    }

    if (this.bootConfig?.clientShell) {
      this.bootConfig.clientShell.activeProfile = profileName;
    }

    await Promise.all(changes);
  };

  private async setRegionProfile(region: AuraDynamicRegionName, profileName: string) {
    const profile = this.getRegionProfile(region, profileName);
    if (!profile) {
      return;
    }

    const regionConfig = this.bootConfig?.clientShell?.regions[region];
    if (regionConfig) {
      regionConfig.activeProfile = profileName;
    }

    await this.setRegionRenderer(
      region,
      profile.renderer,
      this.getRegionPropsFromProfile(profile, profileName),
      profile.widthPx,
    );
  }

  private async setRegionRenderer(
    region: AuraDynamicRegionName,
    renderer: MasterFrontendRegionRendererConfig,
    props?: Record<string, unknown>,
    widthPx?: number,
  ) {
    if (!renderer.entrypoint || !renderer.tag) {
      throw new Error(`Aura ${region} renderer requires entrypoint and tag.`);
    }

    await loadAuraRouteChunk(renderer.entrypoint);
    this.dynamicRegionRenderers[region] = {
      ...renderer,
      fallback: false,
    };
    this.dynamicRegionProps[region] = props ?? {};
    if (region === 'aside' && typeof widthPx === 'number' && widthPx > 0) {
      this.activeAsideWidthPx = widthPx;
    }
    this.mountRegion(region);
    this.requestUpdate();
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (this.interactionState.busy) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.syncResolvedDevice();
    // Ctrl+E cycles the current page through its UX variants (page11 -> page21 -> page31 -> ...).
    if (event.ctrlKey && !event.altKey && !event.metaKey && (event.key === 'e' || event.key === 'E')) {
      event.preventDefault();
      void this.rotateContentVariant();
      return;
    }
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
    // Settle the aside's expected navigation load with the real route load: without this
    // bind the beginExpectedNavigationLoad promise never resolves and every menu
    // navigation ends in a 10s TIMEOUT (no network request involved).
    const pendingLoad = consumeExpectedNavigationLoad();
    bindExpectedNavigationLoad(pendingLoad, this.loadActiveRoute());
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

  private resolveDevice(): MasterFrontendDeviceKind {
    if (typeof window.matchMedia === 'function') {
      return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches ? 'mobile' : 'desktop';
    }
    return this.bootConfig?.device ?? 'desktop';
  }

  private getDefaultAsideOpen(device: MasterFrontendDeviceKind) {
    return this.getAsideModeForDevice(device) === 'inline';
  }

  private initializeDynamicRegions() {
    (['header', 'aside'] as AuraDynamicRegionName[]).forEach((region) => {
      const regionConfig = this.bootConfig?.clientShell?.regions[region];
      const profileName = regionConfig?.activeProfile;
      if (!profileName) {
        return;
      }

      const profile = this.getRegionProfile(region, profileName);
      if (!profile) {
        return;
      }

      this.dynamicRegionRenderers[region] = {
        ...profile.renderer,
        fallback: false,
      };
      this.dynamicRegionProps[region] = this.getRegionPropsFromProfile(profile, profileName);
      if (region === 'aside' && typeof profile.widthPx === 'number' && profile.widthPx > 0) {
        this.activeAsideWidthPx = profile.widthPx;
      }
    });
  }

  private getRegionProfile(region: AuraDynamicRegionName, profileName: string) {
    return this.bootConfig?.clientShell?.regions[region]?.profiles[profileName];
  }

  private getRegionPropsFromProfile(profile: MasterFrontendDynamicRegionConfig, profileName: string): Record<string, unknown> {
    const {
      renderer: _renderer,
      widthPx: _widthPx,
      source: _source,
      switchWithoutRouteReload: _switchWithoutRouteReload,
      props,
      ...regionProps
    } = profile;

    return {
      ...regionProps,
      ...(props ?? {}),
      profileName,
    };
  }

  private getAsideModeForDevice(device: MasterFrontendDeviceKind): MasterFrontendAsideMode {
    return this.bootConfig?.layout.asideMode[device] ?? (device === 'mobile' ? 'drawer' : 'inline');
  }

  private getResolvedAsideMode(): MasterFrontendAsideMode {
    return this.getAsideModeForDevice(this.resolvedDevice);
  }

  private getAsideWidthPx() {
    return this.activeAsideWidthPx ?? this.bootConfig?.layout.asideSize?.desktopWidthPx ?? 280;
  }

  private getAsideDrawerWidthPx() {
    return this.activeAsideWidthPx ?? this.bootConfig?.layout.asideSize?.drawerWidthPx ?? 320;
  }

  private getRegionProps(region: MasterFrontendRegionName) {
    if (region === 'content') {
      return undefined;
    }
    return this.dynamicRegionProps[region];
  }

  // Effective content renderer: the picked UX variant when set for the current route, else the route default.
  private getActiveContentRenderer(): { tag: string; entrypoint: string } | undefined {
    if (!this.activeRoute?.entrypoint || !this.activeRoute.tag) {
      return undefined;
    }
    if (this.contentVariantRenderer && this.contentVariantRenderer.routeKey === this.activeRoute.path) {
      return { tag: this.contentVariantRenderer.tag, entrypoint: this.contentVariantRenderer.entrypoint };
    }
    return { tag: this.activeRoute.tag, entrypoint: this.activeRoute.entrypoint };
  }

  // Ordered UX layout indices from the config (project.json/config.json "layouts"); falls back to 1..3.
  private getAvailableUxLayouts(): number[] {
    const layouts = (this.bootConfig as { layouts?: Record<string, unknown> } | undefined)?.layouts
      ?? (window.collabBoot as { layouts?: Record<string, unknown> } | undefined)?.layouts;
    if (layouts && typeof layouts === 'object') {
      const indices = Object.keys(layouts)
        .map((key) => Number(key))
        .filter((value) => Number.isInteger(value) && value >= 1)
        .sort((left, right) => left - right);
      if (indices.length > 0) {
        return indices;
      }
    }
    return [1, 2, 3];
  }

  // Cycle the content page to the next existing UX variant (rotative). A variant exists when its
  // module chunk loads and its custom element is registered; missing variants are skipped.
  private async rotateContentVariant(): Promise<void> {
    const current = this.getActiveContentRenderer();
    if (!current) {
      return;
    }
    const genomeMatch = current.tag.match(/--page(\d)(\d)--/);
    if (!genomeMatch) {
      return;
    }
    const currentUx = Number(genomeMatch[1]);
    const uiDigit = genomeMatch[2];
    const uxList = this.getAvailableUxLayouts();
    if (uxList.length <= 1) {
      return;
    }
    const startIndex = Math.max(0, uxList.indexOf(currentUx));
    for (let step = 1; step <= uxList.length; step++) {
      const nextUx = uxList[(startIndex + step) % uxList.length];
      if (nextUx === currentUx) {
        continue;
      }
      const nextTag = current.tag.replace(/--page\d\d--/, `--page${nextUx}${uiDigit}--`);
      const nextEntrypoint = current.entrypoint.replace(/\/page\d\d\//, `/page${nextUx}${uiDigit}/`);
      if (nextTag === current.tag || nextEntrypoint === current.entrypoint) {
        continue;
      }
      try {
        await loadAuraRouteChunk(nextEntrypoint);
      } catch {
        continue;
      }
      if (!customElements.get(nextTag)) {
        continue;
      }
      this.contentVariantRenderer = { tag: nextTag, entrypoint: nextEntrypoint, routeKey: this.activeRoute?.path ?? '' };
      this.routeStatusMessage = '';
      this.mountRegion('content');
      this.requestUpdate();
      return;
    }
  }

  private getRenderer(region: MasterFrontendRegionName) {
    if (!this.bootConfig) {
      return null;
    }

    if (region === 'content') {
      const content = this.getActiveContentRenderer();
      if (!content) {
        throw new Error('Aura shell requires an active route renderer in window.collabBoot.');
      }
      return {
        entrypoint: content.entrypoint,
        tag: content.tag,
        fallback: false,
      };
    }

    const dynamicRenderer = this.dynamicRegionRenderers[region];
    if (dynamicRenderer) {
      return dynamicRenderer;
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

  private async importRegion(region: MasterFrontendRegionName) {
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
    // Navigation resets any picked UX variant back to the route default (page11).
    this.contentVariantRenderer = undefined;
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

  private getBaseRegionVisibility(region: MasterFrontendRegionName) {
    const visibility = this.bootConfig?.layout.regions[this.resolvedDevice];
    return visibility?.[region] ?? true;
  }

  private getActualAsideOpen() {
    if (!this.getBaseRegionVisibility('aside')) {
      return false;
    }

    return this.getResolvedAsideMode() === 'inline' ? true : this.isAsideOpen;
  }

  private getRegionVisibility(region: MasterFrontendRegionName) {
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

  private mountRegion(region: MasterFrontendRegionName) {
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
      const currentElement = host.firstElementChild as AuraRegionElement | null;
      if (currentElement) {
        currentElement.bootConfig = this.bootConfig;
        currentElement.regionProps = this.getRegionProps(region);
      }
      return;
    }

    traceLazy('mountRegion.replace', {
      region,
      tag: renderer.tag,
    });
    const element = document.createElement(renderer.tag) as AuraRegionElement;
    element.bootConfig = this.bootConfig;
    element.regionProps = this.getRegionProps(region);
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

  private renderBlockingError(blockingError: MasterFrontendBlockingErrorState) {
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
        grid-template-columns: var(--aura-aside-width, 280px) minmax(0, 1fr);
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
        max-width: min(var(--aura-aside-drawer-width, 320px), calc(100vw - 32px));
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
      `--aura-aside-width: ${this.getAsideWidthPx()}px`,
      `--aura-aside-drawer-width: ${this.getAsideDrawerWidthPx()}px`,
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
