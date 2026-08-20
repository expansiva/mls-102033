/// <mls fileReference="_102033_/l2/shared/layout/aura-header.ts" enhancement="_blank" />

// The master's own header: the `defaultAura` profile and the shell's fallback tag. It is now a thin
// subclass of AuraHeaderBase — band, height, brand, toggle, navigation and styles all come from the
// base, so this file only decides WHAT goes in the band.
//
// The old `projectId · device · shellMode` line was diagnostics, not product: it now shows only
// under window.isTraceLazy, the same switch the rest of the shell tracing uses.

import { html, nothing } from 'lit';
import { AuraHeaderBase } from '/_102033_/l2/shared/layout/aura-header-base.js';

export class AuraHeader extends AuraHeaderBase {
  protected get fallbackBrandTitle(): string {
    return 'Collab Aura';
  }

  private renderTrace() {
    if (!window.isTraceLazy) {
      return nothing;
    }
    return html`
      <span class="aura-header-subtitle">
        ${this.bootConfig?.projectId ?? 'project'} ·
        ${this.bootConfig?.device ?? 'device'} ·
        ${this.bootConfig?.shellMode ?? 'shell'}
      </span>
    `;
  }

  protected renderBand() {
    return html`
      <div class="aura-header-side">
        ${this.renderAsideToggle()}
        ${this.renderBrand()}
      </div>
      <div class="aura-header-side">
        ${this.renderTrace()}
        ${this.renderActions()}
      </div>
    `;
  }
}

customElements.define('collab-aura-header', AuraHeader);
