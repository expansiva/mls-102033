/// <mls fileReference="_102033_/l2/cbe/studioHeader.ts" enhancement="_blank" />
// "Studio mode" header for the runtime VM: renders the studio chrome — nav1
// (30px top bar), nav2 (36px toolbar) and nav3 (workspace strip filling the
// rest of the band) — instead of the client app header. Switched via the
// clientShell header profiles (Ctrl+Alt+S / mls.sites.setHeader).
//
// The components live in mls-102041 (the on.collab.codes site) and load
// through the mini-studio environment cbeMiniCfe prepares (service worker +
// IndexedDB filled by the cbe login; the server also serves them straight from
// compiled.zip as a fallback). Markup mirrors the studio index.html: a
// collab-page wrapper (the navs find each other via closest('collab-page'))
// with nav1 on top and a left/right splitter of nav2+nav3.
//
// nav2's tabs are NOT intrinsic: on the studio, CollabInit (mls-100554) scans
// the projects' plugin menu actions and assigns nav1.services after login.
// applyStudioServices() scans the site + deps (not 100554) and declares the
// studio widgets the runtime uses; on any failure it falls back to anonymous.

import { LitElement, html } from 'lit';
import type { MasterFrontendBootConfig } from '/_102033_/l2/shared/contracts/bootstrap.js';
// The VM storage driver registration lives with the rest of the runtime studio bootstrap —
// this header is only ONE of the paths that needs it (see initStudio.registerVmDriver).
import { registerVmDriver } from '/_102033_/l2/cbe/initStudio.js';
import {
  STUDIO_BASE_PROJECT,
  ANONYMOUS_SERVICES,
  SERVICE_MESSAGES,
  SERVICE_APP,
  RUNTIME_STUDIO_SERVICES,
  withRuntimeServices,
  buildStudioServices,
} from '/_102033_/l2/cbe/studioServices.js';

export {
  STUDIO_BASE_PROJECT,
  ANONYMOUS_SERVICES,
  SERVICE_MESSAGES,
  SERVICE_APP,
  RUNTIME_STUDIO_SERVICES,
  withRuntimeServices,
  buildStudioServices,
};

const NAV1_HEIGHT_PX = 30;
const NAV2_HEIGHT_PX = 36;
export const STUDIO_PROJECT = 102041;
// Header-only studio chrome: nav1 + nav2 (the nav3 workspaces live in the
// content, shared by both modes — see nav3_unificado_plano.md). collab-page
// stays as the wrapper because the navs wire to each other via
// closest('collab-page').
const STUDIO_MODULES = ['collab-page', 'collab-nav-1', 'collab-nav-2'];
const NAV_TAGS = ['collab-nav-1', 'collab-nav-2'];

// Icon font the studio page loads in its index.html (the navs render
// `class="fa ..."` glyphs); same CDN/version as mls-102041/l2/index.html and
// the fontawesome ref in its enhancementCollab.ts. Injected once, on demand.
const FONT_AWESOME_URL = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css';
const FONT_AWESOME_LINK_ID = 'cbe-studio-fontawesome';

export function ensureStudioPageAssets(): void {
  if (!document.getElementById(FONT_AWESOME_LINK_ID)) {
    const link = document.createElement('link');
    link.id = FONT_AWESOME_LINK_ID;
    link.rel = 'stylesheet';
    link.href = FONT_AWESOME_URL;
    document.head.appendChild(link);
  }
  // Theme variables the studio components consume — the variables block of
  // _102041_/l2/collab-css-base.less (ONLY the variables: its html/body resets
  // must not leak into the client app page). Global so nav1/nav2/nav3 render
  // with the exact on.collab.codes colors in light AND dark.
  if (!document.getElementById('cbe-studio-vars')) {
    const style = document.createElement('style');
    style.id = 'cbe-studio-vars';
    style.textContent = `
      :root {
        --collab-nav-bg-1: #ffffff; --collab-nav-bg-2: #dfdfdf; --collab-nav-bg-3: #f6f6f6;
        --collab-nav-color: #767676; --collab-nav-color-active: #000000;
        --collab-nav-3-link-active: #007bff; --collab-text-primary-color: #403f3f;
        --collab-bg-primary-color: #ffffff; --collab-bg-secondary-color: #E6E6E6;
      }
      [data-theme="dark"] {
        --collab-nav-bg-1: #161616; --collab-nav-bg-2: #363636; --collab-nav-bg-3: #565555;
        --collab-nav-color: #888888; --collab-nav-color-active: #ffffff;
        --collab-nav-3-link-active: #a8d8ff; --collab-text-primary-color: #e6edf3;
        --collab-bg-primary-color: #0d1117; --collab-bg-secondary-color: #161b22;
      }
    `;
    document.head.appendChild(style);
  }
}

interface StudioNav1Element extends HTMLElement {
  services?: { services: string[] };
}

export class CbeStudioHeader extends LitElement {
  static properties = {
    bootConfig: { attribute: false },
    navsReady: { state: true },
    navsError: { state: true },
  };

  declare bootConfig?: MasterFrontendBootConfig;
  declare navsReady: boolean;
  declare navsError: string;

  constructor() {
    super();
    this.navsReady = false;
    this.navsError = '';
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    void this.loadNavModules();
  }

  private async loadNavModules(): Promise<void> {
    try {
      ensureStudioPageAssets();
      // Before anything can read a SOURCE file: without it the cfe resolves the
      // GitHub driver (the login marks every VM project as 'GitHub') and every
      // cache miss goes to github.com with the bogus projectURL 'local'.
      await registerVmDriver();
      // Served by the mls service worker from the IndexedDB the cbe login
      // fills (server compiled.zip fallback covers the SW-less first load).
      await Promise.all(STUDIO_MODULES.map((name) => import(`/_${STUDIO_PROJECT}_/l2/${name}.js`)));
      // The enhanced studio modules register their custom elements on the
      // window 'mls:ready' event (once-listeners). The studio page fires it
      // after the lib boots; on the runtime page cbeMiniCfe boots the lib, so
      // by the time these modules are imported mls IS ready — fire the event
      // to run the pending customElements.define calls. Re-dispatching is safe:
      // every enhanced listener is registered with { once: true }.
      if (!customElements.get(NAV_TAGS[0]) && window.mls) {
        window.dispatchEvent(new Event('mls:ready'));
      }
      await Promise.race([
        Promise.all(NAV_TAGS.map((name) => customElements.whenDefined(name))),
        new Promise((_, reject) => setTimeout(() => reject(new Error('studio nav components did not register (mls:ready pending?)')), 5000)),
      ]);
      this.navsReady = true;
      await this.updateComplete;
      void this.applyStudioServices();
    } catch (err) {
      this.navsError = err instanceof Error ? err.message : String(err);
      console.warn('[studioHeader] studio navs unavailable (mini-studio env not ready?):', this.navsError);
    }
  }

  // What CollabInit.enableNav does on the studio after login: hand the scanned
  // services to nav1 (nav2 pulls them via closest('collab-page')) and enable it.
  private async applyStudioServices(): Promise<void> {
    const nav1 = this.querySelector('collab-nav-1') as StudioNav1Element | null;
    if (!nav1) return;
    const siteProject = Number(this.bootConfig?.projectId) || 0;
    let services = ANONYMOUS_SERVICES;
    try {
      services = await buildStudioServices(siteProject);
    } catch (err) {
      console.warn('[studioHeader] service scan failed — using anonymous defaults:', err);
    }
    // Same list the content structure builds (studioStructure): the runtime pair prepended on
    // every level and the studio's own messages widget dropped. Both toolbars drive the SAME
    // nav3s, so without this the studio header would have no entry to get back to the app or
    // the messages after a profile switch.
    const nav2Left = this.querySelector('collab-nav-2[toolbarposition="left"]');
    const nav2Right = this.querySelector('collab-nav-2[toolbarposition="right"]');
    nav1.services = { services: withRuntimeServices(services, nav2Left, nav2Right) };
    nav1.setAttribute('status', 'enabled');
  }

  render() {
    return html`
      <style>
        /* Theme variables the nav components consume — copied from the ROOT
           block of _102041_/l2/collab-css-base.less (only the variables: its
           html/body resets must NOT leak into the client app page). */
        :root {
          --collab-nav-bg-1: #ffffff;
          --collab-nav-bg-2: #dfdfdf;
          --collab-nav-bg-3: #f6f6f6;
          --collab-nav-color: #767676;
          --collab-nav-color-active: #000000;
          --collab-nav-3-link-active: #007bff;
          --collab-text-primary-color: #403f3f;
          --collab-bg-primary-color: #ffffff;
          --collab-bg-secondary-color: #E6E6E6;
        }
        [data-theme="dark"] {
          --collab-nav-bg-1: #161616;
          --collab-nav-bg-2: #363636;
          --collab-nav-bg-3: #565555;
          --collab-nav-color: #888888;
          --collab-nav-color-active: #ffffff;
          --collab-nav-3-link-active: #a8d8ff;
          --collab-text-primary-color: #e6edf3;
          --collab-bg-primary-color: #0d1117;
          --collab-bg-secondary-color: #161b22;
        }

        collab-cbe-studio-header {
          display: block;
          height: 100%;
          overflow: hidden;
          background: var(--collab-nav-bg-1, #ffffff);
        }
        /* Header-only band: nav1 (30px) + nav2 row (36px) replacing the client
           banner inside the header region. The workspace below (aside/content —
           the future unified nav3 pair) is untouched by the toggle. */
        collab-cbe-studio-header collab-page {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--collab-nav-bg-1, #ffffff);
        }
        collab-cbe-studio-header .studio-nav1 { flex: 0 0 ${NAV1_HEIGHT_PX}px; }
        collab-cbe-studio-header .studio-nav2s {
          flex: 1 1 ${NAV2_HEIGHT_PX}px;
          min-height: 0;
          display: flex;
        }
        collab-cbe-studio-header .studio-nav2s > collab-nav-2 { flex: 1 1 50%; min-width: 0; }
        collab-cbe-studio-header .studio-placeholder {
          display: flex;
          align-items: center;
          height: 100%;
          padding: 0 24px;
          color: #52606d;
          font-size: 0.88rem;
        }
      </style>
      ${this.navsReady
        ? html`
            <collab-page>
              <div class="studio-nav1">
                <collab-nav-1 mheight="${NAV1_HEIGHT_PX}" tabindexactive="0" initialproject="${STUDIO_BASE_PROJECT}"></collab-nav-1>
              </div>
              <div class="studio-nav2s">
                <collab-nav-2 mheight="${NAV2_HEIGHT_PX}" level="7" toolbarposition="left"></collab-nav-2>
                <collab-nav-2 mheight="${NAV2_HEIGHT_PX}" level="7" toolbarposition="right"></collab-nav-2>
              </div>
            </collab-page>
          `
        : html`
            <div class="studio-placeholder">
              ${this.navsError
            ? `Studio indisponível: ${this.navsError}`
            : 'Carregando ambiente do studio...'}
            </div>
          `}
    `;
  }
}

customElements.define('collab-cbe-studio-header', CbeStudioHeader);
