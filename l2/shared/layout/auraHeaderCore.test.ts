/// <mls fileReference="_102033_/l2/shared/layout/auraHeaderCore.test.ts" enhancement="_blank" />

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AURA_HEADER_HEIGHT_PX,
  isSafeLogoSvg,
  AURA_MOBILE_BREAKPOINT_PX,
  buildHeaderBandCss,
  isSupportedLogoUrl,
  resolveBandHeightPx,
  resolveHeaderActions,
  resolveHeaderBrand,
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

test('the band sizes and paints the inlined mark', () => {
  const css = buildHeaderBandCss('collab-aura-header');
  assert.ok(css.includes('.aura-header-logo svg'));
  assert.ok(css.includes('fill: currentColor'), 'the mark follows the nav text color');
});

test('the runtime sanitizer refuses what cannot be inlined safely', () => {
  assert.ok(isSafeLogoSvg('<svg viewBox="0 0 32 32"><path d="M0 0h4v4H0z" fill="currentColor"/></svg>'));
  assert.equal(isSafeLogoSvg('<svg><rect fill="currentColor"/></svg>'), false, 'no viewBox');
  assert.equal(isSafeLogoSvg('<svg viewBox="0 0 32 32" width="32"><rect fill="currentColor"/></svg>'), false, 'intrinsic size');
  assert.equal(isSafeLogoSvg('<div><svg viewBox="0 0 32 32"></svg></div>'), false, 'not a single svg root');
  assert.equal(isSafeLogoSvg('<svg viewBox="0 0 32 32"><rect fill="#f00"/></svg>'), false, 'literal color');
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
  assert.ok(css.includes('--ds-color-nav-bg'));
  assert.ok(css.includes('--ds-color-border-default'));
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
