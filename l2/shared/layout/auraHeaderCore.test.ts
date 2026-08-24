/// <mls fileReference="_102033_/l2/shared/layout/auraHeaderCore.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AURA_HEADER_HEIGHT_PX,
  buildUserMenuCss,
  isSafeLogoSvg,
  AURA_MOBILE_BREAKPOINT_PX,
  buildHeaderBandCss,
  isSupportedLogoUrl,
  resolveBandHeightPx,
  resolveHeaderActions,
  resolveHeaderBrand,
  resolveHeaderLocales,
  resolveHeaderNavHrefs,
  selectNavEntries,
  shouldShowMobileAsideToggle,
} from '/_102033_/l2/shared/layout/auraHeaderCore.js';
import { isInternalModuleHref, isRegionLinkActive } from '/_102033_/l2/shared/layout/auraNavigate.js';
import type { MasterFrontendAsideMode, MasterFrontendBootConfig } from '/_102033_/l2/shared/contracts/bootstrap.js';

// Fictitious project/module: the fixtures must not depend on a real project in the workspace.
function bootConfig(overrides: Partial<MasterFrontendBootConfig> = {}): MasterFrontendBootConfig {
  return {
    projectId: '999999',
    moduleId: 'sampleModule',
    basePath: '/sampleModule',
    shellMode: 'spa',
    device: 'desktop',
    routes: [],
    layout: {
      regions: {
        desktop: { header: true, aside: true, content: true },
        mobile: { header: true, aside: true, content: true },
      },
      asideMode: { desktop: 'inline', mobile: 'drawer' },
    },
    ...overrides,
  };
}

// ── brand ──────────────────────────────────────────────────────────────────

test('the profile brand wins over the fallback title', () => {
  const brand = resolveHeaderBrand(bootConfig(), { brand: { title: 'Sample App', subtitle: 'Operacao' } }, 'Collab Aura');
  assert.equal(brand.title, 'Sample App');
  assert.equal(brand.subtitle, 'Operacao');
});

test('without a configured brand the fallback title and the page subtitle are used', () => {
  const brand = resolveHeaderBrand(bootConfig({ pageTitle: 'Items' }), undefined, 'Collab Aura');
  assert.equal(brand.title, 'Collab Aura');
  assert.equal(brand.subtitle, 'Items');
  assert.equal(brand.href, '/sampleModule');
});

test('the subtitle falls back to the module id, and the href to the base path', () => {
  const brand = resolveHeaderBrand(bootConfig(), {});
  assert.equal(brand.title, 'App');
  assert.equal(brand.subtitle, 'sampleModule');
  assert.equal(brand.href, '/sampleModule');
});

test('only .svg logos survive (raster brand assets are not published)', () => {
  assert.ok(isSupportedLogoUrl('/assets/brand.svg'));
  assert.ok(isSupportedLogoUrl('/assets/brand.svg?v=2'));
  assert.equal(isSupportedLogoUrl('/assets/brand.png'), false);
  assert.equal(isSupportedLogoUrl(''), false);

  const kept = resolveHeaderBrand(bootConfig(), { brand: { title: 'Sample', logoUrl: '/assets/brand.svg' } });
  assert.equal(kept.logoUrl, '/assets/brand.svg');
  assert.equal(kept.logoAlt, 'Sample', 'the alt text defaults to the brand title');

  const dropped = resolveHeaderBrand(bootConfig(), { brand: { title: 'Sample', logoUrl: '/assets/brand.png' } });
  assert.equal(dropped.logoUrl, undefined);
});

test('a malformed brand block does not break the header', () => {
  const brand = resolveHeaderBrand(bootConfig(), { brand: 'Sample App' }, 'Collab Aura');
  assert.equal(brand.title, 'Collab Aura');
});

test('an inlined mark wins over a logo URL, and unsafe markup is dropped', () => {
  const svg = '<svg viewBox="0 0 32 32"><rect fill="currentColor" width="10" height="10"/></svg>';
  const inlined = resolveHeaderBrand(bootConfig(), { brand: { title: 'Sample', logoSvg: svg, logoUrl: '/a/b.svg' } });
  assert.equal(inlined.logoSvg, svg);
  assert.equal(inlined.logoUrl, undefined, 'the markup is the one that follows the design system');
  assert.equal(inlined.logoAlt, 'Sample');

  // Refused markup must not silently reach the DOM — the URL takes over.
  const unsafe = resolveHeaderBrand(bootConfig(), {
    brand: { title: 'Sample', logoSvg: '<svg viewBox="0 0 32 32"><script>alert(1)</script></svg>', logoUrl: '/a/b.svg' },
  });
  assert.equal(unsafe.logoSvg, undefined);
  assert.equal(unsafe.logoUrl, '/a/b.svg');
});

test('the band sizes the inlined mark without painting over its own fills', () => {
  const css = buildHeaderBandCss('collab-aura-header');
  const svgRule = css.slice(css.indexOf('.aura-header-logo svg'));
  const block = svgRule.slice(0, svgRule.indexOf('}'));
  assert.ok(block.includes('height: 28px'));
  // A CSS `fill` outranks the markup's fill="none" and turns an outlined mark into a solid blob.
  assert.equal(/(^|[\s;])fill\s*:/u.test(block), false, 'the svg rule must not set fill');
  // currentColor still resolves: the wrapper carries the nav text color.
  assert.ok(css.includes('span.aura-header-logo'));
  assert.ok(css.includes('color: var(--nav-text'));
});

test('the runtime sanitizer refuses what cannot be inlined safely', () => {
  assert.ok(isSafeLogoSvg('<svg viewBox="0 0 32 32"><path d="M0 0h4v4H0z" fill="currentColor"/></svg>'));
  assert.equal(isSafeLogoSvg('<svg><rect fill="currentColor"/></svg>'), false, 'no viewBox');
  assert.equal(isSafeLogoSvg('<svg viewBox="0 0 32 32" width="32"><rect fill="currentColor"/></svg>'), false, 'intrinsic size');
  assert.equal(isSafeLogoSvg('<div><svg viewBox="0 0 32 32"></svg></div>'), false, 'not a single svg root');
  // A fixed color is NOT unsafe — a brand mark may be colored. Monochrome is opt-in, for a mark that
  // must follow the design system in both themes.
  assert.ok(isSafeLogoSvg('<svg viewBox="0 0 32 32"><rect fill="#f00"/></svg>'), 'a colored mark is allowed');
  assert.equal(isSafeLogoSvg('<svg viewBox="0 0 32 32"><rect fill="#f00"/></svg>', { monochrome: true }), false);
  assert.equal(isSafeLogoSvg('<svg viewBox="0 0 32 32"><rect fill="url(http://x/y#g)"/></svg>'), false, 'external ref');
  assert.ok(isSafeLogoSvg('<svg viewBox="0 0 32 32"><defs><linearGradient id="g"><stop offset="0" stop-color="#c85a2a"/></linearGradient></defs><rect x="1" y="1" width="30" height="30" fill="url(#g)"/></svg>'), 'inline gradient is fine');
  assert.equal(isSafeLogoSvg(''), false);
});

// ── actions ────────────────────────────────────────────────────────────────

test('only known actions are kept, in the canonical order', () => {
  assert.deepEqual(resolveHeaderActions({ actions: ['user', 'language', 'nope'] }), ['language', 'user']);
  assert.deepEqual(resolveHeaderActions({ actions: 'language' }), []);
  assert.deepEqual(resolveHeaderActions(undefined), []);
});

// ── band height ────────────────────────────────────────────────────────────

test('the band height defaults to the shared constant', () => {
  assert.equal(resolveBandHeightPx(undefined), AURA_HEADER_HEIGHT_PX);
  assert.equal(resolveBandHeightPx({ heightPx: 0 }), AURA_HEADER_HEIGHT_PX);
  assert.equal(resolveBandHeightPx({ heightPx: '80' }), AURA_HEADER_HEIGHT_PX);
  assert.equal(resolveBandHeightPx({ heightPx: 80 }), 80);
});

// ── mobile aside toggle ────────────────────────────────────────────────────

test('the toggle shows exactly when the mobile aside is not inline', () => {
  const withMode = (mobile: MasterFrontendAsideMode) => bootConfig({
    layout: { ...bootConfig().layout, asideMode: { desktop: 'inline', mobile } },
  });
  assert.equal(shouldShowMobileAsideToggle(withMode('drawer')), true);
  assert.equal(shouldShowMobileAsideToggle(withMode('fullscreen')), true);
  assert.equal(shouldShowMobileAsideToggle(withMode('inline')), false);
  assert.equal(shouldShowMobileAsideToggle(undefined), false);
});

// ── band CSS ───────────────────────────────────────────────────────────────

test('the band CSS is scoped by the tag it is given, not by a hardcoded one', () => {
  const css = buildHeaderBandCss('layout--app-header-999999');
  assert.ok(css.includes('layout--app-header-999999 .aura-header-band {'));
  assert.equal(css.includes('collab-aura-header'), false);
  assert.throws(() => buildHeaderBandCss(''), /requires a tag name/);
});

test('the band keeps the invariants the shell depends on', () => {
  const css = buildHeaderBandCss('collab-aura-header');
  assert.ok(css.includes('height: 100%'), 'the band must fill --aura-header-height');
  assert.ok(css.includes('box-sizing: border-box'));
  assert.ok(css.includes(`@media (max-width: ${AURA_MOBILE_BREAKPOINT_PX}px)`));
  assert.ok(css.includes('.aura-header-toggle.enabled'), 'the mobile toggle must become visible');
});

test('every color goes through a DS role token', () => {
  const css = buildHeaderBandCss('collab-aura-header');
  // Strip the var(--ds-*, fallback) expressions: what is left must carry no literal color.
  const withoutTokens = css.replace(/var\([^)]*\)/gu, '');
  assert.equal(/#[0-9a-f]{3,8}\b/iu.test(withoutTokens), false, `literal color outside a token fallback: ${withoutTokens.match(/#[0-9a-f]{3,8}\b/iu)?.[0]}`);
  assert.equal(/\b(rgb|rgba|hsl|hsla)\(/u.test(withoutTokens), false, 'literal color function outside a token fallback');
  assert.ok(css.includes('--nav-bg'));
});

test('everything the band paints comes from the nav palette', () => {
  // The band IS the nav surface: in a project whose nav-bg is dark (102051: #1c2430 with light
  // nav-text), a surface/input/button token would paint a bright control on a dark strip.
  const css = buildHeaderBandCss('collab-aura-header');
  const tokens = [...new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/gu)].map((match) => match[1]))];
  const offenders = tokens.filter((token) => !token.startsWith('--nav-') && !token.startsWith('--aura-'));
  assert.deepEqual(offenders, [], `the band must paint with nav-* tokens only, found: ${offenders.join(', ')}`);
  // And it does use the active pair for its controls (toggle, select, avatar).
  assert.ok(css.includes('--nav-active-bg'));
  assert.ok(css.includes('--nav-active-text'));
});

test('the floating panel wears the nav palette too', () => {
  // It reads as an extension of the header, not as a card of the page — so the same family as the
  // band, including the radius/shadow scales from the DS global group.
  const css = buildUserMenuCss();
  const tokens = [...new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/gu)].map((match) => match[1]))];
  const offenders = tokens.filter((token) => !/^--(nav-|radius-|shadow-)/u.test(token));
  assert.deepEqual(offenders, [], `the panel must use nav-*/radius-*/shadow-* only, found: ${offenders.join(', ')}`);
  assert.ok(css.includes('--nav-bg'));
  assert.ok(css.includes('--nav-active-bg'));
});

// ── navigation predicates ──────────────────────────────────────────────────

test('in-module hrefs are the ones the SPA push handles', () => {
  assert.equal(isInternalModuleHref('/sampleModule', '/sampleModule'), true);
  assert.equal(isInternalModuleHref('/sampleModule/items', '/sampleModule'), true);
  assert.equal(isInternalModuleHref('/other/route', '/sampleModule'), false);
  assert.equal(isInternalModuleHref('https://x.dev/sampleModule', '/sampleModule'), false);
  assert.equal(isInternalModuleHref('/qualquer', ''), true);
});

test('the module root is active on its aliases too', () => {
  assert.equal(isRegionLinkActive('/sampleModule', '/sampleModule/index.html', '/sampleModule'), true);
  assert.equal(isRegionLinkActive('/sampleModule', '/sampleModule/overview', '/sampleModule'), true);
  assert.equal(isRegionLinkActive('/sampleModule', '/sampleModule/items', '/sampleModule'), false);
  assert.equal(isRegionLinkActive('/sampleModule/items', '/sampleModule/items', '/sampleModule'), true);
});

test('the user menu CSS is global on purpose, and carries the classes the base builds', () => {
  const css = buildUserMenuCss();
  // Not tag-scoped: the panel lives in document.body, because the band's backdrop-filter would
  // trap a fixed child and the shell clips the header region.
  assert.equal(css.includes('${tag}'), false);
  assert.ok(css.includes('.aura-user-menu {'));
  assert.ok(css.includes('position: fixed'));
  for (const cls of ['.aura-user-menu-identity', '.aura-user-menu-name', '.aura-user-menu-email', '.aura-user-menu-action']) {
    assert.ok(css.includes(cls), `missing ${cls}`);
  }
  // Same token discipline as the band.
  const withoutTokens = css.replace(/var\([^)]*\)/gu, '');
  assert.equal(/#[0-9a-f]{3,8}\b/iu.test(withoutTokens), false, 'literal color outside a token fallback');
});

// ── what the profile selected ──────────────────────────────────────────────

test('the profile filters the locales the switcher offers, and never invents one', () => {
  const runtime = ['pt-BR', 'en', 'es'];

  assert.deepEqual(resolveHeaderLocales({ locales: ['en', 'pt-BR'] }, runtime), ['pt-BR', 'en'],
    'kept in the runtime order, not the order the profile lists them');
  assert.deepEqual(resolveHeaderLocales({ locales: ['en', 'de'] }, runtime), ['en'],
    'a locale the app does not ship has no messages: it cannot be offered');

  // No selection = every runtime language, which is what every header did before the field existed.
  assert.deepEqual(resolveHeaderLocales(undefined, runtime), runtime);
  assert.deepEqual(resolveHeaderLocales({ locales: [] }, runtime), runtime);
  assert.deepEqual(resolveHeaderLocales({ locales: 'en' as unknown as string[] }, runtime), runtime);

  // Stale profile (the project dropped those languages): fall back instead of hiding the switcher.
  assert.deepEqual(resolveHeaderLocales({ locales: ['de', 'fr'] }, runtime), runtime);
});

test('the profile selects which routes the band links', () => {
  assert.deepEqual(resolveHeaderNavHrefs({ navLinks: ['/a', '/b'] }), ['/a', '/b']);
  assert.deepEqual(resolveHeaderNavHrefs({ navLinks: ['/a', '', 3] as unknown as string[] }), ['/a'],
    'only usable hrefs survive');
  assert.deepEqual(resolveHeaderNavHrefs(undefined), [], 'no selection recorded');
  assert.deepEqual(resolveHeaderNavHrefs({ navLinks: true as unknown as string[] }), [],
    'the legacy flag is not a selection');
});

test('the selected links resolve against the module AND the cross-module lists', () => {
  const navigation = [{ href: '/m/a', label: 'A' }, { href: '/m/b', label: 'B' }];
  const moduleLinks = [{ href: '/other', label: 'Other' }, { href: '/m/a', label: 'A dup' }];

  assert.deepEqual(
    selectNavEntries(navigation, moduleLinks, ['/other', '/m/b']).map((entry) => entry.href),
    ['/m/b', '/other'],
    'a cross-module selection survives, in the runtime order',
  );
  assert.deepEqual(
    selectNavEntries(navigation, moduleLinks, ['/m/a']).map((entry) => entry.label),
    ['A'],
    'the first list wins a duplicated href',
  );
  assert.deepEqual(selectNavEntries(navigation, moduleLinks, ['/gone']), [],
    'a selection that no longer exists links nothing');
  assert.deepEqual(selectNavEntries(navigation, moduleLinks, []), navigation,
    'no selection = the module navigation, as before the field existed');
});
