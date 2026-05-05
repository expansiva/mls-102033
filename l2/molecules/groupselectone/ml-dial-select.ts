/// <mls fileReference="_102033_/l2/molecules/groupselectone/ml-dial-select.ts" enhancement="_102020_/l2/enhancementAura"/>
// =============================================================================
// DIAL SELECT MOLECULE
// =============================================================================
// Skill Group: groupSelectOne
// This molecule does NOT contain business logic.

import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
placeholder: 'Select an option',
empty: 'No options available',
loading: 'Loading...',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
en: message_en,
pt: {
placeholder: 'Selecione uma opção',
empty: 'Nenhuma opção disponível',
loading: 'Carregando...',
},
};
/// **collab_i18n_end**

type ParsedItem = {
value: string;
label: string;
disabled: boolean;
groupLabel?: string;
};

type ParsedGroup = {
label: string;
items: ParsedItem[];
};

@customElement('groupselectone--ml-dial-select')
export class DialSelectMolecule extends MoleculeAuraElement {
private msg: MessageType = messages.en;

// ===========================================================================
// SLOT TAGS
// ===========================================================================
slotTags = ['Label', 'Helper', 'Trigger', 'Item', 'Group', 'Empty'];

// ===========================================================================
// PROPERTIES — From Contract
// ===========================================================================
@propertyDataSource({ type: String })
value: string | null = null;

@propertyDataSource({ type: String })
error = '';

@propertyDataSource({ type: String })
name = '';

@propertyDataSource({ type: String })
placeholder = '';

@propertyDataSource({ type: Boolean, attribute: 'searchable' })
searchable = false;

@propertyDataSource({ type: Boolean, attribute: 'is-editing' })
isEditing = true;

@propertyDataSource({ type: Boolean })
disabled = false;

@propertyDataSource({ type: Boolean })
readonly = false;

@propertyDataSource({ type: Boolean })
required = false;

@propertyDataSource({ type: Boolean })
loading = false;

// ===========================================================================
// INTERNAL STATE
// ===========================================================================
@state()
private isOpen = false;

@state()
private searchQuery = '';

@state()
private activeIndex = -1;

private uid = `dial-${Math.random().toString(36).slice(2)}`;
private lastVisibleItems: ParsedItem[] = [];

// ===========================================================================
// LIFECYCLE
// ===========================================================================
createRenderRoot() {
return this;
}

connectedCallback() {
super.connectedCallback();
this.handleDocumentClick = this.handleDocumentClick.bind(this);
document.addEventListener('click', this.handleDocumentClick);
}

disconnectedCallback() {
document.removeEventListener('click', this.handleDocumentClick);
super.disconnectedCallback();
}

updated() {
if (!this.isOpen) return;
const items = this.lastVisibleItems;
if (items.length === 0) {
if (this.activeIndex !== -1) this.activeIndex = -1;
return;
}
const current = items[this.activeIndex];
if (this.activeIndex === -1 || !current || current.disabled) {
const selectedIndex = items.findIndex(i => i.value === this.value && !i.disabled);
const next = selectedIndex >= 0 ? selectedIndex : this.getNextEnabledIndex(items, -1, 1);
if (next !== this.activeIndex) this.activeIndex = next;
}
}

// ===========================================================================
// EVENT HANDLERS
// ===========================================================================
private handleDocumentClick(event: MouseEvent) {
if (!this.isOpen) return;
const target = event.target as Node | null;
if (target && !this.contains(target)) {
this.isOpen = false;
}
}

private handleTriggerClick() {
if (!this.isEditing || this.disabled || this.readonly || this.loading) return;
this.isOpen = !this.isOpen;
if (this.isOpen) {
this.activeIndex = this.getNextEnabledIndex(this.lastVisibleItems, -1, 1);
}
}

private handleKeyDown(event: KeyboardEvent) {
if (!this.isEditing || this.disabled || this.readonly || this.loading) return;
const items = this.lastVisibleItems;
if (event.key === 'Escape') {
this.isOpen = false;
this.activeIndex = -1;
event.preventDefault();
return;
}
if (!this.isOpen && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
this.isOpen = true;
this.activeIndex = this.getNextEnabledIndex(items, -1, 1);
event.preventDefault();
return;
}
if (!this.isOpen) return;
if (event.key === 'ArrowDown') {
this.activeIndex = this.getNextEnabledIndex(items, this.activeIndex, 1);
event.preventDefault();
return;
}
if (event.key === 'ArrowUp') {
this.activeIndex = this.getNextEnabledIndex(items, this.activeIndex, -1);
event.preventDefault();
return;
}
if (event.key === 'Enter') {
const item = items[this.activeIndex];
if (item && !item.disabled) {
this.selectItem(item);
}
event.preventDefault();
}
}

private handleSearchInput(event: Event) {
const input = event.target as HTMLInputElement;
this.searchQuery = input.value;
this.activeIndex = -1;
}

private selectItem(item: ParsedItem) {
if (this.disabled || this.readonly || this.loading || item.disabled) return;
this.value = item.value;
this.isOpen = false;
this.dispatchEvent(new CustomEvent('change', {
bubbles: true,
composed: true,
detail: { value: this.value }
}));
}

private handleFocus() {
if (!this.isEditing) return;
this.dispatchEvent(new CustomEvent('focus', { bubbles: true, composed: true }));
}

private handleBlur() {
if (!this.isEditing) return;
this.dispatchEvent(new CustomEvent('blur', { bubbles: true, composed: true }));
}

// ===========================================================================
// HELPERS
// ===========================================================================
private getPlainText(content: string): string {
return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

private getNextEnabledIndex(items: ParsedItem[], start: number, step: number): number {
if (items.length === 0) return -1;
let index = start;
for (let i = 0; i < items.length; i += 1) {
index = (index + step + items.length) % items.length;
if (!items[index].disabled) return index;
}
return -1;
}

private getTriggerClasses(hasError: boolean): string {
return [
'relative flex items-center justify-center rounded-full border transition focus:outline-none focus:ring-2',
'bg-white dark:bg-slate-900',
'text-slate-900 dark:text-slate-100',
hasError ? 'border-red-500 dark:border-red-400' : 'border-slate-200 dark:border-slate-700',
'focus:ring-sky-500 dark:focus:ring-sky-400',
(this.disabled || this.readonly || this.loading) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
].filter(Boolean).join(' ');
}

private getItemClasses(item: ParsedItem, isSelected: boolean): string {
return [
'absolute flex items-center justify-center rounded-full border text-[11px] leading-tight text-center transition',
'bg-white dark:bg-slate-800',
'text-slate-900 dark:text-slate-100',
isSelected
? 'border-sky-500 dark:border-sky-400 bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
: 'border-slate-200 dark:border-slate-700',
!item.disabled && !isSelected ? 'hover:bg-slate-50 dark:hover:bg-slate-700' : '',
item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
].filter(Boolean).join(' ');
}

// ===========================================================================
// RENDER
// ===========================================================================
render() {
const lang = this.getMessageKey(messages);
this.msg = messages[lang];

const labelId = `${this.uid}-label`;
const errorId = `${this.uid}-error`;
const panelId = `${this.uid}-panel`;

const standaloneItemEls = this.getSlots('Item').filter(el => !el.closest('Group'));
const standaloneItems: ParsedItem[] = standaloneItemEls.map(el => ({
value: el.getAttribute('value') || '',
label: el.innerHTML,
disabled: el.hasAttribute('disabled'),
}));

const groups: ParsedGroup[] = this.getSlots('Group').map(group => ({
label: group.getAttribute('label') || '',
items: Array.from(group.querySelectorAll('Item')).map(el => ({
value: el.getAttribute('value') || '',
label: el.innerHTML,
disabled: el.hasAttribute('disabled'),
})),
}));

const allItems = [
...standaloneItems,
...groups.flatMap(group => group.items)
];

const selectedItem = allItems.find(item => item.value === this.value) || null;
const selectedLabel = selectedItem ? selectedItem.label : null;
const hasError = (!!this.error && this.error.length > 0) || (this.required && !this.value);
const placeholderText = this.placeholder || this.msg.placeholder || '—';
const triggerContent = this.hasSlot('Trigger') ? this.getSlotContent('Trigger') : '';

const query = this.searchQuery.trim().toLowerCase();
const filterItem = (item: ParsedItem) => {
if (!query) return true;
return this.getPlainText(item.label).toLowerCase().includes(query);
};

const filteredStandalone = standaloneItems.filter(filterItem);
const filteredGroups = groups
.map(group => ({
label: group.label,
items: group.items.filter(filterItem)
}))
.filter(group => group.items.length > 0);

const rings = [
...filteredGroups.map(group => ({ label: group.label, items: group.items })),
...(filteredStandalone.length > 0 ? [{ label: '', items: filteredStandalone }] : [])
];

const visibleItems = rings.flatMap(ring => ring.items);
this.lastVisibleItems = visibleItems;

const ringCount = Math.max(1, rings.length || 1);
const baseRadius = 64;
const ringGap = 40;
const itemSize = 44;
const maxRadius = baseRadius + (ringCount - 1) * ringGap;
const dialSize = maxRadius * 2 + itemSize;

if (!this.isEditing) {
const viewTextClass = selectedLabel || triggerContent
? 'text-slate-900 dark:text-slate-100'
: 'text-slate-400 dark:text-slate-500';
return html`
<div class="w-full">
${this.hasSlot('Label')
? html`<div id=${labelId} class="mb-1 text-sm text-slate-600 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Label'))}</div>`
: nothing}
<div class="text-sm ${viewTextClass}">
${selectedLabel
? unsafeHTML(selectedLabel)
: triggerContent
? unsafeHTML(triggerContent)
: placeholderText}
</div>
${this.name
? html`<input type="hidden" name=${this.name} value=${this.value ?? ''} />`
: nothing}
</div>
`;
}

const renderCenterContent = () => {
if (this.loading) {
return html`<span class="text-xs text-slate-500 dark:text-slate-400">${this.msg.loading}</span>`;
}
if (selectedLabel) {
return html`<span class="text-xs text-slate-900 dark:text-slate-100">${unsafeHTML(selectedLabel)}</span>`;
}
if (triggerContent) {
return html`<span class="text-xs text-slate-900 dark:text-slate-100">${unsafeHTML(triggerContent)}</span>`;
}
return html`<span class="text-xs text-slate-400 dark:text-slate-500">${placeholderText}</span>`;
};

return html`
<div class="w-full">
${this.hasSlot('Label')
? html`<div id=${labelId} class="mb-2 text-sm text-slate-600 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Label'))}</div>`
: nothing}

<div class="flex flex-col items-center">
${this.searchable && this.isOpen
? html`
<input
class="mb-3 w-full max-w-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400"
placeholder=${this.msg.placeholder}
.value=${this.searchQuery}
@input=${this.handleSearchInput}
/>
`
: nothing}

<div class="relative mx-auto" style="width:${dialSize}px;height:${dialSize}px;">
${this.isOpen
? rings.map((ring, ringIndex) => {
const radius = baseRadius + ringIndex * ringGap;
return html`
<div
class="absolute rounded-full border border-slate-200 dark:border-slate-700"
style="width:${radius * 2}px;height:${radius * 2}px;left:50%;top:50%;transform:translate(-50%, -50%);"
></div>
${ring.items.map((item, itemIndex) => {
const angle = (360 / Math.max(1, ring.items.length)) * itemIndex - 90;
const isSelected = item.value === this.value;
const optionId = `${this.uid}-option-${ringIndex}-${itemIndex}`;
return html`
<button
id=${optionId}
role="option"
aria-selected=${isSelected ? 'true' : 'false'}
aria-disabled=${item.disabled ? 'true' : 'false'}
class=${this.getItemClasses(item, isSelected)}
style="width:${itemSize}px;height:${itemSize}px;left:50%;top:50%;transform:translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}px) rotate(${-angle}deg);"
@click=${() => this.selectItem(item)}
?disabled=${item.disabled}
>
<span class="px-1">${unsafeHTML(item.label)}</span>
</button>
`;
})}
`;
})
: nothing}

<button
class=${this.getTriggerClasses(hasError)}
style="width:84px;height:84px;left:50%;top:50%;transform:translate(-50%, -50%);"
role="combobox"
aria-expanded=${this.isOpen ? 'true' : 'false'}
aria-haspopup="listbox"
aria-controls=${panelId}
aria-labelledby=${ifDefined(this.hasSlot('Label') ? labelId : undefined)}
aria-describedby=${ifDefined(this.error ? errorId : undefined)}
aria-invalid=${hasError ? 'true' : 'false'}
aria-required=${this.required ? 'true' : 'false'}
@focus=${this.handleFocus}
@blur=${this.handleBlur}
@click=${this.handleTriggerClick}
@keydown=${this.handleKeyDown}
?disabled=${this.disabled || this.loading}
>
${renderCenterContent()}
</button>

${this.isOpen
? html`
<div
id=${panelId}
role="listbox"
class="sr-only"
aria-activedescendant=${ifDefined(this.activeIndex >= 0 ? `${this.uid}-option-0-${this.activeIndex}` : undefined)}
></div>
`
: nothing}
</div>
</div>

${this.name
? html`<input type="hidden" name=${this.name} value=${this.value ?? ''} />`
: nothing}

${this.error
? html`<p id=${errorId} class="mt-2 text-xs text-red-600 dark:text-red-400">${unsafeHTML(String(this.error))}</p>`
: !hasError && this.hasSlot('Helper')
? html`<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Helper'))}</p>`
: nothing}
</div>
`;
}
}
