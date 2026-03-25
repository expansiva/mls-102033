/// <mls fileReference="_102033_/l2/shared/layout/aura-header.ts" enhancement="_blank" />
import { LitElement, html } from 'lit';
import type { AuraBootConfig } from '/_102033_/l2/shared/contracts/bootstrap.js';
import { toggleAuraAside } from '/_102033_/l2/shared/layout/aura-shell-events.js';

export class AuraHeader extends LitElement {
  static properties = {
    bootConfig: { attribute: false },
  };

  declare bootConfig?: AuraBootConfig;

  createRenderRoot() {
    return this;
  }

  private showMobileAsideToggle() {
    return this.bootConfig?.layout.asideMode.mobile && this.bootConfig.layout.asideMode.mobile !== 'inline';
  }

  render() {
    return html`
      <style>
        collab-aura-header {
          display: block;
        }

        collab-aura-header .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 16px 24px;
          border-bottom: 1px solid #d9e2ec;
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(14px);
        }

        collab-aura-header .brand {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        collab-aura-header .left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        collab-aura-header .brand strong {
          font-size: 1rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        collab-aura-header .meta {
          color: #52606d;
          font-size: 0.88rem;
        }

        collab-aura-header .toggle {
          display: none;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 999px;
          border: 1px solid #d9e2ec;
          background: white;
          color: #102a43;
          font-size: 1.1rem;
          cursor: pointer;
        }

        @media (max-width: 768px) {
          collab-aura-header .toggle.enabled {
            display: inline-flex;
          }

          collab-aura-header .meta {
            display: none;
          }
        }
      </style>
      <header class="header">
        <div class="left">
          <button
            class="toggle ${this.showMobileAsideToggle() ? 'enabled' : ''}"
            type="button"
            aria-label="Open navigation"
            @click=${() => toggleAuraAside()}
          >
            ☰
          </button>
          <div class="brand">
            <strong>Collab Aura</strong>
            <span class="meta">${this.bootConfig?.pageTitle ?? this.bootConfig?.moduleId ?? 'Module'}</span>
          </div>
        </div>
        <div class="meta">
          ${this.bootConfig?.projectId ?? 'project'} · ${this.bootConfig?.device ?? 'device'} · ${this.bootConfig?.shellMode ?? 'shell'}
        </div>
      </header>
    `;
  }
}

customElements.define('collab-aura-header', AuraHeader);
