/// <mls fileReference="_102033_/l2/molecules/groupenterdatetimeinterval/ml-datetime-interval-timeline.ts" enhancement="_102020_/l2/enhancementAura"/>

// =============================================================================
// DATETIME INTERVAL TIMELINE MOLECULE
// =============================================================================
// Skill Group: enter + datetime-interval
// This molecule does NOT contain business logic.
import { html, TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';
/// **collab_i18n_start**
const message_en = {
    labelStart: 'Start',
    labelEnd: 'End',
    placeholder: 'Select date and time',
    loading: 'Loading...',
    rangeSeparator: '–',
    empty: '—',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
    en: message_en,
    pt: {
        labelStart: 'Início',
        labelEnd: 'Fim',
        placeholder: 'Selecione data e hora',
        loading: 'Carregando...',
        rangeSeparator: '–',
        empty: '—',
    },
};
/// **collab_i18n_end**

@customElement('groupenterdatetimeinterval--ml-datetime-interval-timeline')
export class DatetimeIntervalTimelineMolecule extends MoleculeAuraElement {
    private msg: MessageType = messages.en;
    // =========================================================================
    // SLOT TAGS
    // =========================================================================
    slotTags = ['Label', 'LabelStart', 'LabelEnd', 'Helper'];
    // =========================================================================
    // PROPERTIES — From Contract
    // =========================================================================
    @propertyDataSource({ type: String })
    startDatetime: string | null = null;

    @propertyDataSource({ type: String })
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

    // =========================================================================
    // INTERNAL STATE
    // =========================================================================
    @state()
    activeField: 'start' | 'end' | null = null;

    private uid = `dtint-${Math.random().toString(36).slice(2, 9)}`;

    // =========================================================================
    // EVENT HANDLERS
    // =========================================================================
    private onStartFocus() {
        if (this.disabled || this.readonly || this.loading) return;
        this.activeField = 'start';
        this.dispatchEvent(new CustomEvent('focus', { bubbles: true, composed: true }));
    }

    private onEndFocus() {
        if (this.disabled || this.readonly || this.loading) return;
        this.activeField = 'end';
        this.dispatchEvent(new CustomEvent('focus', { bubbles: true, composed: true }));
    }

    private onFieldBlur() {
        this.activeField = null;
        this.dispatchEvent(new CustomEvent('blur', { bubbles: true, composed: true }));
    }

    private onStartInput(e: Event) {
        if (this.disabled || this.readonly || this.loading) return;
        const input = e.target as HTMLInputElement;
        const value = this.fromInputValue(input.value);
        if (!this.isWithinMinMax(value)) return;
        this.startDatetime = value;
        this.dispatchEvent(new CustomEvent('startChange', {
            bubbles: true,
            composed: true,
            detail: { value: this.startDatetime },
        }));
        if (this.startDatetime && this.endDatetime && this.isValidRange(this.startDatetime, this.endDatetime)) {
            this.dispatchEvent(new CustomEvent('change', {
                bubbles: true,
                composed: true,
                detail: { startDatetime: this.startDatetime, endDatetime: this.endDatetime },
            }));
        }
    }

    private onEndInput(e: Event) {
        if (this.disabled || this.readonly || this.loading) return;
        const input = e.target as HTMLInputElement;
        const value = this.fromInputValue(input.value);
        if (!this.isWithinMinMax(value)) return;
        if (this.startDatetime && value && !this.isValidRange(this.startDatetime, value)) return;
        this.endDatetime = value;
        this.dispatchEvent(new CustomEvent('endChange', {
            bubbles: true,
            composed: true,
            detail: { value: this.endDatetime },
        }));
        if (this.startDatetime && this.endDatetime) {
            this.dispatchEvent(new CustomEvent('change', {
                bubbles: true,
                composed: true,
                detail: { startDatetime: this.startDatetime, endDatetime: this.endDatetime },
            }));
        }
    }

    // =========================================================================
    // HELPERS
    // =========================================================================
    private toInputValue(value: string | null): string {
        if (!value) return '';
        return value.length >= 16 ? value.slice(0, 16) : value;
    }

    private fromInputValue(value: string): string | null {
        if (!value) return null;
        return value.length === 16 ? `${value}:00` : value;
    }

    private toDate(value: string | null): Date | null {
        if (!value) return null;
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    private isWithinMinMax(value: string | null): boolean {
        if (!value) return true;
        const date = this.toDate(value);
        if (!date) return false;
        const min = this.toDate(this.minDatetime || null);
        const max = this.toDate(this.maxDatetime || null);
        if (min && date < min) return false;
        if (max && date > max) return false;
        return true;
    }

    private isValidRange(start: string, end: string): boolean {
        const s = this.toDate(start);
        const e = this.toDate(end);
        if (!s || !e) return false;
        const diff = e.getTime() - s.getTime();
        if (diff < 0) return false;
        if (!this.allowSameInstant && diff === 0) return false;
        const minutes = diff / 60000;
        if (this.minDurationMinutes && minutes < this.minDurationMinutes) return false;
        if (this.maxDurationMinutes && minutes > this.maxDurationMinutes) return false;
        return true;
    }

    private formatDateTime(value: string | null): string {
        if (!value) return this.msg.empty;
        const date = this.toDate(value);
        if (!date) return this.msg.empty;
        const formatter = new Intl.DateTimeFormat(this.locale || undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: this.locale === 'en-US',
            timeZone: this.timezone || undefined,
        });
        return formatter.format(date);
    }

    private formatRange(): string {
        const start = this.toDate(this.startDatetime);
        const end = this.toDate(this.endDatetime);
        if (!start && !end) return this.msg.empty;
        if (start && !end) return `${this.formatDateTime(this.startDatetime)} ${this.msg.rangeSeparator} ${this.msg.empty}`;
        if (!start && end) return `${this.msg.empty} ${this.msg.rangeSeparator} ${this.formatDateTime(this.endDatetime)}`;
        if (!start || !end) return this.msg.empty;
        const sameDay = start.toDateString() === end.toDateString();
        if (sameDay) {
            const dateFormatter = new Intl.DateTimeFormat(this.locale || undefined, {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                timeZone: this.timezone || undefined,
            });
            const timeFormatter = new Intl.DateTimeFormat(this.locale || undefined, {
                hour: '2-digit',
                minute: '2-digit',
                hour12: this.locale === 'en-US',
                timeZone: this.timezone || undefined,
            });
            return `${dateFormatter.format(start)} ${timeFormatter.format(start)} ${this.msg.rangeSeparator} ${timeFormatter.format(end)}`;
        }
        return `${this.formatDateTime(this.startDatetime)} ${this.msg.rangeSeparator} ${this.formatDateTime(this.endDatetime)}`;
    }

    private getContainerClasses(): string {
        return [
            'w-full rounded-lg border p-4 transition',
            'bg-white dark:bg-slate-800',
            'border-slate-200 dark:border-slate-700',
            this.error ? 'border-red-500 dark:border-red-400' : '',
            this.disabled ? 'opacity-50 cursor-not-allowed' : '',
            this.readonly ? 'bg-slate-50 dark:bg-slate-900' : '',
        ].filter(Boolean).join(' ');
    }

    private getInputClasses(active: boolean): string {
        return [
            'w-full rounded-md px-3 py-2 text-sm border transition',
            'bg-white dark:bg-slate-900',
            'text-slate-900 dark:text-slate-100',
            'placeholder:text-slate-400 dark:placeholder:text-slate-500',
            active
                ? 'border-sky-500 dark:border-sky-400'
                : 'border-slate-200 dark:border-slate-700',
            this.error ? 'border-red-500 dark:border-red-400' : '',
            this.disabled ? 'opacity-50 cursor-not-allowed' : '',
            'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
        ].filter(Boolean).join(' ');
    }

    private getMarkerClasses(active: boolean): string {
        return [
            'h-4 w-4 rounded-full border-2 absolute -top-1 transition',
            active
                ? 'bg-sky-500 dark:bg-sky-400 border-sky-500 dark:border-sky-400'
                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600',
            this.disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        ].filter(Boolean).join(' ');
    }

    private getTimelineProgressClasses(): string {
        return [
            'h-2 rounded-full absolute top-0 left-0 transition',
            'bg-sky-200 dark:bg-sky-900/40',
        ].join(' ');
    }

    private renderLabel(): TemplateResult {
        if (!this.hasSlot('Label')) return html``;
        return html`<div class="mb-2 text-sm text-slate-600 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Label'))}</div>`;
    }

    private renderHelperOrError(): TemplateResult {
        if (!this.isEditing) return html``;
        if (this.error) {
            return html`<p id="${this.uid}-error" class="mt-2 text-xs text-red-600 dark:text-red-400">${unsafeHTML(String(this.error))}</p>`;
        }
        if (this.hasSlot('Helper')) {
            return html`<p id="${this.uid}-helper" class="mt-2 text-xs text-slate-500 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Helper'))}</p>`;
        }
        return html``;
    }

    private renderViewMode(): TemplateResult {
        return html`
<div class="${this.getContainerClasses()}">
${this.renderLabel()}
<div class="text-sm text-slate-900 dark:text-slate-100">${this.formatRange()}</div>
</div>
`;
    }

    private renderTimeline(): TemplateResult {
        const start = this.toDate(this.startDatetime);
        const end = this.toDate(this.endDatetime);
        const min = this.toDate(this.minDatetime || this.startDatetime || null) || start || new Date();
        const max = this.toDate(this.maxDatetime || this.endDatetime || null) || end || new Date(min.getTime() + 3600000);
        const range = Math.max(1, max.getTime() - min.getTime());
        const startPct = start ? Math.max(0, Math.min(100, ((start.getTime() - min.getTime()) / range) * 100)) : 0;
        const endPct = end ? Math.max(0, Math.min(100, ((end.getTime() - min.getTime()) / range) * 100)) : 0;
        const progressLeft = Math.min(startPct, endPct);
        const progressWidth = Math.abs(endPct - startPct);
        return html`
<div class="relative mt-4">
<div class="h-2 rounded-full bg-slate-100 dark:bg-slate-700 relative">
<div class="${this.getTimelineProgressClasses()}" style="left: ${progressLeft}%; width: ${progressWidth}%;"></div>
<div
class="${this.getMarkerClasses(this.activeField === 'start')}"
style="left: ${startPct}%;"
role="button"
aria-label="${this.msg.labelStart}"
@click=${() => this.onStartFocus()}
></div>
<div
class="${this.getMarkerClasses(this.activeField === 'end')}"
style="left: ${endPct}%;"
role="button"
aria-label="${this.msg.labelEnd}"
@click=${() => this.onEndFocus()}
></div>
</div>
</div>
`;
    }

    // =========================================================================
    // RENDER
    // =========================================================================
    render() {
        const lang = this.getMessageKey(messages);
        this.msg = messages[lang];
        if (!this.isEditing) {
            return this.renderViewMode();
        }
        const labelStart = this.hasSlot('LabelStart') ? this.getSlotContent('LabelStart') : this.msg.labelStart;
        const labelEnd = this.hasSlot('LabelEnd') ? this.getSlotContent('LabelEnd') : this.msg.labelEnd;
        const describedBy = this.error ? `${this.uid}-error` : this.hasSlot('Helper') ? `${this.uid}-helper` : '';
        return html`
<div class="${this.getContainerClasses()}">
${this.renderLabel()}
<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
<div>
<label id="${this.uid}-label-start" class="mb-1 block text-xs text-slate-600 dark:text-slate-400">${unsafeHTML(labelStart)}</label>
<input
class="${this.getInputClasses(this.activeField === 'start')}"
type="datetime-local"
name="${this.name ? `${this.name}_start` : ''}"
.value=${this.toInputValue(this.startDatetime)}
step=${String(Math.max(1, this.minuteStep) * 60)}
?disabled=${this.disabled || this.loading}
?readonly=${this.readonly}
placeholder="${this.msg.placeholder}"
aria-labelledby="${this.uid}-label-start"
aria-describedby="${describedBy}"
aria-invalid="${this.error ? 'true' : 'false'}"
aria-required="${this.required ? 'true' : 'false'}"
@focus=${this.onStartFocus}
@blur=${this.onFieldBlur}
@change=${this.onStartInput}
/>
</div>
<div>
<label id="${this.uid}-label-end" class="mb-1 block text-xs text-slate-600 dark:text-slate-400">${unsafeHTML(labelEnd)}</label>
<input
class="${this.getInputClasses(this.activeField === 'end')}"
type="datetime-local"
name="${this.name ? `${this.name}_end` : ''}"
.value=${this.toInputValue(this.endDatetime)}
step=${String(Math.max(1, this.minuteStep) * 60)}
?disabled=${this.disabled || this.loading}
?readonly=${this.readonly}
placeholder="${this.msg.placeholder}"
aria-labelledby="${this.uid}-label-end"
aria-describedby="${describedBy}"
aria-invalid="${this.error ? 'true' : 'false'}"
aria-required="${this.required ? 'true' : 'false'}"
@focus=${this.onEndFocus}
@blur=${this.onFieldBlur}
@change=${this.onEndInput}
/>
</div>
</div>
${this.loading ? html`<div class="mt-3 text-xs text-slate-500 dark:text-slate-400">${this.msg.loading}</div>` : html``}
${this.renderTimeline()}
${this.renderHelperOrError()}
</div>
`;
    }
}
