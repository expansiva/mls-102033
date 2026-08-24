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
import {
  getNextRuntimeLanguage,
  getRuntimeLanguage,
  listRuntimeLanguages,
  setRuntimeLanguage,
} from '/_102033_/l2/shared/languageRuntime.js';
import {
  getNextRuntimeDesignSystem,
  getRuntimeDesignSystem,
  listRuntimeDesignSystems,
  setRuntimeDesignSystem,
} from '/_102033_/l2/shared/designSystemRuntime.js';
import { getCollabRouteChunkCache, loadAuraRouteChunk, matchAuraRoute } from '/_102033_/l2/shared/routeRuntime.js';
import { describeContentPageGenomeChange } from '/_102033_/l2/shared/contentPageGenome.js';
import { contentPageGenomeToPreserve } from '/_102033_/l2/shared/contentPageGenomePreserve.js';
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
type AuraContentRenderer = { tag: string; entrypoint: string };
type AuraRegionElement = HTMLElement & {
  bootConfig?: MasterFrontendBootConfig;
  regionProps?: Record<string, unknown>;
};
type AuraSitesControls = {
  register?: (impl: Record<string, unknown>) => void;
  getLanguage?: () => string | undefined;
  setLanguage?: (language: string) => void;
  listLanguages?: () => string[];
  getDS?: () => string | undefined;
  setDS?: (designSystem: string) => Promise<void>;
  listDS?: () => string[];
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
    contentTabs: { state: true },
    activeContentTabId: { state: true },
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
  // Fixed header band height from the active header profile (heightPx). When every
  // header profile declares the same value, switching profiles (e.g. client app
  // header <-> studio nav1/nav2/nav3, Ctrl+Alt+S) causes zero layout shift.
  private activeHeaderHeightPx?: number;
  // ── Unified nav3 (option C): the content region hosts N tabs. Tab 'app' is the
  // client app (the normal route rendering) and is always present; extra tabs host
  // arbitrary elements (task Detail, studio services, another app route — the
  // "3 telas" workflow). The tab bar only renders when extra tabs exist, so the
  // production app pays nothing until a tab opens. Hosted elements get the studio
  // nav3 contract: an `msize` attribute ("width,height,top,left") plus layout()
  // calls on resize — what serviceBase/monaco-based services rely on.
  declare contentTabs: Array<{ id: string; title: string; element: HTMLElement; closable: boolean }>;
  declare activeContentTabId: string;
  // ── Progressive upgrade to the on.collab.codes structure (option C final):
  // after first paint, the shell mounts collab-page>nav1+spliter[nav2+nav3 × 2]
  // in background and the runtime services adopt the aside/content panels.
  // Production vs studio differs ONLY in the top 66px: the client banner is a
  // fixed overlay covering nav1+nav2; Ctrl+Alt+S hides/shows the banner.
  private structureUpgraded = false;
  private structureUpgradeFailed = false;
  private studioModeOn = false;
  private structureUpgradeAttempted = false;
  private structureRetriesLeft = 67;
  // Set once the classic header/aside/content regions have mounted (see
  // mountModuleRoot) — the structure upgrade adopts those DOM nodes, so it
  // must not run ahead of them.
  private regionsMounted = false;
  // Embedded (iframe) mode: foreign modules opened as nav3 content tabs by the
  // unified shell (openProgramUnified). The OUTER shell already provides
  // navigation (Apps menu) and framing — rendering this module's own header +
  // aside/hamburger would show its item menu twice on screen, so the frame is
  // content-only. Also gates the structure upgrade (no nested mini-studio).
  private readonly isEmbedded = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  // Ctrl+Alt+E cycles the content page through its UX variants (genome page11 -> page21 -> page31 ...).
  // Ctrl+Alt+L cycles the configured runtime languages.
  // Ctrl+Alt+D cycles the configured runtime design systems.
  // mls.sites.setPage(n) sets one directly. Override the content renderer with the picked variant;
  // navigation preserves the current genome when the next route has the same pageNN variant.
  private contentVariantRenderer?: AuraContentRenderer & { routeKey: string };
  private sitesRetryTimer?: ReturnType<typeof setTimeout>;
  // Bounded retry (~20s at 300ms) matching cbeMiniCfe's mls-lib load window.
  private sitesRetriesLeft = 67;

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
    this.contentTabs = [];
    this.activeContentTabId = 'app';
    this.initializeDynamicRegions();
    window.collabMasterFrontendShellControls = {
      toggleAside: this.handleToggleAside,
      openAside: this.handleOpenAside,
      closeAside: this.handleCloseAside,
      setHeaderRenderer: this.setHeaderRenderer,
      setAsideRenderer: this.setAsideRenderer,
      setShellProfile: this.setShellProfile,
    };
    // Unified nav3 tab API — for the shell's own pages, the collab-messages
    // environment (Detail tab) and, later, studio services.
    window.collabRuntimeNav3 = {
      // Contract types element as unknown (DOM-free for backend consumers);
      // the implementation validates it is an HTMLElement.
      openTab: (tab) => this.openContentTab(tab as { id: string; title: string; element: HTMLElement; closable?: boolean }),
      closeTab: this.closeContentTab,
      activateTab: this.activateContentTab,
      listTabs: () => ['app', ...this.contentTabs.map((tab) => tab.id)],
    };
    window.addEventListener('resize', this.handleContentTabsResize);
    this.registerSitesControls();
    setTimeout(() => this.maybeUpgradeStructure(), 1200);
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
    if (this.sitesRetryTimer) {
      clearTimeout(this.sitesRetryTimer);
      this.sitesRetryTimer = undefined;
    }
    delete window.collabMasterFrontendShellControls;
    delete window.collabRuntimeNav3;
    window.removeEventListener('resize', this.handleContentTabsResize);
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
      this.regionsMounted = true;
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
      profile.heightPx,
    );

    if (region === 'header') this.showRuntimeServices();
  }

  /**
   * Registers the TypeScript definition models of the project chain (Monaco resolves the
   * cross-project imports through them).
   *
   * Deferred to the studio switch on purpose: an app user never opens an editor, so this cost
   * has no reason to be paid at login. Idempotent — repeated toggles do nothing.
   */
  private loadStudioDefinitions(): void {
    const project = Number(this.bootConfig?.projectId) || 0;
    if (!project) return;
    void import('/_102033_/l2/cbe/initStudio.js')
      .then((module) => (module as { loadProjectDefinitions?: (project: number) => Promise<void> }).loadProjectDefinitions?.(project))
      .catch((error) => console.warn('[aura-shell] could not load the project definitions', error));
  }



  /**
   * Puts the client's own services (messages + app) back on the structure's nav3 pair.
   *
   * Called whenever the shell leaves studio mode, by either door: the Ctrl+Alt+S toggle or a
   * header profile switch. No-op while the structure is not up.
   */
  private showRuntimeServices(): void {
    const host = this.querySelector('.studio-structure-host');
    if (!host || !this.structureUpgraded) return;
    void import('/_102033_/l2/cbe/studioStructure.js')
      .then((module) => (module as { showRuntimeServices?: (host: ParentNode) => void }).showRuntimeServices?.(host))
      .catch((error) => console.warn('[aura-shell] could not restore the runtime services', error));
  }

  private async setRegionRenderer(
    region: AuraDynamicRegionName,
    renderer: MasterFrontendRegionRendererConfig,
    props?: Record<string, unknown>,
    widthPx?: number,
    heightPx?: number,
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
    if (region === 'header' && typeof heightPx === 'number' && heightPx > 0) {
      this.activeHeaderHeightPx = heightPx;
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
    // Ctrl+Alt+E cycles the current page through its UX variants (page11 -> page21 -> page31 -> ...).
    // Match by event.code ('KeyE') because Alt can change event.key to a composed character on some layouts.
    if (event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey && event.code === 'KeyE') {
      event.preventDefault();
      void this.rotateContentVariant();
      return;
    }
    // Ctrl+Alt+L cycles the configured languages (en -> pt -> ...).
    if (event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey && event.code === 'KeyL') {
      event.preventDefault();
      this.rotateLanguage();
      return;
    }
    // Ctrl+Alt+D cycles the configured design systems (Default -> Natal -> ...).
    if (event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey && event.code === 'KeyD') {
      event.preventDefault();
      void this.rotateDesignSystem();
      return;
    }
    // Ctrl+Alt+S swaps ONLY the top 66px. Upgraded structure: toggle the client
    // banner overlay (production covers nav1+nav2; studio reveals them — the
    // workspace below never changes). Classic layout: rotate header profiles.
    if (event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey && event.code === 'KeyS') {
      event.preventDefault();
      if (this.structureUpgraded) {
        this.studioModeOn = !this.studioModeOn;
        this.requestUpdate();
        if (this.studioModeOn) this.loadStudioDefinitions();
        // Back to client mode: the banner returns, and the nav3s must show the client's own
        // services again. The toolbars remember the last service opened — by now a studio one —
        // so the runtime pair has to be forced, not restored.
        else this.showRuntimeServices();
      } else {
        this.rotateHeaderProfile();
      }
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
      if (region === 'header' && typeof profile.heightPx === 'number' && profile.heightPx > 0) {
        this.activeHeaderHeightPx = profile.heightPx;
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
      heightPx: _heightPx,
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
  private getActiveContentRenderer(): AuraContentRenderer | undefined {
    if (!this.activeRoute?.entrypoint || !this.activeRoute.tag) {
      return undefined;
    }
    if (this.contentVariantRenderer && this.contentVariantRenderer.routeKey === this.activeRoute.path) {
      return { tag: this.contentVariantRenderer.tag, entrypoint: this.contentVariantRenderer.entrypoint };
    }
    return { tag: this.activeRoute.tag, entrypoint: this.activeRoute.entrypoint };
  }

  private reportContentPageMiss(genome: number, reason: string): false {
    const message = `setPage(${genome}) skipped: ${reason}`;
    console.warn(`[aura-shell] ${message}`);
    this.routeStatusMessage = message;
    this.requestUpdate();
    return false;
  }

  private async applyContentPageGenome(genome: number, shouldMount: boolean): Promise<boolean> {
    const current = this.getActiveContentRenderer();
    const change = describeContentPageGenomeChange(current, genome);
    if (!change.ok) {
      return this.reportContentPageMiss(genome, change.reason);
    }
    if (change.nextTag === current?.tag && change.nextEntrypoint === current?.entrypoint) {
      return true;
    }

    try {
      await loadAuraRouteChunk(change.nextEntrypoint);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return this.reportContentPageMiss(genome, `failed to load chunk ${change.nextEntrypoint} (${detail})`);
    }

    if (!customElements.get(change.nextTag)) {
      return this.reportContentPageMiss(genome, `custom element '${change.nextTag}' is not registered`);
    }

    this.contentVariantRenderer = { tag: change.nextTag, entrypoint: change.nextEntrypoint, routeKey: this.activeRoute?.path ?? '' };
    this.routeStatusMessage = '';
    if (shouldMount) {
      this.mountRegion('content');
      this.requestUpdate();
    }
    return true;
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

  private listLanguages(): string[] {
    return listRuntimeLanguages(this.bootConfig?.languages);
  }

  private getLanguage(): string | undefined {
    return getRuntimeLanguage(this.listLanguages(), document.documentElement.lang);
  }

  private setLanguage(language: string): void {
    setRuntimeLanguage(language, this.listLanguages());
  }

  private rotateLanguage(): void {
    const languages = this.listLanguages();
    const nextLanguage = getNextRuntimeLanguage(languages, document.documentElement.lang);
    if (nextLanguage) {
      this.setLanguage(nextLanguage);
    }
  }

  private listDS(): string[] {
    return listRuntimeDesignSystems(this.bootConfig?.designSystems);
  }

  private getDS(): string | undefined {
    return getRuntimeDesignSystem(this.listDS());
  }

  private async setDS(designSystem: string): Promise<void> {
    const projectId = this.bootConfig?.projectId;
    if (!projectId) {
      throw new Error('mls.sites.setDS: runtime project is not available.');
    }
    await setRuntimeDesignSystem(designSystem, this.listDS(), projectId);
  }

  private async rotateDesignSystem(): Promise<void> {
    const designSystems = this.listDS();
    const nextDesignSystem = getNextRuntimeDesignSystem(designSystems, this.getDS());
    if (!nextDesignSystem) {
      return;
    }
    try {
      await this.setDS(nextDesignSystem);
    } catch (error) {
      console.warn('[shell] design system switch failed:', error);
    }
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

  // Inject the console-facing controls into the mls lib (window.mls.sites), so a developer
  // can change header/aside/page/language/design system from devtools. The mls lib loads asynchronously on the
  // runtime VM (cbeMiniCfe injects /libs/mls.js), so retry with a bounded poll until it is
  // present — before it registers, mls.sites getters return undefined and setters are no-ops.
  private readonly registerSitesControls = () => {
    this.sitesRetryTimer = undefined;
    const sites = (window as unknown as {
      mls?: { sites?: AuraSitesControls };
    }).mls?.sites;
    const register = sites?.register;
    if (typeof register === 'function') {
      const languageControls = {
        getLanguage: () => this.getLanguage(),
        setLanguage: (language: string) => this.setLanguage(language),
        listLanguages: () => this.listLanguages(),
      };
      const designSystemControls = {
        getDS: () => this.getDS(),
        setDS: (designSystem: string) => this.setDS(designSystem),
        listDS: () => this.listDS(),
      };
      register({
        getHeader: () => this.getRegionIndex('header'),
        setHeader: (index: number) => this.setRegionByIndex('header', index),
        getAside: () => this.getRegionIndex('aside'),
        setAside: (index: number) => this.setRegionByIndex('aside', index),
        getPage: () => this.getContentPageGenome(),
        setPage: (genome: number) => { void this.setContentPage(genome); },
        ...languageControls,
        ...designSystemControls,
      });
      // Compatibility with an already-published mls.js that predates the language/DS
      // forwarders. A future mls.js exposes these itself and this branch is skipped.
      if (sites) {
        sites.getLanguage ??= languageControls.getLanguage;
        sites.setLanguage ??= languageControls.setLanguage;
        sites.listLanguages ??= languageControls.listLanguages;
        sites.getDS ??= designSystemControls.getDS;
        sites.setDS ??= designSystemControls.setDS;
        sites.listDS ??= designSystemControls.listDS;
      }
      return;
    }
    if (this.sitesRetriesLeft <= 0) {
      return; // mls lib never loaded (e.g. lib disabled on this VM) — nothing to register
    }
    this.sitesRetriesLeft -= 1;
    this.sitesRetryTimer = setTimeout(this.registerSitesControls, 300);
  };

  // Ordered profile names for a region, from clientShell.regions[region].profiles in the
  // boot config (config.json). This is the selectable header/aside list mls.sites indexes.
  private getRegionProfileNames(region: AuraDynamicRegionName): string[] {
    const profiles = this.bootConfig?.clientShell?.regions[region]?.profiles;
    return profiles ? Object.keys(profiles) : [];
  }

  // 1-based index of the region's active profile within its profile list, or undefined.
  private getRegionIndex(region: AuraDynamicRegionName): number | undefined {
    const names = this.getRegionProfileNames(region);
    if (names.length === 0) {
      return undefined;
    }
    const active = this.bootConfig?.clientShell?.regions[region]?.activeProfile;
    if (!active) {
      return undefined;
    }
    const index = names.indexOf(active);
    return index >= 0 ? index + 1 : undefined;
  }

  // ── Unified nav3: content tabs ────────────────────────────────────────────

  private readonly openContentTab = (tab: { id: string; title: string; element: HTMLElement; closable?: boolean }): void => {
    if (!tab?.id || tab.id === 'app' || !(tab.element instanceof HTMLElement)) {
      throw new Error('collabRuntimeNav3.openTab: id (!= "app") and element are required.');
    }
    const existing = this.contentTabs.find((entry) => entry.id === tab.id);
    if (existing) {
      existing.title = tab.title || existing.title;
      existing.element = tab.element;
    } else {
      this.contentTabs = [...this.contentTabs, {
        id: tab.id,
        title: tab.title || tab.id,
        element: tab.element,
        closable: tab.closable !== false,
      }];
    }
    this.activeContentTabId = tab.id;
    this.requestUpdate();
  };

  private readonly closeContentTab = (id: string): void => {
    if (id === 'app') return;
    this.contentTabs = this.contentTabs.filter((entry) => entry.id !== id);
    if (this.activeContentTabId === id) {
      this.activeContentTabId = this.contentTabs.length > 0 ? this.contentTabs[this.contentTabs.length - 1].id : 'app';
    }
  };

  private readonly activateContentTab = (id: string): void => {
    if (id !== 'app' && !this.contentTabs.some((entry) => entry.id === id)) return;
    this.activeContentTabId = id;
  };

  // Studio nav3 contract for hosted elements: msize="width,height,top,left" +
  // layout() on resize. serviceBase/monaco-based components size themselves
  // from it; plain elements simply ignore the attribute.
  private readonly handleContentTabsResize = (): void => {
    if (this.contentTabs.length > 0) this.updateContentTabsMsize();
  };

  private updateContentTabsMsize(): void {
    const panels = this.querySelector('.nav3-panels');
    if (!panels) return;
    const rect = panels.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const msize = [rect.width.toFixed(2), rect.height.toFixed(2), rect.top.toFixed(2), rect.left.toFixed(2)].join(',');
    for (const tab of this.contentTabs) {
      tab.element.setAttribute('msize', msize);
      (tab.element as HTMLElement & { layout?: () => void }).layout?.();
    }
  }

  // After render: make sure each tab panel contains its element (imperative —
  // the elements are caller-owned and must not be re-created by lit).
  private syncContentTabPanels(): void {
    for (const tab of this.contentTabs) {
      const panel = this.querySelector(`.nav3-panel[data-tab="${tab.id}"]`);
      if (panel && tab.element.parentElement !== panel) {
        panel.replaceChildren(tab.element);
      }
    }
    if (this.contentTabs.length > 0) this.updateContentTabsMsize();
  }

  // ── Progressive structure upgrade ────────────────────────────────────────

  private structureRetryPending = false;

  private maybeUpgradeStructure(): void {
    if (this.isEmbedded || this.structureUpgradeAttempted || this.resolvedDevice !== 'desktop' || !this.bootConfig) return;
    // Gate on the FULL studio bootstrap (login + cache + preload) — the
    // proven-safe condition. An earlier attempt gated this on just the mls
    // lib being loaded, but when collabMiniCfeReady then landed WHILE the
    // structure's own dynamic-import/whenDefined chain was still in flight
    // (fast/warm-cache runs), the upgrade rendered blank — a race in the
    // shared studio component registration this shell doesn't control.
    // regionsMounted is kept as an extra guard: the upgrade adopts the
    // classic content/aside DOM nodes, so they must already exist.
    const mlsReady = Boolean((window as unknown as { collabMiniCfeReady?: boolean }).collabMiniCfeReady);
    if (!mlsReady || !this.regionsMounted) {
      if (!this.structureRetryPending && this.structureRetriesLeft-- > 0) {
        this.structureRetryPending = true;
        setTimeout(() => { this.structureRetryPending = false; this.maybeUpgradeStructure(); }, 500);
      } else if (this.structureRetriesLeft <= 0) {
        // Gave up waiting — fall back to the classic layout instead of
        // leaving the skeleton on screen forever.
        this.structureUpgradeFailed = true;
        this.requestUpdate();
      }
      return;
    }
    this.structureUpgradeAttempted = true;
    void this.attemptStructureUpgrade();
  }

  // The nav1 -> nav2/nav3 service wiring is itself asynchronous inside the
  // studio components (studioStructure's own applySplit re-applies at 600ms
  // for the same reason) — upgradeToStudioStructure() resolving cleanly does
  // NOT guarantee the runtime service widgets actually landed. Observed in
  // practice: intermittently (more often on fast/warm-cache runs) it
  // resolves but the app/messages panes never appear, leaving the swap blank
  // with nothing left to fall back to. Verify the expected widget exists
  // before committing to 'upgraded'; retry the whole attempt a few times,
  // then give up to the classic layout rather than show a blank page.
  private static readonly STRUCTURE_UPGRADE_MAX_ATTEMPTS = 3;

  private async attemptStructureUpgrade(): Promise<void> {
    const modulePath = '/_102033_/l2/cbe/studioStructure.js';
    for (let attempt = 1; attempt <= CollabAuraShell.STRUCTURE_UPGRADE_MAX_ATTEMPTS; attempt += 1) {
      try {
        const module = (await import(`${modulePath}`)) as {
          upgradeToStudioStructure: (container: HTMLElement, siteProject: number) => Promise<HTMLElement>;
        };
        const host = this.querySelector('.studio-structure-host') as HTMLElement | null;
        if (!host) throw new Error('studio-structure-host not found');
        host.replaceChildren();
        await module.upgradeToStudioStructure(host, Number(this.bootConfig?.projectId) || 0);
        if (await this.verifyStudioStructureRendered(host)) {
          this.structureUpgraded = true;
          this.requestUpdate();
          // collab-page measured its own size via getBoundingClientRect()
          // while .studio-structure-host was still display:none (the CSS
          // only reveals it once data-structure="upgraded" lands, which is
          // NOW) — that first measurement is always 0×0. Force a remeasure
          // once the DOM update above has actually applied, so it sees the
          // real, visible layout instead of relying on its own 500ms retry
          // (which can just as easily fire before this point and re-cache 0).
          await this.updateComplete;
          (host.querySelector('collab-page') as (HTMLElement & { layout?: () => void }) | null)?.layout?.();
          console.info(`[aura-shell] structure upgraded to the unified studio layout (attempt ${attempt})`);
          return;
        }
        console.warn(`[aura-shell] studio structure rendered without the runtime service widgets (attempt ${attempt}/${CollabAuraShell.STRUCTURE_UPGRADE_MAX_ATTEMPTS})`);
      } catch (error) {
        console.warn(`[aura-shell] studio structure upgrade attempt ${attempt}/${CollabAuraShell.STRUCTURE_UPGRADE_MAX_ATTEMPTS} failed:`, error);
      }
    }
    console.warn('[aura-shell] studio structure upgrade skipped after retries (classic layout stays)');
    this.structureUpgradeFailed = true;
    this.requestUpdate();
  }

  // Gives the nav1->nav2/nav3 service cascade time to settle (past
  // studioStructure's own 600ms applySplit re-apply) before judging whether
  // the upgrade actually produced visible content.
  private verifyStudioStructureRendered(host: HTMLElement): Promise<boolean> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(Boolean(host.querySelector('cbe--service-client-app-102033')));
      }, 800);
    });
  }

  // Whether this connection will (attempt to) end up in the unified studio
  // structure — governs the skeleton shown from first paint on desktop, so
  // the classic aside/menu never has to flash before the real swap.
  private wantsStudioStructure(): boolean {
    return !this.isEmbedded && this.resolvedDevice === 'desktop';
  }

  private get structureState(): 'classic' | 'pending' | 'upgraded' {
    if (this.structureUpgraded) return 'upgraded';
    if (this.wantsStudioStructure() && !this.structureUpgradeFailed) return 'pending';
    return 'classic';
  }

  // Ctrl+Alt+S: advance to the next header profile in the clientShell list
  // (banner <-> studio nav1+nav2; wraps around). No-op with fewer than two.
  private rotateHeaderProfile(): void {
    const names = this.getRegionProfileNames('header');
    if (names.length < 2) {
      return;
    }
    const active = this.bootConfig?.clientShell?.regions.header?.activeProfile ?? names[0];
    const next = names[(Math.max(0, names.indexOf(active)) + 1) % names.length];
    void this.setRegionProfile('header', next)
      .catch((error) => console.error('[aura-shell] failed to rotate header profile', error));
  }

  // Switch a region to the nth profile (1-based) of its clientShell list. Throws synchronously
  // on an out-of-range index so the console call surfaces the error; applies asynchronously.
  private setRegionByIndex(region: AuraDynamicRegionName, index: number): void {
    const names = this.getRegionProfileNames(region);
    if (!Number.isInteger(index) || index < 1 || index > names.length) {
      const name = region === 'header' ? 'setHeader' : 'setAside';
      throw new Error(`mls.sites.${name}(${index}): index out of range (valid: 1..${names.length}).`);
    }
    void this.setRegionProfile(region, names[index - 1])
      .catch((error) => console.error(`[mls.sites] failed to set ${region}`, error));
  }

  // Current content page genome (e.g. 11, 21) parsed from the active renderer tag, or undefined.
  private getContentPageGenome(): number | undefined {
    const match = this.getActiveContentRenderer()?.tag.match(/--page(\d\d)--/);
    return match ? Number(match[1]) : undefined;
  }

  // Set the active content page to an absolute two-digit genome (e.g. 21). Fail-safe: if the
  // variant chunk does not load or its element is not registered, the current page is kept.
  private async setContentPage(genome: number): Promise<void> {
    await this.applyContentPageGenome(genome, true);
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

    const previousContentGenome = this.getContentPageGenome();
    traceLazy('loadActiveRoute.start', {
      pathname: window.location.pathname,
      requestedContentGenome: previousContentGenome,
    });
    const nextRoute = matchAuraRoute(this.bootConfig.routes, window.location.pathname);
    if (!nextRoute) {
      this.activeRoute = undefined;
      this.routeStatusMessage = `Route not registered for ${window.location.pathname}.`;
      return;
    }

    this.activeRoute = nextRoute;
    this.contentVariantRenderer = undefined;
    const nextContentGenome = this.getContentPageGenome();
    const requestedContentGenome = contentPageGenomeToPreserve(previousContentGenome, nextContentGenome);
    if (requestedContentGenome !== undefined && requestedContentGenome !== nextContentGenome) {
      await this.applyContentPageGenome(requestedContentGenome, false);
    }
    const loadedChunks = getCollabRouteChunkCache();
    const activeRenderer = this.getActiveContentRenderer() ?? nextRoute;
    const shouldShowLoading = !loadedChunks.has(activeRenderer.entrypoint);
    traceLazy('loadActiveRoute.matched', {
      path: nextRoute.path,
      entrypoint: activeRenderer.entrypoint,
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
    if (this.isEmbedded && region !== 'content') return false;
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
    this.setAttribute('data-structure', this.structureState);
    this.setAttribute('data-studio-mode', String(this.studioModeOn));
    this.mountRegion('header');
    this.mountRegion('aside');
    this.mountRegion('content');
    this.syncContentTabPanels();
    // Redundant trigger: the connectedCallback timer can be lost across early
    // shell remounts (observed on some boots) — the attempted/mls guards make
    // this re-check free once the upgrade ran or started.
    this.maybeUpgradeStructure();
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

      /* ── Upgraded structure (on.collab.codes layout) ─────────────────────
         The studio DOM (collab-page > nav1 + spliter[nav2+nav3 ×2]) fills the
         viewport; the runtime services inside the nav3 pair adopted the
         messages/app panels. The classic .body is emptied+hidden. The client
         banner becomes a fixed 66px overlay covering exactly nav1+nav2 —
         production shows the banner, studio mode (Ctrl+Alt+S) hides it. */
      collab-aura-shell .studio-structure-host { display: none; }

      collab-aura-shell[data-structure="upgraded"] .studio-structure-host {
        display: block;
        position: fixed;
        inset: 0;
      }

      /* ── Pending structure (desktop, upgrade attempt in flight) ──────────
         Same footprint the upgraded structure will occupy, but filled with a
         static shimmer skeleton instead of collab-page — shown from FIRST
         paint on desktop so the classic aside/menu never flashes on screen.
         Swapped out for the real structure the instant the upgrade lands. */
      collab-aura-shell .studio-structure-skeleton { display: none; }

      collab-aura-shell[data-structure="pending"] .studio-structure-skeleton {
        display: flex;
        flex-direction: column;
        position: fixed;
        inset: 0;
        background: #f6f6f6;
      }

      collab-aura-shell .skeleton-nav1 {
        flex: 0 0 30px;
        background: #dfdfdf;
      }

      collab-aura-shell .skeleton-body {
        flex: 1 1 auto;
        display: flex;
        min-height: 0;
      }

      collab-aura-shell .skeleton-pane {
        display: flex;
        flex-direction: column;
        min-width: 0;
        border-right: 1px solid #e2e8f0;
      }

      collab-aura-shell .skeleton-pane:last-child {
        border-right: none;
      }

      collab-aura-shell .skeleton-pane-left {
        flex: 0 0 375px;
      }

      collab-aura-shell .skeleton-pane-right {
        flex: 1 1 auto;
      }

      collab-aura-shell .skeleton-nav2 {
        flex: 0 0 36px;
        background: #dfdfdf;
      }

      collab-aura-shell .skeleton-content {
        flex: 1 1 auto;
        margin: 16px;
        border-radius: 8px;
        background: linear-gradient(90deg, #eceff1 25%, #e3e6e8 37%, #eceff1 63%);
        background-size: 400% 100%;
        animation: shell-skeleton-shimmer 1.4s ease infinite;
      }

      @keyframes shell-skeleton-shimmer {
        0% { background-position: 100% 50%; }
        100% { background-position: 0 50%; }
      }

      collab-aura-shell[data-structure="upgraded"] .layout .body,
      collab-aura-shell[data-structure="pending"] .layout .body {
        display: none;
      }

      collab-aura-shell[data-structure="upgraded"] .region.header,
      collab-aura-shell[data-structure="pending"] .region.header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 66px;
        z-index: 50;
        overflow: hidden;
      }

      collab-aura-shell[data-structure="upgraded"][data-studio-mode="true"] .region.header {
        display: none;
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
        height: var(--aura-header-height, auto);
        overflow: hidden;
      }

      collab-aura-shell .region.header [data-region-host="header"],
      collab-aura-shell .region.header [data-region-host="header"] > * {
        height: 100%;
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
        background:
          radial-gradient(circle at top right, rgba(255, 207, 117, 0.28), transparent 26%),
          linear-gradient(180deg, #f7f4ea 0%, #fffdfa 100%);
      }

      /* Unified nav3: the content region is a tab host. With no extra tabs the
         bar is absent and the app panel keeps the classic 24px padding — the
         production app renders exactly as before. */
      collab-aura-shell .region.content[data-has-tabs="true"] {
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      collab-aura-shell .nav3-tabs {
        display: flex;
        gap: 2px;
        flex: 0 0 36px;
        align-items: stretch;
        padding: 0 8px;
        background: var(--collab-nav-bg-2, #e8e4da);
        border-bottom: 1px solid #d9e2ec;
      }

      collab-aura-shell .nav3-tab {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
        padding: 0 14px;
        border: none;
        border-radius: 6px 6px 0 0;
        background: transparent;
        color: var(--collab-nav-color, #52606d);
        font-size: 0.85rem;
        cursor: pointer;
        white-space: nowrap;
      }

      collab-aura-shell .nav3-tab[data-active="true"] {
        background: var(--collab-nav-bg-3, #fffdfa);
        color: var(--collab-nav-color-active, #102a43);
        font-weight: 600;
      }

      collab-aura-shell .nav3-tab-close {
        font-size: 1rem;
        line-height: 1;
        opacity: 0.6;
      }

      collab-aura-shell .nav3-tab-close:hover {
        opacity: 1;
      }

      collab-aura-shell .nav3-panels {
        flex: 1 1 auto;
        min-height: 0;
        position: relative;
      }

      collab-aura-shell .nav3-panel {
        height: 100%;
        min-height: 0;
        overflow: auto;
      }

      collab-aura-shell .nav3-panel[data-active="false"] {
        display: none;
      }

      collab-aura-shell .nav3-panel-app {
        padding: 24px;
        box-sizing: border-box;
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
      `--aura-header-height: ${this.activeHeaderHeightPx && this.activeHeaderHeightPx > 0 ? `${this.activeHeaderHeightPx}px` : 'auto'}`,
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
        <div class="studio-structure-host"></div>
        <div class="studio-structure-skeleton" aria-hidden="true">
          <div class="skeleton-nav1"></div>
          <div class="skeleton-body">
            <div class="skeleton-pane skeleton-pane-left">
              <div class="skeleton-nav2"></div>
              <div class="skeleton-content"></div>
            </div>
            <div class="skeleton-pane skeleton-pane-right">
              <div class="skeleton-nav2"></div>
              <div class="skeleton-content"></div>
            </div>
          </div>
        </div>
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
            <main class="region content" data-region="content" data-visible=${String(contentVisible)} data-has-tabs=${String(this.contentTabs.length > 0)}>
              ${this.contentTabs.length > 0
        ? html`
                  <div class="nav3-tabs" role="tablist">
                    <button class="nav3-tab" role="tab" data-active=${String(this.activeContentTabId === 'app')} @click=${() => this.activateContentTab('app')}>
                      ${this.bootConfig?.pageTitle ?? 'App'}
                    </button>
                    ${this.contentTabs.map((tab) => html`
                      <button class="nav3-tab" role="tab" data-active=${String(this.activeContentTabId === tab.id)} @click=${() => this.activateContentTab(tab.id)}>
                        ${tab.title}
                        ${tab.closable
            ? html`<span class="nav3-tab-close" title="Fechar" @click=${(event: Event) => { event.stopPropagation(); this.closeContentTab(tab.id); }}>×</span>`
            : null}
                      </button>
                    `)}
                  </div>
                `
        : null}
              <div class="nav3-panels">
                <div class="nav3-panel nav3-panel-app" data-tab="app" data-active=${String(this.activeContentTabId === 'app')}>
                  ${blockingError ? this.renderBlockingError(blockingError) : null}
                  ${!blockingError && this.routeStatusMessage
        ? html`<div class="error">${this.routeStatusMessage}</div>`
        : null}
                  ${blockingError ? null : html`<div data-region-host="content"></div>`}
                </div>
                ${this.contentTabs.map((tab) => html`
                  <div class="nav3-panel" data-tab=${tab.id} data-active=${String(this.activeContentTabId === tab.id)}></div>
                `)}
              </div>
            </main>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('collab-aura-shell', CollabAuraShell);
