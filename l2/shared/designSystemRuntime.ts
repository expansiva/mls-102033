/// <mls fileReference="_102033_/l2/shared/designSystemRuntime.ts" enhancement="_blank" />

type RuntimeDesignSystemStyle = {
  id: string;
  textContent: string | null;
  dataset: Record<string, string | undefined>;
};

type RuntimeDesignSystemDocument = {
  getElementById: (id: string) => RuntimeDesignSystemStyle | null;
  createElement: (tagName: string) => RuntimeDesignSystemStyle;
  head: {
    appendChild: (element: RuntimeDesignSystemStyle) => unknown;
  };
};

type DesignSystemCssLoader = (name: string, path: string) => Promise<string>;

async function loadDesignSystemCss(name: string, path: string): Promise<string> {
  const { getTokensCss } = await import('/_102029_/l2/designSystemBase.js');
  return getTokensCss(name, path);
}

function normalizeDesignSystem(name: string): string {
  return name.trim().toLowerCase();
}

export function listRuntimeDesignSystems(designSystems: readonly string[] | undefined): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const value of designSystems ?? []) {
    if (typeof value !== 'string') {
      continue;
    }
    const name = value.trim();
    const key = normalizeDesignSystem(name);
    if (key && !seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }

  return names;
}

export function resolveRuntimeDesignSystem(
  designSystems: readonly string[],
  requestedDesignSystem: string,
): string | undefined {
  const requested = normalizeDesignSystem(requestedDesignSystem);
  if (!requested) {
    return undefined;
  }
  return designSystems.find((name) => normalizeDesignSystem(name) === requested);
}

export function getRuntimeDesignSystem(
  designSystems: readonly string[],
  runtimeDocument: RuntimeDesignSystemDocument = document as unknown as RuntimeDesignSystemDocument,
): string | undefined {
  const active = runtimeDocument.getElementById('ds-tokens')?.dataset.designSystem;
  return resolveRuntimeDesignSystem(designSystems, active ?? '') ?? designSystems[0];
}

export function getNextRuntimeDesignSystem(
  designSystems: readonly string[],
  currentDesignSystem: string | undefined,
): string | undefined {
  if (designSystems.length <= 1) {
    return undefined;
  }

  const current = currentDesignSystem
    ? resolveRuntimeDesignSystem(designSystems, currentDesignSystem)
    : undefined;
  const currentIndex = current ? designSystems.indexOf(current) : -1;
  return designSystems[(currentIndex + 1) % designSystems.length];
}

export async function setRuntimeDesignSystem(
  requestedDesignSystem: string,
  designSystems: readonly string[],
  projectId: string,
  runtimeDocument: RuntimeDesignSystemDocument = document as unknown as RuntimeDesignSystemDocument,
  loadCss: DesignSystemCssLoader = loadDesignSystemCss,
): Promise<void> {
  const designSystem = typeof requestedDesignSystem === 'string'
    ? resolveRuntimeDesignSystem(designSystems, requestedDesignSystem)
    : undefined;
  if (!designSystem) {
    const valid = designSystems.length > 0 ? designSystems.join(', ') : 'none';
    throw new Error(`mls.sites.setDS("${String(requestedDesignSystem)}"): design system not available (valid: ${valid}).`);
  }

  const css = await loadCss(designSystem, `/_${projectId}_/l2/designSystem.js`);
  if (!css) {
    throw new Error(`mls.sites.setDS("${designSystem}"): design system generated no token CSS.`);
  }

  let style = runtimeDocument.getElementById('ds-tokens');
  if (!style) {
    style = runtimeDocument.createElement('style');
    style.id = 'ds-tokens';
    runtimeDocument.head.appendChild(style);
  }
  style.textContent = css;
  style.dataset.designSystem = designSystem;
}
