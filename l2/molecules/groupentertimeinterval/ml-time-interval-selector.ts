/// <mls fileReference="_102033_/l2/molecules/groupentertimeinterval/ml-time-interval-selector.ts" enhancement="_102020_/l2/enhancementAura" />

// =============================================================================
// ML TIME INTERVAL SELECTOR MOLECULE
// =============================================================================
// Skill Group: enter + time-interval
// This molecule does NOT contain business logic.
import { html, TemplateResult, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
  placeholderStart: 'Start time',
  placeholderEnd: 'End time',
  loading: 'Loading...',
  confirm: 'Confirm',
  clear: 'Clear',
  nextDay: '(+1)',
  empty: '—',
};

type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
  en: message_en,
  pt: {
    placeholderStart: 'Início',
    placeholderEnd: 'Fim',
    loading: 'Carregando...',
    confirm: 'Confirmar',
    clear: 'Limpar',
    nextDay: '(+1)',
    empty: '—',
  },
};
/// **collab_i18n_end**

@customElement('groupentertimeinterval--ml-time-interval-selector')
export class MlTimeIntervalSelectorMolecule extends MoleculeAuraElement {
  private msg: MessageType = messages.en;
  private uid = `ti-${Math.random().toString(36).slice(2)}`;

  // =========================================================================
  // SLOT TAGS
  // =========================================================================
  slotTags = ['Label', 'LabelStart', 'LabelEnd', 'Helper'];

  // =========================================================================
  // PROPERTIES — From Contract
  // =========================================================================
  @propertyDataSource({ type: String })
  startTime: string | null = null;

  @propertyDataSource({ type: String })
  endTime: string | null = null;

  @propertyDataSource({ type: String })
  error = '';

  @propertyDataSource({ type: String })
  name = '';

  @propertyDataSource({ type: String })
  locale = '';

  @propertyDataSource({ type: Boolean, attribute: 'hour12' })
  hour12 = false;

  @propertyDataSource({ type: Boolean, attribute: 'show-seconds' })
  showSeconds = false;

  @propertyDataSource({ type: Number, attribute: 'minute-step' })
  minuteStep = 1;

  @propertyDataSource({ type: String, attribute: 'min-time' })
  minTime = '';

  @propertyDataSource({ type: String, attribute: 'max-time' })
  maxTime = '';

  @propertyDataSource({ type: Number, attribute: 'min-duration-minutes' })
  minDurationMinutes = 0;

  @propertyDataSource({ type: Number, attribute: 'max-duration-minutes' })
  maxDurationMinutes = 0;

  @propertyDataSource({ type: Boolean, attribute: 'allow-overnight' })
  allowOvernight = false;

  @propertyDataSource({ type: Boolean, attribute: 'allow-same-time' })
  allowSameTime = false;

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

  // =========================================================================
  // INTERNAL STATE
  // =========================================================================
  @state()
  private activeField: 'start' | 'end' | null = null;

  @state()
  private tempHour = 0;

  @state()
  private tempMinute = 0;

  @state()
  private tempSecond = 0;

  @state()
  private tempAmPm: 'AM' | 'PM' = 'AM';

  // =========================================================================
  // STATE CHANGE HANDLER
  // =========================================================================
  handleIcaStateChange(key: string, value: any) {
    const startAttr = this.getAttribute('startTime');
    const endAttr = this.getAttribute('endTime');
    if ((startAttr === `{{${key}}}` && this.activeField === 'start') || (endAttr === `{{${key}}}` && this.activeField === 'end')) {
      const current = this.activeField === 'start' ? value : value;
      this.initTempFromTime(current as string | null);
    }
    this.requestUpdate();
  }

  // =========================================================================
  // EVENT HANDLERS
  // =========================================================================
  private handleOpen(field: 'start' | 'end') {
    if (this.disabled || this.readonly || this.loading) return;
    this.activeField = field;
    const current = field === 'start' ? this.startTime : this.endTime;
    this.initTempFromTime(current);
    this.dispatchEvent(new CustomEvent('focus', { bubbles: true, composed: true }));
  }

  private handleClose() {
    if (this.activeField === null) return;
    this.activeField = null;
    this.dispatchEvent(new CustomEvent('blur', { bubbles: true, composed: true }));
  }

  private handleConfirm() {
    if (this.disabled || this.readonly || this.loading) return;
    const time = this.getTimeFromTemp();
    const field = this.activeField;
    if (!field) return;

    if (!this.isTimeValidForField(field, time)) return;

    if (field === 'start') {
      this.startTime = time;
      this.dispatchEvent(new CustomEvent('startChange', {
        bubbles: true,
        composed: true,
        detail: { value: this.startTime },
      }));
      if (this.endTime) {
        this.dispatchEvent(new CustomEvent('change', {
          bubbles: true,
          composed: true,
          detail: { startTime: this.startTime, endTime: this.endTime },
        }));
        this.activeField = null;
      } else {
        this.activeField = 'end';
        this.initTempFromTime(this.endTime);
      }
    } else {
      this.endTime = time;
      this.dispatchEvent(new CustomEvent('endChange', {
        bubbles: true,
        composed: true,
        detail: { value: this.endTime },
      }));
      this.dispatchEvent(new CustomEvent('change', {
        bubbles: true,
        composed: true,
        detail: { startTime: this.startTime, endTime: this.endTime },
      }));
      this.activeField = null;
    }
  }

  private handleClear() {
    if (this.disabled || this.readonly || this.loading) return;
    const field = this.activeField;
    if (!field) return;

    if (field === 'start') {
      this.startTime = null;
      this.dispatchEvent(new CustomEvent('startChange', {
        bubbles: true,
        composed: true,
        detail: { value: this.startTime },
      }));
    } else {
      this.endTime = null;
      this.dispatchEvent(new CustomEvent('endChange', {
        bubbles: true,
        composed: true,
        detail: { value: this.endTime },
      }));
    }
  }

  private handleHourChange(e: Event) {
    const value = Number((e.target as HTMLSelectElement).value);
    this.tempHour = value;
  }

  private handleMinuteChange(e: Event) {
    const value = Number((e.target as HTMLSelectElement).value);
    this.tempMinute = value;
  }

  private handleSecondChange(e: Event) {
    const value = Number((e.target as HTMLSelectElement).value);
    this.tempSecond = value;
  }

  private handleAmPmChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value as 'AM' | 'PM';
    this.tempAmPm = value;
  }

  // =========================================================================
  // HELPERS
  // =========================================================================
  private parseTime(value: string | null): { hour: number; minute: number; second: number } | null {
    if (!value) return null;
    const parts = value.split(':').map((v) => Number(v));
    if (parts.length < 2) return null;
    const [hour, minute, second = 0] = parts;
    if (Number.isNaN(hour) || Number.isNaN(minute) || Number.isNaN(second)) return null;
    return { hour, minute, second };
  }

  private formatToStorage(hour: number, minute: number, second: number): string {
    const h = String(hour).padStart(2, '0');
    const m = String(minute).padStart(2, '0');
    const s = String(second).padStart(2, '0');
    return this.showSeconds ? `${h}:${m}:${s}` : `${h}:${m}`;
  }

  private formatForDisplay(value: string | null): string {
    if (!value) return this.msg.empty;
    const parsed = this.parseTime(value);
    if (!parsed) return this.msg.empty;

    const date = new Date(1970, 0, 1, parsed.hour, parsed.minute, parsed.second);
    const options: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: this.hour12,
    };
    if (this.showSeconds) {
      options.second = '2-digit';
    }
    const locale = this.locale || undefined;
    return new Intl.DateTimeFormat(locale, options).format(date);
  }

  private initTempFromTime(value: string | null) {
    const parsed = this.parseTime(value) || this.parseTime(this.minTime) || { hour: 0, minute: 0, second: 0 };
    if (this.hour12) {
      const { hour12, ampm } = this.toHour12(parsed.hour);
      this.tempHour = hour12;
      this.tempAmPm = ampm;
    } else {
      this.tempHour = parsed.hour;
      this.tempAmPm = parsed.hour >= 12 ? 'PM' : 'AM';
    }
    this.tempMinute = parsed.minute;
    this.tempSecond = parsed.second;
  }

  private toHour12(hour24: number): { hour12: number; ampm: 'AM' | 'PM' } {
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    const hour = hour24 % 12 || 12;
    return { hour12: hour, ampm };
  }

  private toHour24(hour12Value: number, ampm: 'AM' | 'PM'): number {
    const base = hour12Value % 12;
    return ampm === 'PM' ? base + 12 : base;
  }

  private getTimeFromTemp(): string {
    const hour = this.hour12 ? this.toHour24(this.tempHour, this.tempAmPm) : this.tempHour;
    return this.formatToStorage(hour, this.tempMinute, this.showSeconds ? this.tempSecond : 0);
  }

  private toSeconds(value: string): number {
    const parsed = this.parseTime(value);
    if (!parsed) return 0;
    return parsed.hour * 3600 + parsed.minute * 60 + parsed.second;
  }

  private isTimeWithinLimits(value: string): boolean {
    const seconds = this.toSeconds(value);
    if (this.minTime) {
      const min = this.toSeconds(this.minTime);
      if (seconds < min) return false;
    }
    if (this.maxTime) {
      const max = this.toSeconds(this.maxTime);
      if (seconds > max) return false;
    }
    return true;
  }

  private isOvernight(start: string | null, end: string | null): boolean {
    if (!start || !end) return false;
    return this.allowOvernight && this.toSeconds(end) < this.toSeconds(start);
  }

  private calcDurationMinutes(start: string, end: string): number {
    const startMin = Math.floor(this.toSeconds(start) / 60);
    const endMin = Math.floor(this.toSeconds(end) / 60);
    if (this.allowOvernight && endMin < startMin) {
      return 24 * 60 - startMin + endMin;
    }
    return endMin - startMin;
  }

  private isEndTimeValid(endValue: string): boolean {
    if (!this.startTime) return true;
    const startSeconds = this.toSeconds(this.startTime);
    const endSeconds = this.toSeconds(endValue);

    if (!this.allowOvernight) {
      if (this.allowSameTime) {
        if (endSeconds < startSeconds) return false;
      } else {
        if (endSeconds <= startSeconds) return false;
      }
    }

    const duration = this.calcDurationMinutes(this.startTime, endValue);
    if (this.minDurationMinutes > 0 && duration < this.minDurationMinutes) return false;
    if (this.maxDurationMinutes > 0 && duration > this.maxDurationMinutes) return false;

    return true;
  }

  private isTimeValidForField(field: 'start' | 'end', value: string): boolean {
    if (!this.isTimeWithinLimits(value)) return false;
    if (field === 'end') {
      return this.isEndTimeValid(value);
    }
    return true;
  }

  private getRangeDisplay(): string {
    const startDisplay = this.startTime ? this.formatForDisplay(this.startTime) : this.msg.empty;
    const endDisplay = this.endTime ? this.formatForDisplay(this.endTime) : this.msg.empty;
    const overnight = this.isOvernight(this.startTime, this.endTime);
    const suffix = overnight ? ` ${this.msg.nextDay}` : '';
    return `${startDisplay} – ${endDisplay}${suffix}`;
  }

  private getInputClasses(active: boolean): string {
    return [
      'w-full rounded-lg border px-3 py-2 text-sm transition flex items-center justify-between',
      'bg-white dark:bg-slate-900',
      'text-slate-900 dark:text-slate-100',
      'placeholder:text-slate-400 dark:placeholder:text-slate-500',
      active ? 'border-sky-500 dark:border-sky-400' : 'border-slate-200 dark:border-slate-700',
      this.error ? 'border-red-500 dark:border-red-400' : '',
      'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
      this.disabled || this.loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    ].filter(Boolean).join(' ');
  }

  private getPickerClasses(): string {
    return [
      'mt-2 rounded-lg border p-4 shadow-sm',
      'bg-white dark:bg-slate-800',
      'border-slate-200 dark:border-slate-700',
    ].join(' ');
  }

  private getSelectClasses(): string {
    return [
      'w-full rounded-md border px-2 py-1 text-sm',
      'bg-white dark:bg-slate-900',
      'text-slate-900 dark:text-slate-100',
      'border-slate-200 dark:border-slate-700',
      'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
      this.disabled || this.loading ? 'opacity-50 cursor-not-allowed' : '',
    ].filter(Boolean).join(' ');
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

    return this.renderEditMode();
  }

  private renderViewMode(): TemplateResult {
    return html`
      <div class="w-full">
        ${this.hasSlot('Label')
        ? html`<div id="${this.uid}-label" class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              ${unsafeHTML(this.getSlotContent('Label'))}
            </div>`
        : nothing}
        <div class="text-sm text-slate-900 dark:text-slate-100">
          ${this.getRangeDisplay()}
        </div>
      </div>
    `;
  }

  private renderEditMode(): TemplateResult {
    const startLabelId = `${this.uid}-start-label`;
    const endLabelId = `${this.uid}-end-label`;
    const errorId = `${this.uid}-error`;

    return html`
      <div class="w-full">
        ${this.hasSlot('Label')
        ? html`<div id="${this.uid}-label" class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              ${unsafeHTML(this.getSlotContent('Label'))}
            </div>`
        : nothing}

        <div class="grid grid-cols-2 gap-3">
          <div>
            ${this.hasSlot('LabelStart')
        ? html`<div id="${startLabelId}" class="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                  ${unsafeHTML(this.getSlotContent('LabelStart'))}
                </div>`
        : nothing}
            <button
              class="${this.getInputClasses(this.activeField === 'start')}"
              type="button"
              aria-haspopup="dialog"
              aria-expanded="${this.activeField === 'start'}"
              aria-labelledby="${startLabelId}"
              aria-describedby="${this.error ? errorId : ''}"
              aria-invalid="${this.error ? 'true' : 'false'}"
              aria-required="${this.required ? 'true' : 'false'}"
              @click="${() => this.handleOpen('start')}"
            >
              <span>
                ${this.startTime ? this.formatForDisplay(this.startTime) : this.msg.placeholderStart}
              </span>
              ${this.renderClockIcon()}
            </button>
          </div>

          <div>
            ${this.hasSlot('LabelEnd')
        ? html`<div id="${endLabelId}" class="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                  ${unsafeHTML(this.getSlotContent('LabelEnd'))}
                </div>`
        : nothing}
            <button
              class="${this.getInputClasses(this.activeField === 'end')}"
              type="button"
              aria-haspopup="dialog"
              aria-expanded="${this.activeField === 'end'}"
              aria-labelledby="${endLabelId}"
              aria-describedby="${this.error ? errorId : ''}"
              aria-invalid="${this.error ? 'true' : 'false'}"
              aria-required="${this.required ? 'true' : 'false'}"
              @click="${() => this.handleOpen('end')}"
            >
              <span class="flex items-center gap-2">
                ${this.endTime ? this.formatForDisplay(this.endTime) : this.msg.placeholderEnd}
                ${this.isOvernight(this.startTime, this.endTime)
        ? html`<span class="rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" aria-label="${this.msg.nextDay}">
                      ${this.msg.nextDay}
                    </span>`
        : nothing}
              </span>
              ${this.renderClockIcon()}
            </button>
          </div>
        </div>

        ${this.loading
        ? html`<div class="mt-2 text-xs text-slate-500 dark:text-slate-400">${this.msg.loading}</div>`
        : nothing}

        ${this.renderPicker()}
        ${this.renderFeedback(errorId)}
      </div>
    `;
  }

  private renderPicker(): TemplateResult {
    if (!this.activeField || this.loading) return html``;

    const invalid = !this.isTimeValidForField(this.activeField, this.getTimeFromTemp());

    return html`
      <div class="${this.getPickerClasses()}" role="dialog" aria-modal="true">
        <div class="grid ${this.showSeconds ? 'grid-cols-3' : 'grid-cols-2'} gap-3">
          <div>
            <label class="mb-1 block text-xs text-slate-500 dark:text-slate-400">${this.hour12 ? 'Hour' : 'Hour'}</label>
            <select class="${this.getSelectClasses()}" @change="${this.handleHourChange}">
              ${this.renderHourOptions()}
            </select>
          </div>
          <div>
            <label class="mb-1 block text-xs text-slate-500 dark:text-slate-400">Minute</label>
            <select class="${this.getSelectClasses()}" @change="${this.handleMinuteChange}">
              ${this.renderMinuteOptions()}
            </select>
          </div>
          ${this.showSeconds
        ? html`<div>
                <label class="mb-1 block text-xs text-slate-500 dark:text-slate-400">Second</label>
                <select class="${this.getSelectClasses()}" @change="${this.handleSecondChange}">
                  ${this.renderSecondOptions()}
                </select>
              </div>`
        : nothing}
        </div>

        ${this.hour12
        ? html`<div class="mt-3">
              <label class="mb-1 block text-xs text-slate-500 dark:text-slate-400">AM / PM</label>
              <select class="${this.getSelectClasses()}" @change="${this.handleAmPmChange}">
                <option value="AM" ?selected="${this.tempAmPm === 'AM'}">AM</option>
                <option value="PM" ?selected="${this.tempAmPm === 'PM'}">PM</option>
              </select>
            </div>`
        : nothing}

        <div class="mt-4 flex items-center gap-2">
          <button
            type="button"
            class="rounded-md border px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
            @click="${this.handleClear}"
          >
            ${this.msg.clear}
          </button>
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-xs text-white bg-sky-600 dark:bg-sky-500 disabled:opacity-50"
            ?disabled="${invalid}"
            @click="${this.handleConfirm}"
          >
            ${this.msg.confirm}
          </button>
          <button
            type="button"
            class="ml-auto rounded-md border px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
            @click="${this.handleClose}"
          >
            OK
          </button>
        </div>
      </div>
    `;
  }

  private renderHourOptions(): TemplateResult[] {
    if (this.hour12) {
      return Array.from({ length: 12 }, (_, i) => {
        const value = i + 1;
        return html`<option value="${value}" ?selected="${this.tempHour === value}">${String(value).padStart(2, '0')}</option>`;
      });
    }
    return Array.from({ length: 24 }, (_, i) => html`<option value="${i}" ?selected="${this.tempHour === i}">${String(i).padStart(2, '0')}</option>`);
  }

  private renderMinuteOptions(): TemplateResult[] {
    const step = Math.max(1, this.minuteStep);
    const options: TemplateResult[] = [];
    for (let i = 0; i < 60; i += step) {
      options.push(html`<option value="${i}" ?selected="${this.tempMinute === i}">${String(i).padStart(2, '0')}</option>`);
    }
    return options;
  }

  private renderSecondOptions(): TemplateResult[] {
    return Array.from({ length: 60 }, (_, i) => html`<option value="${i}" ?selected="${this.tempSecond === i}">${String(i).padStart(2, '0')}</option>`);
  }

  private renderFeedback(errorId: string): TemplateResult {
    if (this.error) {
      return html`<p id="${errorId}" class="mt-2 text-xs text-red-600 dark:text-red-400">${unsafeHTML(String(this.error))}</p>`;
    }
    if (this.hasSlot('Helper')) {
      return html`<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Helper'))}</p>`;
    }
    return html``;
  }

  private renderClockIcon(): TemplateResult {
    return html`
      <svg class="h-4 w-4 text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"></circle>
        <path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `;
  }
}
