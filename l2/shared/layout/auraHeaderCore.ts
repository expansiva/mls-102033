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

/**
 * Height of the brand mark inside the band. The mark is sized by HEIGHT with `width: auto`, so a
 * wide wordmark and a square glyph both keep their proportions — exported so a preview elsewhere
 * can show it at the size it will really have.
 */
export const AURA_HEADER_LOGO_PX = 28;

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
 * Locales this header offers, from `props.locales`, intersected with what the app actually runs.
 *
 * The profile is a FILTER, never a source: a locale the app does not ship has no messages, so it
 * would switch the page into a language nothing is translated to. Absent/empty = every runtime
 * language, which is the behaviour every header had before the field existed.
 */
export function resolveHeaderLocales(
  regionProps: Record<string, unknown> | undefined,
  runtimeLanguages: readonly string[],
): string[] {
  const raw = regionProps?.locales;
  if (!Array.isArray(raw) || raw.length === 0) return [...runtimeLanguages];
  const wanted = new Set(raw.filter((locale): locale is string => typeof locale === 'string'));
  const kept = runtimeLanguages.filter((language) => wanted.has(language));
  // An empty intersection means the profile is stale (the project dropped those languages): fall
  // back to the runtime list instead of hiding the switcher for good.
  return kept.length ? kept : [...runtimeLanguages];
}

/**
 * The entries a header links: the selected hrefs, resolved against everything the runtime offers.
 *
 * Both lists are searched — the current module's `navigation` AND the cross-module `moduleLinks` —
 * because a selection is made in the studio over the whole project, and filtering only the current
 * module would make a legitimate cross-module link silently disappear.
 *
 * Order comes from the runtime lists, not from the selection: the header must not reorder the
 * project's own navigation. No selection = every entry of `navigation` (what headers did before the
 * field existed).
 */
export function selectNavEntries<T extends { href: string }>(
  navigation: readonly T[],
  moduleLinks: readonly T[],
  wanted: readonly string[],
): T[] {
  if (!wanted.length) return [...navigation];
  const selected = new Set(wanted);
  const entries: T[] = [];
  const seen = new Set<string>();
  for (const entry of [...navigation, ...moduleLinks]) {
    if (!selected.has(entry.href) || seen.has(entry.href)) continue;
    seen.add(entry.href);
    entries.push(entry);
  }
  return entries;
}

/**
 * Routes this header links, from `props.navLinks`: the hrefs picked for the band.
 *
 * Absent/empty means "no selection recorded", NOT "no links": the caller keeps every route the
 * module declares, which is what headers generated before this field did.
 */
export function resolveHeaderNavHrefs(regionProps?: Record<string, unknown>): string[] {
  const raw = regionProps?.navLinks;
  if (!Array.isArray(raw)) return [];
  return raw.filter((href): href is string => typeof href === 'string' && href.length > 0);
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
 * CSS of the user menu — NOT scoped by the header tag, on purpose.
 *
 * Painted with the SAME nav palette as the band (it reads as an extension of the header, not as a
 * card of the page), and attached to `document.body`, not to the band: the band carries `backdrop-filter`,
 * which establishes a containing block for fixed descendants, so a panel inside it would be trapped
 * and then clipped by the header region's `overflow: hidden`. Living in the body is what lets it
 * open below the header at all. Injected once per page.
 */
export function buildUserMenuCss(): string {
  return `
.aura-user-menu {
  position: fixed;
  z-index: 200;
  min-width: 240px;
  max-width: min(320px, calc(100vw - 24px));
  padding: 6px;
  border: 1px solid var(--nav-bg-focus, #d9e2ec);
  border-radius: var(--radius-large, 14px);
  background: var(--nav-bg, #fff);
  color: var(--nav-text, #102a43);
  box-shadow: var(--shadow-medium, 0 18px 40px rgba(15, 23, 42, 0.16));
  font-family: inherit;
}

.aura-user-menu-identity {
  display: grid;
  gap: 2px;
  padding: 10px 12px 12px;
  border-bottom: 1px solid var(--nav-bg-focus, #eef2f6);
}

.aura-user-menu-name {
  font-size: 0.95rem;
  font-weight: 600;
}

.aura-user-menu-email {
  overflow: hidden;
  color: var(--nav-text, #52606d);
  opacity: 0.75;
  font-size: 0.84rem;
  text-overflow: ellipsis;
}

.aura-user-menu-action {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 10px 12px;
  border: none;
  border-radius: var(--radius-medium, 10px);
  background: transparent;
  color: var(--nav-text, #102a43);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.aura-user-menu-action:hover,
.aura-user-menu-action:focus-visible {
  background: var(--nav-active-bg, #f1f5f9);
  color: var(--nav-active-text, #102a43);
}
`.trim();
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
  background: var(--nav-bg, rgba(255, 255, 255, 0.9));
  color: var(--nav-text, #102a43);
  border-bottom: 1px solid var(--nav-bg-focus, #d9e2ec);
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
  height: ${AURA_HEADER_LOGO_PX}px;
}

/* Inlined mark: same box as the img, painted by the nav text color (currentColor). */
${tag} span.aura-header-logo {
  display: inline-flex;
  align-items: center;
  color: var(--nav-text, #102a43);
}

/* No fill declaration here on purpose: CSS BEATS the SVG presentation attributes, so a
   fill:currentColor would override the mark's own fill=none and turn every outlined shape
   into a solid blob (a rounded container came out as a filled square). The wrapper's color
   is what currentColor resolves against — the markup keeps deciding fill vs stroke. */
${tag} .aura-header-logo svg {
  display: block;
  width: auto;
  height: ${AURA_HEADER_LOGO_PX}px;
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
  color: var(--nav-text, #52606d);
  opacity: 0.75;
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
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--nav-active-bg, #eef2f6);
  color: var(--nav-active-text, #102a43);
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
  color: var(--nav-text, #102a43);
  font-size: 0.9rem;
  text-decoration: none;
  white-space: nowrap;
}

${tag} .aura-header-link:hover {
  background: var(--nav-bg-hover, #eef2f6);
  color: var(--nav-text-hover, #102a43);
}

${tag} .aura-header-link[data-active="true"] {
  background: var(--nav-active-bg, #e8e4da);
  color: var(--nav-active-text, #102a43);
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
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--nav-active-bg, #102a43);
  color: var(--nav-active-text, #fff);
  cursor: pointer;
}

${tag} .aura-header-avatar-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

${tag} .aura-header-avatar-icon {
  display: block;
  width: 22px;
  height: 22px;
}

${tag} .aura-header-avatar-initials {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
}

${tag} .aura-header-select {
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--nav-active-bg, #eef2f6);
  color: var(--nav-active-text, #102a43);
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
