/// <mls fileReference="_102033_/l2/cbe/studioAssets.ts" enhancement="_blank" />
// Media uploaded in the studio, shown before it is published.
//
// Pages and the Design System always write the FINAL url of a project asset —
// `/_<project>_/l3/assets/<file>` — the one the published app serves. Before publishing, that url
// 404s: the server reads `/_<p>_/l3` from dist only, and the service worker only answers versioned
// `/local/...?v=` urls. The bytes are already in the browser (stor, status `new` / `changed`).
//
// While studio mode is on, this swaps the final url for a `blob:` of the local bytes — on screen
// only:
//   - media attributes in the document (`src`, `srcset`, `poster`), keeping the final url in
//     `data-collab-asset-<attr>` so leaving the studio puts it back;
//   - the Design System css (`#ds-tokens`): NOT rewritten (bootstrap and studioDesignSystem copy
//     that style around), but shadowed by `#ds-assets-studio`, placed right after it, holding only
//     the rules that use a local asset, with the `blob:` url. Same selector / same @font-face
//     descriptors later in the cascade win.
// A file with no local version is left alone: the server serves the published copy.

export const ASSET_ATTR_PREFIX = 'data-collab-asset-';
export const ASSETS_OVERLAY_ID = 'ds-assets-studio';
export const DS_TOKENS_STYLE_ID = 'ds-tokens';
/** Fired on window by whoever writes or deletes an asset (the L5 Media panel). detail: { url } */
export const ASSET_CHANGED_EVENT = 'collab-asset-changed';

const MEDIA_ATTRIBUTES = ['src', 'srcset', 'poster'] as const;
type MediaAttribute = typeof MEDIA_ATTRIBUTES[number];

// ─── Pure ─────────────────────────────────────────────────────────────

export interface IAssetRef {
  project: number;
  level: 3;
  folder: string;
  shortName: string;
  extension: string;
}

const ASSET_PATH = /^\/_(\d+)_\/l3\/(?:(.+)\/)?([^/]+?)(\.[A-Za-z0-9]+)$/u;

/** `/_<p>_/l3/<folder>/<name><ext>` (same-origin absolute accepted, query/hash ignored) → stor identity. */
export function parseAssetUrl(url: string, origin?: string): IAssetRef | null {
  let path = url.trim();
  if (origin && path.startsWith(origin)) path = path.slice(origin.length);
  path = path.replace(/[?#].*$/u, '');
  if (!path.startsWith('/_')) return null;
  try { path = decodeURI(path); } catch { return null; }
  if (path.split('/').some((segment) => segment === '..' || segment === '.')) return null;
  const match = ASSET_PATH.exec(path);
  if (!match) return null;
  const project = Number(match[1]);
  if (!Number.isSafeInteger(project) || project <= 0) return null;
  return { project, level: 3, folder: match[2] ?? '', shortName: match[3], extension: match[4].toLowerCase() };
}

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.tif': 'image/tiff', '.tiff': 'image/tiff',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
  '.aac': 'audio/aac', '.m4a': 'audio/mp4', '.opus': 'audio/opus',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

export function mimeOf(extension: string): string {
  return MIME[extension.toLowerCase()] ?? 'application/octet-stream';
}

/** Only bytes that exist here and not on the server need the swap. */
export function hasLocalVersion(status: string | undefined): boolean {
  return status === 'new' || status === 'changed';
}

const CSS_URL = /url\(\s*(['"]?)([^'")]+?)\1\s*\)/gu;

/** Rewrites every `url(...)` that `resolve` answers; everything else stays byte for byte. */
export function rewriteCssUrls(css: string, resolve: (url: string) => string | null): string {
  return css.replace(CSS_URL, (whole, quote: string, url: string) => {
    const next = resolve(url.trim());
    return next ? `url(${quote}${next}${quote})` : whole;
  });
}

/** Every `url(...)` target in a css text. */
export function cssUrls(css: string): string[] {
  return Array.from(css.matchAll(CSS_URL), (match) => match[2].trim());
}

interface ICssBlock {
  prelude: string;
  body: string;
}

/** Top-level `prelude { body }` blocks of a css text (strings and comments respected). */
function cssBlocks(css: string): ICssBlock[] {
  const blocks: ICssBlock[] = [];
  let start = 0;
  let i = 0;
  const skip = (at: number): number => {
    const c = css[at];
    if (c === '/' && css[at + 1] === '*') {
      const end = css.indexOf('*/', at + 2);
      return end === -1 ? css.length : end + 2;
    }
    if (c === '"' || c === '\'') {
      let j = at + 1;
      while (j < css.length && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
      return j + 1;
    }
    return at;
  };
  while (i < css.length) {
    const skipped = skip(i);
    if (skipped !== i) { i = skipped; continue; }
    const c = css[i];
    if (c === ';') { start = i + 1; i++; continue; }
    if (c !== '{') { i++; continue; }
    let depth = 1;
    let j = i + 1;
    while (j < css.length && depth > 0) {
      const after = skip(j);
      if (after !== j) { j = after; continue; }
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    blocks.push({ prelude: css.slice(start, i).trim(), body: css.slice(i + 1, j - 1) });
    i = j;
    start = j;
  }
  return blocks;
}

const NESTING_AT_RULES = ['@media', '@supports', '@layer', '@container', '@scope'];

/**
 * The shadow stylesheet: only what uses a resolvable url, rewritten. `@font-face` goes whole (its
 * descriptors are its identity); a style rule keeps only the declarations with such a url; grouping
 * at-rules recurse so the copy lands in the same media / layer as the original.
 */
export function assetOverlayCss(css: string, resolve: (url: string) => string | null): string {
  const out: string[] = [];
  for (const { prelude, body } of cssBlocks(css)) {
    const lower = prelude.toLowerCase();
    if (lower.startsWith('@font-face')) {
      const rewritten = rewriteCssUrls(body, resolve);
      if (rewritten !== body) out.push(`${prelude}{${rewritten}}`);
    } else if (NESTING_AT_RULES.some((at) => lower.startsWith(at))) {
      const inner = assetOverlayCss(body, resolve);
      if (inner) out.push(`${prelude}{${inner}}`);
    } else if (!lower.startsWith('@')) {
      const kept = body.split(';')
        .map((declaration) => declaration.trim())
        .filter(Boolean)
        .flatMap((declaration) => {
          const rewritten = rewriteCssUrls(declaration, resolve);
          return rewritten === declaration ? [] : [rewritten];
        });
      if (kept.length) out.push(`${prelude}{${kept.join(';')}}`);
    }
  }
  return out.join('\n');
}

/** `srcset` candidates: the url of each is rewritten, descriptors kept. */
export function rewriteSrcset(srcset: string, resolve: (url: string) => string | null): string {
  return srcset.split(',').map((candidate) => {
    const trimmed = candidate.trim();
    if (!trimmed) return candidate;
    const [url, ...descriptors] = trimmed.split(/\s+/u);
    const next = resolve(url);
    return next ? [next, ...descriptors].join(' ') : trimmed;
  }).join(', ');
}

// ─── Resolver (url → blob:) ─────────────────────────────────────────────

export interface IAssetStorFile {
  status?: string;
  getContent(): Promise<string | Blob | null>;
}

export interface IAssetStor {
  getKey(ref: IAssetRef): string;
  getFile(key: string): IAssetStorFile | undefined;
}

export interface IObjectUrls {
  create(blob: Blob): string;
  revoke(url: string): void;
}

export class AssetUrlResolver {
  private readonly urls = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string | null>>();

  constructor(
    private readonly stor: IAssetStor,
    private readonly objectUrls: IObjectUrls,
    private readonly origin?: string,
  ) {}

  /** The `blob:` already known for a final url (sync — for rewriting after `ensure`). */
  peek(url: string): string | null {
    const ref = parseAssetUrl(url, this.origin);
    return ref ? this.urls.get(this.stor.getKey(ref)) ?? null : null;
  }

  /** Reads the local bytes once and returns their `blob:`; null when there is nothing local. */
  async ensure(url: string): Promise<string | null> {
    const ref = parseAssetUrl(url, this.origin);
    if (!ref) return null;
    const key = this.stor.getKey(ref);
    const known = this.urls.get(key);
    if (known) return known;
    const file = this.stor.getFile(key);
    if (!file || !hasLocalVersion(file.status)) return null;
    let running = this.pending.get(key);
    if (!running) {
      running = this.read(key, ref, file).finally(() => this.pending.delete(key));
      this.pending.set(key, running);
    }
    return running;
  }

  private async read(key: string, ref: IAssetRef, file: IAssetStorFile): Promise<string | null> {
    let content: string | Blob | null = null;
    try { content = await file.getContent(); } catch { content = null; }
    if (content === null || content === '') return null;
    const type = mimeOf(ref.extension);
    const blob = typeof content === 'string'
      ? new Blob([content], { type })
      : (content.type ? content : new Blob([content], { type }));
    const url = this.objectUrls.create(blob);
    this.urls.set(key, url);
    return url;
  }

  /** Forget one asset (replaced or deleted): its `blob:` is revoked, the next `ensure` reads again. */
  invalidate(url: string): void {
    const ref = parseAssetUrl(url, this.origin);
    if (!ref) return;
    const key = this.stor.getKey(ref);
    const known = this.urls.get(key);
    if (known) this.objectUrls.revoke(known);
    this.urls.delete(key);
  }

  clear(): void {
    for (const url of this.urls.values()) this.objectUrls.revoke(url);
    this.urls.clear();
  }
}

// ─── Elements ─────────────────────────────────────────────────────────

export interface IAssetElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  hasAttribute(name: string): boolean;
}

function finalUrlsOf(attribute: MediaAttribute, value: string): string[] {
  if (attribute !== 'srcset') return [value];
  return value.split(',').map((candidate) => candidate.trim().split(/\s+/u)[0]).filter(Boolean);
}

/**
 * Swaps one media attribute for its local `blob:` when there is one. The final url is kept in
 * `data-collab-asset-<attr>`. A value that changed while the bytes were read is left alone (the
 * framework wrote a new one; the observer brings it back here).
 */
export async function swapElementAttribute(el: IAssetElement, attribute: MediaAttribute, resolver: AssetUrlResolver): Promise<boolean> {
  const value = el.getAttribute(attribute);
  if (!value || value.startsWith('blob:')) return false;
  const urls = finalUrlsOf(attribute, value);
  if (!urls.some((url) => parseAssetUrl(url))) return false;
  await Promise.all(urls.map((url) => resolver.ensure(url)));
  const next = attribute === 'srcset' ? rewriteSrcset(value, (url) => resolver.peek(url)) : resolver.peek(value);
  if (!next || next === value || el.getAttribute(attribute) !== value) return false;
  el.setAttribute(`${ASSET_ATTR_PREFIX}${attribute}`, value);
  el.setAttribute(attribute, next);
  return true;
}

/** Puts the final url back (leaving the studio, or before re-resolving a replaced asset). */
export function restoreElementAttribute(el: IAssetElement, attribute: MediaAttribute): boolean {
  const stash = `${ASSET_ATTR_PREFIX}${attribute}`;
  const original = el.getAttribute(stash);
  if (original === null) return false;
  const current = el.getAttribute(attribute);
  // Only our own blob is undone: a framework that wrote something new since then wins.
  if (current === null || current.startsWith('blob:')) el.setAttribute(attribute, original);
  el.removeAttribute(stash);
  return true;
}

// ─── Document wiring (studio mode) ─────────────────────────────────────

const MEDIA_SELECTOR = MEDIA_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(',');
const STASH_SELECTOR = MEDIA_ATTRIBUTES.map((attribute) => `[${ASSET_ATTR_PREFIX}${attribute}]`).join(',');

let active: {
  resolver: AssetUrlResolver;
  observer: MutationObserver;
  onChanged: (event: Event) => void;
  dsVersion: number;
} | null = null;

function browserResolver(): AssetUrlResolver | null {
  const host = (globalThis as { mls?: typeof mls }).mls;
  if (!host?.stor) return null;
  return new AssetUrlResolver(
    {
      getKey: (ref) => host.stor.getKeyToFiles(ref.project, ref.level, ref.shortName, ref.folder, ref.extension),
      getFile: (key) => host.stor.files[key],
    },
    { create: (blob) => URL.createObjectURL(blob), revoke: (url) => URL.revokeObjectURL(url) },
    location.origin,
  );
}

function swapTree(root: ParentNode, resolver: AssetUrlResolver): void {
  const elements: Element[] = [];
  if (root instanceof Element && root.matches(MEDIA_SELECTOR)) elements.push(root);
  elements.push(...Array.from(root.querySelectorAll(MEDIA_SELECTOR)));
  for (const el of elements) {
    for (const attribute of MEDIA_ATTRIBUTES) {
      if (el.hasAttribute(attribute)) void swapElementAttribute(el, attribute, resolver);
    }
  }
}

function restoreTree(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll(STASH_SELECTOR))) {
    for (const attribute of MEDIA_ATTRIBUTES) restoreElementAttribute(el, attribute);
  }
}

/** Rebuilds `#ds-assets-studio` from the current `#ds-tokens`. */
async function refreshDsOverlay(): Promise<void> {
  if (!active) return;
  const state = active;
  const version = ++state.dsVersion;
  const tokens = document.getElementById(DS_TOKENS_STYLE_ID);
  const css = tokens?.textContent ?? '';
  await Promise.all(cssUrls(css).map((url) => state.resolver.ensure(url)));
  if (active !== state || version !== state.dsVersion) return;
  const overlayCss = assetOverlayCss(css, (url) => state.resolver.peek(url));
  let overlay = document.getElementById(ASSETS_OVERLAY_ID);
  if (!tokens || !overlayCss) { overlay?.remove(); return; }
  if (!overlay) {
    overlay = document.createElement('style');
    overlay.id = ASSETS_OVERLAY_ID;
  }
  if (overlay.textContent !== overlayCss) overlay.textContent = overlayCss;
  if (tokens.nextElementSibling !== overlay) tokens.after(overlay);
}

function isDsTokensMutation(record: MutationRecord): boolean {
  const target = record.target;
  const el = target.nodeType === Node.ELEMENT_NODE ? target as Element : target.parentElement;
  if (el?.id === DS_TOKENS_STYLE_ID) return true;
  return Array.from(record.addedNodes).some((node) => (node as Element).id === DS_TOKENS_STYLE_ID);
}

function onMutations(records: MutationRecord[]): void {
  if (!active) return;
  const { resolver } = active;
  let ds = false;
  for (const record of records) {
    if (isDsTokensMutation(record)) { ds = true; continue; }
    if (record.type === 'attributes') {
      const el = record.target as Element;
      const attribute = record.attributeName as MediaAttribute;
      void swapElementAttribute(el, attribute, resolver);
    } else {
      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType === Node.ELEMENT_NODE) swapTree(node as Element, resolver);
      }
    }
  }
  if (ds) void refreshDsOverlay();
}

/** Studio mode on: swap now and follow the document. Off: put every final url back, drop the blobs. */
export function setStudioAssets(on: boolean): void {
  if (typeof document === 'undefined') return;
  if (on) {
    if (active) return;
    const resolver = browserResolver();
    if (!resolver) return;
    const observer = new MutationObserver(onMutations);
    const onChanged = (event: Event) => {
      const url = (event as CustomEvent<{ url?: string }>).detail?.url;
      if (!active || !url) return;
      active.resolver.invalidate(url);
      restoreTree(document);
      swapTree(document, active.resolver);
      void refreshDsOverlay();
    };
    active = { resolver, observer, onChanged, dsVersion: 0 };
    observer.observe(document.documentElement, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: [...MEDIA_ATTRIBUTES],
    });
    window.addEventListener(ASSET_CHANGED_EVENT, onChanged);
    swapTree(document, resolver);
    void refreshDsOverlay();
    return;
  }
  if (!active) return;
  const { resolver, observer, onChanged } = active;
  active = null;
  observer.disconnect();
  window.removeEventListener(ASSET_CHANGED_EVENT, onChanged);
  restoreTree(document);
  document.getElementById(ASSETS_OVERLAY_ID)?.remove();
  resolver.clear();
}

/** For whoever wrote or deleted an asset: the page re-reads it. */
export function notifyAssetChanged(url: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ASSET_CHANGED_EVENT, { detail: { url } }));
}
