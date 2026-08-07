/// <mls fileReference="_102033_/l2/cbe/serviceRuntimeMessages.ts" enhancement="_blank" />
// Runtime service hosting collab-messages inside the LEFT collab-nav-3 (the
// unified on.collab.codes structure — messages panel WITHOUT its own toolbar,
// the nav3 toolbar takes over). It ADOPTS the aside's existing messages
// element (e.g. cafe-flow-messages-aside-102051) so the runtime environment
// (same-origin /msg API, apps/tasks providers) and all state are preserved —
// unlike the studio's serviceCollabMessages, which would override the
// environment with studio endpoints. Tab toolbar parity with the studio
// service comes in a later pass.

import { html } from 'lit';
import { ServiceBase, type IService, type IServiceMenu, type IToolbarContent } from '/_102027_/l2/serviceBase.js';

export class ServiceRuntimeMessages extends ServiceBase {
  public details: IService = {
    icon: '&#xf086;',
    state: 'foreground',
    position: 'left',
    tooltip: 'Messages',
    visible: true,
    widget: '_102033_/l2/cbe/serviceRuntimeMessages',
    level: [0, 1, 2, 3, 4, 5, 6, 7],
  };

  // Same nav3 toolbar the studio's serviceCollabMessages declares: the mode
  // tabs render in the nav3 bar and drive the inner collab-messages activeTab
  // (whose own toolbar is hidden via getMenuMode() === 'custom').
  private readonly tabNames = ['CRM', 'TASK', 'CONNECT', 'MOMENTS', 'APPS'];

  // Startup tab: the last one the user picked, defaulting to APPS — the entry
  // point of the unified runtime shell. Persistence rides collab-messages' OWN
  // localStorage record ('serviceCollabMessages'.lastTab): the component
  // re-applies dataLocal.lastTab over activeTab on its first update, so a
  // separate key would always lose that race — sharing the record makes the
  // component itself restore the tab.
  private static readonly TAB_STORAGE_KEY = 'serviceCollabMessages';

  private loadStorageRecord(): Record<string, unknown> {
    try {
      const raw = localStorage.getItem(ServiceRuntimeMessages.TAB_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Record<string, unknown>;
    } catch { /* storage unavailable/corrupt — fall through */ }
    return {};
  }

  private saveLastTab(name: string): void {
    try {
      const record = this.loadStorageRecord();
      record.lastTab = name;
      localStorage.setItem(ServiceRuntimeMessages.TAB_STORAGE_KEY, JSON.stringify(record));
    } catch { /* storage unavailable — selection just won't persist */ }
  }

  private initialTabIndex(): number {
    const saved = this.loadStorageRecord().lastTab;
    const index = typeof saved === 'string' ? this.tabNames.indexOf(saved) : -1;
    return index >= 0 ? index : this.tabNames.indexOf('APPS');
  }

  public menu: IServiceMenu = {
    title: '',
    main: {},
    tabs: {
      group: 'Mode',
      type: 'onlyicon',
      selected: this.initialTabIndex(),
      options: [
        { text: 'CRM', icon: 'f095' },
        { text: 'Tasks', icon: 'f0ae' },
        { text: 'Connect', icon: 'f0c1' },
        { text: 'Moments', icon: 'f1ea' },
        { text: 'Apps', icon: 'f58d' },
      ],
    },
    tools: {},
    onClickMain: () => { /* no menu actions yet */ },
    onClickTabs: (index: number) => this.setMessagesTab(index),
  };

  private setMessagesTab(index: number): void {
    const name = this.tabNames[index] ?? 'CRM';
    this.saveLastTab(name);
    const messages = this.querySelector('collab-messages-102025') as (HTMLElement & { activeTab?: string }) | null;
    if (messages) messages.activeTab = name;
  }

  public onServiceClick(_visible: boolean, _reinit: boolean, _el: IToolbarContent | null): void {
    this.adoptMessagesElement();
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // Custom elements default to display:inline, which ignores the height +
    // overflow:auto the nav3 layout applies — block makes the panel scroll.
    this.style.display = 'block';
    this.adoptMessagesElement();
  }

  private adoptMessagesElement(): void {
    void this.ensureMessages();
  }

  private ensuring = false;

  // Two sources, in order: (1) a project-provided messages aside (e.g. the
  // 102051 cafe-flow aside — carries its own environment), adopted whole;
  // (2) SELF-HOSTED collab-messages with the generic runtime environment —
  // any client project (102045...) gets messages without per-project code.
  // The 102025 modules load via dist or the mini-studio fallback.
  private async ensureMessages(): Promise<void> {
    if (this.ensuring || this.querySelector('collab-messages-102025')) return;
    this.ensuring = true;
    try {
      const asideContent = document.querySelector('[data-region-host="aside"] > *');
      const isMessagesAside = asideContent?.tagName.toLowerCase().includes('messages') ?? false;
      if (asideContent && isMessagesAside) {
        if (asideContent.parentElement !== this) this.appendChild(asideContent);
        this.applyInnerHeight();
        this.setMessagesTab(this.initialTabIndex());
        return;
      }
      const { applyRuntimeMessagesEnvironment } = await import('/_102033_/l2/cbe/runtimeMessagesEnvironment.js');
      applyRuntimeMessagesEnvironment();
      await import('/_102025_/l2/collabMessages.js');
      if (!customElements.get('collab-messages-102025') && window.mls) {
        window.dispatchEvent(new Event('mls:ready'));
      }
      // Seed the shared record BEFORE the element exists: connectedCallback
      // reads it into dataLocal.lastTab and the first update applies it over
      // activeTab — the component restores the tab by itself, no flash.
      const initialTab = this.tabNames[this.initialTabIndex()];
      this.saveLastTab(initialTab);
      const messages = document.createElement('collab-messages-102025') as HTMLElement & { activeTab?: string };
      messages.activeTab = initialTab;
      this.appendChild(messages);
      this.applyInnerHeight();
    } catch (error) {
      console.warn('[serviceRuntimeMessages] collab-messages unavailable:', error);
    } finally {
      this.ensuring = false;
    }
  }

  // Same pattern as the studio's serviceCollabMessages: the inner
  // collab-messages sizes itself from an explicit height — forward the msize
  // the nav3 cascades or it collapses to ~120px. ServiceBase declares msize
  // with noAccessor (no reactive update cycle), so hook the raw attribute
  // callback instead of updated().
  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    super.attributeChangedCallback(name, oldValue ?? '', newValue ?? '');
    if (name === 'msize') this.applyInnerHeight();
  }

  private applyInnerHeight(): void {
    // msize is "width,height,top,left"; the inline height the nav3 layout
    // writes on this element is the fallback for the adoption moment.
    let height = parseFloat((this.getAttribute('msize') || '').split(',')[1] || '');
    if (!Number.isFinite(height) || height <= 0) height = parseFloat(this.style.height || '');
    if (!Number.isFinite(height) || height <= 0) return;
    const inner = this.querySelector('collab-messages-102025') as HTMLElement | null;
    if (inner) {
      inner.style.height = `${height}px`;
      // The component's own CSS carries overflow:hidden !important — the
      // panel must scroll when content (e.g. the Apps menu) exceeds the
      // fixed height, so important is required here too.
      inner.style.setProperty('overflow-y', 'auto', 'important');
    }
  }

  render() {
    return html``;
  }
}

if (!customElements.get('cbe--service-runtime-messages-102033')) {
  customElements.define('cbe--service-runtime-messages-102033', ServiceRuntimeMessages);
}
