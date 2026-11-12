/// <mls fileReference="_102033_/l2/shared/headerTabBoot.ts" enhancement="_blank" />

// The header follows the module of the tab on screen.
//
// A module opened from the header's module switcher (or a link) lives in a tab of its own, with its own boot
// config (`/_moduleBoot`). The header is a region of the shell and is fed the APP's boot; on a module tab it gets
// the app's boot with the MODULE's fields taken from the tab — its id, base path, routes, title and page links.
// Everything that is the app's identity stays the app's (brand/profile, languages, design systems, layout): a
// platform module (monitor, audit) opened here must not turn the header into the platform's.
//
// The switcher's list of OTHER modules is the app's too — the app's own module plus its module links, minus the
// module of the tab — because a platform module's boot may list a different set. Pure.

import type { MasterFrontendBootConfig } from '/_102029_/l2/contracts/bootstrap.js';

type ModuleLink = NonNullable<MasterFrontendBootConfig['moduleLinks']>[number];

function samePath(left: string | undefined, right: string | undefined): boolean {
  const norm = (value: string | undefined) => (value ?? '').replace(/\/+$/u, '') || '/';
  return norm(left) === norm(right);
}

/** The header's boot for a tab: the app's, or — on a module tab — the app's with the module's fields. */
export function headerBootForTab(
  appBoot: MasterFrontendBootConfig,
  moduleBoot: MasterFrontendBootConfig | undefined,
): MasterFrontendBootConfig {
  if (!moduleBoot || samePath(moduleBoot.basePath, appBoot.basePath)) return appBoot;
  const appModule: ModuleLink = { label: appBoot.pageTitle ?? appBoot.moduleId, href: appBoot.basePath } as ModuleLink;
  const others = [appModule, ...(appBoot.moduleLinks ?? [])].filter((link) => !samePath(link.href, moduleBoot.basePath));
  return {
    ...appBoot,
    moduleId: moduleBoot.moduleId,
    basePath: moduleBoot.basePath,
    routes: moduleBoot.routes,
    pageTitle: moduleBoot.pageTitle,
    navigation: moduleBoot.navigation ?? [],
    moduleLinks: others,
  };
}
