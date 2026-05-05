/// <mls fileReference="_102033_/l2/molecules/groupentertime/ml-time-scroll-picker.ts" enhancement="_102020_/l2/enhancementAura" />
// =============================================================================
// TIME SCROLL PICKER MOLECULE
// =============================================================================
// Skill Group: enter + time
// This molecule does NOT contain business logic.
import { html, svg, TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
placeholder: 'Select time',
confirm: 'Confirm',
clear: 'Clear',
loading: 'Loading...',
viewEmpty: '—',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
en: message_en,
pt: {
placeholder: 'Selecione o horário',
confirm: 'Confirmar',
clear: 'Limpar',
loading: 'Carregando...',
viewEmpty: '—',
},
};
/// **collab_i18n_end**
@customElement('groupentertime--ml-time-scroll-picker')
export class MlTimeScrollPickerMolecule extends MoleculeAuraElement {
private msg: MessageType = messages.en;
// ===========================================================================
// SLOT TAGS
// ===========================================================================
slotTags = ['Label', 'Helper'];
// ===========================================================================
// PROPERTIES — From Contract
// ===========================================================================
@propertyDataSource({ type: String })
value: string | null = null;
@propertyDataSource({ type: String })
error: string = '';
@propertyDataSource({ type: String })
name: string = '';
@propertyDataSource({ type: String })
locale: string = '';
@propertyDataSource({ type: Boolean, attribute: 'hour12' })
hour12: boolean = false;
@propertyDataSource({ type: Boolean, attribute: 'show-seconds' })
showSeconds: boolean = false;
@propertyDataSource({ type: Number, attribute: 'minute-step' })
minuteStep: number = 1;
@propertyDataSource({ type: String, attribute: 'min-time' })
minTime: string = '';
@propertyDataSource({ type: String, attribute: 'max-time' })
maxTime: string = '';
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
private isOpen = false;
@state()
private selectedHour: number = 0;
@state()
private selectedMinute: number = 0;
@state()
private selectedSecond: number = 0;
@state()
private selectedPeriod: 'AM' | 'PM' = 'AM';
private componentId = `tsp-${Math.random().toString(36).slice(2)}`;
// ===========================================================================
// LIFECYCLE
// ===========================================================================
connectedCallback() {
super.connectedCallback();
this.syncFromValue();
this.addEventListener('keydown', this.handleKeyDown);
}
disconnectedCallback() {
this.removeEventListener('keydown', this.handleKeyDown);
window.removeEventListener('click', this.handleOutsideClick);
super.disconnectedCallback();
}
// ===========================================================================
// STATE CHANGE HANDLER
// ===========================================================================
handleIcaStateChange(key: string) {
const valueAttr = this.getAttribute('value');
const hour12Attr = this.getAttribute('hour12');
const showSecondsAttr = this.getAttribute('show-seconds');
if (
valueAttr === `{{${key}}}` ||
hour12Attr === `{{${key}}}` ||
showSecondsAttr === `{{${key}}}`
) {
this.syncFromValue();
}
this.requestUpdate();
}
// ===========================================================================
// EVENT HANDLERS
// ===========================================================================
private handleToggleOpen() {
if (this.disabled || this.readonly || this.loading || !this.isEditing) return;
this.isOpen = !this.isOpen;
if (this.isOpen) {
window.addEventListener('click', this.handleOutsideClick);
} else {
window.removeEventListener('click', this.handleOutsideClick);
}
}
private handleOutsideClick = (e: Event) => {
const path = e.composedPath();
if (!path.includes(this)) {
this.isOpen = false;
window.removeEventListener('click', this.handleOutsideClick);
}
};
private handleFocus() {
if (!this.isEditing) return;
this.dispatchEvent(new CustomEvent('focus', { bubbles: true, composed: true }));
}
private handleBlur() {
if (!this.isEditing) return;
this.dispatchEvent(new CustomEvent('blur', { bubbles: true, composed: true }));
}
private handleConfirm() {
if (!this.isEditing || this.disabled || this.readonly || this.loading) return;
if (!this.isSelectedTimeValid()) return;
this.value = this.formatValueFromSelection();
this.dispatchEvent(
new CustomEvent('change', {
bubbles: true,
composed: true,
detail: { value: this.value },
})
);
this.isOpen = false;
window.removeEventListener('click', this.handleOutsideClick);
}
private handleClear() {
if (!this.isEditing || this.disabled || this.readonly || this.loading) return;
this.value = null;
this.dispatchEvent(
new CustomEvent('change', {
bubbles: true,
composed: true,
detail: { value: this.value },
})
);
this.isOpen = false;
window.removeEventListener('click', this.handleOutsideClick);
}
private handleHourSelect(hour: number) {
if (this.disabled || this.readonly || this.loading) return;
if (this.hour12) {
this.selectedHour = this.to24Hour(hour, this.selectedPeriod);
} else {
this.selectedHour = hour;
}
}
private handleMinuteSelect(minute: number) {
if (this.disabled || this.readonly || this.loading) return;
this.selectedMinute = minute;
}
private handleSecondSelect(second: number) {
if (this.disabled || this.readonly || this.loading) return;
this.selectedSecond = second;
}
private handlePeriodSelect(period: 'AM' | 'PM') {
if (this.disabled || this.readonly || this.loading) return;
this.selectedPeriod = period;
if (this.hour12) {
const displayHour = this.to12Hour(this.selectedHour);
this.selectedHour = this.to24Hour(displayHour, period);
}
}
private handleKeyDown = (e: KeyboardEvent) => {
if (e.key === 'Escape' && this.isOpen) {
this.isOpen = false;
window.removeEventListener('click', this.handleOutsideClick);
}
};
// ===========================================================================
// DATA HELPERS
// ===========================================================================
private syncFromValue() {
const parsed = this.parseTimeValue(this.value);
if (parsed) {
this.selectedHour = parsed.hour;
this.selectedMinute = parsed.minute;
this.selectedSecond = this.showSeconds ? parsed.second : 0;
} else {
this.selectedHour = 0;
this.selectedMinute = 0;
this.selectedSecond = 0;
}
this.selectedPeriod = this.selectedHour >= 12 ? 'PM' : 'AM';
}
private parseTimeValue(value: string | null): { hour: number; minute: number; second: number } | null {
if (!value) return null;
const parts = value.split(':').map((v) => parseInt(v, 10));
if (parts.length < 2) return null;
const hour = parts[0] ?? 0;
const minute = parts[1] ?? 0;
const second = parts[2] ?? 0;
return { hour, minute, second };
}
private formatValueFromSelection(): string {
const hh = String(this.selectedHour).padStart(2, '0');
const mm = String(this.selectedMinute).padStart(2, '0');
if (this.showSeconds) {
const ss = String(this.selectedSecond).padStart(2, '0');
return `${hh}:${mm}:${ss}`;
}
return `${hh}:${mm}`;
}
private formatDisplay(value: string | null): string {
if (!value) return this.msg.viewEmpty;
const parsed = this.parseTimeValue(value);
if (!parsed) return this.msg.viewEmpty;
const date = new Date(1970, 0, 1, parsed.hour, parsed.minute, parsed.second || 0);
const opts: Intl.DateTimeFormatOptions = {
hour: '2-digit',
minute: '2-digit',
second: this.showSeconds ? '2-digit' : undefined,
hour12: this.hour12,
};
const formatter = new Intl.DateTimeFormat(this.locale || undefined, opts);
return formatter.format(date);
}
private to12Hour(hour24: number): number {
const h = hour24 % 12;
return h === 0 ? 12 : h;
}
private to24Hour(hour12: number, period: 'AM' | 'PM'): number {
const base = hour12 % 12;
return period === 'PM' ? base + 12 : base;
}
private getMinSeconds(): number | null {
if (!this.minTime) return null;
const parsed = this.parseTimeValue(this.minTime);
if (!parsed) return null;
return parsed.hour * 3600 + parsed.minute * 60 + (parsed.second || 0);
}
private getMaxSeconds(): number | null {
if (!this.maxTime) return null;
const parsed = this.parseTimeValue(this.maxTime);
if (!parsed) return null;
const base = parsed.hour * 3600 + parsed.minute * 60 + (parsed.second || 0);
return this.showSeconds ? base : base + 59;
}
private isTimeAllowed(hour: number, minute: number, second: number): boolean {
const min = this.getMinSeconds();
const max = this.getMaxSeconds();
const total = hour * 3600 + minute * 60 + second;
if (min !== null && total < min) return false;
if (max !== null && total > max) return false;
return true;
}
private isSelectedTimeValid(): boolean {
const sec = this.showSeconds ? this.selectedSecond : 0;
return this.isTimeAllowed(this.selectedHour, this.selectedMinute, sec);
}
private getMinutesList(): number[] {
const step = Math.max(1, this.minuteStep || 1);
const list: number[] = [];
for (let i = 0; i < 60; i += step) list.push(i);
return list;
}
// ===========================================================================
// RENDER HELPERS
// ===========================================================================
private renderLabel(): TemplateResult {
if (!this.hasSlot('Label')) return html``;
const labelId = `${this.componentId}-label`;
return html`
<label id="${labelId}" class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
${unsafeHTML(this.getSlotContent('Label'))}
${this.required ? html`<span class="text-red-600 dark:text-red-400">*</span>` : ''}
</label>
`;
}
private renderHelperOrError(): TemplateResult {
if (!this.isEditing) return html``;
if (this.error) {
return html`<p id="${this.componentId}-error" class="mt-1 text-xs text-red-600 dark:text-red-400">${unsafeHTML(String(this.error))}</p>`;
}
if (this.hasSlot('Helper')) {
return html`<p id="${this.componentId}-helper" class="mt-1 text-xs text-slate-500 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Helper'))}</p>`;
}
return html``;
}
private renderViewMode(): TemplateResult {
return html`
<div class="w-full">
${this.renderLabel()}
<div class="text-sm text-slate-900 dark:text-slate-100">${this.formatDisplay(this.value)}</div>
</div>
`;
}
private renderInput(): TemplateResult {
const labelId = this.hasSlot('Label') ? `${this.componentId}-label` : '';
const describedBy = this.error
? `${this.componentId}-error`
: this.hasSlot('Helper')
? `${this.componentId}-helper`
: '';
const placeholder = this.placeholder || this.msg.placeholder;
const displayValue = this.value ? this.formatDisplay(this.value) : '';
const inputClasses = this.getInputClasses();
return html`
<div class="relative">
<input
id="${this.componentId}-input"
name="${this.name}"
class="${inputClasses}"
type="text"
.placeholder="${placeholder}"
.value="${displayValue}"
?disabled=${this.disabled}
?readonly=${true}
aria-labelledby="${labelId}"
aria-describedby="${describedBy}"
aria-invalid="${this.error ? 'true' : 'false'}"
aria-required="${this.required ? 'true' : 'false'}"
@focus=${this.handleFocus}
@blur=${this.handleBlur}
@click=${this.handleToggleOpen}
/>
<button
class="${this.getIconButtonClasses()}"
@click=${this.handleToggleOpen}
?disabled=${this.disabled || this.readonly || this.loading}
aria-label="${this.formatDisplay(this.value)}"
>
${this.renderClockIcon()}
</button>
</div>
`;
}
private renderClockIcon(): TemplateResult {
return html`
<svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500 dark:text-slate-400">
${svg`<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"></circle>`}
${svg`<path d="M12 7v5l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>`}
</svg>
`;
}
private renderPicker(): TemplateResult {
if (!this.isOpen || this.loading) return html``;
return html`
<div
class="mt-2 grid grid-cols-${this.hour12 ? (this.showSeconds ? '4' : '3') : this.showSeconds ? '3' : '2'} gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800"
role="dialog"
aria-modal="true"
>
${this.renderHourColumn()}
${this.renderMinuteColumn()}
${this.showSeconds ? this.renderSecondColumn() : html``}
${this.hour12 ? this.renderPeriodColumn() : html``}
<div class="col-span-full mt-2 flex items-center justify-end gap-2">
<button class="${this.getActionButtonClasses()}" @click=${this.handleClear} ?disabled=${this.disabled || this.readonly || this.loading}>${this.msg.clear}</button>
<button class="${this.getPrimaryButtonClasses()}" @click=${this.handleConfirm} ?disabled=${!this.isSelectedTimeValid() || this.disabled || this.readonly || this.loading}>${this.msg.confirm}</button>
</div>
</div>
`;
}
private renderHourColumn(): TemplateResult {
const hours = this.hour12 ? Array.from({ length: 12 }, (_, i) => i + 1) : Array.from({ length: 24 }, (_, i) => i);
return html`
<div class="flex flex-col">
<span class="mb-1 text-xs text-slate-500 dark:text-slate-400">H</span>
<div class="max-h-48 overflow-y-auto rounded-md border border-slate-200 p-1 dark:border-slate-700">
${hours.map((h) => {
const hour24 = this.hour12 ? this.to24Hour(h, this.selectedPeriod) : h;
const isSelected = this.selectedHour === hour24;
const disabled = !this.isTimeAllowed(hour24, this.selectedMinute, this.showSeconds ? this.selectedSecond : 0);
return html`
<button
class="${this.getItemClasses(isSelected, disabled)}"
@click=${() => this.handleHourSelect(h)}
?disabled=${disabled}
>
${String(h).padStart(2, '0')}
</button>
`;
})}
</div>
</div>
`;
}
private renderMinuteColumn(): TemplateResult {
const minutes = this.getMinutesList();
return html`
<div class="flex flex-col">
<span class="mb-1 text-xs text-slate-500 dark:text-slate-400">M</span>
<div class="max-h-48 overflow-y-auto rounded-md border border-slate-200 p-1 dark:border-slate-700">
${minutes.map((m) => {
const isSelected = this.selectedMinute === m;
const disabled = !this.isTimeAllowed(this.selectedHour, m, this.showSeconds ? this.selectedSecond : 0);
return html`
<button
class="${this.getItemClasses(isSelected, disabled)}"
@click=${() => this.handleMinuteSelect(m)}
?disabled=${disabled}
>
${String(m).padStart(2, '0')}
</button>
`;
})}
</div>
</div>
`;
}
private renderSecondColumn(): TemplateResult {
const seconds = Array.from({ length: 60 }, (_, i) => i);
return html`
<div class="flex flex-col">
<span class="mb-1 text-xs text-slate-500 dark:text-slate-400">S</span>
<div class="max-h-48 overflow-y-auto rounded-md border border-slate-200 p-1 dark:border-slate-700">
${seconds.map((s) => {
const isSelected = this.selectedSecond === s;
const disabled = !this.isTimeAllowed(this.selectedHour, this.selectedMinute, s);
return html`
<button
class="${this.getItemClasses(isSelected, disabled)}"
@click=${() => this.handleSecondSelect(s)}
?disabled=${disabled}
>
${String(s).padStart(2, '0')}
</button>
`;
})}
</div>
</div>
`;
}
private renderPeriodColumn(): TemplateResult {
const periods: Array<'AM' | 'PM'> = ['AM', 'PM'];
return html`
<div class="flex flex-col">
<span class="mb-1 text-xs text-slate-500 dark:text-slate-400">P</span>
<div class="max-h-48 overflow-y-auto rounded-md border border-slate-200 p-1 dark:border-slate-700">
${periods.map((p) => {
const isSelected = this.selectedPeriod === p;
const disabled = !this.isPeriodAllowed(p);
return html`
<button
class="${this.getItemClasses(isSelected, disabled)}"
@click=${() => this.handlePeriodSelect(p)}
?disabled=${disabled}
>
${p}
</button>
`;
})}
</div>
</div>
`;
}
private isPeriodAllowed(period: 'AM' | 'PM'): boolean {
const minutes = this.selectedMinute;
const seconds = this.showSeconds ? this.selectedSecond : 0;
const hours = period === 'AM' ? Array.from({ length: 12 }, (_, i) => i) : Array.from({ length: 12 }, (_, i) => i + 12);
return hours.some((h) => this.isTimeAllowed(h, minutes, seconds));
}
// ===========================================================================
// CLASSES
// ===========================================================================
private getInputClasses(): string {
return [
'w-full rounded-lg border px-3 py-2 pr-10 text-sm transition',
'bg-white dark:bg-slate-900',
'text-slate-900 dark:text-slate-100',
'placeholder:text-slate-400 dark:placeholder:text-slate-500',
this.error ? 'border-red-500 dark:border-red-400' : 'border-slate-200 dark:border-slate-700',
'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
this.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text',
].filter(Boolean).join(' ');
}
private getIconButtonClasses(): string {
return [
'absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 transition',
'bg-transparent',
'text-slate-500 dark:text-slate-400',
this.disabled || this.readonly || this.loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 dark:hover:bg-slate-700',
].filter(Boolean).join(' ');
}
private getItemClasses(isSelected: boolean, disabled: boolean): string {
return [
'w-full rounded-md px-2 py-1 text-sm text-left transition',
'isSelected' in Object ? '' : '',
isSelected
? 'bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border border-sky-500 dark:border-sky-400'
: 'text-slate-900 dark:text-slate-100 border border-transparent',
!disabled && !isSelected ? 'hover:bg-slate-50 dark:hover:bg-slate-700' : '',
disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
].filter(Boolean).join(' ');
}
private getActionButtonClasses(): string {
return [
'rounded-md border px-3 py-1.5 text-sm transition',
'border-slate-200 dark:border-slate-700',
'text-slate-700 dark:text-slate-300',
'hover:bg-slate-50 dark:hover:bg-slate-700',
].filter(Boolean).join(' ');
}
private getPrimaryButtonClasses(): string {
return [
'rounded-md border px-3 py-1.5 text-sm transition',
'border-sky-500 dark:border-sky-400',
'bg-sky-50 dark:bg-sky-900/40',
'text-sky-700 dark:text-sky-300',
'hover:bg-sky-100 dark:hover:bg-sky-900/60',
].filter(Boolean).join(' ');
}
// ===========================================================================
// RENDER
// ===========================================================================
render() {
const lang = this.getMessageKey(messages);
this.msg = messages[lang];
if (!this.isEditing) {
return this.renderViewMode();
}
return html`
<div class="w-full">
${this.renderLabel()}
${this.renderInput()}
${this.loading ? html`<div class="mt-2 text-xs text-slate-500 dark:text-slate-400">${this.msg.loading}</div>` : ''}
${this.renderPicker()}
${this.renderHelperOrError()}
</div>
`;
}
}
