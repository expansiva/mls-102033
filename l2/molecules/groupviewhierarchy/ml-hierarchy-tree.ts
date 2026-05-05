/// <mls fileReference="_102033_/l2/molecules/groupviewhierarchy/ml-hierarchy-tree.ts" enhancement="_102020_/l2/enhancementAura" />
// =============================================================================
// HIERARCHY TREE MOLECULE
// =============================================================================
// Skill Group: view + hierarchy
// This molecule does NOT contain business logic.
import { html, svg, TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { customElement } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';
/// **collab_i18n_start**
const message_en = {
    empty: 'No items to display',
    loading: 'Loading hierarchy...',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
    en: message_en,
    pt: {
        empty: 'Nenhum item para exibir',
        loading: 'Carregando hierarquia...',
    },
};
/// **collab_i18n_end**
@customElement('groupviewhierarchy--ml-hierarchy-tree')
export class HierarchyTreeMolecule extends MoleculeAuraElement {
    private msg: MessageType = messages.en;
    // =========================================================================
    // SLOT TAGS
    // =========================================================================
    slotTags = ['Label', 'Node', 'Empty'];
    // =========================================================================
    // PROPERTIES — From Contract
    // =========================================================================
    @propertyDataSource({ type: Boolean })
    multiple = true;
    @propertyDataSource({ type: Boolean, attribute: 'expand-all' })
    expandAll = false;
    @propertyDataSource({ type: Boolean })
    disabled = false;
    @propertyDataSource({ type: Boolean })
    loading = false;
    // =========================================================================
    // INTERNAL STATE
    // =========================================================================
    private expandedState = new WeakMap<Element, boolean>();
    // =========================================================================
    // LIFECYCLE
    // =========================================================================
    updated(changedProps: Map<string, unknown>) {
        if (changedProps.has('expandAll') && this.expandAll) {
            this.expandAllNodes();
        }
    }
    // =========================================================================
    // HELPERS — NODE PARSING
    // =========================================================================
    private isNodeElement(el: Element): boolean {
        return el.tagName.toLowerCase() === 'node';
    }
    private getRootNodes(): Element[] {
        const fragment = (this as unknown as { getTemplateDoc?: () => DocumentFragment }).getTemplateDoc?.();
        if (!fragment) return [];
        const elements = Array.from(fragment.childNodes)
            .filter((n): n is Element => n.nodeType === Node.ELEMENT_NODE);
        return elements.filter((el) => this.isNodeElement(el));
    }
    private getChildNodes(node: Element): Element[] {
        return Array.from(node.children).filter((el) => this.isNodeElement(el));
    }
    private getNodeLabelHtml(node: Element): string {
        const clone = node.cloneNode(true) as Element;
        Array.from(clone.querySelectorAll('Node')).forEach((child) => child.remove());
        return clone.innerHTML.trim();
    }
    private getNodeValue(node: Element): string | null {
        return node.getAttribute('value');
    }
    private isNodeDisabled(node: Element): boolean {
        return this.disabled || node.hasAttribute('disabled');
    }
    private getNodeExpanded(node: Element): boolean {
        if (!this.expandedState.has(node)) {
            const initial = this.expandAll ? true : node.hasAttribute('expanded');
            this.expandedState.set(node, initial);
        }
        return this.expandedState.get(node) ?? false;
    }
    private setNodeExpanded(node: Element, expanded: boolean) {
        this.expandedState.set(node, expanded);
    }
    private expandAllNodes() {
        const walk = (nodes: Element[]) => {
            nodes.forEach((node) => {
                this.setNodeExpanded(node, true);
                const children = this.getChildNodes(node);
                if (children.length) walk(children);
            });
        };
        walk(this.getRootNodes());
        this.requestUpdate();
    }
    private collapseSiblings(target: Element) {
        const parent = target.parentElement;
        let siblings: Element[] = [];
        if (parent && this.isNodeElement(parent)) {
            siblings = this.getChildNodes(parent);
        } else {
            siblings = this.getRootNodes();
        }
        siblings.forEach((node) => {
            if (node !== target) this.setNodeExpanded(node, false);
        });
    }
    // =========================================================================
    // EVENT HANDLERS
    // =========================================================================
    private handleToggle(node: Element) {
        const children = this.getChildNodes(node);
        if (!children.length) return;
        if (this.isNodeDisabled(node)) return;
        const expanded = this.getNodeExpanded(node);
        const nextExpanded = !expanded;
        if (nextExpanded && !this.multiple) {
            this.collapseSiblings(node);
        }
        this.setNodeExpanded(node, nextExpanded);
        this.dispatchEvent(
            new CustomEvent('toggle', {
                bubbles: true,
                composed: true,
                detail: { value: this.getNodeValue(node), expanded: nextExpanded },
            })
        );
        this.requestUpdate();
    }
    private handleNodeClick(node: Element) {
        if (this.isNodeDisabled(node)) return;
        this.dispatchEvent(
            new CustomEvent('nodeClick', {
                bubbles: true,
                composed: true,
                detail: { value: this.getNodeValue(node) },
            })
        );
    }
    private handleNodeKeyDown(
        event: KeyboardEvent,
        node: Element,
        hasChildren: boolean,
        expanded: boolean
    ) {
        const key = event.key;
        if (key === 'Enter' || key === ' ') {
            event.preventDefault();
            if (hasChildren) {
                this.handleToggle(node);
            } else {
                this.handleNodeClick(node);
            }
            return;
        }
        if (key === 'ArrowRight' && hasChildren && !expanded) {
            event.preventDefault();
            this.handleToggle(node);
            return;
        }
        if (key === 'ArrowLeft' && hasChildren && expanded) {
            event.preventDefault();
            this.handleToggle(node);
            return;
        }
        if (key === 'ArrowDown') {
            event.preventDefault();
            this.focusAdjacentNode(event.currentTarget as HTMLElement, 1);
            return;
        }
        if (key === 'ArrowUp') {
            event.preventDefault();
            this.focusAdjacentNode(event.currentTarget as HTMLElement, -1);
        }
    }
    private focusAdjacentNode(current: HTMLElement, direction: 1 | -1) {
        const nodes = Array.from(
            this.querySelectorAll('[data-node-content="true"]')
        ) as HTMLElement[];
        const index = nodes.indexOf(current);
        if (index === -1) return;
        const nextIndex = index + direction;
        const next = nodes[nextIndex];
        if (next) next.focus();
    }
    // =========================================================================
    // RENDER HELPERS
    // =========================================================================
    private renderLabel(): TemplateResult {
        if (!this.hasSlot('Label')) return html``;
        return html`
<div class="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
${unsafeHTML(this.getSlotContent('Label'))}
</div>
`;
    }
    private renderLoading(): TemplateResult {
        return html`
<div
class="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-500 dark:text-slate-400"
>
${this.msg.loading}
</div>
`;
    }
    private renderEmpty(): TemplateResult {
        const content = this.hasSlot('Empty') ? this.getSlotContent('Empty') : this.msg.empty;
        return html`
<div
class="rounded-md border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-500 dark:text-slate-400"
>
${unsafeHTML(content)}
</div>
`;
    }
    private getToggleButtonClasses(disabled: boolean): string {
        return [
            'flex h-5 w-5 items-center justify-center rounded border transition',
            'border-slate-200 dark:border-slate-700',
            'bg-white dark:bg-slate-800',
            'text-slate-600 dark:text-slate-400',
            !disabled ? 'hover:bg-slate-50 dark:hover:bg-slate-700' : 'cursor-not-allowed',
            disabled ? 'opacity-50' : '',
            'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
        ]
            .filter(Boolean)
            .join(' ');
    }
    private getContentButtonClasses(disabled: boolean): string {
        return [
            'flex-1 text-left rounded-md px-2 py-1 text-sm transition',
            'text-slate-900 dark:text-slate-100',
            !disabled ? 'hover:bg-slate-50 dark:hover:bg-slate-700' : 'cursor-not-allowed',
            disabled ? 'opacity-50' : '',
            'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
        ]
            .filter(Boolean)
            .join(' ');
    }
    private renderChevron(expanded: boolean): TemplateResult {
        const rotation = expanded ? 'rotate-90' : '';
        return html`
<svg viewBox="0 0 20 20" class="h-3 w-3 ${rotation}">
${svg`<path d="M7 5l6 5-6 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>`}
</svg>
`;
    }
    private renderNode(node: Element, depth: number, path: string): TemplateResult {
        const children = this.getChildNodes(node);
        const hasChildren = children.length > 0;
        const expanded = hasChildren ? this.getNodeExpanded(node) : false;
        const disabled = this.isNodeDisabled(node);
        const labelHtml = this.getNodeLabelHtml(node);
        const indentStyle = `padding-left: ${depth * 1.25}rem;`;
        return html`
<div class="w-full">
<div
class="flex items-center gap-2"
style=${indentStyle}
role="treeitem"
aria-level=${String(depth + 1)}
aria-expanded=${ifDefined(hasChildren ? String(expanded) : undefined)}
aria-disabled=${disabled ? 'true' : 'false'}
>
${hasChildren
                ? html`
<button
type="button"
class="${this.getToggleButtonClasses(disabled)}"
@click=${(e: Event) => {
                        e.stopPropagation();
                        this.handleToggle(node);
                    }}
aria-label="Toggle"
>
${this.renderChevron(expanded)}
</button>
`
                : html`<span class="inline-flex h-5 w-5"></span>`}
<button
type="button"
class="${this.getContentButtonClasses(disabled)}"
data-node-content="true"
data-node-path=${path}
@click=${() => this.handleNodeClick(node)}
@keydown=${(e: KeyboardEvent) => this.handleNodeKeyDown(e, node, hasChildren, expanded)}
>
${unsafeHTML(labelHtml)}
</button>
</div>
${hasChildren && expanded
                ? html`
<div role="group" class="mt-1 space-y-1">
${children.map((child, index) =>
                    this.renderNode(child, depth + 1, `${path}.${index}`)
                )}
</div>
`
                : html``}
</div>
`;
    }
    private renderNodeList(nodes: Element[]): TemplateResult {
        return html`${nodes.map((node, index) => this.renderNode(node, 0, `${index}`))}`;
    }
    // =========================================================================
    // RENDER
    // =========================================================================
    render() {
        const lang = this.getMessageKey(messages);
        this.msg = messages[lang];
        if (this.loading) {
            return html`
<div class="w-full">
${this.renderLabel()}
${this.renderLoading()}
</div>
`;
        }
        const rootNodes = this.getRootNodes();
        if (!rootNodes.length) {
            return html`
<div class="w-full">
${this.renderLabel()}
${this.renderEmpty()}
</div>
`;
        }
        return html`
<div class="w-full">
${this.renderLabel()}
<div role="tree" class="space-y-1">
${this.renderNodeList(rootNodes)}
</div>
</div>
`;
    }
}
