/// <mls fileReference="_102033_/l2/molecules/groupviewhierarchy/ml-hierarchy-tree-diagram.ts" enhancement="_102020_/l2/enhancementAura"/>
// =============================================================================
// HIERARCHY TREE DIAGRAM MOLECULE
// =============================================================================
// Skill Group: view + hierarchy
// This molecule does NOT contain business logic.
import { html, svg, TemplateResult, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
  loading: 'Loading...',
  empty: 'No items.',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
  en: message_en,
  pt: {
    loading: 'Carregando...',
    empty: 'Sem itens.',
  },
};
/// **collab_i18n_end**

interface TreeNode {
  id: string;
  value: string | null;
  labelHtml: string;
  children: TreeNode[];
  disabled: boolean;
  expandedDefault: boolean;
  parentId: string | null;
}

@customElement('groupviewhierarchy--ml-hierarchy-tree-diagram')
export class HierarchyTreeDiagramMolecule extends MoleculeAuraElement {
  private msg: MessageType = messages.en;

  // ==========================================================================
  // SLOT TAGS
  // ==========================================================================
  slotTags = ['Label', 'Node', 'Empty'];

  // ==========================================================================
  // PROPERTIES — From Contract
  // ==========================================================================
  @propertyDataSource({ type: Boolean })
  multiple = true;

  @propertyDataSource({ type: Boolean, attribute: 'expand-all' })
  expandAll = false;

  @propertyDataSource({ type: Boolean })
  disabled = false;

  @propertyDataSource({ type: Boolean })
  loading = false;

  // ==========================================================================
  // INTERNAL STATE
  // ==========================================================================
  @state()
  private focusedId: string | null = null;

  private expandedMap: Record<string, boolean> = {};
  private nodeIndex: Record<string, TreeNode> = {};
  private visibleNodeIds: string[] = [];

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================
  createRenderRoot() {
    return this;
  }

  updated(changedProps: Map<string, unknown>) {
    if (changedProps.has('expandAll') && this.expandAll) {
      this.expandedMap = {};
    }
    this.refreshVisibleNodes();
    if (changedProps.has('focusedId')) {
      this.focusCurrentNode();
    }
  }

  // ==========================================================================
  // TREE PARSING
  // ==========================================================================
  private buildTree(): TreeNode[] {
    const allNodes = this.getSlots('Node');
    const roots = allNodes.filter((el) => !this.isNestedNode(el));
    const rootNodes = roots.map((el, index) => this.parseNode(el, [index], null));
    this.nodeIndex = {};
    const register = (node: TreeNode) => {
      this.nodeIndex[node.id] = node;
      node.children.forEach(register);
    };
    rootNodes.forEach(register);
    return rootNodes;
  }

  private isNestedNode(el: Element): boolean {
    const parent = el.parentElement;
    return !!parent && parent.tagName.toLowerCase() === 'node';
  }

  private parseNode(el: Element, path: number[], parentId: string | null): TreeNode {
    const id = path.join('-');
    const value = el.getAttribute('value');
    const disabled = el.hasAttribute('disabled');
    const expandedDefault = el.hasAttribute('expanded');
    const childrenEls = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'node');
    const labelHtml = this.getNodeLabelHtml(el) || value || '';
    const children = childrenEls.map((child, index) => this.parseNode(child, [...path, index], id));
    return { id, value, labelHtml, children, disabled, expandedDefault, parentId };
  }

  private getNodeLabelHtml(el: Element): string {
    const clone = el.cloneNode(true) as Element;
    Array.from(clone.querySelectorAll('node')).forEach((n) => n.remove());
    return (clone.innerHTML || '').trim();
  }

  private isExpanded(node: TreeNode): boolean {
    if (this.expandAll) return true;
    const state = this.expandedMap[node.id];
    if (state !== undefined) return state;
    return node.expandedDefault;
  }

  private refreshVisibleNodes() {
    const roots = this.buildTree();
    const ids: string[] = [];
    const walk = (node: TreeNode) => {
      ids.push(node.id);
      if (node.children.length && this.isExpanded(node)) {
        node.children.forEach(walk);
      }
    };
    roots.forEach(walk);
    this.visibleNodeIds = ids;
  }

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================
  private handleNodeClick(node: TreeNode) {
    if (this.disabled || node.disabled) return;
    this.focusedId = node.id;
    this.dispatchEvent(
      new CustomEvent('nodeClick', {
        bubbles: true,
        composed: true,
        detail: { value: node.value ?? null },
      })
    );
  }

  private handleToggle(node: TreeNode) {
    if (this.disabled || node.disabled) return;
    if (!node.children.length) return;
    const current = this.isExpanded(node);
    const next = !current;
    const nextMap: Record<string, boolean> = { ...this.expandedMap, [node.id]: next };

    if (!this.multiple && next) {
      Object.values(this.nodeIndex).forEach((n) => {
        if (n.parentId === node.parentId && n.id !== node.id) {
          nextMap[n.id] = false;
        }
      });
    }

    this.expandedMap = nextMap;
    this.focusedId = node.id;

    this.dispatchEvent(
      new CustomEvent('toggle', {
        bubbles: true,
        composed: true,
        detail: { value: node.value ?? null, expanded: next },
      })
    );
    this.requestUpdate();
  }

  private handleNodeKeydown(e: KeyboardEvent, node: TreeNode) {
    if (this.disabled || node.disabled) return;
    const key = e.key;
    if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter'].includes(key)) {
      e.preventDefault();
    }

    if (key === 'ArrowDown') {
      this.moveFocus(1);
    } else if (key === 'ArrowUp') {
      this.moveFocus(-1);
    } else if (key === 'ArrowRight') {
      if (node.children.length && !this.isExpanded(node)) {
        this.handleToggle(node);
      }
    } else if (key === 'ArrowLeft') {
      if (node.children.length && this.isExpanded(node)) {
        this.handleToggle(node);
      }
    } else if (key === 'Enter') {
      if (node.children.length) {
        this.handleToggle(node);
      }
    }
  }

  private moveFocus(direction: number) {
    if (!this.visibleNodeIds.length) return;
    const currentIndex = this.focusedId
      ? this.visibleNodeIds.indexOf(this.focusedId)
      : -1;
    const nextIndex = Math.min(
      this.visibleNodeIds.length - 1,
      Math.max(0, currentIndex + direction)
    );
    this.focusedId = this.visibleNodeIds[nextIndex];
  }

  private focusCurrentNode() {
    if (!this.focusedId) return;
    const el = this.querySelector(`[data-node-id="${this.focusedId}"]`) as HTMLElement | null;
    if (el) el.focus();
  }

  // ==========================================================================
  // RENDER HELPERS
  // ==========================================================================
  private getToggleClasses(disabled: boolean): string {
    return [
      'h-5 w-5 rounded-full border flex items-center justify-center transition',
      'bg-white dark:bg-slate-800',
      'border-slate-200 dark:border-slate-700',
      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 dark:hover:bg-slate-700',
      'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private getLabelClasses(disabled: boolean): string {
    return [
      'rounded-md px-2 py-1 text-sm transition',
      'text-slate-900 dark:text-slate-100',
      'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private getCircleClasses(disabled: boolean, expanded: boolean): string {
    return [
      'h-3 w-3 rounded-full border',
      expanded
        ? 'bg-sky-50 dark:bg-sky-900/40 border-sky-500 dark:border-sky-400'
        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600',
      disabled ? 'opacity-50' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private renderToggleIcon(expanded: boolean): TemplateResult {
    return html`
      <svg class="h-3 w-3 text-slate-600 dark:text-slate-300" viewBox="0 0 20 20" fill="currentColor">
        ${svg`
          <path
            d="M6 8l4 4 4-4"
            stroke="currentColor"
            stroke-width="2"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
            transform="${expanded ? 'rotate(180 10 10)' : 'rotate(0 10 10)'}"
          ></path>
        `}
      </svg>
    `;
  }

  private renderConnector(): TemplateResult {
    return html`
      <svg class="mt-3" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        ${svg`
          <path
            d="M0 12 Q12 0 24 12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="text-slate-300 dark:text-slate-600"
          ></path>
        `}
      </svg>
    `;
  }

  private renderNode(node: TreeNode, depth: number): TemplateResult {
    const expanded = this.isExpanded(node);
    const hasChildren = node.children.length > 0;
    const nodeDisabled = this.disabled || node.disabled;
    const ariaExpanded = hasChildren ? String(expanded) : nothing;
    const tabindex = this.focusedId === node.id || (!this.focusedId && depth === 0) ? 0 : -1;

    return html`
      <div class="flex items-start">
        <div class="flex items-start gap-3">
          ${hasChildren
        ? html`
                <button
                  class="${this.getToggleClasses(nodeDisabled)}"
                  @click=${(e: Event) => {
            e.stopPropagation();
            this.handleToggle(node);
          }}
                  aria-label="Toggle"
                  ?disabled=${nodeDisabled}
                >
                  ${this.renderToggleIcon(expanded)}
                </button>
              `
        : html`<div class="h-5 w-5"></div>`}

          <div class="flex items-center gap-2">
            <span class="${this.getCircleClasses(nodeDisabled, expanded)}"></span>
            <div
              class="${this.getLabelClasses(nodeDisabled)}"
              role="treeitem"
              data-node-id="${node.id}"
              aria-expanded=${ariaExpanded}
              aria-disabled=${nodeDisabled ? 'true' : 'false'}
              tabindex=${tabindex}
              @click=${() => this.handleNodeClick(node)}
              @focus=${() => (this.focusedId = node.id)}
              @keydown=${(e: KeyboardEvent) => this.handleNodeKeydown(e, node)}
            >
              ${unsafeHTML(node.labelHtml)}
            </div>
          </div>
        </div>

        ${hasChildren && expanded
        ? html`
              <div role="group" class="ml-8 mt-1 flex flex-col gap-4">
                ${node.children.map(
          (child) => html`
                    <div class="flex items-start gap-4">
                      ${this.renderConnector()} ${this.renderNode(child, depth + 1)}
                    </div>
                  `
        )}
              </div>
            `
        : html``}
      </div>
    `;
  }

  private renderLabel(): TemplateResult {
    if (!this.hasSlot('Label')) return html``;
    return html`
      <div class="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
        ${unsafeHTML(this.getSlotContent('Label'))}
      </div>
    `;
  }

  private renderEmpty(): TemplateResult {
    const content = this.hasSlot('Empty') ? this.getSlotContent('Empty') : this.msg.empty;
    return html`
      <div class="text-sm text-slate-500 dark:text-slate-400">
        ${unsafeHTML(content)}
      </div>
    `;
  }

  private renderLoading(): TemplateResult {
    return html`
      <div class="text-sm text-slate-500 dark:text-slate-400">${this.msg.loading}</div>
    `;
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================
  render() {
    const lang = this.getMessageKey(messages);
    this.msg = messages[lang];

    if (this.loading) {
      return html`<div class="w-full">${this.renderLoading()}</div>`;
    }

    const roots = this.buildTree();
    if (!roots.length) {
      return html`<div class="w-full">${this.renderEmpty()}</div>`;
    }

    return html`
      <div class="w-full">
        ${this.renderLabel()}
        <div role="tree" class="space-y-4">
          ${roots.map((node) => this.renderNode(node, 0))}
        </div>
      </div>
    `;
  }
}
