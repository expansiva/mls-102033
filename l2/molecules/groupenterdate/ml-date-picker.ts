/// <mls fileReference="_102033_/l2/molecules/groupenterdate/ml-date-picker.ts" enhancement="_102020_/l2/enhancementAura" />
// =============================================================================
// DATE PICKER MOLECULE
// =============================================================================
// Skill Group: enter + date
// This molecule does NOT contain business logic.
import { html, svg, TemplateResult, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
placeholder: 'Select a date',
clear: 'Clear',
loading: 'Loading...',
emptyView: '—',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
en: message_en,
pt: {
placeholder: 'Selecione uma data',
clear: 'Limpar',
loading: 'Carregando...',
emptyView: '—',
},
};
/// **collab_i18n_end**

@customElement('groupenterdate--ml-date-picker')
export class MlDatePickerMolecule extends MoleculeAuraElement {
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

@propertyDataSource({ type: String, attribute: 'min-date' })
minDate: string = '';

@propertyDataSource({ type: String, attribute: 'max-date' })
maxDate: string = '';

@propertyDataSource({ type: String })
placeholder: string = '';

@propertyDataSource({ type: Number, attribute: 'first-day-of-week' })
firstDayOfWeek: number = 0;

@propertyDataSource({ type: Boolean, attribute: 'show-week-numbers' })
showWeekNumbers: boolean = false;

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
private isOpen: boolean = false;

@state()
private viewMonth: number = new Date().getUTCMonth();

@state()
private viewYear: number = new Date().getUTCFullYear();

@state()
private fieldId: string = `date-${Math.random().toString(36).slice(2)}`;

// ===========================================================================
// LIFECYCLE
// ===========================================================================
connectedCallback() {
super.connectedCallback();
this.syncViewToValue(this.value);
this.handleOutsideClick = this.handleOutsideClick.bind(this);
document.addEventListener('mousedown', this.handleOutsideClick);
}

disconnectedCallback() {
document.removeEventListener('mousedown', this.handleOutsideClick);
super.disconnectedCallback();
}

// ===========================================================================
// STATE CHANGE HANDLER
// ===========================================================================
handleIcaStateChange(key: string, value: any) {
const valueAttr = this.getAttribute('value');
const minAttr = this.getAttribute('min-date');
const maxAttr = this.getAttribute('max-date');
const editingAttr = this.getAttribute('is-editing');
if (valueAttr === `{{${key}}}`) {
this.syncViewToValue(value);
}
if (minAttr === `{{${key}}}` || maxAttr === `{{${key}}}`) {
this.ensureViewWithinRange();
}
if (editingAttr === `{{${key}}}` && value === false) {
this.isOpen = false;
}
this.requestUpdate();
}

// ===========================================================================
// EVENT HANDLERS
// ===========================================================================
private handleToggleOpen() {
if (!this.isEditing || this.disabled || this.readonly || this.loading) return;
this.isOpen = !this.isOpen;
if (this.isOpen) {
this.syncViewToValue(this.value);
}
}

private handleFocus() {
if (!this.isEditing || this.disabled || this.readonly || this.loading) return;
this.dispatchEvent(new CustomEvent('focus', { bubbles: true, composed: true }));
}

private handleBlur() {
if (!this.isEditing) return;
this.dispatchEvent(new CustomEvent('blur', { bubbles: true, composed: true }));
}

private handleOutsideClick(e: MouseEvent) {
if (!this.isOpen) return;
const path = e.composedPath();
if (!path.includes(this)) {
this.isOpen = false;
}
}

private handlePrevMonth() {
if (!this.canNavigatePrev()) return;
const prev = this.addMonths(this.viewYear, this.viewMonth, -1);
this.viewYear = prev.year;
this.viewMonth = prev.month;
this.dispatchEvent(new CustomEvent('monthChange', {
bubbles: true,
composed: true,
detail: { year: this.viewYear, month: this.viewMonth + 1 },
}));
}

private handleNextMonth() {
if (!this.canNavigateNext()) return;
const next = this.addMonths(this.viewYear, this.viewMonth, 1);
this.viewYear = next.year;
this.viewMonth = next.month;
this.dispatchEvent(new CustomEvent('monthChange', {
bubbles: true,
composed: true,
detail: { year: this.viewYear, month: this.viewMonth + 1 },
}));
}

private handleSelectDay(day: number) {
if (this.disabled || this.readonly || this.loading || !this.isEditing) return;
const iso = this.toIsoDate(this.viewYear, this.viewMonth, day);
if (this.isDateDisabled(iso)) return;
this.value = iso;
this.isOpen = false;
this.dispatchEvent(new CustomEvent('change', {
bubbles: true,
composed: true,
detail: { value: this.value },
}));
}

private handleClear() {
if (this.disabled || this.readonly || this.loading || !this.isEditing) return;
this.value = null;
this.dispatchEvent(new CustomEvent('change', {
bubbles: true,
composed: true,
detail: { value: this.value },
}));
this.isOpen = false;
}

// ===========================================================================
// HELPERS
// ===========================================================================
private syncViewToValue(value: string | null) {
const parsed = this.parseIsoDate(value);
if (parsed) {
this.viewYear = parsed.year;
this.viewMonth = parsed.month;
} else {
const now = new Date();
this.viewYear = now.getUTCFullYear();
this.viewMonth = now.getUTCMonth();
}
this.ensureViewWithinRange();
}

private ensureViewWithinRange() {
const min = this.parseIsoDate(this.minDate);
const max = this.parseIsoDate(this.maxDate);
if (min) {
const minKey = this.toDateKey(min.year, min.month, min.day);
const viewKey = this.toDateKey(this.viewYear, this.viewMonth, 1);
if (viewKey < minKey) {
this.viewYear = min.year;
this.viewMonth = min.month;
}
}
if (max) {
const maxKey = this.toDateKey(max.year, max.month, max.day);
const viewKey = this.toDateKey(this.viewYear, this.viewMonth, 1);
if (viewKey > maxKey) {
this.viewYear = max.year;
this.viewMonth = max.month;
}
}
}

private parseIsoDate(value: string | null | undefined): { year: number; month: number; day: number } | null {
if (!value) return null;
const match = /^\d{4}-\d{2}-\d{2}$/.exec(value);
if (!match) return null;
const [year, month, day] = value.split('-').map((v) => Number(v));
return { year, month: month - 1, day };
}

private toIsoDate(year: number, month: number, day: number): string {
const m = `${month + 1}`.padStart(2, '0');
const d = `${day}`.padStart(2, '0');
return `${year}-${m}-${d}`;
}

private toDateKey(year: number, month: number, day: number): number {
return year * 10000 + (month + 1) * 100 + day;
}

private formatDisplay(value: string | null): string {
if (!value) return this.msg.emptyView;
const parsed = this.parseIsoDate(value);
if (!parsed) return this.msg.emptyView;
const locale = this.locale || 'en-US';
const date = new Date(Date.UTC(parsed.year, parsed.month, parsed.day));
const fmt = new Intl.DateTimeFormat(locale, {
year: 'numeric',
month: '2-digit',
day: '2-digit',
timeZone: 'UTC',
});
return fmt.format(date);
}

private formatTriggerValue(): string {
if (!this.value) return this.placeholder || this.msg.placeholder;
const parsed = this.parseIsoDate(this.value);
if (!parsed) return this.placeholder || this.msg.placeholder;
const locale = this.locale || 'en-US';
const date = new Date(Date.UTC(parsed.year, parsed.month, parsed.day));
const fmt = new Intl.DateTimeFormat(locale, {
year: 'numeric',
month: '2-digit',
day: '2-digit',
timeZone: 'UTC',
});
return fmt.format(date);
}

private getWeekdayLabels(): string[] {
const locale = this.locale || 'en-US';
const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
const base = new Date(Date.UTC(2024, 0, 7));
const labels: string[] = [];
for (let i = 0; i < 7; i++) {
const date = new Date(base.getTime() + i * 86400000);
labels.push(formatter.format(date));
}
const shift = this.firstDayOfWeek % 7;
return labels.slice(shift).concat(labels.slice(0, shift));
}

private getDaysInMonth(year: number, month: number): number {
return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

private addMonths(year: number, month: number, delta: number): { year: number; month: number } {
const date = new Date(Date.UTC(year, month + delta, 1));
return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

private isDateDisabled(iso: string): boolean {
const parsed = this.parseIsoDate(iso);
if (!parsed) return true;
const key = this.toDateKey(parsed.year, parsed.month, parsed.day);
const min = this.parseIsoDate(this.minDate);
const max = this.parseIsoDate(this.maxDate);
if (min && key < this.toDateKey(min.year, min.month, min.day)) return true;
if (max && key > this.toDateKey(max.year, max.month, max.day)) return true;
return false;
}

private canNavigatePrev(): boolean {
const min = this.parseIsoDate(this.minDate);
if (!min) return true;
const prev = this.addMonths(this.viewYear, this.viewMonth, -1);
const lastDayPrev = this.getDaysInMonth(prev.year, prev.month);
const prevKey = this.toDateKey(prev.year, prev.month, lastDayPrev);
const minKey = this.toDateKey(min.year, min.month, min.day);
return prevKey >= minKey;
}

private canNavigateNext(): boolean {
const max = this.parseIsoDate(this.maxDate);
if (!max) return true;
const next = this.addMonths(this.viewYear, this.viewMonth, 1);
const nextKey = this.toDateKey(next.year, next.month, 1);
const maxKey = this.toDateKey(max.year, max.month, max.day);
return nextKey <= maxKey;
}

private getISOWeekNumber(date: Date): number {
const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const dayNum = d.getUTCDay() || 7;
d.setUTCDate(d.getUTCDate() + 4 - dayNum);
const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

private getContainerClasses(): string {
return [
'relative w-full',
].join(' ');
}

private getTriggerClasses(hasError: boolean): string {
return [
'w-full rounded-lg px-3 py-2 text-sm border transition flex items-center justify-between gap-2',
'bg-white dark:bg-slate-900',
'text-slate-900 dark:text-slate-100',
'placeholder:text-slate-400 dark:placeholder:text-slate-500',
hasError ? 'border-red-500 dark:border-red-400' : 'border-slate-200 dark:border-slate-700',
'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
this.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
this.readonly ? 'select-text' : '',
].filter(Boolean).join(' ');
}

private getDayClasses(isToday: boolean, isSelected: boolean, disabled: boolean): string {
return [
'w-9 h-9 rounded-md text-sm flex items-center justify-center transition',
'border border-transparent',
isSelected
? 'bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-500 dark:border-sky-400'
: 'text-slate-900 dark:text-slate-100',
!disabled && !isSelected ? 'hover:bg-slate-50 dark:hover:bg-slate-700' : '',
disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
isToday && !isSelected ? 'border-sky-500 dark:border-sky-400' : '',
].filter(Boolean).join(' ');
}

private renderLabel(): TemplateResult {
if (!this.hasSlot('Label')) return html``;
const labelId = `${this.fieldId}-label`;
return html`
<label id=${labelId} class="mb-1 block text-sm text-slate-600 dark:text-slate-400">
${unsafeHTML(this.getSlotContent('Label'))}
${this.required ? html`<span class="text-red-600 dark:text-red-400"> *</span>` : html``}
</label>
`;
}

private renderHelperOrError(): TemplateResult {
if (!this.isEditing) return html``;
if (this.error) {
return html`<p id=${`${this.fieldId}-error`} class="mt-1 text-xs text-red-600 dark:text-red-400">${unsafeHTML(this.error)}</p>`;
}
if (this.hasSlot('Helper')) {
return html`<p id=${`${this.fieldId}-helper`} class="mt-1 text-xs text-slate-500 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Helper'))}</p>`;
}
return html``;
}

private renderCalendar(): TemplateResult {
if (!this.isOpen || this.loading || !this.isEditing) return html``;
const daysInMonth = this.getDaysInMonth(this.viewYear, this.viewMonth);
const firstDay = new Date(Date.UTC(this.viewYear, this.viewMonth, 1)).getUTCDay();
const offset = (firstDay - (this.firstDayOfWeek % 7) + 7) % 7;
const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;
const weekdayLabels = this.getWeekdayLabels();
const today = new Date();
const todayKey = this.toDateKey(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
const selectedParsed = this.parseIsoDate(this.value);
const selectedKey = selectedParsed ? this.toDateKey(selectedParsed.year, selectedParsed.month, selectedParsed.day) : null;

const weeks: Array<Array<number | null>> = [];
let currentDay = 1;
for (let i = 0; i < totalCells; i++) {
const rowIndex = Math.floor(i / 7);
if (!weeks[rowIndex]) weeks[rowIndex] = [];
if (i < offset || currentDay > daysInMonth) {
weeks[rowIndex].push(null);
} else {
weeks[rowIndex].push(currentDay);
currentDay++;
}
}

return html`
<div class="absolute z-20 mt-2 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-lg">
<div class="flex items-center justify-between mb-2">
<button
class="p-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 ${this.canNavigatePrev() ? 'hover:bg-slate-50 dark:hover:bg-slate-700' : 'opacity-50 cursor-not-allowed'}"
?disabled=${!this.canNavigatePrev()}
@оқlick=${this.handlePrevMonth}
aria-label="Previous month"
>
${svg`<svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M12.7 15.3a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 1.4L8.4 9l4.3 4.3a1 1 0 0 1 0 1.4z"></path></svg>`}
</button>
<div class="text-sm text-slate-900 dark:text-slate-100" aria-live="polite">
${new Intl.DateTimeFormat(this.locale || 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(this.viewYear, this.viewMonth, 1)))}
</div>
<button
class="p-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 ${this.canNavigateNext() ? 'hover:bg-slate-50 dark:hover:bg-slate-700' : 'opacity-50 cursor-not-allowed'}"
?disabled=${!this.canNavigateNext()}
@click=${this.handleNextMonth}
aria-label="Next month"
>
${svg`<svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M7.3 4.7a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4L11.6 10 7.3 5.7a1 1 0 0 1 0-1.4z"></path></svg>`}
</button>
</div>
<div class="grid grid-cols-7 gap-1 mb-1 text-xs text-slate-500 dark:text-slate-400">
${weekdayLabels.map((label) => html`<div class="text-center">${label}</div>`)}
</div>
<div class="grid grid-cols-${this.showWeekNumbers ? '8' : '7'} gap-1" role="grid">
${weeks.map((week, rowIndex) => {
const weekDayIndex = Math.max(1, rowIndex * 7 - offset + 1);
const weekDate = new Date(Date.UTC(this.viewYear, this.viewMonth, weekDayIndex));
const weekNumber = this.getISOWeekNumber(weekDate);
return html`
${this.showWeekNumbers ? html`<div class="w-9 h-9 text-xs flex items-center justify-center text-slate-400 dark:text-slate-500">${weekNumber}</div>` : html``}
${week.map((day) => {
if (!day) {
return html`<div class="w-9 h-9"></div>`;
}
const iso = this.toIsoDate(this.viewYear, this.viewMonth, day);
const parsed = this.parseIsoDate(iso);
const key = parsed ? this.toDateKey(parsed.year, parsed.month, parsed.day) : 0;
const isToday = key === todayKey;
const isSelected = selectedKey !== null && key === selectedKey;
const disabled = this.isDateDisabled(iso);
return html`
<button
class=${this.getDayClasses(isToday, isSelected, disabled)}
?disabled=${disabled}
role="gridcell"
aria-selected=${isSelected}
aria-disabled=${disabled}
@click=${() => this.handleSelectDay(day)}
>
${day}
</button>
`;
})}
`;
})}
</div>
<div class="mt-2 flex justify-end">
<button
class="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
@click=${this.handleClear}
?disabled=${this.disabled || this.readonly || this.loading}
>
${this.msg.clear}
</button>
</div>
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
<div class="w-full">
${this.renderLabel()}
<p class="text-sm text-slate-900 dark:text-slate-100">${this.formatDisplay(this.value)}</p>
</div>
`;
}

const hasError = !!this.error;
const labelId = this.hasSlot('Label') ? `${this.fieldId}-label` : '';
const describedBy = this.error ? `${this.fieldId}-error` : (this.hasSlot('Helper') ? `${this.fieldId}-helper` : '');

return html`
<div class=${this.getContainerClasses()}>
${this.renderLabel()}
<input type="hidden" name=${this.name} .value=${this.value || ''} />
<button
id=${this.fieldId}
class=${this.getTriggerClasses(hasError)}
@click=${this.handleToggleOpen}
@focus=${this.handleFocus}
@blur=${this.handleBlur}
aria-haspopup="dialog"
aria-expanded=${this.isOpen}
aria-labelledby=${labelId || nothing}
aria-describedby=${describedBy || nothing}
aria-invalid=${hasError ? 'true' : 'false'}
aria-required=${this.required ? 'true' : 'false'}
?disabled=${this.disabled}
>
<span class=${this.value ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}>
${this.formatTriggerValue()}
</span>
<span class="text-slate-400 dark:text-slate-500">
${svg`<svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1zm9 7H5v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9z"></path></svg>`}
</span>
</button>
${this.loading ? html`<div class="mt-2 text-xs text-slate-500 dark:text-slate-400">${this.msg.loading}</div>` : html``}
${this.renderCalendar()}
${this.renderHelperOrError()}
</div>
`;
}
}
