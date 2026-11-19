/// <mls fileReference="_102033_/l2/cbe/pinTag/pinTagTarget.ts" enhancement="_blank" />
// From the clicked element to the pin's `target` (chain, selector, offset, label), and back.
//
// The selector starts at the nearest PROJECT component of the chain, not at the document, so a change
// elsewhere on the page does not lose the pin. Shadow roots are crossed: a ` >>> ` step enters the
// shadow root of the element before it.
//
// Works on a minimal node shape (INodeLike) so the tests run without a DOM.

import type { IPinTarget } from '/_102033_/l2/cbe/pinTag/pinTagCore.js';

export interface INodeLike {
  tagName: string;
  parentElement: INodeLike | null;
  children: ArrayLike<INodeLike>;
  shadowRoot?: { children: ArrayLike<INodeLike> } | null;
  textContent?: string | null;
  getAttribute(name: string): string | null;
  getRootNode?(): unknown;
}

const SHADOW_STEP = '>>>';

function lower(node: INodeLike): string {
  return node.tagName.toLowerCase();
}

/** A tag of the site project: custom element whose name ends with `-<project>`. */
export function isProjectTag(tagName: string, project: number): boolean {
  const tag = tagName.toLowerCase();
  return tag.includes('-') && tag.endsWith(`-${project}`);
}

/** Parent across a shadow boundary: the host when the node is the top of a shadow tree. */
function parentOf(node: INodeLike): { parent: INodeLike | null; crossedShadow: boolean } {
  if (node.parentElement) return { parent: node.parentElement, crossedShadow: false };
  const root = node.getRootNode?.() as { host?: INodeLike } | undefined;
  if (root && root.host && root.host !== node) return { parent: root.host, crossedShadow: true };
  return { parent: null, crossedShadow: false };
}

/** Project tags from the outermost (page) down to the element, inclusive. */
export function buildChain(el: INodeLike, project: number): string[] {
  const chain: string[] = [];
  let node: INodeLike | null = el;
  while (node) {
    if (isProjectTag(node.tagName, project)) chain.push(lower(node));
    node = parentOf(node).parent;
  }
  return chain.reverse();
}

function stepFor(node: INodeLike): string {
  const tag = lower(node);
  const parent = node.parentElement;
  const siblings = parent ? Array.from(parent.children) : siblingsInShadow(node);
  const same = siblings.filter((s) => lower(s) === tag);
  if (same.length <= 1) return tag;
  return `${tag}:nth-of-type(${same.indexOf(node) + 1})`;
}

function siblingsInShadow(node: INodeLike): INodeLike[] {
  const root = node.getRootNode?.() as { children?: ArrayLike<INodeLike> } | undefined;
  return root?.children ? Array.from(root.children) : [node];
}

/** The nearest project component at or above the element. */
export function nearestAnchor(el: INodeLike, project: number): INodeLike | null {
  let node: INodeLike | null = el;
  while (node) {
    if (isProjectTag(node.tagName, project)) return node;
    node = parentOf(node).parent;
  }
  return null;
}

/** Path from the anchor down to the element. Empty when the element is the anchor. */
export function buildSelector(el: INodeLike, anchor: INodeLike): string {
  const steps: string[] = [];
  let node: INodeLike | null = el;
  while (node && node !== anchor) {
    steps.push(stepFor(node));
    const { parent, crossedShadow } = parentOf(node);
    if (crossedShadow) steps.push(SHADOW_STEP);
    node = parent;
  }
  if (node !== anchor) return '';
  return steps.reverse().join(' > ').replace(/ > >>> > /gu, ` ${SHADOW_STEP} `).replace(/^>>> > /u, `${SHADOW_STEP} `);
}

/** Splits the selector back into steps; `>>>` is its own step. */
export function selectorSteps(selector: string): string[] {
  if (!selector.trim()) return [];
  return selector
    .split(new RegExp(`\\s*(${SHADOW_STEP})\\s*|\\s*>\\s*`, 'u'))
    .filter((part): part is string => typeof part === 'string' && part.length > 0);
}

function parseStep(step: string): { tag: string; nth: number } | null {
  const m = /^([a-z][a-z0-9-]*)(?::nth-of-type\((\d+)\))?$/u.exec(step.toLowerCase());
  if (!m) return null;
  return { tag: m[1], nth: m[2] ? Number(m[2]) : 1 };
}

/** Walks the selector from the anchor. Null when any step no longer exists. */
export function applySelector(anchor: INodeLike, selector: string): INodeLike | null {
  let node: INodeLike = anchor;
  let inShadow = false;
  for (const step of selectorSteps(selector)) {
    if (step === SHADOW_STEP) { inShadow = true; continue; }
    const parsed = parseStep(step);
    if (!parsed) return null;
    const pool = inShadow ? node.shadowRoot?.children : node.children;
    inShadow = false;
    if (!pool) return null;
    const same = Array.from(pool).filter((child) => lower(child) === parsed.tag);
    const next = same[parsed.nth - 1];
    if (!next) return null;
    node = next;
  }
  return node;
}

/** Every element under the root with that tag, light DOM and shadow roots, in document order. */
export function findAllByTag(root: INodeLike, tag: string): INodeLike[] {
  const found: INodeLike[] = [];
  const wanted = tag.toLowerCase();
  const stack: INodeLike[] = [root];
  while (stack.length) {
    const node = stack.pop() as INodeLike;
    if (lower(node) === wanted) found.push(node);
    const kids: INodeLike[] = [];
    if (node.shadowRoot) kids.push(...Array.from(node.shadowRoot.children));
    kids.push(...Array.from(node.children));
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
  }
  return found;
}

/**
 * The element a target points to, or null when it is gone (the page changed).
 *
 * Candidates are the anchors (last tag of the chain); the one whose own chain matches the pin's is
 * preferred, so the same component used twice on the page resolves to the right copy when it can.
 */
export function resolveTarget(root: INodeLike, target: Pick<IPinTarget, 'chain' | 'selector'>, project: number): INodeLike | null {
  const anchorTag = target.chain[target.chain.length - 1];
  if (!anchorTag) return null;
  const anchors = findAllByTag(root, anchorTag);
  const wanted = target.chain.join('|');
  const ordered = [
    ...anchors.filter((a) => buildChain(a, project).join('|') === wanted),
    ...anchors.filter((a) => buildChain(a, project).join('|') !== wanted),
  ];
  for (const anchor of ordered) {
    const el = applySelector(anchor, target.selector);
    if (el) return el;
  }
  return null;
}

// ─── Readable label ─────────────────────────────────────────────────────────

const LABEL_MAX = 40;

const KIND_WORDS: Record<'pt' | 'en', Record<string, string>> = {
  pt: {
    button: 'Botão', a: 'Link', input: 'Campo', textarea: 'Campo', select: 'Seleção', img: 'Imagem',
    h1: 'Título', h2: 'Título', h3: 'Título', h4: 'Título', h5: 'Título', h6: 'Título',
    table: 'Tabela', tr: 'Linha', td: 'Célula', th: 'Coluna', ul: 'Lista', ol: 'Lista', li: 'Item',
    label: 'Rótulo', form: 'Formulário', nav: 'Menu',
  },
  en: {
    button: 'Button', a: 'Link', input: 'Field', textarea: 'Field', select: 'Select', img: 'Image',
    h1: 'Title', h2: 'Title', h3: 'Title', h4: 'Title', h5: 'Title', h6: 'Title',
    table: 'Table', tr: 'Row', td: 'Cell', th: 'Column', ul: 'List', ol: 'List', li: 'Item',
    label: 'Label', form: 'Form', nav: 'Menu',
  },
};

function clip(text: string): string {
  const clean = text.replace(/\s+/gu, ' ').trim();
  return clean.length > LABEL_MAX ? `${clean.slice(0, LABEL_MAX - 1)}…` : clean;
}

/** `tarefas--web--shared--pendencias-agora-102047` → `Pendencias agora`. */
export function componentName(tag: string, project: number): string {
  let name = tag.toLowerCase();
  if (name.endsWith(`-${project}`)) name = name.slice(0, -(`-${project}`.length));
  name = name.split('--').pop() ?? name;
  name = name.replace(/^page\d+-/u, '').replace(/-/gu, ' ').trim();
  return name ? name[0].toUpperCase() + name.slice(1) : tag;
}

function ownText(el: INodeLike): string {
  for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
    const value = el.getAttribute(attr);
    if (value && value.trim()) return value;
  }
  return el.textContent ?? '';
}

/** "Botão Aceitar", "Lista de tarefas", or the component name — never the technical tag. */
export function readableLabel(el: INodeLike, project: number, language = 'pt'): string {
  const words = language.toLowerCase().startsWith('pt') ? KIND_WORDS.pt : KIND_WORDS.en;
  const tag = lower(el);
  if (isProjectTag(tag, project)) return componentName(tag, project);
  const text = clip(ownText(el));
  const kind = words[tag];
  if (kind && text) return `${kind} ${text}`;
  if (text) return text;
  if (kind) return kind;
  const anchor = nearestAnchor(el, project);
  return anchor ? componentName(lower(anchor), project) : tag;
}

// ─── Build ──────────────────────────────────────────────────────────────────

export interface IRectLike { left: number; top: number; width: number; height: number }

export function offsetIn(rect: IRectLike, x: number, y: number): { x: number; y: number } {
  const fx = rect.width > 0 ? (x - rect.left) / rect.width : 0.5;
  const fy = rect.height > 0 ? (y - rect.top) / rect.height : 0.5;
  const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
  return { x: clamp(fx), y: clamp(fy) };
}

/** The target of a click, or null when the element is not inside any project component. */
export function buildTarget(el: INodeLike, rect: IRectLike, x: number, y: number, project: number, language = 'pt'): IPinTarget | null {
  const anchor = nearestAnchor(el, project);
  if (!anchor) return null;
  return {
    chain: buildChain(anchor, project),
    selector: buildSelector(el, anchor),
    offset: offsetIn(rect, x, y),
    label: readableLabel(el, project, language),
  };
}
