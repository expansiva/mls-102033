/// <mls fileReference="_102033_/l2/molecules/groupentermoney/ml-enter-money-display.ts" enhancement="_102020_/l2/enhancementAura" />
// =============================================================================
// ENTER MONEY DISPLAY MOLECULE
// =============================================================================
// Skill Group: groupEnterMoney
// This molecule does NOT contain business logic.
import { html, TemplateResult, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators.js';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
loading: 'Loading...',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
en: message_en,
};
/// **collab_i18n_end**

@customElement('groupentermoney--ml-enter-money-display')
export class EnterMoneyDisplayMolecule extends MoleculeAuraElement {
private msg: MessageType = messages.en;

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

@propertyDataSource({ type: Number })
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

// ===========================================================================
// INTERNAL IDS
// ===========================================================================
private static idCounter = 0;
private labelId = `em-label-${EnterMoneyDisplayMolecule.idCounter++}`;
private errorId = `em-error-${EnterMoneyDisplayMolecule.idCounter++}`;
private inputId = `em-input-${EnterMoneyDisplayMolecule.idCounter++}`;

// ===========================================================================
// LIFECYCLE
// ===========================================================================
firstUpdated() {
this.rawValue = this.formatToRaw(this.value);
}

// ===========================================================================
// STATE CHANGE HANDLER
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
if (this.disabled || this.loading) return;
const input = e.target as HTMLInputElement;
input.select();
this.dispatchEvent(new CustomEvent('focus', {
bubbles: true,
composed: true,
}));
}

private handleInput(e: Event) {
if (this.disabled || this.readonly || this.loading) return;
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
if (this.disabled || this.loading) {
this.dispatchEvent(new CustomEvent('blur', { bubbles: true, composed: true }));
return;
}

if (this.readonly) {
this.dispatchEvent(new CustomEvent('blur', { bubbles: true, composed: true }));
return;
}

const trimmed = this.rawValue.trim();
if (!trimmed) {
this.value = null;
this.rawValue = '';
} else {
let parsed = this.parseLocaleNumber(trimmed);
if (parsed === null) {
this.value = null;
this.rawValue = '';
} else {
parsed = this.clampValue(parsed);
this.value = parsed;
this.rawValue = this.formatToRaw(parsed);
}
}

this.dispatchEvent(new CustomEvent('change', {
bubbles: true,
composed: true,
detail: { value: this.value },
}));
this.dispatchEvent(new CustomEvent('blur', {
bubbles: true,
composed: true,
}));
}

// ===========================================================================
// HELPERS
// ===========================================================================
private getEffectiveLocale(): string | undefined {
return this.locale ? this.locale : undefined;
}

private clampValue(value: number): number {
let result = value;
if (this.min !== null && result < this.min) result = this.min;
if (this.max !== null && result > this.max) result = this.max;
return result;
}

private parseLocaleNumber(input: string): number | null {
const { decimalSeparator } = this.getSeparators();
const allowed = new RegExp(`[^0-9\\${decimalSeparator}-]`, 'g');
const cleaned = input.replace(allowed, '');
if (!cleaned || cleaned === '-' || cleaned === decimalSeparator) return null;
const normalized = decimalSeparator === '.' ? cleaned : cleaned.replace(new RegExp(`\\${decimalSeparator}`, 'g'), '.');
const parsed = parseFloat(normalized);
return isNaN(parsed) ? null : parsed;
}

private getSeparators(): { decimalSeparator: string; groupSeparator: string } {
const locale = this.getEffectiveLocale();
const parts = new Intl.NumberFormat(locale).formatToParts(1000.1);
const decimal = parts.find(p => p.type === 'decimal')?.value || '.';
const group = parts.find(p => p.type === 'group')?.value || ',';
return { decimalSeparator: decimal, groupSeparator: group };
}

private formatToRaw(value: number | null): string {
if (value === null || value === undefined) return '';
const locale = this.getEffectiveLocale();
return new Intl.NumberFormat(locale, {
style: 'decimal',
minimumFractionDigits: this.decimals,
maximumFractionDigits: this.decimals,
}).format(value);
}

private formatToDisplay(value: number | null): string {
if (value === null || value === undefined) return '—';
const locale = this.getEffectiveLocale();
if (this.showSymbol) {
return new Intl.NumberFormat(locale, {
style: 'currency',
currency: this.currency,
minimumFractionDigits: this.decimals,
maximumFractionDigits: this.decimals,
}).format(value);
}
return new Intl.NumberFormat(locale, {
style: 'decimal',
minimumFractionDigits: this.decimals,
maximumFractionDigits: this.decimals,
}).format(value);
}

private getCurrencySymbolInfo(): { symbol: string; isPrefix: boolean } {
if (!this.showSymbol) return { symbol: '', isPrefix: true };
const locale = this.getEffectiveLocale();
const parts = new Intl.NumberFormat(locale, {
style: 'currency',
currency: this.currency,
minimumFractionDigits: this.decimals,
maximumFractionDigits: this.decimals,
}).formatToParts(1);
const currencyIndex = parts.findIndex(p => p.type === 'currency');
const integerIndex = parts.findIndex(p => p.type === 'integer');
const symbol = parts.find(p => p.type === 'currency')?.value || this.currency;
const isPrefix = currencyIndex > -1 && integerIndex > -1 ? currencyIndex < integerIndex : true;
return { symbol, isPrefix };
}

private getInputClasses(): string {
const hasError = !!this.error;
return [
'w-full rounded-lg px-3 py-2 text-sm border transition',
'bg-white dark:bg-slate-900',
'text-slate-900 dark:text-slate-100',
'placeholder:text-slate-400 dark:placeholder:text-slate-500',
hasError
? 'border-red-500 dark:border-red-400'
: 'border-slate-200 dark:border-slate-700',
'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
(this.disabled || this.loading) ? 'opacity-50 cursor-not-allowed' : '',
].filter(Boolean).join(' ');
}

private getSymbolClasses(): string {
return [
'px-2 text-sm',
'bg-slate-50 dark:bg-slate-900',
'border border-slate-200 dark:border-slate-700',
'text-slate-600 dark:text-slate-400',
'rounded-lg',
].join(' ');
}

private getContainerClasses(): string {
return [
'w-full',
(this.disabled || this.loading) ? 'opacity-50' : '',
].filter(Boolean).join(' ');
}

private getAriaLabel(): string | undefined {
if (this.hasSlot('Label')) return undefined;
return this.currency ? `Amount (${this.currency})` : 'Amount';
}

// ===========================================================================
// RENDER PARTS
// ===========================================================================
private renderLabel(): TemplateResult {
if (!this.hasSlot('Label')) return html``;
return html`
<label id="${this.labelId}" class="block mb-1 text-sm text-slate-600 dark:text-slate-400">
${unsafeHTML(this.getSlotContent('Label'))}
</label>
`;
}

private renderHelperOrError(): TemplateResult {
if (this.error) {
return html`
<p id="${this.errorId}" class="mt-1 text-xs text-red-600 dark:text-red-400">
${unsafeHTML(String(this.error))}
</p>
`;
}
if (this.hasSlot('Helper')) {
return html`
<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
${unsafeHTML(this.getSlotContent('Helper'))}
</p>
`;
}
return html``;
}

private renderLoading(): TemplateResult {
if (!this.loading) return html``;
return html`
<div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
${this.msg.loading}
</div>
`;
}

private renderInputRow(): TemplateResult {
const { symbol, isPrefix } = this.getCurrencySymbolInfo();
const showSymbol = this.showSymbol && symbol;
const ariaLabel = this.getAriaLabel();
return html`
<div class="flex items-center gap-2">
${showSymbol && isPrefix ? html`<span class="${this.getSymbolClasses()}">${symbol}</span>` : nothing}
<input
id="${this.inputId}"
class="${this.getInputClasses()}"
.type="text"
inputmode="decimal"
.name="${this.name}"
.placeholder="${this.placeholder}"
.value="${this.rawValue}"
?disabled="${this.disabled || this.loading}"
?readonly="${this.readonly}"
aria-labelledby="${this.hasSlot('Label') ? this.labelId : nothing}"
aria-describedby="${this.error ? this.errorId : nothing}"
aria-invalid="${this.error ? 'true' : 'false'}"
aria-required="${this.required ? 'true' : 'false'}"
aria-label="${ariaLabel || nothing}"
@focus="${this.handleFocus}"
@input="${this.handleInput}"
@blur="${this.handleBlur}"
/>
${showSymbol && !isPrefix ? html`<span class="${this.getSymbolClasses()}">${symbol}</span>` : nothing}
</div>
`;
}

// ===========================================================================
// RENDER
// ===========================================================================
render() {
const lang = this.getMessageKey(messages);
this.msg = messages[lang];

if (!this.isEditing) {
return html`
<div class="${this.getContainerClasses()}">
${this.renderLabel()}
<div class="text-sm text-slate-900 dark:text-slate-100">
${this.formatToDisplay(this.value)}
</div>
</div>
`;
}

return html`
<div class="${this.getContainerClasses()}">
${this.renderLabel()}
${this.renderInputRow()}
${this.renderLoading()}
${this.renderHelperOrError()}
</div>
`;
}
}
