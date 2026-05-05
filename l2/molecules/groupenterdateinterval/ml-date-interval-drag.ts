/// <mls fileReference="_102033_/l2/molecules/groupenterdateinterval/ml-date-interval-drag.ts" enhancement="_102020_/l2/enhancementAura"/>
// =============================================================================
// DATE INTERVAL DRAG MOLECULE
// =============================================================================
// Skill Group: enter + date-interval
// This molecule does NOT contain business logic.
import { html, TemplateResult, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';

import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';
/// **collab_i18n_start**
const message_en = {
loading: 'Loading...',
startLabel: 'Start',
endLabel: 'End',
rangeSeparator: '–',
empty: '—',
prevMonth: 'Previous month',
nextMonth: 'Next month',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
en: message_en,
pt: {
loading: 'Carregando...',
startLabel: 'Início',
endLabel: 'Fim',
rangeSeparator: '–',
empty: '—',
prevMonth: 'Mês anterior',
nextMonth: 'Próximo mês',
},
};
/// **collab_i18n_end**
@customElement('groupenterdateinterval--ml-date-interval-drag')
export class DateIntervalDragMolecule extends MoleculeAuraElement {
private msg: MessageType = messages.en;
// ===========================================================================
// SLOT TAGS
// ===========================================================================
slotTags = ['Label', 'LabelStart', 'LabelEnd', 'Helper'];
// ===========================================================================
// PROPERTIES — From Contract
// ===========================================================================
@propertyDataSource({ type: String })
startDate: string | null = null;
@propertyDataSource({ type: String })
endDate: string | null = null;
@propertyDataSource({ type: String })
error: string = '';
@propertyDataSource({ type: String })
name: string = '';
@propertyDataSource({ type: String })
locale: string = '';
@propertyDataSource({ type: String })
minDate: string = '';
@propertyDataSource({ type: String })
maxDate: string = '';
@propertyDataSource({ type: Number, attribute: 'min-range-days' })
minRangeDays: number = 0;
@propertyDataSource({ type: Number, attribute: 'max-range-days' })
maxRangeDays: number = 0;
@propertyDataSource({ type: Number, attribute: 'first-day-of-week' })
firstDayOfWeek: number = 0;
@propertyDataSource({ type: Boolean, attribute: 'allow-same-day' })
allowSameDay: boolean = true;
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
private isOpen: boolean = true;
@state()
private selectingEnd: boolean = false;
@state()
private hoverDate: string | null = null;
@state()
private isDragging: boolean = false;
@state()
private hoverValid: boolean = true;
@state()
private currentMonth: Date = new Date();
@state()
private hasFocus: boolean = false;
// ===========================================================================
// INTERNAL IDS
// ===========================================================================
private labelId: string = `lbl-${Math.random().toString(36).slice(2, 9)}`;
private errorId: string = `err-${Math.random().toString(36).slice(2, 9)}`;
private helperId: string = `hlp-${Math.random().toString(36).slice(2, 9)}`;
// ===========================================================================
// LIFECYCLE
// ===========================================================================
connectedCallback() {
super.connectedCallback();
this.syncCurrentMonth();
}
updated(changed: Map<string, unknown>) {
if (changed.has('startDate') || changed.has('endDate')) {
this.syncCurrentMonth();
}
}
// ===========================================================================
// EVENT HANDLERS
// ===========================================================================
private handleDayPointerDown(e: PointerEvent, iso: string) {
if (this.disabled || this.readonly || this.loading) return;
if (!this.isDateSelectableForStart(iso)) return;
e.preventDefault();
this.isDragging = true;
this.selectingEnd = true;
this.hoverDate = iso;
this.hoverValid = this.isDateSelectableForEnd(iso);
this.startDate = iso;
this.endDate = null;
this.dispatchEvent(
new CustomEvent('startChange', {
bubbles: true,
composed: true,
detail: { value: this.startDate },
})
);
window.addEventListener('pointerup', this.handleWindowPointerUp);
window.addEventListener('pointercancel', this.handleWindowPointerUp);
}
private handleDayPointerEnter(iso: string) {
if (!this.isDragging || !this.selectingEnd) return;
this.hoverDate = iso;
this.hoverValid = this.isDateSelectableForEnd(iso);
}
private handleDayPointerUp(e: PointerEvent, iso: string) {
if (!this.isDragging) return;
e.preventDefault();
this.finishDrag(iso);
}
private handleWindowPointerUp = () => {
if (!this.isDragging) return;
this.finishDrag(this.hoverDate);
};
private finishDrag(candidateIso: string | null) {
this.isDragging = false;
window.removeEventListener('pointerup', this.handleWindowPointerUp);
window.removeEventListener('pointercancel', this.handleWindowPointerUp);
if (!this.startDate || !candidateIso) return;
if (!this.isDateSelectableForEnd(candidateIso)) {
this.hoverDate = null;
this.selectingEnd = true;
return;
}
const ordered = this.getOrderedRange(this.startDate, candidateIso);
const swapped = ordered.start !== this.startDate;
this.startDate = ordered.start;
this.endDate = ordered.end;
this.selectingEnd = false;
this.hoverDate = null;
if (swapped) {
this.dispatchEvent(
new CustomEvent('startChange', {
bubbles: true,
composed: true,
detail: { value: this.startDate },
})
);
}
this.dispatchEvent(
new CustomEvent('endChange', {
bubbles: true,
composed: true,
detail: { value: this.endDate },
})
);
this.dispatchEvent(
new CustomEvent('change', {
bubbles: true,
composed: true,
detail: { startDate: this.startDate, endDate: this.endDate },
})
);
}
private handlePrevMonth() {
if (!this.canNavigatePrev()) return;
this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() - 1, 1);
}
private handleNextMonth() {
if (!this.canNavigateNext()) return;
this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1);
}
private handleFocusIn() {
if (this.hasFocus) return;
this.hasFocus = true;
this.dispatchEvent(new CustomEvent('focus', { bubbles: true, composed: true }));
}
private handleFocusOut() {
if (!this.hasFocus) return;
this.hasFocus = false;
this.dispatchEvent(new CustomEvent('blur', { bubbles: true, composed: true }));
}
// ===========================================================================
// HELPERS
// ===========================================================================
private getLocale(): string {
return this.locale || navigator.language || 'en-US';
}
private syncCurrentMonth() {
const baseIso = this.startDate || this.endDate;
if (!baseIso) return;
const d = this.parseIsoDate(baseIso);
if (d) {
this.currentMonth = new Date(d.getFullYear(), d.getMonth(), 1);
}
}
private parseIsoDate(value: string | null): Date | null {
if (!value) return null;
const parts = value.split('-').map((p) => Number(p));
if (parts.length !== 3) return null;
const [y, m, d] = parts;
if (!y || !m || !d) return null;
return new Date(y, m - 1, d);
}
private formatIsoDate(date: Date): string {
const y = date.getFullYear();
const m = String(date.getMonth() + 1).padStart(2, '0');
const d = String(date.getDate()).padStart(2, '0');
return `${y}-${m}-${d}`;
}
private formatDisplayDate(value: string): string {
const date = this.parseIsoDate(value);
if (!date) return this.msg.empty;
const formatter = new Intl.DateTimeFormat(this.getLocale(), {
day: '2-digit',
month: '2-digit',
year: 'numeric',
});
return formatter.format(date);
}
private diffInDays(a: string, b: string): number {
const da = this.parseIsoDate(a);
const db = this.parseIsoDate(b);
if (!da || !db) return 0;
const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
return Math.abs(Math.round((ub - ua) / 86400000));
}
private compareIso(a: string, b: string): number {
return this.formatIsoDate(this.parseIsoDate(a) as Date).localeCompare(
this.formatIsoDate(this.parseIsoDate(b) as Date)
);
}
private getOrderedRange(a: string, b: string): { start: string; end: string } {
return this.compareIso(a, b) <= 0 ? { start: a, end: b } : { start: b, end: a };
}
private isWithinMinMax(iso: string): boolean {
const min = this.minDate ? this.minDate : null;
const max = this.maxDate ? this.maxDate : null;
if (min && this.compareIso(iso, min) < 0) return false;
if (max && this.compareIso(iso, max) > 0) return false;
return true;
}
private isDateSelectableForStart(iso: string): boolean {
return this.isWithinMinMax(iso);
}
private isDateSelectableForEnd(iso: string): boolean {
if (!this.startDate) return false;
if (!this.isWithinMinMax(iso)) return false;
const diff = this.diffInDays(this.startDate, iso);
if (!this.allowSameDay && diff === 0) return false;
if (this.minRangeDays > 0 && diff < this.minRangeDays) return false;
if (this.maxRangeDays > 0 && diff > this.maxRangeDays) return false;
return true;
}
private getWeekdayLabels(): string[] {
const locale = this.getLocale();
const base = new Date(2021, 7, 1); // Sunday
const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
const labels: string[] = [];
for (let i = 0; i < 7; i += 1) {
const offset = (i + this.firstDayOfWeek) % 7;
const date = new Date(base);
date.setDate(base.getDate() + offset);
labels.push(formatter.format(date));
}
return labels;
}
private getCalendarDays(): { date: Date; iso: string; isOutside: boolean }[] {
const year = this.currentMonth.getFullYear();
const month = this.currentMonth.getMonth();
const monthStart = new Date(year, month, 1);
const firstWeekday = (monthStart.getDay() - this.firstDayOfWeek + 7) % 7;
const daysInMonth = new Date(year, month + 1, 0).getDate();
const cells: { date: Date; iso: string; isOutside: boolean }[] = [];
for (let i = 0; i < 42; i += 1) {
const dayNumber = i - firstWeekday + 1;
const date = new Date(year, month, dayNumber);
const iso = this.formatIsoDate(date);
const isOutside = dayNumber < 1 || dayNumber > daysInMonth;
cells.push({ date, iso, isOutside });
}
return cells;
}
private getActiveRange(): { start: string | null; end: string | null; preview: boolean } {
if (this.selectingEnd && this.startDate && this.hoverDate && this.hoverValid) {
const range = this.getOrderedRange(this.startDate, this.hoverDate);
return { start: range.start, end: range.end, preview: true };
}
if (this.startDate && this.endDate) {
const range = this.getOrderedRange(this.startDate, this.endDate);
return { start: range.start, end: range.end, preview: false };
}
return { start: null, end: null, preview: false };
}
private isInRange(iso: string, start: string | null, end: string | null): boolean {
if (!start || !end) return false;
return this.compareIso(iso, start) >= 0 && this.compareIso(iso, end) <= 0;
}
private getMonthLabel(): string {
const formatter = new Intl.DateTimeFormat(this.getLocale(), { month: 'long', year: 'numeric' });
return formatter.format(this.currentMonth);
}
private canNavigatePrev(): boolean {
if (!this.minDate) return true;
const min = this.parseIsoDate(this.minDate);
if (!min) return true;
const minMonth = new Date(min.getFullYear(), min.getMonth(), 1);
return this.currentMonth.getTime() > minMonth.getTime();
}
private canNavigateNext(): boolean {
if (!this.maxDate) return true;
const max = this.parseIsoDate(this.maxDate);
if (!max) return true;
const maxMonth = new Date(max.getFullYear(), max.getMonth(), 1);
return this.currentMonth.getTime() < maxMonth.getTime();
}
private getRangeSummary(): string {
const start = this.startDate ? this.formatDisplayDate(this.startDate) : this.msg.empty;
const end = this.endDate ? this.formatDisplayDate(this.endDate) : this.msg.empty;
if (!this.startDate && !this.endDate) return this.msg.empty;
return `${start} ${this.msg.rangeSeparator} ${end}`;
}
private getDayClasses(options: {
isOutside: boolean;
isDisabled: boolean;
isInRange: boolean;
isStart: boolean;
isEnd: boolean;
isHover: boolean;
isHoverInvalid: boolean;
}): string {
const classes = [
'flex h-9 w-9 items-center justify-center rounded-md text-sm transition',
'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
options.isOutside ? 'text-slate-400 dark:text-slate-600' : 'text-slate-900 dark:text-slate-100',
!options.isDisabled ? 'hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer' : 'cursor-not-allowed opacity-50',
options.isInRange
? 'bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
: 'bg-transparent',
options.isStart || options.isEnd
? 'bg-sky-500 dark:bg-sky-400 text-white dark:text-slate-900'
: '',
options.isHover && options.isHoverInvalid ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' : '',
].filter(Boolean);
return classes.join(' ');
}
// ===========================================================================
// RENDER
// ===========================================================================
render() {
const lang = this.getMessageKey(messages);
this.msg = messages[lang];
const hasError = Boolean(this.error);
const hasHelper = !hasError && this.hasSlot('Helper');
const describedBy = hasError ? this.errorId : hasHelper ? this.helperId : undefined;
const wrapperClasses = [
'relative rounded-lg border p-3',
'bg-white dark:bg-slate-800',
'border-slate-200 dark:border-slate-700',
hasError ? 'border-red-500 dark:border-red-400' : '',
this.disabled ? 'opacity-50 cursor-not-allowed' : '',
this.readonly ? 'bg-slate-50 dark:bg-slate-900' : '',
].filter(Boolean).join(' ');
return html`
<div class="w-full">
${this.renderOverallLabel()}
<div
class="${wrapperClasses}"
role="group"
aria-labelledby=${ifDefined(this.hasSlot('Label') ? this.labelId : undefined)}
aria-describedby=${ifDefined(describedBy)}
aria-invalid=${ifDefined(hasError ? 'true' : undefined)}
aria-required=${ifDefined(this.required ? 'true' : undefined)}
@focusin=${this.handleFocusIn}
@focusout=${this.handleFocusOut}
>
${this.renderHeader()}
<div role="dialog" aria-modal="true">
${this.renderCalendar()}
</div>
${this.loading ? this.renderLoading() : nothing}
</div>
${this.renderFeedback()}
</div>
`;
}
private renderOverallLabel(): TemplateResult {
if (!this.hasSlot('Label')) return html``;
return html`
<div id="${this.labelId}" class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
${unsafeHTML(this.getSlotContent('Label'))}
</div>
`;
}
private renderHeader(): TemplateResult {
const labelStart = this.hasSlot('LabelStart')
? unsafeHTML(this.getSlotContent('LabelStart'))
: this.msg.startLabel;
const labelEnd = this.hasSlot('LabelEnd')
? unsafeHTML(this.getSlotContent('LabelEnd'))
: this.msg.endLabel;
const prevDisabled = !this.canNavigatePrev();
const nextDisabled = !this.canNavigateNext();
const navBtnBase = [
'rounded-md p-1 text-slate-600 dark:text-slate-300',
'hover:bg-slate-50 dark:hover:bg-slate-700',
'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
].join(' ');
const navBtnDisabled = 'opacity-50 cursor-not-allowed';
return html`
<div class="mb-2 flex items-center justify-between">
<div class="text-sm text-slate-600 dark:text-slate-400">
<span class="font-medium text-slate-700 dark:text-slate-200">${labelStart}</span>
<span class="ml-1 mr-2">${this.getRangeSummary().split(this.msg.rangeSeparator)[0].trim()}</span>
<span class="mx-1 text-slate-400 dark:text-slate-500">${this.msg.rangeSeparator}</span>
<span class="font-medium text-slate-700 dark:text-slate-200">${labelEnd}</span>
<span class="ml-1">${this.getRangeSummary().split(this.msg.rangeSeparator)[1]?.trim() || this.msg.empty}</span>
</div>
<div class="flex items-center gap-2">
<button
type="button"
class="${prevDisabled ? `${navBtnBase} ${navBtnDisabled}` : navBtnBase}"
?disabled=${prevDisabled}
aria-label="${this.msg.prevMonth}"
@click=${this.handlePrevMonth}
>
‹
</button>
<div class="text-sm font-medium text-slate-700 dark:text-slate-200">
${this.getMonthLabel()}
</div>
<button
type="button"
class="${nextDisabled ? `${navBtnBase} ${navBtnDisabled}` : navBtnBase}"
?disabled=${nextDisabled}
aria-label="${this.msg.nextMonth}"
@click=${this.handleNextMonth}
>
›
</button>
</div>
</div>
`;
}
private renderCalendar(): TemplateResult {
const weekdays = this.getWeekdayLabels();
const days = this.getCalendarDays();
const range = this.getActiveRange();
const todayIso = this.formatIsoDate(new Date());
return html`
<div class="w-full">
<div class="grid grid-cols-7 gap-1 text-center text-xs text-slate-500 dark:text-slate-400">
${weekdays.map((label) => html`<div class="py-1">${label}</div>`)}
</div>
<div role="grid" class="mt-1 grid grid-cols-7 gap-1">
${days.map((day) => {
const isStart = range.start === day.iso;
const isEnd = range.end === day.iso;
const isInRange = this.isInRange(day.iso, range.start, range.end);
const isHover = this.hoverDate === day.iso;
const isDisabled =
this.disabled ||
this.readonly ||
(!this.selectingEnd && !this.isDateSelectableForStart(day.iso)) ||
(this.selectingEnd && !this.isDateSelectableForEnd(day.iso));
const classes = this.getDayClasses({
isOutside: day.isOutside,
isDisabled,
isInRange,
isStart,
isEnd,
isHover,
isHoverInvalid: isHover && !this.hoverValid,
});
return html`
<button
type="button"
class="${classes}"
role="gridcell"
aria-selected="${isInRange ? 'true' : 'false'}"
aria-disabled="${isDisabled ? 'true' : 'false'}"
data-today="${day.iso === todayIso ? 'true' : 'false'}"
@pointerdown=${(e: PointerEvent) => this.handleDayPointerDown(e, day.iso)}
@pointerenter=${() => this.handleDayPointerEnter(day.iso)}
@pointerup=${(e: PointerEvent) => this.handleDayPointerUp(e, day.iso)}
>
${day.date.getDate()}
</button>
`;
})}
</div>
</div>
`;
}
private renderFeedback(): TemplateResult {
if (this.error) {
return html`
<p id="${this.errorId}" class="mt-2 text-xs text-red-600 dark:text-red-400">
${unsafeHTML(String(this.error))}
</p>
`;
}
if (this.hasSlot('Helper')) {
return html`
<p id="${this.helperId}" class="mt-2 text-xs text-slate-500 dark:text-slate-400">
${unsafeHTML(this.getSlotContent('Helper'))}
</p>
`;
}
return html``;
}
private renderLoading(): TemplateResult {
return html`
<div class="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70 dark:bg-slate-800/70">
<span class="text-sm text-slate-600 dark:text-slate-300">${this.msg.loading}</span>
</div>
`;
}
}
