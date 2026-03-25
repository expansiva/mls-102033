/// <mls fileReference="_102033_/l2/shared/layout/aura-aside.ts" enhancement="_blank" />
import { LitElement, html } from 'lit';
import type { AuraBootConfig } from '/_102033_/l2/shared/contracts/bootstrap.js';
import { beginExpectedNavigationLoad, runBlockingUiAction } from '/_102033_/l2/shared/interactionRuntime.js';
import { closeAuraAside } from '/_102033_/l2/shared/layout/aura-shell-events.js';

function traceLazy(event: string, details?: Record<string, unknown>) {
  if (!window.isTraceLazy) {
    return;
  }
  console.log('[traceLazy][aura-aside]', event, details ?? {});
}

export class AuraAside extends LitElement {
  static properties = {
    bootConfig: { attribute: false },
    currentPath: { state: true },
  };

  declare bootConfig?: AuraBootConfig;
  declare currentPath: string;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.currentPath = window.location.pathname;
    window.addEventListener('popstate', this.handleLocationChange);
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this.handleLocationChange);
    super.disconnectedCallback();
  }

  private readonly handleLocationChange = () => {
    this.currentPath = window.location.pathname;
  };

  private isItemActive(href: string) {
    if (href === this.bootConfig?.basePath) {
      return (
        this.currentPath === href ||
        this.currentPath === `${href}/index.html` ||
        this.currentPath === `${href}/overview`
      );
    }

    return this.currentPath === href;
  }

  private handleNavigate(event: Event) {
    const target = event.currentTarget as HTMLAnchorElement | null;
    const href = target?.getAttribute('href');
    if (!href || !href.startsWith('/')) {
      return;
    }

    event.preventDefault();
    const basePath = this.bootConfig?.basePath ?? '';
    const isCurrentModuleRoute = href === basePath || href.startsWith(`${basePath}/`);
    if (!isCurrentModuleRoute) {
      window.location.href = href;
      return;
    }

    if (window.location.pathname !== href) {
      traceLazy('handleNavigate', {
        href,
      });
      const retry = () => this.navigateWithinModule(href);
      void runBlockingUiAction(
        async (signal) => {
          await this.navigateWithinModule(href, signal);
        },
        {
          clearContentWhileBusy: true,
          busyLabel: 'Carregando pagina...',
          errorTitle: 'Nao foi possivel carregar esta pagina',
          retry,
        },
      );
    }
    closeAuraAside();
  }

  private async navigateWithinModule(href: string, signal?: AbortSignal) {
    const pendingLoad = beginExpectedNavigationLoad(signal);
    traceLazy('navigateWithinModule.dispatch', {
      href,
    });
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await pendingLoad;
    traceLazy('navigateWithinModule.resolved', {
      href,
    });
  }

  render() {
    const navigation = this.bootConfig?.navigation ?? [];
    const moduleLinks = this.bootConfig?.moduleLinks ?? [];
    return html`
      <style>
        collab-aura-aside {
          display: block;
          height: 100%;
        }

        collab-aura-aside .aside {
          display: flex;
          flex-direction: column;
          gap: 20px;
          height: 100%;
          padding: 20px;
          background: linear-gradient(180deg, #17324d 0%, #22496e 100%);
          color: #f8fafc;
        }

        collab-aura-aside .badge {
          display: inline-flex;
          width: fit-content;
          border-radius: 999px;
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.14);
          font-size: 0.78rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        collab-aura-aside ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 10px;
        }

        collab-aura-aside .section {
          display: grid;
          gap: 10px;
        }

        collab-aura-aside .section-label {
          font-size: 0.76rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(248, 250, 252, 0.62);
        }

        collab-aura-aside li {
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.08);
          overflow: hidden;
        }

        collab-aura-aside a {
          display: block;
          padding: 12px 14px;
          color: inherit;
          text-decoration: none;
        }

        collab-aura-aside li.active {
          background: rgba(255, 255, 255, 0.18);
        }

        collab-aura-aside strong {
          display: block;
        }

        collab-aura-aside small {
          display: block;
          margin-top: 4px;
          color: rgba(248, 250, 252, 0.72);
        }

        collab-aura-aside .caption {
          color: rgba(248, 250, 252, 0.72);
          font-size: 0.84rem;
          line-height: 1.5;
        }

        collab-aura-aside .head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        collab-aura-aside .module-name {
          margin-top: 12px;
        }

        collab-aura-aside .close {
          display: none;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(248, 250, 252, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: inherit;
          cursor: pointer;
        }

        @media (max-width: 768px) {
          collab-aura-aside .close.enabled {
            display: inline-flex;
          }
        }
      </style>
      <aside class="aside">
        <div class="head">
          <div>
            <div class="badge">Global Aside</div>
            <div class="module-name">${this.bootConfig?.moduleId ?? 'module'}</div>
            <div class="caption">This aside lives in the 102033 shell and can be changed once for all modules.</div>
          </div>
          <button
            class="close ${this.bootConfig?.layout.asideMode.mobile !== 'inline' ? 'enabled' : ''}"
            type="button"
            aria-label="Close navigation"
            @click=${() => closeAuraAside()}
          >
            ✕
          </button>
        </div>
        <div class="section">
          <div class="section-label">Pages</div>
          <ul>
            ${navigation.length > 0
              ? navigation.map((item) => html`
                  <li class="${this.isItemActive(item.href) ? 'active' : ''}">
                    <a href="${item.href}" @click=${this.handleNavigate}>
                      <strong>${item.label}</strong>
                      ${item.description ? html`<small>${item.description}</small>` : ''}
                    </a>
                  </li>
                `)
              : html`
                  <li><a href="${this.bootConfig?.basePath ?? '/'}" @click=${this.handleNavigate}><strong>Overview</strong></a></li>
                `}
          </ul>
        </div>
        ${moduleLinks.length > 0
          ? html`
              <div class="section">
                <div class="section-label">Other Modules</div>
                <ul>
                  ${moduleLinks.map((item) => html`
                    <li>
                      <a href="${item.href}" @click=${this.handleNavigate}>
                        <strong>${item.label}</strong>
                        ${item.description ? html`<small>${item.description}</small>` : ''}
                      </a>
                    </li>
                  `)}
                </ul>
              </div>
            `
          : null}
      </aside>
    `;
  }
}

customElements.define('collab-aura-aside', AuraAside);
