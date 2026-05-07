/// <mls fileReference="_102033_/l2/molecules/groupselectmany/ml-dual-list-select.ts" enhancement="_102020_/l2/enhancementAura"/>
// =============================================================================
// ML DUAL LIST SELECT MOLECULE
// =============================================================================
// Skill Group: groupSelectMany (select + many)
// This molecule does NOT contain business logic.

import { html, TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators.js';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
placeholder: 'Select items',
empty: 'No items available',
loading: 'Loading...',
availableTitle: 'Available',
selectedTitle: 'Selected',
add: 'Add',
remove: 'Remove',
addAll: 'Add all',
removeAll: 'Remove all',
searchPlaceholder: 'Search items',
noSelection: '—',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
en: message_en,
pt: {
placeholder: 'Selecione itens',
empty: 'Nenhum item disponível',
loading: 'Carregando...',
availableTitle: 'Disponíveis',
selectedTitle: 'Selecionados',
add: 'Adicionar',
remove: 'Remover',
addAll: 'Adicionar todos',
removeAll: 'Remover todos',
searchPlaceholder: 'Buscar itens',
noSelection: '—',
},
};
/// **collab_i18n_end**

type ParsedItem = {
value: string;
labelHtml: string;
labelText: string;
disabled: boolean;
groupLabel: string | null;
};

type GroupBlock = {
label: string | null;
items: ParsedItem[];
};

@customElement('groupselectmany--ml-dual-list-select')
export class MlDualListSelectMolecule extends MoleculeAuraElement {
private msg: MessageType = messages.en;
private uid = `ml-dual-${Math.random().toString(36).slice(2, 9)}`;
// ===========================================================================
// SLOT TAGS
// ==========================================================================='
slotTags = ['Label', 'Helper', 'Trigger', 'Item', 'Group', 'Empty'];
// ===========================================================================
// PROPERTIES — From Contract
// ==========================================================================='
@propertyDataSource({ type: String })
value: string = '';
@propertyDataSource({ type: String })
error: string = '';
@propertyDataSource({ type: String })
name: string = '';
@propertyDataSource({ type: String })
placeholder: string = '';
@propertyDataSource({ type: Boolean })
searchable: boolean = false;
@propertyDataSource({ type: Number, attribute: 'min-selection' })
minSelection: number = 0;
@propertyDataSource({ type: Number, attribute: 'max-selection' })
maxSelection: number = 0;
@propertyDataSource({ type: Boolean, attribute: 'is-editing' })
isEditing: boolean = true;
@propertyDataSource({ type: Boolean })
disabled: boolean = false;
@propertyDataSource({ type: Boolean })
readonly: boolean = false;
@propertyDataSource({ type: Boolean })
required: boolean = false;
@propertyDataSource({ type: Boolean })
loading: boolean = false;
// ===========================================================================
// INTERNAL STATE
// ==========================================================================='
@state()
private searchQuery: string = '';
@state()
private hasFocus: boolean = false;
// ===========================================================================
// EVENT HANDLERS
// ==========================================================================='
private handleAddItem(value: string) {
if (!this.isEditing || this.isInteractionBlocked()) return;
const selectedValues = this.getSelectedValues();
if (selectedValues.includes(value)) return;
if (!this.canAddMore(selectedValues.length)) return;
const nextValues = [...selectedValues, value];
this.updateValue(nextValues);
}

private handleRemoveItem(value: string) {
if (!this.isEditing || this.isInteractionBlocked()) return;
const selectedValues = this.getSelectedValues();
if (!selectedValues.includes(value)) return;
const minSelection = this.getMinSelection();
if (selectedValues.length - 1 < minSelection) return;
const nextValues = selectedValues.filter((item) => item !== value);
this.updateValue(nextValues);
}

private handleAddAll() {
if (!this.isEditing || this.isInteractionBlocked()) return;
const items = this.getParsedItems();
const selectedValues = this.getSelectedValues();
const selectedSet = new Set(selectedValues);
let remaining = this.getMaxSelection() > 0 ? this.getMaxSelection() - selectedValues.length : Infinity;
if (remaining <= 0) return;
const toAdd: string[] = [];
for (const item of items) {
if (item.disabled || selectedSet.has(item.value)) continue;
if (remaining <= 0) break;
toAdd.push(item.value);
remaining -= 1;
}
if (toAdd.length === 0) return;
this.updateValue([...selectedValues, ...toAdd]);
}

private handleRemoveAll() {
if (!this.isEditing || this.isInteractionBlocked()) return;
const items = this.getParsedItems();
const selectedValues = this.getSelectedValues();
const minSelection = this.getMinSelection();
if (selectedValues.length <= minSelection) return;
const disabledMap = new Set(items.filter((item) => item.disabled).map((item) => item.value));
const nextValues = [...selectedValues];
for (let i = nextValues.length - 1; i >= 0; i -= 1) {
if (nextValues.length <= minSelection) break;
const value = nextValues[i];
if (disabledMap.has(value)) continue;
nextValues.splice(i, 1);
}
if (nextValues.length === selectedValues.length) return;
this.updateValue(nextValues);
}

private handleSearchInput(event: Event) {
const input = event.target as HTMLInputElement;
this.searchQuery = input.value;
}

private handleFocusIn() {
if (!this.isEditing) return;
if (this.hasFocus) return;
this.hasFocus = true;
this.dispatchEvent(new CustomEvent('focus', { bubbles: true, composed: true }));
}

private handleFocusOut(event: FocusEvent) {
if (!this.isEditing) return;
const related = event.relatedTarget as Node | null;
if (related && this.contains(related)) return;
if (!this.hasFocus) return;
this.hasFocus = false;
this.dispatchEvent(new CustomEvent('blur', { bubbles: true, composed: true }));
}
// ===========================================================================
// HELPERS
// ==========================================================================='
private isInteractionBlocked(): boolean {
return this.disabled || this.readonly || this.loading;
}

private getMinSelection(): number {
return Math.max(this.minSelection, this.required ? 1 : 0);
}

private getMaxSelection(): number {
return this.maxSelection > 0 ? this.maxSelection : 0;
}

private canAddMore(selectedCount: number): boolean {
const maxSelection = this.getMaxSelection();
if (maxSelection === 0) return true;
return selectedCount < maxSelection;
}

private updateValue(nextValues: string[]) {
this.value = nextValues.join(',');
this.dispatchEvent(
new CustomEvent('change', {
bubbles: true,
composed: true,
detail: { value: this.value },
})
);
}

private getSelectedValues(): string[] {
if (!this.value) return [];
return this.value
.split(',')
.map((val) => val.trim())
.filter((val) => val.length > 0);
}

private mapItemElement(itemEl: Element, groupLabel: string | null): ParsedItem | null {
const value = itemEl.getAttribute('value');
if (!value) return null;
const labelHtml = (itemEl.innerHTML || '').trim() || value;
const labelText = (itemEl.textContent || value).trim();
const disabled = itemEl.hasAttribute('disabled');
return { value, labelHtml, labelText, disabled, groupLabel };
}

private getParsedItems(): ParsedItem[] {
const items: ParsedItem[] = [];
const groupedElements = new Set<Element>();
const groups = this.getSlots('Group');
for (const group of groups) {
const groupLabel = group.getAttribute('label') || '';
const itemEls = Array.from(group.querySelectorAll('Item'));
for (const itemEl of itemEls) {
const parsed = this.mapItemElement(itemEl, groupLabel || null);
if (parsed) items.push(parsed);
groupedElements.add(itemEl);
}
}
const standaloneItems = this.getSlots('Item').filter((item) => {
if (groupedElements.has(item)) return false;
return !item.closest('Group');
});
for (const item of standaloneItems) {
const parsed = this.mapItemElement(item, null);
if (parsed) items.push(parsed);
}
return items;
}

private getFilteredItems(items: ParsedItem[]): ParsedItem[] {
const query = this.searchQuery.trim().toLowerCase();
if (!query) return items;
return items.filter((item) => item.labelText.toLowerCase().includes(query));
}

private buildGroups(items: ParsedItem[], hasGroups: boolean): GroupBlock[] {
if (!hasGroups) {
return [{ label: null, items }];
}
const groups: GroupBlock[] = [];
const groupMap = new Map<string, GroupBlock>();
for (const item of items) {
const key = item.groupLabel || '__ungrouped__';
if (!groupMap.has(key)) {
const block: GroupBlock = { label: item.groupLabel, items: [] };
groupMap.set(key, block);
groups.push(block);
}
(groupMap.get(key) as GroupBlock).items.push(item);
}
return groups;
}

private getContainerClasses(hasError: boolean): string {
return [
'w-full rounded-lg border p-4 transition',
'bg-white dark:bg-slate-800',
hasError ? 'border-red-500 dark:border-red-400' : 'border-slate-200 dark:border-slate-700',
'focus-within:ring-2 focus-within:ring-sky-500 dark:focus-within:ring-sky-400',
this.isInteractionBlocked() ? 'opacity-50' : '',
].filter(Boolean).join(' ');
}

private getPanelClasses(): string {
return [
'rounded-lg border p-3',
'bg-white dark:bg-slate-900',
'border-slate-200 dark:border-slate-700',
].join(' ');
}

private getItemRowClasses(isSelectedList: boolean, disabled: boolean): string {
return [
'flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm transition',
isSelectedList
? 'bg-sky-50 dark:bg-sky-900/40 border-sky-500 dark:border-sky-400 text-sky-700 dark:text-sky-300'
: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100',
!disabled ? 'hover:bg-slate-100 dark:hover:bg-slate-800' : '',
disabled ? 'opacity-50 cursor-not-allowed' : '',
].filter(Boolean).join(' ');
}

private getActionButtonClasses(disabled: boolean): string {
return [
'rounded-md border px-2 py-1 text-xs font-medium transition',
'border-slate-200 dark:border-slate-700',
'bg-white dark:bg-slate-800',
'text-slate-700 dark:text-slate-200',
!disabled ? 'hover:bg-slate-50 dark:hover:bg-slate-700' : '',
disabled ? 'opacity-50 cursor-not-allowed' : '',
].filter(Boolean).join(' ');
}

private renderLabel(): TemplateResult {
if (!this.hasSlot('Label')) return html``;
return html`
<label id="${this.uid}-label" class="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
${unsafeHTML(this.getSlotContent('Label'))}
</label>
`;
}

private renderEmpty(): TemplateResult {
const content = this.getSlotContent('Empty') || this.msg.empty;
return html`
<div class="text-sm text-slate-500 dark:text-slate-400">
${unsafeHTML(content)}
</div>
`;
}

private renderSearch(): TemplateResult {
return html`
<div class="mb-3">
<input
class="w-full rounded-md border px-3 py-2 text-sm transition bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400"
.type="text"
placeholder="${this.msg.searchPlaceholder}"
.value="${this.searchQuery}"
@input="${this.handleSearchInput}"
?disabled="${this.isInteractionBlocked()}"
/>
</div>
`;
}

private renderFeedback(): TemplateResult {
if (!this.isEditing) return html``;
if (this.error) {
return html`
<p id="${this.uid}-error" class="mt-2 text-xs text-red-600 dark:text-red-400">
${unsafeHTML(String(this.error))}
</p>
`;
}
if (this.hasSlot('Helper')) {
return html`
<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
${unsafeHTML(this.getSlotContent('Helper'))}
</p>
`;
}
return html``;
}

private renderList(
items: ParsedItem[],
selectedSet: Set<string>,
selectedCount: number,
minSelection: number,
maxSelection: number,
hasGroups: boolean,
listTitle: string,
isSelectedList: boolean
): TemplateResult {
const groups = this.buildGroups(items, hasGroups);
return html`
<div class="${this.getPanelClasses()}" role="listbox" aria-multiselectable="true">
<div class="mb-2 flex items-center justify-between">
<h4 class="text-sm font-medium text-slate-700 dark:text-slate-300">${listTitle}</h4>
<span class="text-xs text-slate-500 dark:text-slate-400">${items.length}</span>
</div>
${items.length === 0
? this.renderEmpty()
: html`
<div class="space-y-2">
${groups.map((group) => html`
<div class="space-y-2">
${hasGroups && group.label
? html`<div class="text-xs font-semibold text-slate-500 dark:text-slate-400">${group.label}</div>`
: html``}
${group.items.map((item) => {
const isSelected = selectedSet.has(item.value);
const itemDisabled = this.isInteractionBlocked() || item.disabled;
const addDisabled = itemDisabled || !this.canAddMore(selectedCount);
const removeDisabled = itemDisabled || selectedCount - 1 < minSelection;
const isActionDisabled = isSelectedList ? removeDisabled : addDisabled;
const rowClasses = this.getItemRowClasses(isSelectedList, itemDisabled || isActionDisabled);
const actionLabel = isSelectedList ? this.msg.remove : this.msg.add;
return html`
<div class="${rowClasses}" role="option" aria-selected="${isSelected}" aria-disabled="${itemDisabled}">
<div class="flex-1 text-sm">${unsafeHTML(item.labelHtml)}</div>
<button
class="${this.getActionButtonClasses(isActionDisabled)}"
type="button"
?disabled="${isActionDisabled}"
aria-label="${actionLabel}"
@click="${() => (isSelectedList ? this.handleRemoveItem(item.value) : this.handleAddItem(item.value))}"
>
${actionLabel}
</button>
</div>
`;
})}
</div>
`)}
</div>
`}
</div>
`;
}

private renderActionColumn(
availableItems: ParsedItem[],
selectedItems: ParsedItem[],
selectedCount: number,
minSelection: number
): TemplateResult {
const canAddAll =
!this.isInteractionBlocked() &&
availableItems.some((item) => !item.disabled) &&
this.canAddMore(selectedCount);
const canRemoveAll =
!this.isInteractionBlocked() &&
selectedCount > minSelection &&
selectedItems.some((item) => !item.disabled);
return html`
<div class="flex flex-col items-center justify-center gap-2">
<button
class="${this.getActionButtonClasses(!canAddAll)}"
type="button"
?disabled="${!canAddAll}"
@click="${this.handleAddAll}"
>
${this.msg.addAll}
</button>
<button
class="${this.getActionButtonClasses(!canRemoveAll)}"
type="button"
?disabled="${!canRemoveAll}"
@click="${this.handleRemoveAll}"
>
${this.msg.removeAll}
</button>
</div>
`;
}

private renderViewMode(): TemplateResult {
const items = this.getParsedItems();
const selectedValues = this.getSelectedValues();
const selectedSet = new Set(selectedValues);
const selectedItems = items.filter((item) => selectedSet.has(item.value));
const placeholder = this.placeholder || this.msg.placeholder || this.msg.noSelection;
return html`
<div class="w-full">
${this.renderLabel()}
${selectedItems.length === 0
? html`<div class="text-sm text-slate-500 dark:text-slate-400">${placeholder || this.msg.noSelection}</div>`
: html`
<div class="flex flex-wrap gap-2">
${selectedItems.map(
(item) => html`
<span class="rounded-md border px-2 py-1 text-xs bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
${unsafeHTML(item.labelHtml)}
</span>
`
)}
</div>
`}
</div>
`;
}
// ===========================================================================
// RENDER
// ==========================================================================='
render() {
const lang = this.getMessageKey(messages);
this.msg = messages[lang];
if (!this.isEditing) {
return this.renderViewMode();
}
const items = this.getParsedItems();
const filteredItems = this.getFilteredItems(items);
const selectedValues = this.getSelectedValues();
const selectedSet = new Set(selectedValues);
const selectedItems = filteredItems.filter((item) => selectedSet.has(item.value));
const availableItems = filteredItems.filter((item) => !selectedSet.has(item.value));
const hasGroups = items.some((item) => item.groupLabel);
const minSelection = this.getMinSelection();
const maxSelection = this.getMaxSelection();
const placeholder = this.placeholder || this.msg.placeholder;
return html`
<div
class="${this.getContainerClasses(!!this.error)}"
role="group"
aria-labelledby="${this.hasSlot('Label') ? `${this.uid}-label` : ''}"
aria-describedby="${this.error ? `${this.uid}-error` : ''}"
aria-invalid="${this.error ? 'true' : 'false'}"
aria-required="${this.required ? 'true' : 'false'}"
aria-busy="${this.loading ? 'true' : 'false'}"
@focusin="${this.handleFocusIn}"
@focusout="${this.handleFocusOut}"
>
${this.renderLabel()}
${this.loading
? html`<div class="mb-2 text-xs text-slate-500 dark:text-slate-400">${this.msg.loading}</div>`
: html``}
${this.searchable ? this.renderSearch() : html``}
${!selectedValues.length && placeholder
? html`<div class="mb-3 text-xs text-slate-400 dark:text-slate-500">${placeholder}</div>`
: html``}
<div class="grid grid-cols-1 items-start gap-3 md:grid-cols-[1fr_auto_1fr]">
${this.renderList(
availableItems,
selectedSet,
selectedValues.length,
minSelection,
maxSelection,
hasGroups,
this.msg.availableTitle,
false
)}
${this.renderActionColumn(availableItems, selectedItems, selectedValues.length, minSelection)}
${this.renderList(
selectedItems,
selectedSet,
selectedValues.length,
minSelection,
maxSelection,
hasGroups,
this.msg.selectedTitle,
true
)}
</div>
${this.renderFeedback()}
${this.name
? html`<input type="hidden" name="${this.name}" value="${this.value}" />`
: html``}
</div>
`;
}
}
