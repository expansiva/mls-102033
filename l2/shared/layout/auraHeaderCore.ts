/// <mls fileReference="_102033_/l2/shared/layout/auraHeaderCore.ts" enhancement="_blank" />

// DOM-free core of AuraHeaderBase: brand/actions resolution, the band invariants and the CSS the
// band emits. Kept apart from the element so it is testable in node (the l2 test harness has no
// DOM) and so the rules live in ONE place for every header profile — the master's own header and
// the per-project generated ones.

import type { AppHeaderAction, AppHeaderBrand } from '/_102029_/l2/runtimeConfigTypes.js';
import type { MasterFrontendBootConfig } from '/_102033_/l2/shared/contracts/bootstrap.js';

/**
 * Fixed header band, in px.
 *
 * Every header profile in `clientShell.regions.header.profiles` MUST declare this as its
 * `heightPx`: the shell turns the active profile's `heightPx` into `--aura-header-height`, so
 * profiles with different values shift the whole page when switched (Ctrl+Alt+S / mls.sites.setHeader).
 */
export const AURA_HEADER_HEIGHT_PX = 66;

/** Mobile breakpoint of the header band (the shell keeps its own for the region layout). */
export const AURA_MOBILE_BREAKPOINT_PX = 768;

export type AuraHeaderBrand = AppHeaderBrand;
export type AuraHeaderAction = AppHeaderAction;

const HEADER_ACTIONS: readonly AuraHeaderAction[] = ['language', 'designSystem', 'modules', 'search', 'user'];

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Hard cap for an inlined mark. Generous on purpose: a real mark may carry defs and many paths. */
export const MAX_LOGO_SVG_BYTES = 12000;

const LOGO_SVG_FORBIDDEN = [
  '<script', '<foreignobject', '<iframe', '<image', '<use', '<style', '<animate',
  'javascript:', 'xlink:', '<!entity', '<!doctype',
];

/**
 * Whether an SVG markup is safe AND suitable to be inlined in the header band.
 *
 * The markup is inlined, so it is executable surface: anything that can script, fetch or embed is
 * refused. It must also be a single `<svg>` root with a `viewBox` and no intrinsic size, or it cannot
 * scale into the band. Everything else — how many shapes, which colors, how it looks — is the
 * designer's call, not this function's.
 *
 * `monochrome: true` additionally requires currentColor-only paint (what makes a mark follow the
 * design system in both themes); it is OPT-IN, because a real brand mark may well be colored.
 *
 * Shared by the runtime and by the generator's validation, so both judge by the same rule.
 */
export function isSafeLogoSvg(markup: string, options: { monochrome?: boolean } = {}): boolean {
  const svg = readString(markup);
  if (!svg || svg.length > MAX_LOGO_SVG_BYTES) return false;

  const lower = svg.toLowerCase();
  if (!lower.startsWith('<svg') || !lower.endsWith('</svg>')) return false;
  if (lower.split('<svg').length !== 2) return false;              // exactly one root
  if (!/\sviewbox\s*=/u.test(lower)) return false;
  if (LOGO_SVG_FORBIDDEN.some((token) => lower.includes(token))) return false;
  if (/\son[a-z]+\s*=/u.test(lower)) return false;                 // event handlers
  // A url(#id) points inside this very markup (a gradient it carries); anything else leaves the page.
  if (/url\(\s*(?!#)/u.test(lower)) return false;
  if (/(?:href|src)\s*=/u.test(lower)) return false;

  // Intrinsic size on the ROOT tag only — width/height on inner shapes is legitimate.
  const root = lower.slice(0, lower.indexOf('>') + 1);
  if (/\s(width|height)\s*=/u.test(root)) return false;

  // Opt-in: only when the caller wants a design-system-following mark.
  if (options.monochrome === true) {
    if (/#[0-9a-f]{3,8}/u.test(lower) || /(rgb|rgba|hsl|hsla)\(/u.test(lower)) return false;
    for (const paint of lower.matchAll(/(?:fill|stroke)\s*=\s*"([^"]*)"/gu)) {
      const value = paint[1].trim();
      if (value && value !== 'currentcolor' && value !== 'none') return false;
    }
  }

  return true;
}

/**
 * Only `.svg` logos are supported: it is the asset kind that survives into dist (raster brand
 * assets are not published), so anything else would 404 in production.
 */
export function isSupportedLogoUrl(url: string): boolean {
  const path = readString(url).split(/[?#]/u)[0];
  return path.length > 0 && path.toLowerCase().endsWith('.svg');
}

/**
 * Brand shown by a header profile. The identity comes from the CONFIG (`profiles[x].brand`, which
 * the shell hands over as `regionProps.brand`) — never hardcoded in a generated subclass, so
 * regenerating the header cannot lose it.
 */
export function resolveHeaderBrand(
  bootConfig?: MasterFrontendBootConfig,
  regionProps?: Record<string, unknown>,
  fallbackTitle = 'App',
): AuraHeaderBrand {
  const configured = isRecord(regionProps?.brand) ? regionProps.brand : {};
  const logoUrl = readString(configured.logoUrl);
  const logoSvg = readString(configured.logoSvg);
  const title = readString(configured.title) || fallbackTitle;
  const brand: AuraHeaderBrand = {
    title,
    subtitle: readString(configured.subtitle)
      || readString(bootConfig?.pageTitle)
      || readString(bootConfig?.moduleId)
      || undefined,
    href: readString(configured.href) || readString(bootConfig?.basePath) || undefined,
  };

  // Inline markup wins over a URL: it is the one that follows the design system.
  if (isSafeLogoSvg(logoSvg)) {
    brand.logoSvg = logoSvg;
    brand.logoAlt = readString(configured.logoAlt) || title;
  } else if (isSupportedLogoUrl(logoUrl)) {
    brand.logoUrl = logoUrl;
    brand.logoAlt = readString(configured.logoAlt) || title;
  }

  return brand;
}

/** Optional actions the profile turned on (`profiles[x].props.actions`); unknown names are dropped. */
export function resolveHeaderActions(regionProps?: Record<string, unknown>): AuraHeaderAction[] {
  const raw = regionProps?.actions;
  if (!Array.isArray(raw)) return [];
  return HEADER_ACTIONS.filter((action) => raw.includes(action));
}

/**
 * Band height for this profile. Defaults to the shared constant: the shell writes the ACTIVE
 * profile's height into `--aura-header-height`, so a profile that disagrees shifts the page on
 * every switch.
 */
export function resolveBandHeightPx(regionProps?: Record<string, unknown>): number {
  const heightPx = regionProps?.heightPx;
  return typeof heightPx === 'number' && heightPx > 0 ? heightPx : AURA_HEADER_HEIGHT_PX;
}

/**
 * The mobile aside toggle is the ONLY way to reach the menu when the aside is not inline, so it
 * shows exactly when the mobile aside mode is a drawer/fullscreen.
 */
export function shouldShowMobileAsideToggle(bootConfig?: MasterFrontendBootConfig): boolean {
  const mobileMode = bootConfig?.layout?.asideMode?.mobile;
  return Boolean(mobileMode && mobileMode !== 'inline');
}

/**
 * Band CSS for one header tag.
 *
 * Scoped by the ELEMENT'S OWN tag (`this.localName`), never by a hardcoded tag: every subclass —
 * including the per-project generated ones — gets the same band without colliding with a sibling
 * header profile that may still be in the DOM.
 *
 * Colors come from DS role tokens with a hex fallback, because `<style id="ds-tokens">` is injected
 * at runtime and may not be there on the first paint.
 */
export function buildHeaderBandCss(tagName: string): string {
  const tag = readString(tagName).toLowerCase();
  if (!tag) throw new Error('[auraHeaderCore] buildHeaderBandCss requires a tag name');

  return `
${tag} {
  display: block;
  height: 100%;
}

${tag} .aura-header-band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  /* Fill the shell's fixed header band (--aura-header-height) so profile switches
     (client header <-> studio navs) keep the same total height. */
  height: 100%;
  box-sizing: border-box;
  padding: 0 24px;
  background: var(--ds-color-nav-bg, rgba(255, 255, 255, 0.9));
  color: var(--ds-color-nav-text, #102a43);
  border-bottom: 1px solid var(--ds-color-border-default, #d9e2ec);
  backdrop-filter: blur(14px);
}

${tag} .aura-header-side {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

${tag} .aura-header-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

${tag} .aura-header-brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

${tag} .aura-header-logo {
  display: block;
  width: auto;
  height: 28px;
}

/* Inlined mark: same box as the img, painted by the nav text color (currentColor). */
${tag} span.aura-header-logo {
  display: inline-flex;
  align-items: center;
  color: var(--ds-color-nav-text, #102a43);
}

/* No fill declaration here on purpose: CSS BEATS the SVG presentation attributes, so a
   fill:currentColor would override the mark's own fill=none and turn every outlined shape
   into a solid blob (a rounded container came out as a filled square). The wrapper's color
   is what currentColor resolves against — the markup keeps deciding fill vs stroke. */
${tag} .aura-header-logo svg {
  display: block;
  width: auto;
  height: 28px;
}

${tag} .aura-header-title {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

${tag} .aura-header-subtitle {
  overflow: hidden;
  color: var(--ds-color-text-muted, #52606d);
  font-size: 0.88rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

${tag} .aura-header-toggle {
  display: none;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--ds-color-border-default, #d9e2ec);
  border-radius: 999px;
  background: var(--ds-color-surface-bg, #fff);
  color: var(--ds-color-nav-text, #102a43);
  font-size: 1.1rem;
  cursor: pointer;
}

${tag} .aura-header-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

${tag} .aura-header-link {
  padding: 8px 12px;
  border-radius: 999px;
  color: var(--ds-color-nav-text, #102a43);
  font-size: 0.9rem;
  text-decoration: none;
  white-space: nowrap;
}

${tag} .aura-header-link[data-active="true"] {
  background: var(--ds-color-nav-active-bg, #e8e4da);
  color: var(--ds-color-nav-active-text, #102a43);
  font-weight: 600;
}

/* Avatar: a circle the size of a touch target, brand-colored, with the photo filling it when the
   IdP sends one. Same footprint photo or initials, so the band never reflows when the probe answers. */
${tag} .aura-header-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  overflow: hidden;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--ds-color-border-subtle, #d9e2ec);
  border-radius: 999px;
  background: var(--ds-color-button-primary-bg, #102a43);
  color: var(--ds-color-button-primary-text, #fff);
  cursor: pointer;
}

${tag} .aura-header-avatar-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

${tag} .aura-header-avatar-initials {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
}

${tag} .aura-header-select {
  border: 1px solid var(--ds-color-border-subtle, #d9e2ec);
  border-radius: 999px;
  background: var(--ds-color-input-bg, #fff);
  color: var(--ds-color-text-default, #102a43);
  padding: 6px 10px;
  font-size: 0.85rem;
  cursor: pointer;
}

@media (max-width: ${AURA_MOBILE_BREAKPOINT_PX}px) {
  ${tag} .aura-header-toggle.enabled {
    display: inline-flex;
  }

  ${tag} .aura-header-subtitle {
    display: none;
  }

  ${tag} .aura-header-nav {
    display: none;
  }
}
`.trim();
}
