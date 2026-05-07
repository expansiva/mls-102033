/// <mls fileReference="_102033_/l2/molecules/groupviewhierarchy/ml-hierarchy-orgchart.ts" enhancement="_102020_/l2/enhancementAura"/>
// =============================================================================
// HIERARCHY ORGCHART MOLECULE
// =============================================================================
// Skill Group: view + hierarchy
// This molecule does NOT contain business logic.
import { html, svg, TemplateResult, nothing} from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators.js';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
empty: 'No hierarchy available',
loading: 'Loading...',
expand: 'Expand',
collapse: 'Collapse',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
en: message_en,
};
/// **collab_i18n_end**
// =============================================================================
// TYPES
// =============================================================================
type NodeModel = {
element: Element;
path: string;
parentPath: string | null;
depth: number;
value: string | null;
disabled: boolean;
expanded: boolean;
hasChildren: boolean;
labelHtml: string;
children: NodeModel[];
};
@customElement('groupviewhierarchy--ml-hierarchy-orgchart')
export class HierarchyOrgchartMolecule extends MoleculeAuraElement {
private msg: MessageType = messages.en;
// ===========================================================================
// SLOT TAGS
// ==========================================================================
slotTags = ['Label', 'Node', 'Empty'];
// ===========================================================================
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
// ===========================================================================
// INTERNAL STATE
// ==========================================================================
@state()
private expandedState: Record<string, boolean> = {};
@state()
private focusedPath: string | null = null;
// ===========================================================================
// LIFECYCLE
// ==========================================================================
firstUpdated() {
const tree = this.buildTree();
if (tree.length > 0 && !this.focusedPath) {
this.focusedPath = tree[0].path;
}
}
updated() {
this.ensureFocusPath();
}
// ===========================================================================
// TREE BUILDING
// ==========================================================================
private buildTree(): NodeModel[] {
const roots = this.getRootNodeElements();
return roots.map((node, index) => this.createNodeModel(node, `${index}`, null, 0));
}
private createNodeModel(node: Element, path: string, parentPath: string | null, depth: number): NodeModel {
const childrenElements = this.getChildNodeElements(node);
const hasChildren = childrenElements.length > 0;
const expanded = this.getExpandedForPath(path, node);
const labelHtml = this.getNodeLabelHtml(node);
const value = node.getAttribute('value');
const disabled = node.hasAttribute('disabled');
const children = childrenElements.map((child, index) =>
this.createNodeModel(child, `${path}-${index}`, path, depth + 1)
);
return {
element: node,
path,
parentPath,
depth,
value,
disabled,
expanded,
hasChildren,
labelHtml,
children,
};
}
private getRootNodeElements(): Element[] {
const nodes = this.getSlots('Node');
return nodes.filter((node) => {
const parent = node.parentElement;
return !parent || parent.tagName.toLowerCase() !== 'node';
});
}
private getChildNodeElements(node: Element): Element[] {
return Array.from(node.children).filter((child) => child.tagName.toLowerCase() === 'node');
}
private getNodeLabelHtml(node: Element): string {
const clone = node.cloneNode(true) as Element;
const nested = Array.from(clone.querySelectorAll('Node'));
nested.forEach((n) => n.remove());
return clone.innerHTML.trim();
}
private getExpandedForPath(path: string, node: Element): boolean {
if (Object.prototype.hasOwnProperty.call(this.expandedState, path)) {
return this.expandedState[path];
}
if (this.expandAll) return true;
return node.hasAttribute('expanded');
}
// ===========================================================================
// FOCUS MANAGEMENT
// ==========================================================================
private ensureFocusPath() {
const buttons = Array.from(this.querySelectorAll('.gvh-node-button')) as HTMLElement[];
const paths = buttons.map((b) => b.dataset.path || '');
if (paths.length === 0) return;
if (!this.focusedPath || !paths.includes(this.focusedPath)) {
this.focusedPath = paths[0];
}
}
private focusButton(button: HTMLElement | null) {
if (!button) return;
this.focusedPath = button.dataset.path || null;
button.focus();
}
// ===========================================================================
// EVENT HANDLERS
// ==========================================================================
private handleNodeClick(event: Event, model: NodeModel) {
if (this.disabled || model.disabled) return;
const target = event.currentTarget as HTMLElement;
this.focusedPath = target.dataset.path || model.path;
this.dispatchEvent(new CustomEvent('nodeClick', {
bubbles: true,
composed: true,
detail: { value: model.value || null },
}));
}
private handleToggleClick(event: Event, model: NodeModel) {
event.stopPropagation();
if (this.disabled || model.disabled) return;
const nextExpanded = !model.expanded;
this.applyToggle(model.path, model.value, nextExpanded, model.parentPath);
}
private applyToggle(path: string, value: string | null, expanded: boolean, parentPath: string | null) {
const next = { ...this.expandedState, [path]: expanded };
if (!this.multiple && expanded) {
const parentKey = parentPath ?? '';
const siblings = Array.from(this.querySelectorAll(`.gvh-node-button[data-parent="${parentKey}"]`)) as HTMLElement[];
siblings.forEach((el) => {
const siblingPath = el.dataset.path;
if (siblingPath && siblingPath !== path) {
next[siblingPath] = false;
}
});
}
this.expandedState = next;
this.dispatchEvent(new CustomEvent('toggle', {
bubbles: true,
composed: true,
detail: { value: value || null, expanded },
}));
}
private handleKeyDown(event: KeyboardEvent) {
if (this.disabled) return;
const target = event.target as HTMLElement;
const button = target.closest('.gvh-node-button') as HTMLElement | null;
if (!button) return;
const buttons = Array.from(this.querySelectorAll('.gvh-node-button')) as HTMLElement[];
const currentIndex = buttons.indexOf(button);
const hasChildren = button.dataset.hasChildren === 'true';
const expanded = button.dataset.expanded === 'true';
const path = button.dataset.path || '';
const value = button.dataset.value || null;
const parentPath = button.dataset.parent || null;
const isDisabled = button.getAttribute('aria-disabled') === 'true';
if (event.key === 'ArrowDown') {
event.preventDefault();
this.focusButton(buttons[currentIndex + 1] || null);
return;
}
if (event.key === 'ArrowUp') {
event.preventDefault();
this.focusButton(buttons[currentIndex - 1] || null);
return;
}
if (event.key === 'ArrowRight') {
event.preventDefault();
if (!isDisabled && hasChildren && !expanded) {
this.applyToggle(path, value, true, parentPath);
return;
}
this.focusButton(buttons[currentIndex + 1] || null);
return;
}
if (event.key === 'ArrowLeft') {
event.preventDefault();
if (!isDisabled && hasChildren && expanded) {
this.applyToggle(path, value, false, parentPath);
return;
}
const parent = parentPath
? (this.querySelector(`.gvh-node-button[data-path="${parentPath}"]`) as HTMLElement | null)
: null;
this.focusButton(parent);
return;
}
if (event.key === 'Enter') {
event.preventDefault();
if (isDisabled) return;
if (hasChildren) {
this.applyToggle(path, value, !expanded, parentPath);
return;
}
this.dispatchEvent(new CustomEvent('nodeClick', {
bubbles: true,
composed: true,
detail: { value },
}));
}
}
// ===========================================================================
// RENDER
// ==========================================================================
render() {
const lang = this.getMessageKey(messages);
this.msg = messages[lang];
const labelContent = this.hasSlot('Label') ? this.getSlotContent('Label') : '';
const tree = this.buildTree();
return html`
<div class="w-full text-sm text-slate-900 dark:text-slate-100" role="tree" @keydown=${this.handleKeyDown}>
${labelContent
? html`<div class="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">${unsafeHTML(labelContent)}</div>`
: nothing}
${this.loading
? this.renderLoading()
: tree.length === 0
? this.renderEmpty()
: html`<div class="space-y-3">${tree.map((node) => this.renderNode(node))}</div>`}
</div>
`;
}
private renderLoading(): TemplateResult {
return html`
<div class="space-y-3" role="status" aria-live="polite">
<div class="h-4 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
<div class="h-4 w-56 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
<div class="h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
<div class="text-xs text-slate-500 dark:text-slate-400">${this.msg.loading}</div>
</div>
`;
}
private renderEmpty(): TemplateResult {
const emptyContent = this.hasSlot('Empty') ? this.getSlotContent('Empty') : this.msg.empty;
return html`<div class="text-sm text-slate-500 dark:text-slate-400">${unsafeHTML(emptyContent)}</div>`;
}
private renderNode(model: NodeModel): TemplateResult {
const nodeDisabled = this.disabled || model.disabled;
const buttonClasses = this.getNodeButtonClasses(nodeDisabled);
const toggleClasses = this.getToggleButtonClasses(nodeDisabled);
const connectorClasses = [
'absolute -left-4 top-1/2 w-4 border-t',
'border-slate-200 dark:border-slate-700',
].join(' ');
return html`
<div class="gvh-node-row">
<div class="relative flex items-center gap-2">
${model.depth > 0 ? html`<span class="${connectorClasses}"></span>` : nothing}
${model.hasChildren
? html`
<button
class="${toggleClasses}"
?disabled=${nodeDisabled}
aria-label=${model.expanded ? this.msg.collapse : this.msg.expand}
@click=${(e: Event) => this.handleToggleClick(e, model)}
type="button"
>
${this.renderChevron(model.expanded)}
</button>
`
: html`<span class="inline-block w-6"></span>`}
<button
class="${buttonClasses} gvh-node-button"
data-path=${model.path}
data-parent=${model.parentPath ?? ''}
data-value=${ifDefined(model.value ?? undefined)}
data-has-children=${model.hasChildren ? 'true' : 'false'}
data-expanded=${model.expanded ? 'true' : 'false'}
role="treeitem"
aria-disabled=${nodeDisabled ? 'true' : 'false'}
aria-expanded=${ifDefined(model.hasChildren ? String(model.expanded) : undefined)}
tabindex=${this.focusedPath === model.path ? '0' : '-1'}
@click=${(e: Event) => this.handleNodeClick(e, model)}
@focus=${() => (this.focusedPath = model.path)}
type="button"
>
${unsafeHTML(model.labelHtml)}
</button>
</div>
${model.hasChildren && model.expanded
? html`
<div role="group" class="ml-6 space-y-3 border-l border-slate-200 dark:border-slate-700 pl-4">
${model.children.map((child) => this.renderNode(child))}
</div>
`
: nothing}
</div>
`;
}
private renderChevron(expanded: boolean): TemplateResult {
const iconClasses = [
'h-4 w-4 text-slate-600 dark:text-slate-300 transition-transform',
expanded ? 'rotate-90' : 'rotate-0',
].join(' ');
return html`
<svg class="${iconClasses}" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
${svg`<path d="M7.25 4.75L12.5 10l-5.25 5.25-1.5-1.5L9.5 10 5.75 6.25z" />`}
</svg>
`;
}
private getNodeButtonClasses(nodeDisabled: boolean): string {
return [
'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm border transition',
'bg-white dark:bg-slate-800',
'text-slate-900 dark:text-slate-100',
'border-slate-200 dark:border-slate-700',
'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
nodeDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 dark:hover:bg-slate-700',
].filter(Boolean).join(' ');
}
private getToggleButtonClasses(nodeDisabled: boolean): string {
return [
'flex h-6 w-6 items-center justify-center rounded-md transition',
'bg-slate-50 dark:bg-slate-900',
'border border-slate-200 dark:border-slate-700',
'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
nodeDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-slate-700',
].filter(Boolean).join(' ');
}
}
