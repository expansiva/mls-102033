/// <mls fileReference="_102033_/l2/molecules/groupenterdatetimeinterval/ml-enter-datetime-interval.ts" enhancement="_102020_/l2/enhancementAura"/>
// =============================================================================
// ENTER DATETIME INTERVAL MOLECULE
// =============================================================================
// Skill Group: enter + datetime-interval
// This molecule does NOT contain business logic.
import { html, TemplateResult, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';
/// **collab_i18n_start**
const message_en = {
labelStart: 'Start',
labelEnd: 'End',
placeholderStart: 'Select start datetime',
placeholderEnd: 'Select end datetime',
rangeEmpty: '—',
confirm: 'Confirm',
clear: 'Clear',
loading: 'Loading...',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
en: message_en,
pt: {
labelStart: 'Início',
labelEnd: 'Fim',
placeholderStart: 'Selecione início',
placeholderEnd: 'Selecione fim',
rangeEmpty: '—',
confirm: 'Confirmar',
clear: 'Limpar',
loading: 'Carregando...',
},
};
/// **collab_i18n_end**
@customElement('groupenterdatetimeinterval--ml-enter-datetime-interval')
export class EnterDatetimeIntervalMolecule extends MoleculeAuraElement {
private msg: MessageType = messages.en;
// ===========================================================================
// SLOT TAGS
// ==========================================================================='
slotTags = ['Label', 'LabelStart', 'LabelEnd', 'Helper'];
// ===========================================================================
// PROPERTIES — From Contract
// ==========================================================================='
@propertyDataSource({ type: String, attribute: 'start-datetime' })
startDatetime: string | null = null;
@propertyDataSource({ type: String, attribute: 'end-datetime' })
endDatetime: string | null = null;
@propertyDataSource({ type: String })
error: string = '';
@propertyDataSource({ type: String })
name: string = '';
@propertyDataSource({ type: String })
locale: string = '';
@propertyDataSource({ type: String })
timezone: string = '';
@propertyDataSource({ type: String, attribute: 'min-datetime' })
minDatetime: string = '';
@propertyDataSource({ type: String, attribute: 'max-datetime' })
maxDatetime: string = '';
@propertyDataSource({ type: Number, attribute: 'min-duration-minutes' })
minDurationMinutes: number = 0;
@propertyDataSource({ type: Number, attribute: 'max-duration-minutes' })
maxDurationMinutes: number = 0;
@propertyDataSource({ type: Number, attribute: 'minute-step' })
minuteStep: number = 1;
@propertyDataSource({ type: Boolean, attribute: 'allow-same-instant' })
allowSameInstant: boolean = false;
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
private activeField: 'start' | 'end' | null = null;
@state()
private startDraft: string = '';
@state()
private endDraft: string = '';
private uid = `edt-${Math.random().toString(36).slice(2, 9)}`;
// ===========================================================================
// STATE CHANGE HANDLER — derived values (drafts)
// ==========================================================================='
handleIcaStateChange(key: string, value: any) {
const startAttr = this.getAttribute('start-datetime');
const endAttr = this.getAttribute('end-datetime');
if (startAttr === `{{${key}}}`) {
this.startDraft = this.toInputValueFromIso(value);
}
if (endAttr === `{{${key}}}`) {
this.endDraft = this.toInputValueFromIso(value);
}
this.requestUpdate();
}
// ===========================================================================
// EVENT DISPATCHERS
// ==========================================================================='
private dispatchFocus() {
this.dispatchEvent(new CustomEvent('focus', { bubbles: true, composed: true }));
}
private dispatchBlur() {
this.dispatchEvent(new CustomEvent('blur', { bubbles: true, composed: true }));
}
private dispatchStartChange() {
this.dispatchEvent(new CustomEvent('startChange', {
bubbles: true,
composed: true,
detail: { value: this.startDatetime },
}));
}
private dispatchEndChange() {
this.dispatchEvent(new CustomEvent('endChange', {
bubbles: true,
composed: true,
detail: { value: this.endDatetime },
}));
}
private dispatchChange() {
this.dispatchEvent(new CustomEvent('change', {
bubbles: true,
composed: true,
detail: { startDatetime: this.startDatetime, endDatetime: this.endDatetime },
}));
}
// ===========================================================================
// EVENT HANDLERS
// ==========================================================================='
private handleOpenField(field: 'start' | 'end') {
if (this.disabled || this.readonly || this.loading) return;
const nextField = this.activeField === field ? null : field;
this.setActiveField(nextField);
if (nextField === 'start') {
this.startDraft = this.toInputValueFromIso(this.startDatetime);
}
if (nextField === 'end') {
this.endDraft = this.toInputValueFromIso(this.endDatetime);
}
}
private setActiveField(field: 'start' | 'end' | null) {
const previous = this.activeField;
this.activeField = field;
if (previous === null && field !== null) this.dispatchFocus();
if (previous !== null && field === null) this.dispatchBlur();
}
private handleStartDraftInput(e: Event) {
const input = e.target as HTMLInputElement;
this.startDraft = input.value;
}
private handleEndDraftInput(e: Event) {
const input = e.target as HTMLInputElement;
this.endDraft = input.value;
}
private handleConfirmStart() {
if (this.disabled || this.readonly || this.loading) return;
if (!this.isStartDraftValid()) return;
this.startDatetime = this.toIsoFromInput(this.startDraft);
this.dispatchStartChange();
if (!this.endDatetime) {
this.setActiveField('end');
this.endDraft = this.toInputValueFromIso(this.endDatetime);
} else {
this.setActiveField(null);
}
}
private handleConfirmEnd() {
if (this.disabled || this.readonly || this.loading) return;
if (!this.isEndDraftValid()) return;
this.endDatetime = this.toIsoFromInput(this.endDraft);
this.dispatchEndChange();
this.dispatchChange();
this.setActiveField(null);
}
private handleClearStart() {
if (this.disabled || this.readonly || this.loading) return;
this.startDraft = '';
this.startDatetime = null;
this.dispatchStartChange();
this.setActiveField(null);
}
private handleClearEnd() {
if (this.disabled || this.readonly || this.loading) return;
this.endDraft = '';
this.endDatetime = null;
this.dispatchEndChange();
this.dispatchChange();
this.setActiveField(null);
}
// ===========================================================================
// VALIDATION HELPERS (UI-level constraints)
// ==========================================================================='
private isStartDraftValid(): boolean {
if (!this.startDraft) return false;
const iso = this.toIsoFromInput(this.startDraft);
if (!iso) return false;
const min = this.minDatetime || null;
const max = this.maxDatetime || null;
return this.isWithinRange(iso, min, max);
}
private isEndDraftValid(): boolean {
if (!this.endDraft) return false;
const iso = this.toIsoFromInput(this.endDraft);
if (!iso) return false;
const min = this.getMinEndIso();
const max = this.getMaxEndIso();
return this.isWithinRange(iso, min, max);
}
private isWithinRange(value: string, min: string | null, max: string | null): boolean {
const valueTime = this.parseIsoToTime(value);
if (valueTime === null) return false;
if (min) {
const minTime = this.parseIsoToTime(min);
if (minTime !== null && valueTime < minTime) return false;
}
if (max) {
const maxTime = this.parseIsoToTime(max);
if (maxTime !== null && valueTime > maxTime) return false;
}
return true;
}
private getMinEndIso(): string | null {
let minCandidate: string | null = null;
if (this.startDatetime) {
const baseMin = this.minDurationMinutes > 0
? this.minDurationMinutes
: this.allowSameInstant
? 0
: Math.max(this.minuteStep, 1);
minCandidate = this.addMinutes(this.startDatetime, baseMin);
}
if (this.minDatetime) {
minCandidate = this.maxIso(minCandidate, this.minDatetime);
}
return minCandidate;
}
private getMaxEndIso(): string | null {
let maxCandidate: string | null = null;
if (this.startDatetime && this.maxDurationMinutes > 0) {
maxCandidate = this.addMinutes(this.startDatetime, this.maxDurationMinutes);
}
if (this.maxDatetime) {
maxCandidate = this.minIso(maxCandidate, this.maxDatetime);
}
return maxCandidate;
}
// ===========================================================================
// FORMATTERS
// ==========================================================================='
private getDisplayRange(): string {
if (!this.startDatetime && !this.endDatetime) return this.msg.rangeEmpty;
if (this.startDatetime && !this.endDatetime) {
return `${this.formatDateTime(this.startDatetime)} – ${this.msg.rangeEmpty}`;
}
if (!this.startDatetime && this.endDatetime) {
return `${this.msg.rangeEmpty} – ${this.formatDateTime(this.endDatetime)}`;
}
const start = this.startDatetime as string;
const end = this.endDatetime as string;
const sameDay = this.getDateKey(start) === this.getDateKey(end);
if (sameDay) {
return `${this.formatDate(start)} ${this.formatTime(start)} – ${this.formatTime(end)}`;
}
return `${this.formatDateTime(start)} – ${this.formatDateTime(end)}`;
}
private formatDateTime(iso: string): string {
const date = this.parseIso(iso);
if (!date) return this.msg.rangeEmpty;
const locale = this.locale || 'en-US';
const timeZone = this.timezone || undefined;
const formatter = new Intl.DateTimeFormat(locale, {
year: 'numeric',
month: '2-digit',
day: '2-digit',
hour: '2-digit',
minute: '2-digit',
hour12: locale === 'en-US',
timeZone,
});
return formatter.format(date);
}
private formatDate(iso: string): string {
const date = this.parseIso(iso);
if (!date) return this.msg.rangeEmpty;
const locale = this.locale || 'en-US';
const timeZone = this.timezone || undefined;
const formatter = new Intl.DateTimeFormat(locale, {
year: 'numeric',
month: '2-digit',
day: '2-digit',
timeZone,
});
return formatter.format(date);
}
private formatTime(iso: string): string {
const date = this.parseIso(iso);
if (!date) return this.msg.rangeEmpty;
const locale = this.locale || 'en-US';
const timeZone = this.timezone || undefined;
const formatter = new Intl.DateTimeFormat(locale, {
hour: '2-digit',
minute: '2-digit',
hour12: locale === 'en-US',
timeZone,
});
return formatter.format(date);
}
private getDateKey(iso: string): string {
const date = this.parseIso(iso);
if (!date) return '';
const timeZone = this.timezone || undefined;
const formatter = new Intl.DateTimeFormat('en-CA', {
year: 'numeric',
month: '2-digit',
day: '2-digit',
timeZone,
});
return formatter.format(date);
}
private parseIso(iso: string | null): Date | null {
if (!iso) return null;
const date = new Date(iso);
return isNaN(date.getTime()) ? null : date;
}
private parseIsoToTime(iso: string | null): number | null {
const date = this.parseIso(iso);
return date ? date.getTime() : null;
}
private toInputValueFromIso(iso: string | null): string {
const date = this.parseIso(iso);
if (!date) return '';
return this.formatInputValue(date);
}
private formatInputValue(date: Date): string {
const y = date.getFullYear();
const m = this.pad(date.getMonth() + 1);
const d = this.pad(date.getDate());
const h = this.pad(date.getHours());
const min = this.pad(date.getMinutes());
return `${y}-${m}-${d}T${h}:${min}`;
}
private toIsoFromInput(value: string): string | null {
if (!value) return null;
if (value.length === 16) return `${value}:00`;
if (value.length >= 19) return value.slice(0, 19);
return value;
}
private addMinutes(iso: string, minutes: number): string {
const date = this.parseIso(iso);
if (!date) return iso;
date.setMinutes(date.getMinutes() + minutes);
return this.toIsoString(date);
}
private toIsoString(date: Date): string {
const y = date.getFullYear();
const m = this.pad(date.getMonth() + 1);
const d = this.pad(date.getDate());
const h = this.pad(date.getHours());
const min = this.pad(date.getMinutes());
const s = this.pad(date.getSeconds());
return `${y}-${m}-${d}T${h}:${min}:${s}`;
}
private maxIso(a: string | null, b: string | null): string | null {
if (!a) return b;
if (!b) return a;
return this.parseIsoToTime(a)! >= this.parseIsoToTime(b)! ? a : b;
}
private minIso(a: string | null, b: string | null): string | null {
if (!a) return b;
if (!b) return a;
return this.parseIsoToTime(a)! <= this.parseIsoToTime(b)! ? a : b;
}
private pad(value: number): string {
return value < 10 ? `0${value}` : String(value);
}
// ===========================================================================
// RENDER HELPERS
// ==========================================================================='
private renderLabel(): TemplateResult {
if (!this.hasSlot('Label')) return html``;
return html`
<label class="block text-sm font-medium text-slate-700 dark:text-slate-300">
${unsafeHTML(this.getSlotContent('Label'))}
</label>
`;
}
private renderPreview(): TemplateResult {
const preview = this.getDisplayRange();
return html`
<div class="text-sm text-slate-600 dark:text-slate-400">
${preview}
</div>
`;
}
private renderInputBlock(field: 'start' | 'end'): TemplateResult {
const isStart = field === 'start';
const labelId = `${this.uid}-${field}-label`;
const inputId = `${this.uid}-${field}-input`;
const errorId = `${this.uid}-error`;
const labelContent = isStart
? (this.hasSlot('LabelStart') ? unsafeHTML(this.getSlotContent('LabelStart')) : this.msg.labelStart)
: (this.hasSlot('LabelEnd') ? unsafeHTML(this.getSlotContent('LabelEnd')) : this.msg.labelEnd);
const value = isStart ? this.startDatetime : this.endDatetime;
const placeholder = isStart ? this.msg.placeholderStart : this.msg.placeholderEnd;
const displayValue = value ? this.formatDateTime(value) : placeholder;
const isActive = this.activeField === field;
const hasError = Boolean(this.error) && this.isEditing;
const buttonClasses = [
'w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition',
'bg-white dark:bg-slate-900',
'value' in { value: 0 } ? '' : '',
value ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500',
hasError
? 'border-red-500 dark:border-red-400'
: isActive
? 'border-sky-500 dark:border-sky-400'
: 'border-slate-200 dark:border-slate-700',
this.disabled ? 'opacity-50 cursor-not-allowed' : '',
this.readonly ? 'cursor-default' : 'cursor-pointer',
].filter(Boolean).join(' ');
return html`
<div class="flex flex-col gap-1">
<label id=${labelId} for=${inputId} class="text-xs font-medium text-slate-600 dark:text-slate-400">
${labelContent}
</label>
<button
id=${inputId}
type="button"
class=${buttonClasses}
aria-labelledby=${labelId}
aria-invalid=${hasError ? 'true' : 'false'}
aria-required=${this.required ? 'true' : 'false'}
aria-describedby=${hasError ? errorId : nothing}
?disabled=${this.disabled}
@click=${() => this.handleOpenField(field)}
>
<span class="truncate">${displayValue}</span>
<span class="text-slate-400 dark:text-slate-500">▾</span>
</button>
${isActive ? this.renderPickerPanel(field) : html``}
</div>
`;
}
private renderPickerPanel(field: 'start' | 'end'): TemplateResult {
const isStart = field === 'start';
const minIso = isStart ? (this.minDatetime || null) : this.getMinEndIso();
const maxIso = isStart ? (this.maxDatetime || null) : this.getMaxEndIso();
const minValue = minIso ? this.toInputValueFromIso(minIso) : undefined;
const maxValue = maxIso ? this.toInputValueFromIso(maxIso) : undefined;
const step = Math.max(this.minuteStep, 1) * 60;
const value = isStart ? this.startDraft : this.endDraft;
const confirmDisabled = isStart ? !this.isStartDraftValid() : !this.isEndDraftValid();
return html`
<div class="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-sm" role="dialog" aria-modal="true">
<div class="flex flex-col gap-2">
<input
class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400"
type="datetime-local"
step=${step}
.value=${value}
min=${ifDefined(minValue)}
max=${ifDefined(maxValue)}
@input=${isStart ? this.handleStartDraftInput : this.handleEndDraftInput}
/>
<div class="flex items-center justify-end gap-2">
<button
class="rounded-md px-3 py-1 text-xs border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
type="button"
@click=${isStart ? this.handleClearStart : this.handleClearEnd}
>
${this.msg.clear}
</button>
<button
class="rounded-md px-3 py-1 text-xs border border-sky-500 dark:border-sky-400 text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/40"
type="button"
?disabled=${confirmDisabled}
@click=${isStart ? this.handleConfirmStart : this.handleConfirmEnd}
>
${this.msg.confirm}
</button>
</div>
</div>
</div>
`;
}
private renderFeedback(): TemplateResult {
if (!this.isEditing) return html``;
if (this.error) {
return html`
<p id="${this.uid}-error" class="mt-1 text-xs text-red-600 dark:text-red-400">${unsafeHTML(String(this.error))}</p>
`;
}
if (this.hasSlot('Helper')) {
return html`
<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Helper'))}</p>
`;
}
return html``;
}
private renderLoading(): TemplateResult {
if (!this.loading) return html``;
return html`
<div class="mt-2 text-xs text-slate-500 dark:text-slate-400">
${this.msg.loading}
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
return html`
<div class="w-full space-y-2">
${this.renderLabel()}
<div class="text-sm text-slate-900 dark:text-slate-100">
${this.getDisplayRange()}
</div>
</div>
`;
}
return html`
<div class="w-full space-y-3">
${this.renderLabel()}
${this.renderPreview()}
<div class="grid grid-cols-1 gap-3">
${this.renderInputBlock('start')}
${this.renderInputBlock('end')}
</div>
${this.renderLoading()}
${this.renderFeedback()}
</div>
`;
}
}
