/// <mls fileReference="_102033_/l2/molecules/groupentermoney/ml-enter-money-minimal.ts" enhancement="_102020_/l2/enhancementAura" />
// =============================================================================
// ENTER MONEY MINIMAL MOLECULE
// =============================================================================
// Skill Group: groupEnterMoney
// This molecule does NOT contain business logic.
import { html, TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators.js';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

@customElement('groupentermoney--ml-enter-money-minimal')
export class EnterMoneyMinimalMolecule extends MoleculeAuraElement {
// ===========================================================================
// SLOT TAGS
// ===========================================================================
slotTags = ['Label', 'Helper'];

// ===========================================================================
// PROPERTIES — From Contract
// ===========================================================================
@propertyDataSource({ type: Number })
value: number | null = null;

@propertyDataSource({ type: String })
error: string = '';

@propertyDataSource({ type: String })
name: string = '';

@propertyDataSource({ type: String })
currency: string = 'USD';

@propertyDataSource({ type: String })
locale: string = '';

@propertyDataSource({ type: Number, attribute: 'decimals' })
decimals: number = 2;

@propertyDataSource({ type: Number })
min: number | null = null;

@propertyDataSource({ type: Number })
max: number | null = null;

@propertyDataSource({ type: Boolean, attribute: 'show-symbol' })
showSymbol: boolean = true;

@propertyDataSource({ type: String })
placeholder: string = '';

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
// ===========================================================================
@state()
private rawValue: string = '';

@state()
private uid: string = `em-${Math.random().toString(36).slice(2, 9)}`;

// ===========================================================================
// LIFECYCLE
// ===========================================================================
firstUpdated() {
this.rawValue = this.formatToRaw(this.value);
}

// ===========================================================================
// STATE CHANGE HANDLER — for derived rawValue
// ===========================================================================
handleIcaStateChange(key: string, value: any) {
const valueAttr = this.getAttribute('value');
const localeAttr = this.getAttribute('locale');
const decimalsAttr = this.getAttribute('decimals');
if (valueAttr === `{{${key}}}` || localeAttr === `{{${key}}}` || decimalsAttr === `{{${key}}}`) {
this.rawValue = this.formatToRaw(this.value);
}
this.requestUpdate();
}

// ===========================================================================
// EVENT HANDLERS
// ===========================================================================
private handleFocus(e: Event) {
if (!this.isEditing || this.disabled || this.readonly || this.loading) return;
const input = e.target as HTMLInputElement;
input.select();
this.dispatchEvent(new CustomEvent('focus', { bubbles: true, composed: true }));
}

private handleInput(e: Event) {
if (!this.isEditing || this.disabled || this.readonly || this.loading) return;
const input = e.target as HTMLInputElement;
this.rawValue = input.value;
this.value = this.parseLocaleNumber(this.rawValue);
this.dispatchEvent(new CustomEvent('input', {
bubbles: true,
composed: true,
detail: { value: this.value },
}));
}

private handleBlur() {
if (!this.isEditing || this.disabled || this.readonly || this.loading) return;
const trimmed = this.rawValue.trim();
if (trimmed === '') {
this.value = null;
this.rawValue = '';
} else {
const parsed = this.parseLocaleNumber(this.rawValue);
if (parsed === null) {
this.value = null;
this.rawValue = '';
} else {
const clamped = this.clampValue(parsed);
this.value = clamped;
this.rawValue = this.formatToRaw(clamped);
}
}
this.dispatchEvent(new CustomEvent('change', {
bubbles: true,
composed: true,
detail: { value: this.value },
}));
this.dispatchEvent(new CustomEvent('blur', { bubbles: true, composed: true }));
}

// ===========================================================================
// HELPERS
// ===========================================================================
private getSeparators(): { decimal: string; group: string } {
if (!this.locale) return { decimal: '.', group: '' };
const parts = new Intl.NumberFormat(this.locale).formatToParts(1000.1);
const decimal = parts.find((p) => p.type === 'decimal')?.value || '.';
const group = parts.find((p) => p.type === 'group')?.value || ',';
return { decimal, group };
}

private parseLocaleNumber(raw: string): number | null {
if (!raw) return null;
const { decimal, group } = this.getSeparators();
const escDecimal = decimal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escGroup = group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let cleaned = raw;
if (group) cleaned = cleaned.replace(new RegExp(escGroup, 'g'), '');
cleaned = cleaned.replace(new RegExp(`[^0-9${escDecimal}-]`, 'g'), '');
if (decimal !== '.') cleaned = cleaned.replace(new RegExp(escDecimal, 'g'), '.');
const num = parseFloat(cleaned);
if (isNaN(num)) return null;
const fixed = Number(num.toFixed(this.decimals));
return isNaN(fixed) ? null : fixed;
}

private formatToRaw(value: number | null): string {
if (value === null || value === undefined) return '';
return new Intl.NumberFormat(this.locale || undefined, {
style: 'decimal',
minimumFractionDigits: this.decimals,
maximumFractionDigits: this.decimals,
}).format(value);
}

private clampValue(value: number): number {
let next = value;
if (this.min !== null && this.min !== undefined && next < this.min) next = this.min;
if (this.max !== null && this.max !== undefined && next > this.max) next = this.max;
return next;
}

private getCurrencySymbol(): string {
try {
const parts = new Intl.NumberFormat(this.locale || undefined, {
style: 'currency',
currency: this.currency,
currencyDisplay: 'symbol',
minimumFractionDigits: 0,
maximumFractionDigits: 0,
}).formatToParts(0);
const symbol = parts.find((p) => p.type === 'currency')?.value;
return symbol || this.currency;
} catch {
return this.currency;
}
}

private getAriaLabel(): string {
const label = this.stripHtml(this.getSlotContent('Label'));
const base = label || 'Amount';
return `${base} ${this.currency}`;
}

private stripHtml(content: string): string {
return content.replace(/<[^>]*>/g, '').trim();
}

private getContainerClasses(): string {
return [
'w-full flex flex-col gap-1',
this.disabled || this.loading ? 'opacity-50' : '',
].filter(Boolean).join(' ');
}

private getInputClasses(isInvalid: boolean): string {
return [
'w-full rounded-md px-3 py-2 text-sm border transition',
'bg-white dark:bg-slate-900',
'text-slate-900 dark:text-slate-100',
'placeholder:text-slate-400 dark:placeholder:text-slate-500',
isInvalid
? 'border-red-500 dark:border-red-400'
: 'border-slate-200 dark:border-slate-700',
'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
this.readonly ? 'bg-slate-50 dark:bg-slate-900' : '',
].filter(Boolean).join(' ');
}

private getSymbolClasses(): string {
return [
'px-2 text-sm',
'text-slate-600 dark:text-slate-400',
].join(' ');
}

// ===========================================================================
// RENDER
// ===========================================================================
render() {
if (!this.isEditing) return this.renderViewMode();
return this.renderEditMode();
}

private renderViewMode(): TemplateResult {
const labelId = `${this.uid}-label`;
const valueText = this.value === null ? '—' : this.formatToRaw(this.value);
return html`
<div class="${this.getContainerClasses()}">
${this.renderLabel(labelId)}
<div class="flex items-center gap-1 text-sm text-slate-900 dark:text-slate-100">
${this.showSymbol && this.value !== null ? html`<span class="${this.getSymbolClasses()}">${this.getCurrencySymbol()}</span>` : html``}
<span>${valueText}</span>
</div>
</div>
`;
}

private renderEditMode(): TemplateResult {
const labelId = `${this.uid}-label`;
const errorId = `${this.uid}-error`;
const helperId = `${this.uid}-helper`;
const isInvalid = (this.error && this.error.trim() !== '') || (this.required && this.value === null);
const describedBy = this.error && this.error.trim() !== ''
? errorId
: this.hasSlot('Helper') ? helperId : '';

return html`
<div class="${this.getContainerClasses()}">
${this.renderLabel(labelId)}
<div class="flex items-stretch">
${this.showSymbol ? html`<span class="${this.getSymbolClasses()}">${this.getCurrencySymbol()}</span>` : html``}
<input
class="${this.getInputClasses(isInvalid)}"
type="text"
inputmode="decimal"
.name=${this.name}
.placeholder=${this.placeholder}
.value=${this.rawValue}
?disabled=${this.disabled || this.loading}
?readonly=${this.readonly}
aria-labelledby=${this.hasSlot('Label') ? labelId : ''}
aria-describedby=${describedBy}
aria-invalid=${isInvalid ? 'true' : 'false'}
aria-required=${this.required ? 'true' : 'false'}
aria-label=${this.getAriaLabel()}
@focus=${this.handleFocus}
@input=${this.handleInput}
@blur=${this.handleBlur}
/>
</div>
${this.loading ? html`<div class="mt-1 text-xs text-slate-500 dark:text-slate-400">Loading...</div>` : html``}
${this.renderFeedback(errorId, helperId)}
</div>
`;
}

private renderLabel(labelId: string): TemplateResult {
if (!this.hasSlot('Label')) return html``;
return html`<label id="${labelId}" class="text-sm text-slate-600 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Label'))}</label>`;
}

private renderFeedback(errorId: string, helperId: string): TemplateResult {
if (!this.isEditing) return html``;
if (this.error && this.error.trim() !== '') {
return html`<p id="${errorId}" class="text-xs text-red-600 dark:text-red-400">${unsafeHTML(this.error)}</p>`;
}
if (this.hasSlot('Helper')) {
return html`<p id="${helperId}" class="text-xs text-slate-500 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Helper'))}</p>`;
}
return html``;
}
}
