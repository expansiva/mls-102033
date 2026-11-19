/// <mls fileReference="_102033_/l2/cbe/pinTag/pinTagMode.ts" enhancement="_blank" />
// PinTag interface: floating bar, the "inspect" (frame + label + crosshair), the create/view balloon,
// the numbered pins, the list and export/import. Loaded on demand by pinTagCore the first time the
// client enters the mode.
//
// Everything lives in ONE fixed layer on document.body, never inside the page: the shell remounts
// the screen when something is put between the content region host and the page element
// (studioEditSlot.ts). The page scrolls inside main[data-region="content"], so the pins follow
// scroll (captured on window), resizes (ResizeObserver) and content changes (MutationObserver,
// debounced).
//
// Styles are scoped CSS injected with the layer (the layer is outside the app's Tailwind build);
// dark mode follows `html.dark`, like the rest of the app.

import {
  browserPinStorage,
  currentPinProject,
  currentScreen,
  exportPins,
  groupOtherScreens,
  importPins,
  newPinId,
  PIN_KINDS,
  PIN_VERSION,
  pinsForScreen,
  readPins,
  writePins,
  type IPinAuthor,
  type IPinScreen,
  type IPinStorage,
  type IPinTag,
  type IPinTarget,
  type PinKind,
  type PinStatus,
} from '/_102033_/l2/cbe/pinTag/pinTagCore.js';
import { buildTarget, readableLabel, resolveTarget, type INodeLike } from '/_102033_/l2/cbe/pinTag/pinTagTarget.js';
import { currentEditHost } from '/_102033_/l2/cbe/studioEditSlot.js';
import { getSessionUser, userLabel } from '/_102033_/l2/shared/sessionUser.js';
import { auraNavigate } from '/_102033_/l2/shared/layout/auraNavigate.js';
import { NAV3_TAB_CHANGE_EVENT } from '/_102033_/l2/shared/nav3ActiveTab.js';

// ─── Copy ───────────────────────────────────────────────────────────────────

interface IPinTagCopy {
  onScreen: (n: number) => string;
  add: string;
  list: string;
  exit: string;
  above: (n: number) => string;
  below: (n: number) => string;
  showResolved: (n: number) => string;
  hideResolved: string;
  kinds: Record<PinKind, string>;
  placeholder: string;
  cancel: string;
  save: string;
  edit: string;
  resolve: string;
  reopen: string;
  remove: string;
  confirmRemove: string;
  pickHint: string;
  notInComponent: string;
  storageOff: string;
  saveFailed: string;
  editorArmed: string;
  listThis: string;
  listOthers: string;
  listLoose: string;
  listEmpty: string;
  exportJson: string;
  importJson: string;
  imported: (n: number) => string;
  importInvalid: string;
  anon: string;
  resolvedTag: string;
  looseHint: string;
  close: string;
}

const COPY: Record<'pt' | 'en', IPinTagCopy> = {
  pt: {
    onScreen: (n) => `${n} nesta tela`,
    add: '+ Novo',
    list: '☰ Lista',
    exit: '✕ Sair',
    above: (n) => `${n} acima`,
    below: (n) => `${n} abaixo`,
    showResolved: (n) => `+${n} resolvido${n === 1 ? '' : 's'}`,
    hideResolved: 'ocultar resolvidos',
    kinds: { bug: '🐞 Problema', suggestion: '💡 Sugestão', question: '❓ Dúvida' },
    placeholder: 'Escreva o comentário…',
    cancel: 'Cancelar',
    save: 'Salvar',
    edit: 'Editar',
    resolve: 'Marcar como resolvido',
    reopen: 'Reabrir',
    remove: 'Apagar',
    confirmRemove: 'Apagar este comentário?',
    pickHint: 'Clique no elemento que quer comentar · Esc cancela',
    notInComponent: 'Este ponto não pertence a um componente da tela. Escolha outro elemento.',
    storageOff: 'Os comentários não serão salvos neste navegador.',
    saveFailed: 'Não foi possível salvar neste navegador.',
    editorArmed: 'O editor do estúdio está ativo. Saia do nível de edição para usar os comentários na tela.',
    listThis: 'Nesta tela',
    listOthers: 'Outras telas',
    listLoose: 'Soltos (o elemento não foi encontrado)',
    listEmpty: 'Nenhum comentário.',
    exportJson: 'Exportar',
    importJson: 'Importar',
    imported: (n) => `${n} comentário${n === 1 ? '' : 's'} importado${n === 1 ? '' : 's'}.`,
    importInvalid: 'O arquivo não é uma lista de comentários.',
    anon: 'Anônimo',
    resolvedTag: 'resolvido',
    looseHint: 'O elemento deste comentário não está mais na tela.',
    close: 'Fechar',
  },
  en: {
    onScreen: (n) => `${n} on this screen`,
    add: '+ New',
    list: '☰ List',
    exit: '✕ Exit',
    above: (n) => `${n} above`,
    below: (n) => `${n} below`,
    showResolved: (n) => `+${n} resolved`,
    hideResolved: 'hide resolved',
    kinds: { bug: '🐞 Problem', suggestion: '💡 Suggestion', question: '❓ Question' },
    placeholder: 'Write the comment…',
    cancel: 'Cancel',
    save: 'Save',
    edit: 'Edit',
    resolve: 'Mark as resolved',
    reopen: 'Reopen',
    remove: 'Delete',
    confirmRemove: 'Delete this comment?',
    pickHint: 'Click the element you want to comment on · Esc cancels',
    notInComponent: 'This spot is not part of a screen component. Pick another element.',
    storageOff: 'Comments will not be saved in this browser.',
    saveFailed: 'Could not save in this browser.',
    editorArmed: 'The studio editor is active. Leave the edit level to use screen comments.',
    listThis: 'On this screen',
    listOthers: 'Other screens',
    listLoose: 'Loose (element not found)',
    listEmpty: 'No comments.',
    exportJson: 'Export',
    importJson: 'Import',
    imported: (n) => `${n} comment${n === 1 ? '' : 's'} imported.`,
    importInvalid: 'The file is not a list of comments.',
    anon: 'Anonymous',
    resolvedTag: 'resolved',
    looseHint: 'The element of this comment is no longer on the screen.',
    close: 'Close',
  },
};

function language(): string {
  return document.documentElement?.lang || 'en';
}

function copy(): IPinTagCopy {
  return language().toLowerCase().startsWith('pt') ? COPY.pt : COPY.en;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ROOT_ID = 'collab-pintag';
const PICKING_CLASS = 'collab-pintag-picking';
/** The page mounts in steps: a pin is "loose" only after this long without its element. */
const RESOLVE_GRACE_MS = 4000;
const RESOLVE_RETRY_MS = 300;
const MUTATION_DEBOUNCE_MS = 200;
const ROUTE_POLL_MS = 800;
const TOAST_MS = 4000;
/** Blocked while picking. `click` is not here: onPickClick blocks it and also reads it. */
const PICK_BLOCKED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'contextmenu', 'touchstart'];

const STYLE = `
#${ROOT_ID} {
  --pt-bg: #ffffff; --pt-fg: #0f172a; --pt-muted: #64748b; --pt-border: #e2e8f0; --pt-soft: #f1f5f9;
  --pt-accent: #06b6d4; --pt-bug: #ec4899; --pt-suggestion: #f59e0b; --pt-question: #3b82f6;
  --pt-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.18), 0 4px 6px -4px rgb(0 0 0 / 0.12);
  position: fixed; inset: 0; z-index: 2147483000; pointer-events: none;
  font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--pt-fg);
}
.dark #${ROOT_ID} {
  --pt-bg: #0f172a; --pt-fg: #e2e8f0; --pt-muted: #94a3b8; --pt-border: #334155; --pt-soft: #1e293b;
}
#${ROOT_ID} * { box-sizing: border-box; }
#${ROOT_ID} button { font: inherit; color: inherit; cursor: pointer; }
#${ROOT_ID} .pt-panel {
  pointer-events: auto; background: var(--pt-bg); border: 1px solid var(--pt-border); border-radius: 10px;
  box-shadow: var(--pt-shadow);
}
#${ROOT_ID} .pt-bar {
  position: fixed; right: 16px; bottom: 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
  padding: 6px 8px; max-width: calc(100vw - 32px);
}
#${ROOT_ID} .pt-count { padding: 0 6px; font-weight: 600; }
#${ROOT_ID} .pt-btn {
  border: 1px solid transparent; background: transparent; border-radius: 6px; padding: 4px 8px; white-space: nowrap;
}
#${ROOT_ID} .pt-btn:hover { background: var(--pt-soft); }
#${ROOT_ID} .pt-btn.pt-primary { background: var(--pt-accent); color: #fff; }
#${ROOT_ID} .pt-btn.pt-primary:hover { filter: brightness(1.08); }
#${ROOT_ID} .pt-btn.pt-on { border-color: var(--pt-accent); }
#${ROOT_ID} .pt-btn.pt-danger { color: var(--pt-bug); }
#${ROOT_ID} .pt-link { color: var(--pt-muted); font-size: 12px; }
#${ROOT_ID} .pt-toast {
  position: fixed; right: 16px; bottom: 64px; max-width: 360px; padding: 8px 12px; font-size: 12px;
}
#${ROOT_ID} .pt-warn { color: var(--pt-suggestion); font-size: 12px; padding: 0 6px; width: 100%; }
#${ROOT_ID} .pt-pin {
  position: fixed; width: 24px; height: 24px; margin: -12px 0 0 -12px; border-radius: 9999px;
  border: 2px solid #fff; color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center;
  justify-content: center; pointer-events: auto; box-shadow: 0 2px 6px rgb(0 0 0 / 0.35); padding: 0;
}
#${ROOT_ID} .pt-pin.pt-resolved { opacity: 0.45; }
#${ROOT_ID} .pt-pin.pt-flash { animation: pt-flash 0.6s ease-in-out 4; }
@keyframes pt-flash { 50% { transform: scale(1.6); box-shadow: 0 0 0 6px rgb(6 182 212 / 0.45); } }
#${ROOT_ID} .pt-kind-bug { background: var(--pt-bug); }
#${ROOT_ID} .pt-kind-suggestion { background: var(--pt-suggestion); }
#${ROOT_ID} .pt-kind-question { background: var(--pt-question); }
#${ROOT_ID} .pt-frame {
  position: fixed; border: 2px solid var(--pt-accent); background: rgb(6 182 212 / 0.08); border-radius: 3px;
  pointer-events: none;
}
#${ROOT_ID} .pt-frame-label {
  position: absolute; left: -2px; bottom: 100%; margin-bottom: 2px; background: var(--pt-accent); color: #fff;
  font-size: 11px; padding: 1px 6px; border-radius: 3px; white-space: nowrap; max-width: 320px; overflow: hidden;
  text-overflow: ellipsis;
}
#${ROOT_ID} .pt-hint {
  position: fixed; top: 12px; left: 50%; transform: translateX(-50%); padding: 6px 12px; font-size: 12px;
}
#${ROOT_ID} .pt-balloon { position: fixed; width: 300px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
#${ROOT_ID} .pt-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${ROOT_ID} .pt-chips { display: flex; flex-wrap: wrap; gap: 4px; }
#${ROOT_ID} .pt-chip { border: 1px solid var(--pt-border); background: transparent; border-radius: 9999px; padding: 2px 8px; font-size: 12px; }
#${ROOT_ID} .pt-chip.pt-on.pt-c-bug { border-color: var(--pt-bug); background: rgb(236 72 153 / 0.12); }
#${ROOT_ID} .pt-chip.pt-on.pt-c-suggestion { border-color: var(--pt-suggestion); background: rgb(245 158 11 / 0.14); }
#${ROOT_ID} .pt-chip.pt-on.pt-c-question { border-color: var(--pt-question); background: rgb(59 130 246 / 0.12); }
#${ROOT_ID} textarea {
  width: 100%; min-height: 72px; resize: vertical; font: inherit; color: var(--pt-fg); background: var(--pt-soft);
  border: 1px solid var(--pt-border); border-radius: 6px; padding: 6px 8px;
}
#${ROOT_ID} textarea:focus { outline: 2px solid var(--pt-accent); outline-offset: -1px; }
#${ROOT_ID} .pt-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
#${ROOT_ID} .pt-meta { color: var(--pt-muted); font-size: 12px; }
#${ROOT_ID} .pt-text { white-space: pre-wrap; word-break: break-word; }
#${ROOT_ID} .pt-badge { display: inline-block; font-size: 11px; padding: 0 6px; border-radius: 9999px; background: var(--pt-soft); color: var(--pt-muted); margin-left: 4px; }
#${ROOT_ID} .pt-list {
  position: fixed; right: 16px; bottom: 64px; width: 340px; max-width: calc(100vw - 32px); max-height: 70vh;
  overflow: auto; padding: 10px; display: flex; flex-direction: column; gap: 6px;
}
#${ROOT_ID} .pt-list h4 { margin: 8px 0 2px; font-size: 12px; color: var(--pt-muted); text-transform: uppercase; letter-spacing: .03em; }
#${ROOT_ID} .pt-list h5 { margin: 4px 0 0; font-size: 12px; font-weight: 600; }
#${ROOT_ID} .pt-row {
  display: flex; gap: 8px; align-items: flex-start; text-align: left; width: 100%; border: 0; background: transparent;
  padding: 4px 6px; border-radius: 6px;
}
#${ROOT_ID} .pt-row:hover { background: var(--pt-soft); }
#${ROOT_ID} .pt-dot { flex: none; width: 18px; height: 18px; border-radius: 9999px; color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
#${ROOT_ID} .pt-row-text { overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
html.${PICKING_CLASS}, html.${PICKING_CLASS} * { cursor: crosshair !important; }
`;

// ─── DOM helper ─────────────────────────────────────────────────────────────

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; title?: string; onClick?: (ev: MouseEvent) => void } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.title) el.title = props.title;
  if (el instanceof HTMLButtonElement) el.type = 'button';
  if (props.onClick) el.addEventListener('click', props.onClick as EventListener);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

function asNode(el: Element): INodeLike {
  return el as unknown as INodeLike;
}

function asElement(node: INodeLike | null): Element | null {
  return node as unknown as Element | null;
}

/** The deepest element under a point, entering open shadow roots. */
function deepElementFromPoint(x: number, y: number): Element | null {
  let el = document.elementFromPoint(x, y);
  while (el?.shadowRoot) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleString(language()); } catch { return iso; }
}

function editorArmed(): boolean {
  const host = currentEditHost();
  return Boolean(host?.studioMode && host.editLevel);
}

// ─── Mode ───────────────────────────────────────────────────────────────────

type Balloon =
  | { mode: 'create'; target: IPinTarget; el: Element }
  | { mode: 'view'; pinId: string }
  | { mode: 'edit'; pinId: string };

class PinTagUi {
  private readonly project = currentPinProject();
  private readonly storage: IPinStorage | null = browserPinStorage();
  private pins: IPinTag[] = [];
  private storageOk = true;
  private screen: IPinScreen = currentScreen();
  private lastHref = window.location.href;
  private author: IPinAuthor = { id: 'anon', label: copy().anon };

  private readonly root = h('div');
  private readonly pinLayer = h('div');
  private readonly bar = h('div', { class: 'pt-panel pt-bar' });
  private frame: HTMLElement | null = null;
  private hint: HTMLElement | null = null;
  private balloonEl: HTMLElement | null = null;
  private balloon: Balloon | null = null;
  private listEl: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private toastTimer = 0;

  private picking = false;
  private showResolved = false;
  private listOpen = false;
  private draftKind: PinKind = 'suggestion';

  /** Resolved elements, dropped when disconnected or after a content change. */
  private readonly cache = new Map<string, Element | null>();
  private resolveUntil = 0;
  private retryTimer = 0;
  private mutationTimer = 0;
  private routeTimer = 0;
  private frameRequest = 0;
  private focusPinId: string | null = null;
  private above: IPinTag[] = [];
  private below: IPinTag[] = [];
  private loose: IPinTag[] = [];

  private readonly resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.schedule()) : null;
  private readonly mutationObserver = new MutationObserver((records) => this.onMutations(records));

  constructor() {
    const read = readPins(this.storage, this.project);
    this.pins = read.pins;
    this.storageOk = read.ok;

    this.root.id = ROOT_ID;
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.root.append(style, this.pinLayer, this.bar);
    document.body.append(this.root);

    window.addEventListener('scroll', this.schedule, true);
    window.addEventListener('resize', this.schedule);
    window.addEventListener('popstate', this.onRouteChange);
    window.addEventListener(NAV3_TAB_CHANGE_EVENT, this.onRouteChange);
    window.addEventListener('keydown', this.onKeyDown, true);
    const region = document.querySelector('main[data-region="content"]');
    if (region) this.resizeObserver?.observe(region);
    this.resizeObserver?.observe(document.body);
    this.mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    this.routeTimer = window.setInterval(() => {
      if (window.location.href !== this.lastHref) this.onRouteChange();
    }, ROUTE_POLL_MS);

    void getSessionUser().then((user) => {
      this.author = { id: user.email || user.person?.mdmId || 'anon', label: userLabel(user, copy().anon) };
    }).catch(() => undefined);

    this.startResolving();
    this.renderBar();
    if (!this.storageOk) this.toast(copy().storageOff);
  }

  destroy(): void {
    this.stopPick();
    window.removeEventListener('scroll', this.schedule, true);
    window.removeEventListener('resize', this.schedule);
    window.removeEventListener('popstate', this.onRouteChange);
    window.removeEventListener(NAV3_TAB_CHANGE_EVENT, this.onRouteChange);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.resizeObserver?.disconnect();
    this.mutationObserver.disconnect();
    window.clearInterval(this.routeTimer);
    window.clearInterval(this.retryTimer);
    window.clearTimeout(this.mutationTimer);
    window.clearTimeout(this.toastTimer);
    if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
    this.root.remove();
  }

  /** Called after a navigation from the list: highlights that pin once its element shows up. */
  focusPin(id: string): void {
    this.focusPinId = id;
    this.schedule();
  }

  // ─── Data ──────────────────────────────────────────────────────────────────

  private screenPins(): IPinTag[] {
    return pinsForScreen(this.pins, this.screen.route)
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private numberOf(pin: IPinTag): number {
    return this.screenPins().findIndex((p) => p.id === pin.id) + 1;
  }

  private persist(): void {
    if (!writePins(this.storage, this.project, this.pins)) {
      if (this.storageOk) this.toast(copy().saveFailed);
      this.storageOk = false;
    }
    this.renderBar();
    this.renderList();
    this.schedule();
  }

  private elementOf(pin: IPinTag): Element | null {
    const cached = this.cache.get(pin.id);
    if (cached && cached.isConnected) return cached;
    const found = asElement(resolveTarget(asNode(document.documentElement), pin.target, this.project));
    this.cache.set(pin.id, found);
    return found;
  }

  // ─── Route ─────────────────────────────────────────────────────────────────

  private readonly onRouteChange = (): void => {
    this.lastHref = window.location.href;
    const next = currentScreen();
    const sameScreen = next.route === this.screen.route;
    this.screen = next;
    this.cache.clear();
    if (!sameScreen) {
      this.stopPick();
      this.closeBalloon();
    }
    this.startResolving();
    this.renderBar();
    this.renderList();
  };

  /** Retries the lookup for a few seconds while the page mounts, then the missing ones are loose. */
  private startResolving(): void {
    this.resolveUntil = Date.now() + RESOLVE_GRACE_MS;
    window.clearInterval(this.retryTimer);
    this.retryTimer = window.setInterval(() => {
      this.cache.clear();
      this.schedule();
      if (Date.now() > this.resolveUntil) {
        window.clearInterval(this.retryTimer);
        this.retryTimer = 0;
        this.renderBar();
        this.renderList();
      }
    }, RESOLVE_RETRY_MS);
    this.schedule();
  }

  private onMutations(records: MutationRecord[]): void {
    if (records.every((r) => this.root.contains(r.target))) return;
    window.clearTimeout(this.mutationTimer);
    this.mutationTimer = window.setTimeout(() => {
      this.cache.clear();
      this.schedule();
    }, MUTATION_DEBOUNCE_MS);
  }

  // ─── Layout ────────────────────────────────────────────────────────────────

  private readonly schedule = (): void => {
    if (this.frameRequest) return;
    this.frameRequest = requestAnimationFrame(() => {
      this.frameRequest = 0;
      this.layout();
    });
  };

  /** The visible band of the page: the content region, clipped to the window. */
  private viewBand(): { top: number; bottom: number; left: number; right: number } {
    const region = document.querySelector('main[data-region="content"]');
    const r = region?.getBoundingClientRect();
    const top = Math.max(0, r ? r.top : 0);
    const bottom = Math.min(window.innerHeight, r && r.height > 0 ? r.bottom : window.innerHeight);
    const left = Math.max(0, r ? r.left : 0);
    const right = Math.min(window.innerWidth, r && r.width > 0 ? r.right : window.innerWidth);
    return { top, bottom, left, right };
  }

  private layout(): void {
    const band = this.viewBand();
    const resolving = Date.now() <= this.resolveUntil;
    const above: IPinTag[] = [];
    const below: IPinTag[] = [];
    const loose: IPinTag[] = [];
    const keep = new Set<string>();

    for (const pin of this.screenPins()) {
      if (pin.status === 'resolved' && !this.showResolved && this.focusPinId !== pin.id) continue;
      const el = this.elementOf(pin);
      if (!el) {
        if (!resolving) loose.push(pin);
        continue;
      }
      const rect = el.getBoundingClientRect();
      // Hidden (another nav3 tab, collapsed section): not on screen, not loose either.
      if (rect.width === 0 && rect.height === 0) continue;
      const x = rect.left + pin.target.offset.x * rect.width;
      const y = rect.top + pin.target.offset.y * rect.height;
      if (y < band.top) { above.push(pin); continue; }
      if (y > band.bottom) { below.push(pin); continue; }
      if (x < band.left || x > band.right) continue;
      keep.add(pin.id);
      this.placePin(pin, x, y);
    }

    for (const node of Array.from(this.pinLayer.children)) {
      const id = (node as HTMLElement).dataset.pinId ?? '';
      if (!keep.has(id)) node.remove();
    }

    const changed = above.length !== this.above.length || below.length !== this.below.length || loose.length !== this.loose.length;
    this.above = above;
    this.below = below;
    this.loose = loose;
    if (changed) {
      this.renderBar();
      if (this.listOpen) this.renderList();
    }
    this.positionBalloon();
    this.flashFocused();
  }

  private placePin(pin: IPinTag, x: number, y: number): void {
    let btn = this.pinLayer.querySelector<HTMLButtonElement>(`[data-pin-id="${CSS.escape(pin.id)}"]`);
    if (!btn) {
      btn = h('button', { onClick: (ev) => { ev.stopPropagation(); this.openView(pin.id); } });
      btn.dataset.pinId = pin.id;
      this.pinLayer.append(btn);
    }
    btn.className = `pt-pin pt-kind-${pin.kind}${pin.status === 'resolved' ? ' pt-resolved' : ''}${btn.classList.contains('pt-flash') ? ' pt-flash' : ''}`;
    btn.textContent = String(this.numberOf(pin));
    btn.title = `${pin.target.label} — ${pin.text}`;
    btn.style.left = `${Math.round(x)}px`;
    btn.style.top = `${Math.round(y)}px`;
  }

  private flashFocused(): void {
    if (!this.focusPinId) return;
    const id = this.focusPinId;
    const pin = this.pins.find((p) => p.id === id);
    if (!pin || pin.screen.route !== this.screen.route) return;
    const el = this.elementOf(pin);
    if (!el) {
      if (Date.now() > this.resolveUntil) {
        this.focusPinId = null;
        this.openView(id);
      }
      return;
    }
    this.focusPinId = null;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    window.setTimeout(() => {
      const btn = this.pinLayer.querySelector<HTMLElement>(`[data-pin-id="${CSS.escape(id)}"]`);
      if (!btn) return;
      btn.classList.remove('pt-flash');
      void btn.offsetWidth;
      btn.classList.add('pt-flash');
      window.setTimeout(() => btn.classList.remove('pt-flash'), 2600);
    }, 400);
  }

  // ─── Bar ───────────────────────────────────────────────────────────────────

  private renderBar(): void {
    const t = copy();
    const pins = this.screenPins();
    const open = pins.filter((p) => p.status === 'open').length;
    const resolved = pins.length - open;
    const parts: Child[] = [
      h('span', { class: 'pt-count', text: `💬 ${t.onScreen(open)}` }),
      this.above.length ? h('button', { class: 'pt-btn pt-link', text: `↑ ${t.above(this.above.length)}`, onClick: () => this.scrollTo(this.above[this.above.length - 1]) }) : null,
      this.below.length ? h('button', { class: 'pt-btn pt-link', text: `↓ ${t.below(this.below.length)}`, onClick: () => this.scrollTo(this.below[0]) }) : null,
      resolved ? h('button', {
        class: 'pt-btn pt-link',
        text: this.showResolved ? t.hideResolved : t.showResolved(resolved),
        onClick: () => { this.showResolved = !this.showResolved; this.renderBar(); this.schedule(); },
      }) : null,
      h('button', { class: `pt-btn pt-primary${this.picking ? ' pt-on' : ''}`, text: t.add, onClick: () => (this.picking ? this.stopPick() : this.startPick()) }),
      h('button', { class: `pt-btn${this.listOpen ? ' pt-on' : ''}`, text: t.list, onClick: () => this.toggleList() }),
      h('button', { class: 'pt-btn', text: t.exit, onClick: () => { leaveMode(); } }),
      !this.storageOk ? h('span', { class: 'pt-warn', text: t.storageOff }) : null,
    ];
    this.bar.replaceChildren(...parts.filter((p): p is Node | string => Boolean(p)));
  }

  private scrollTo(pin: IPinTag | undefined): void {
    if (!pin) return;
    this.focusPin(pin.id);
  }

  private toast(text: string): void {
    this.toastEl?.remove();
    this.toastEl = h('div', { class: 'pt-panel pt-toast', text });
    this.root.append(this.toastEl);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toastEl?.remove(); this.toastEl = null; }, TOAST_MS);
  }

  // ─── Inspect ───────────────────────────────────────────────────────────────

  private startPick(): void {
    if (this.picking) return;
    this.closeBalloon();
    this.picking = true;
    document.documentElement.classList.add(PICKING_CLASS);
    this.hint = h('div', { class: 'pt-panel pt-hint', text: copy().pickHint });
    this.root.append(this.hint);
    for (const type of PICK_BLOCKED_EVENTS) {
      window.addEventListener(type, this.onPickBlock, true);
    }
    window.addEventListener('pointermove', this.onPickMove, true);
    window.addEventListener('click', this.onPickClick, true);
    this.renderBar();
  }

  private stopPick(): void {
    if (!this.picking) return;
    this.picking = false;
    document.documentElement.classList.remove(PICKING_CLASS);
    this.hint?.remove();
    this.hint = null;
    for (const type of PICK_BLOCKED_EVENTS) {
      window.removeEventListener(type, this.onPickBlock, true);
    }
    window.removeEventListener('pointermove', this.onPickMove, true);
    window.removeEventListener('click', this.onPickClick, true);
    if (!this.balloon || this.balloon.mode !== 'create') this.hideFrame();
    this.renderBar();
  }

  private isOurs(ev: Event): boolean {
    return ev.composedPath().includes(this.root);
  }

  /** While picking, the app never sees the click: the client must not trigger what they comment on. */
  private readonly onPickBlock = (ev: Event): void => {
    if (this.isOurs(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
  };

  private pickable(x: number, y: number): Element | null {
    const el = deepElementFromPoint(x, y);
    if (!el || this.root.contains(el)) return null;
    return el;
  }

  private readonly onPickMove = (ev: PointerEvent): void => {
    if (this.isOurs(ev)) return;
    const el = this.pickable(ev.clientX, ev.clientY);
    if (!el) { this.hideFrame(); return; }
    this.showFrame(el, readableLabel(asNode(el), this.project, language()));
  };

  private readonly onPickClick = (ev: MouseEvent): void => {
    if (this.isOurs(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    const el = this.pickable(ev.clientX, ev.clientY);
    if (!el) return;
    const target = buildTarget(asNode(el), el.getBoundingClientRect(), ev.clientX, ev.clientY, this.project, language());
    if (!target) {
      this.toast(copy().notInComponent);
      return;
    }
    this.draftKind = 'suggestion';
    this.balloon = { mode: 'create', target, el };
    this.stopPick();
    this.showFrame(el, target.label);
    this.renderBalloon();
  };

  private showFrame(el: Element, label: string): void {
    const rect = el.getBoundingClientRect();
    if (!this.frame) {
      this.frame = h('div', { class: 'pt-frame' }, h('span', { class: 'pt-frame-label' }));
      this.root.append(this.frame);
    }
    this.frame.style.left = `${rect.left}px`;
    this.frame.style.top = `${rect.top}px`;
    this.frame.style.width = `${rect.width}px`;
    this.frame.style.height = `${rect.height}px`;
    const tag = this.frame.firstElementChild as HTMLElement;
    tag.textContent = label;
  }

  private hideFrame(): void {
    this.frame?.remove();
    this.frame = null;
  }

  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape') return;
    if (this.picking) { ev.preventDefault(); ev.stopPropagation(); this.stopPick(); return; }
    if (this.balloon) { ev.preventDefault(); ev.stopPropagation(); this.closeBalloon(); return; }
    if (this.listOpen) { ev.preventDefault(); ev.stopPropagation(); this.toggleList(); }
  };

  // ─── Balloon ───────────────────────────────────────────────────────────────

  private openView(pinId: string): void {
    this.stopPick();
    this.balloon = { mode: 'view', pinId };
    this.renderBalloon();
  }

  private closeBalloon(): void {
    this.balloon = null;
    this.balloonEl?.remove();
    this.balloonEl = null;
    if (!this.picking) this.hideFrame();
  }

  private balloonAnchor(): DOMRect | null {
    const b = this.balloon;
    if (!b) return null;
    if (b.mode === 'create') return b.el.isConnected ? b.el.getBoundingClientRect() : null;
    const pin = this.pins.find((p) => p.id === b.pinId);
    if (!pin || pin.screen.route !== this.screen.route) return null;
    const el = this.elementOf(pin);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = rect.left + pin.target.offset.x * rect.width;
    const y = rect.top + pin.target.offset.y * rect.height;
    return new DOMRect(x - 12, y - 12, 24, 24);
  }

  /** Beside the element when there is room, else below or above; centered when it has no element. */
  private positionBalloon(): void {
    const el = this.balloonEl;
    if (!el) return;
    if (this.balloon?.mode === 'create' && this.frame) this.showFrame(this.balloon.el, this.balloon.target.label);
    const width = el.offsetWidth || 300;
    const height = el.offsetHeight || 200;
    const gap = 10;
    const rect = this.balloonAnchor();
    let left: number;
    let top: number;
    if (!rect) {
      left = (window.innerWidth - width) / 2;
      top = (window.innerHeight - height) / 3;
    } else if (rect.right + gap + width <= window.innerWidth) {
      left = rect.right + gap;
      top = rect.top;
    } else if (rect.left - gap - width >= 0) {
      left = rect.left - gap - width;
      top = rect.top;
    } else {
      left = rect.left;
      top = rect.bottom + gap + height <= window.innerHeight ? rect.bottom + gap : rect.top - gap - height;
    }
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
    top = Math.min(Math.max(8, top), window.innerHeight - height - 8);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  private renderBalloon(): void {
    this.balloonEl?.remove();
    this.balloonEl = null;
    const b = this.balloon;
    if (!b) return;
    const panel = b.mode === 'view' ? this.viewPanel(b.pinId) : this.formPanel(b);
    if (!panel) { this.balloon = null; return; }
    panel.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    this.balloonEl = panel;
    this.root.append(panel);
    this.positionBalloon();
    panel.querySelector('textarea')?.focus();
  }

  private kindChips(selected: PinKind, onPick: (kind: PinKind) => void): HTMLElement {
    const t = copy();
    return h('div', { class: 'pt-chips' }, ...PIN_KINDS.map((kind) => h('button', {
      class: `pt-chip pt-c-${kind}${kind === selected ? ' pt-on' : ''}`,
      text: t.kinds[kind],
      onClick: () => onPick(kind),
    })));
  }

  private formPanel(b: Extract<Balloon, { mode: 'create' | 'edit' }>): HTMLElement | null {
    const t = copy();
    const pin = b.mode === 'edit' ? this.pins.find((p) => p.id === b.pinId) : undefined;
    if (b.mode === 'edit' && !pin) return null;
    const label = b.mode === 'create' ? b.target.label : pin!.target.label;
    const textarea = h('textarea');
    textarea.placeholder = t.placeholder;
    textarea.value = pin?.text ?? '';
    if (pin) this.draftKind = pin.kind;
    const chips = h('div');
    const paintChips = (): void => {
      chips.replaceChildren(this.kindChips(this.draftKind, (kind) => { this.draftKind = kind; paintChips(); }));
    };
    paintChips();
    const save = h('button', { class: 'pt-btn pt-primary', text: t.save, onClick: () => this.saveForm(b, textarea.value) });
    textarea.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); save.click(); }
    });
    return h('div', { class: 'pt-panel pt-balloon' },
      h('div', { class: 'pt-title', text: label, title: label }),
      chips,
      textarea,
      h('div', { class: 'pt-actions' },
        h('button', { class: 'pt-btn', text: t.cancel, onClick: () => (b.mode === 'edit' ? this.openView(b.pinId) : this.closeBalloon()) }),
        save,
      ),
    );
  }

  private saveForm(b: Extract<Balloon, { mode: 'create' | 'edit' }>, text: string): void {
    const clean = text.trim();
    if (!clean) { this.balloonEl?.querySelector('textarea')?.focus(); return; }
    const now = new Date().toISOString();
    if (b.mode === 'edit') {
      this.pins = this.pins.map((p) => (p.id === b.pinId ? { ...p, text: clean, kind: this.draftKind, updatedAt: now } : p));
      this.persist();
      this.openView(b.pinId);
      return;
    }
    const boot = (window as { collabBoot?: { device?: string } }).collabBoot;
    const pin: IPinTag = {
      id: newPinId(),
      version: PIN_VERSION,
      kind: this.draftKind,
      text: clean,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      author: { ...this.author },
      screen: { ...this.screen },
      target: b.target,
      context: { viewport: `${window.innerWidth}x${window.innerHeight}`, device: boot?.device ?? '' },
    };
    this.pins = [...this.pins, pin];
    this.cache.set(pin.id, b.el);
    this.closeBalloon();
    this.persist();
  }

  private viewPanel(pinId: string): HTMLElement | null {
    const t = copy();
    const pin = this.pins.find((p) => p.id === pinId);
    if (!pin) return null;
    const missing = pin.screen.route === this.screen.route && !this.elementOf(pin);
    const resolved = pin.status === 'resolved';
    return h('div', { class: 'pt-panel pt-balloon' },
      h('div', { class: 'pt-title', title: pin.target.label },
        `${pin.screen.route === this.screen.route ? `${this.numberOf(pin)}. ` : ''}${pin.target.label}`,
        resolved ? h('span', { class: 'pt-badge', text: t.resolvedTag }) : null,
      ),
      h('div', { class: 'pt-meta', text: `${t.kinds[pin.kind]} · ${pin.author.label} · ${formatDate(pin.updatedAt)}` }),
      h('div', { class: 'pt-text', text: pin.text }),
      missing ? h('div', { class: 'pt-meta', text: t.looseHint }) : null,
      h('div', { class: 'pt-actions' },
        h('button', { class: 'pt-btn pt-danger', text: t.remove, onClick: () => this.removePin(pin.id) }),
        h('button', { class: 'pt-btn', text: resolved ? t.reopen : t.resolve, onClick: () => this.toggleResolved(pin.id) }),
        h('button', { class: 'pt-btn', text: t.edit, onClick: () => { this.balloon = { mode: 'edit', pinId: pin.id }; this.renderBalloon(); } }),
        h('button', { class: 'pt-btn', text: t.close, onClick: () => this.closeBalloon() }),
      ),
    );
  }

  private toggleResolved(id: string): void {
    const now = new Date().toISOString();
    this.pins = this.pins.map((p) => (p.id === id ? { ...p, status: (p.status === 'open' ? 'resolved' : 'open') as PinStatus, updatedAt: now } : p));
    this.persist();
    this.renderBalloon();
  }

  private removePin(id: string): void {
    if (!window.confirm(copy().confirmRemove)) return;
    this.pins = this.pins.filter((p) => p.id !== id);
    this.cache.delete(id);
    this.closeBalloon();
    this.persist();
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  private toggleList(): void {
    this.listOpen = !this.listOpen;
    this.renderList();
    this.renderBar();
  }

  private row(pin: IPinTag, number: string, onClick: () => void): HTMLElement {
    return h('button', { class: 'pt-row', onClick },
      h('span', { class: `pt-dot pt-kind-${pin.kind}`, text: number }),
      h('span', { class: 'pt-row-text' },
        h('strong', { text: pin.target.label }),
        pin.status === 'resolved' ? h('span', { class: 'pt-badge', text: copy().resolvedTag }) : null,
        h('br'),
        pin.text,
      ),
    );
  }

  private renderList(): void {
    if (!this.listOpen) {
      this.listEl?.remove();
      this.listEl = null;
      return;
    }
    const t = copy();
    const looseIds = new Set(this.loose.map((p) => p.id));
    const here = this.screenPins();
    const placed = here.filter((p) => !looseIds.has(p.id));
    const others = groupOtherScreens(this.pins, this.screen.route);
    const panel = h('div', { class: 'pt-panel pt-list' },
      h('div', { class: 'pt-actions' },
        h('button', { class: 'pt-btn', text: t.exportJson, onClick: () => this.exportFile() }),
        h('button', { class: 'pt-btn', text: t.importJson, onClick: () => this.importFile() }),
      ),
      h('h4', { text: t.listThis }),
      placed.length
        ? h('div', {}, ...placed.map((pin) => this.row(pin, String(this.numberOf(pin)), () => {
          if (pin.status === 'resolved') this.showResolved = true;
          this.focusPin(pin.id);
          this.openView(pin.id);
        })))
        : h('div', { class: 'pt-meta', text: t.listEmpty }),
      others.length ? h('h4', { text: t.listOthers }) : null,
      ...others.map((group) => h('div', {},
        h('h5', { text: `${group.module ? `${group.module} › ` : ''}${group.title || group.route}` }),
        ...group.pins.map((pin) => this.row(pin, '·', () => this.goTo(pin))),
      )),
      this.loose.length ? h('h4', { text: t.listLoose }) : null,
      ...this.loose.map((pin) => this.row(pin, String(this.numberOf(pin)), () => this.openView(pin.id))),
    );
    panel.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    this.listEl?.replaceWith(panel);
    if (!this.listEl) this.root.append(panel);
    this.listEl = panel;
  }

  /** Another screen: navigate there, then flash the pin once its element shows up. */
  private goTo(pin: IPinTag): void {
    if (pin.status === 'resolved') this.showResolved = true;
    this.focusPinId = pin.id;
    const href = pin.screen.href || pin.screen.route;
    if (!auraNavigate(href)) window.location.href = href;
  }

  private exportFile(): void {
    const blob = new Blob([exportPins(this.pins)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a');
    a.href = url;
    a.download = `pins-${this.project}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private importFile(): void {
    const input = h('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then((text) => {
        const result = importPins(this.pins, text);
        if (!result.ok) { this.toast(copy().importInvalid); return; }
        this.pins = result.pins;
        this.persist();
        this.toast(copy().imported(result.added));
      });
    });
    input.click();
  }
}

// ─── Entry points ───────────────────────────────────────────────────────────

let ui: PinTagUi | null = null;

function leaveMode(): void {
  ui?.destroy();
  ui = null;
}

export function isPinTagModeOn(): boolean {
  return ui !== null;
}

/**
 * Enters or leaves the mode. Returns the new state.
 *
 * Refuses to enter while the studio editor is armed (level 3 in studio mode): both would capture the
 * clicks, and the editor's selection would fight the inspect.
 */
export function togglePinTagMode(): boolean {
  if (ui) {
    leaveMode();
    return false;
  }
  if (editorArmed()) {
    const note = h('div', { class: 'pt-panel pt-toast', text: copy().editorArmed });
    const holder = h('div');
    holder.id = ROOT_ID;
    const style = document.createElement('style');
    style.textContent = STYLE;
    holder.append(style, note);
    document.body.append(holder);
    window.setTimeout(() => holder.remove(), TOAST_MS);
    return false;
  }
  ui = new PinTagUi();
  return true;
}
