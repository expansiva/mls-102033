/// <mls fileReference="_102033_/l2/molecules/groupentertime/ml-clock-time-picker.ts" enhancement="_102020_/l2/enhancementAura"/>
// =============================================================================
// CLOCK TIME PICKER MOLECULE
// =============================================================================
// Skill Group: enter + time
// This molecule does NOT contain business logic.
import { html, TemplateResult, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
  placeholder: 'Select time',
  loading: 'Loading...',
  clear: 'Clear',
  confirm: 'Confirm',
  hour: 'Hour',
  minute: 'Minute',
  second: 'Second',
  am: 'AM',
  pm: 'PM',
  emptyView: '—',
};

type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
  en: message_en,
  pt: {
    placeholder: 'Selecionar hora',
    loading: 'Carregando...',
    clear: 'Limpar',
    confirm: 'Confirmar',
    hour: 'Hora',
    minute: 'Minuto',
    second: 'Segundo',
    am: 'AM',
    pm: 'PM',
    emptyView: '—',
  },
};
/// **collab_i18n_end**

@customElement('groupentertime--ml-clock-time-picker')
export class ClockTimePickerMolecule extends MoleculeAuraElement {
  private msg: MessageType = messages.en;
  // =========================================================================
  // SLOT TAGS
  // =========================================================================
  slotTags = ['Label', 'Helper'];
  // =========================================================================
  // PROPERTIES — From Contract
  // =========================================================================
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

  // =========================================================================
  // INTERNAL STATE
  // =========================================================================
  @state()
  private isOpen: boolean = false;

  @state()
  private stage: 'hour' | 'minute' | 'second' = 'hour';

  @state()
  private selectedHour: number | null = null;

  @state()
  private selectedMinute: number | null = null;

  @state()
  private selectedSecond: number | null = null;

  @state()
  private amPm: 'AM' | 'PM' = 'AM';

  // =========================================================================
  // STATE CHANGE HANDLER
  // =========================================================================
  handleIcaStateChange(key: string, value: any) {
    const valueAttr = this.getAttribute('value');
    if (valueAttr === `{{${key}}}`) {
      this.syncSelectionFromValue(value as string | null);
    }
    this.requestUpdate();
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================
  connectedCallback() {
    super.connectedCallback();
    this.syncSelectionFromValue(this.value);
  }

  disconnectedCallback() {
    this.detachOutsideClick();
    super.disconnectedCallback();
  }

  // =========================================================================
  // EVENT HANDLERS
  // =========================================================================
  private onToggleOpen() {
    if (!this.canInteract()) return;
    if (this.loading) return;
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.stage = 'hour';
      this.attachOutsideClick();
      this.dispatchEvent(
        new CustomEvent('focus', { bubbles: true, composed: true })
      );
    } else {
      this.detachOutsideClick();
    }
  }

  private onOutsideClick = (e: MouseEvent) => {
    const path = e.composedPath() as EventTarget[];
    if (!path.includes(this)) {
      this.isOpen = false;
      this.detachOutsideClick();
    }
  };

  private onInputFocus() {
    if (!this.canInteract()) return;
    this.dispatchEvent(new CustomEvent('focus', { bubbles: true, composed: true }));
  }

  private onInputBlur() {
    this.dispatchEvent(new CustomEvent('blur', { bubbles: true, composed: true }));
  }

  private onSelectHour(hour: number) {
    if (!this.canInteract()) return;
    if (this.isHourDisabled(hour)) return;
    const normalized = this.hour12 ? this.convertTo24Hour(hour, this.amPm) : hour;
    this.selectedHour = normalized;
    this.stage = 'minute';
  }

  private onSelectMinute(minute: number) {
    if (!this.canInteract()) return;
    if (this.isMinuteDisabled(this.selectedHour, minute)) return;
    this.selectedMinute = minute;
    if (this.showSeconds) {
      this.stage = 'second';
    }
  }

  private onSelectSecond(second: number) {
    if (!this.canInteract()) return;
    if (this.isSecondDisabled(this.selectedHour, this.selectedMinute, second)) return;
    this.selectedSecond = second;
  }

  private onConfirm() {
    if (!this.canInteract()) return;
    if (!this.isSelectionComplete()) return;
    const value = this.buildValueString();
    this.value = value;
    this.isOpen = false;
    this.detachOutsideClick();
    this.dispatchEvent(
      new CustomEvent('change', {
        bubbles: true,
        composed: true,
        detail: { value },
      })
    );
  }

  private onClear() {
    if (!this.canInteract()) return;
    this.value = null;
    this.selectedHour = null;
    this.selectedMinute = null;
    this.selectedSecond = null;
    this.stage = 'hour';
    this.isOpen = false;
    this.detachOutsideClick();
    this.dispatchEvent(
      new CustomEvent('change', {
        bubbles: true,
        composed: true,
        detail: { value: null },
      })
    );
  }

  private onToggleAmPm(value: 'AM' | 'PM') {
    if (!this.canInteract()) return;
    this.amPm = value;
    if (this.selectedHour !== null) {
      const displayHour = this.convertTo12Hour(this.selectedHour).hour;
      this.selectedHour = this.convertTo24Hour(displayHour, value);
    }
  }

  // =========================================================================
  // HELPERS
  // =========================================================================
  private canInteract(): boolean {
    return this.isEditing && !this.disabled && !this.readonly && !this.loading;
  }

  private syncSelectionFromValue(value: string | null) {
    if (!value) {
      this.selectedHour = null;
      this.selectedMinute = null;
      this.selectedSecond = null;
      return;
    }
    const parsed = this.parseTime(value);
    if (!parsed) return;
    this.selectedHour = parsed.hour;
    this.selectedMinute = parsed.minute;
    this.selectedSecond = parsed.second;
    if (this.hour12) {
      this.amPm = parsed.hour >= 12 ? 'PM' : 'AM';
    }
  }

  private parseTime(value: string): { hour: number; minute: number; second: number | null } | null {
    const parts = value.split(':').map((p) => Number(p));
    if (parts.length < 2) return null;
    const hour = parts[0];
    const minute = parts[1];
    const second = parts.length > 2 ? parts[2] : null;
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return { hour, minute, second };
  }

  private formatTime(value: string | null): string {
    if (!value) return this.msg.emptyView;
    const parsed = this.parseTime(value);
    if (!parsed) return this.msg.emptyView;
    const locale = this.locale || undefined;
    const options: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      second: this.showSeconds ? '2-digit' : undefined,
      hour12: this.hour12,
    };
    const date = new Date();
    date.setHours(parsed.hour, parsed.minute, parsed.second || 0, 0);
    return new Intl.DateTimeFormat(locale, options).format(date);
  }

  private buildValueString(): string | null {
    if (!this.isSelectionComplete()) return null;
    const h = String(this.selectedHour).padStart(2, '0');
    const m = String(this.selectedMinute).padStart(2, '0');
    if (this.showSeconds) {
      const s = String(this.selectedSecond ?? 0).padStart(2, '0');
      return `${h}:${m}:${s}`;
    }
    return `${h}:${m}`;
  }

  private isSelectionComplete(): boolean {
    if (this.selectedHour === null || this.selectedMinute === null) return false;
    if (this.showSeconds && this.selectedSecond === null) return false;
    return true;
  }

  private convertTo24Hour(hour12: number, amPm: 'AM' | 'PM'): number {
    if (amPm === 'AM') return hour12 === 12 ? 0 : hour12;
    return hour12 === 12 ? 12 : hour12 + 12;
  }

  private convertTo12Hour(hour24: number): { hour: number; period: 'AM' | 'PM' } {
    const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
    const hour = hour24 % 12 || 12;
    return { hour, period };
  }

  private attachOutsideClick() {
    document.addEventListener('mousedown', this.onOutsideClick);
  }

  private detachOutsideClick() {
    document.removeEventListener('mousedown', this.onOutsideClick);
  }

  private isHourDisabled(hour: number): boolean {
    const hour24 = this.hour12 ? this.convertTo24Hour(hour, this.amPm) : hour;
    if (!this.minTime && !this.maxTime) return false;
    const min = this.parseTime(this.minTime || '');
    const max = this.parseTime(this.maxTime || '');
    if (!min && !max) return false;
    if (min && hour24 < min.hour) return true;
    if (max && hour24 > max.hour) return true;
    if (min && max && hour24 === min.hour && hour24 === max.hour) {
      return this.getMinuteOptions().every((m) => this.isMinuteDisabled(hour24, m));
    }
    return false;
  }

  private isMinuteDisabled(hour: number | null, minute: number): boolean {
    if (hour === null) return false;
    const min = this.parseTime(this.minTime || '');
    const max = this.parseTime(this.maxTime || '');
    if (!min && !max) return false;
    if (min && hour === min.hour && minute < min.minute) return true;
    if (max && hour === max.hour && minute > max.minute) return true;
    return false;
  }

  private isSecondDisabled(hour: number | null, minute: number | null, second: number): boolean {
    if (hour === null || minute === null) return false;
    const min = this.parseTime(this.minTime || '');
    const max = this.parseTime(this.maxTime || '');
    if (!min && !max) return false;
    if (min && hour === min.hour && minute === min.minute && second < (min.second || 0)) return true;
    if (max && hour === max.hour && minute === max.minute && second > (max.second || 0)) return true;
    return false;
  }

  private getHourOptions(): number[] {
    if (this.hour12) {
      return Array.from({ length: 12 }, (_, i) => i + 1);
    }
    return Array.from({ length: 24 }, (_, i) => i);
  }

  private getMinuteOptions(): number[] {
    const step = Math.max(1, this.minuteStep || 1);
    const list: number[] = [];
    for (let i = 0; i < 60; i += step) list.push(i);
    return list;
  }

  private getSecondOptions(): number[] {
    return Array.from({ length: 60 }, (_, i) => i);
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
      this.disabled || this.readonly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    ].filter(Boolean).join(' ');
  }

  private getOptionClasses(selected: boolean, disabled: boolean): string {
    return [
      'w-10 h-10 rounded-full flex items-center justify-center text-sm border transition',
      selected
        ? 'bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-500 dark:border-sky-400'
        : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700',
      !disabled && !selected ? 'hover:bg-slate-50 dark:hover:bg-slate-700' : '',
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    ].filter(Boolean).join(' ');
  }

  private getPanelClasses(): string {
    return [
      'mt-2 rounded-lg border p-3',
      'bg-white dark:bg-slate-800',
      'border-slate-200 dark:border-slate-700',
      'shadow-sm',
    ].join(' ');
  }

  private getLabelClasses(): string {
    return [
      'mb-1 text-sm font-medium',
      'text-slate-600 dark:text-slate-400',
    ].join(' ');
  }

  private getStepLabel(): string {
    if (this.stage === 'hour') return this.msg.hour;
    if (this.stage === 'minute') return this.msg.minute;
    return this.msg.second;
  }

  private renderLabel(): TemplateResult {
    if (!this.hasSlot('Label')) return html``;
    const requiredMark = this.required ? html`<span class="text-red-600 dark:text-red-400">*</span>` : nothing;
    return html`
      <label class="${this.getLabelClasses()}">
        ${unsafeHTML(this.getSlotContent('Label'))}
        ${requiredMark}
      </label>
    `;
  }

  private renderHelperOrError(): TemplateResult {
    if (!this.isEditing) return html``;
    if (this.error) {
      return html`<p id="${this.getErrorId()}" class="mt-1 text-xs text-red-600 dark:text-red-400">${unsafeHTML(this.error)}</p>`;
    }
    if (this.hasSlot('Helper')) {
      return html`<p id="${this.getHelperId()}" class="mt-1 text-xs text-slate-500 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Helper'))}</p>`;
    }
    return html``;
  }

  private renderClockOptions(): TemplateResult {
    if (this.stage === 'hour') {
      const hours = this.getHourOptions();
      return html`
        <div class="grid grid-cols-6 gap-2">
          ${hours.map((h) => {
        const hour24 = this.hour12 ? this.convertTo24Hour(h, this.amPm) : h;
        const selected = this.selectedHour === hour24;
        const disabled = this.isHourDisabled(h);
        return html`
              <button
                class="${this.getOptionClasses(selected, disabled)}"
                ?disabled=${disabled}
                @click=${() => this.onSelectHour(h)}
                aria-label="${h}"
              >
                ${String(h).padStart(2, '0')}
              </button>
            `;
      })}
        </div>
      `;
    }

    if (this.stage === 'minute') {
      const minutes = this.getMinuteOptions();
      return html`
        <div class="grid grid-cols-6 gap-2">
          ${minutes.map((m) => {
        const selected = this.selectedMinute === m;
        const disabled = this.isMinuteDisabled(this.selectedHour, m);
        return html`
              <button
                class="${this.getOptionClasses(selected, disabled)}"
                ?disabled=${disabled}
                @click=${() => this.onSelectMinute(m)}
                aria-label="${m}"
              >
                ${String(m).padStart(2, '0')}
              </button>
            `;
      })}
        </div>
      `;
    }

    const seconds = this.getSecondOptions();
    return html`
      <div class="grid grid-cols-6 gap-2">
        ${seconds.map((s) => {
      const selected = this.selectedSecond === s;
      const disabled = this.isSecondDisabled(this.selectedHour, this.selectedMinute, s);
      return html`
            <button
              class="${this.getOptionClasses(selected, disabled)}"
              ?disabled=${disabled}
              @click=${() => this.onSelectSecond(s)}
              aria-label="${s}"
            >
              ${String(s).padStart(2, '0')}
            </button>
          `;
    })}
      </div>
    `;
  }

  private renderAmPm(): TemplateResult {
    if (!this.hour12) return html``;
    const amClasses = [
      'px-3 py-1 rounded-md text-xs border',
      this.amPm === 'AM'
        ? 'bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-500 dark:border-sky-400'
        : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700',
    ].join(' ');
    const pmClasses = [
      'px-3 py-1 rounded-md text-xs border',
      this.amPm === 'PM'
        ? 'bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-slate-300 border-sky-500 dark:border-sky-400'
        : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700',
    ].join(' ');
    return html`
      <div class="flex items-center gap-2">
        <button class="${amClasses}" @click=${() => this.onToggleAmPm('AM')}>${this.msg.am}</button>
        <button class="${pmClasses}" @click=${() => this.onToggleAmPm('PM')}>${this.msg.pm}</button>
      </div>
    `;
  }

  private getLabelId(): string {
    return `${this.tagName.toLowerCase()}-label`;
  }

  private getHelperId(): string {
    return `${this.tagName.toLowerCase()}-helper`;
  }

  private getErrorId(): string {
    return `${this.tagName.toLowerCase()}-error`;
  }

  // =========================================================================
  // RENDER
  // =========================================================================
  render() {
    const lang = this.getMessageKey(messages);
    this.msg = messages[lang];

    if (!this.isEditing) {
      return html`
        <div class="w-full">
          ${this.renderLabel()}
          <div class="text-sm text-slate-900 dark:text-slate-100">
            ${this.formatTime(this.value)}
          </div>
        </div>
      `;
    }

    const displayValue = this.value ? this.formatTime(this.value) : '';
    const placeholder = this.placeholder || this.msg.placeholder;
    const ariaDescribedBy = this.error ? this.getErrorId() : (this.hasSlot('Helper') ? this.getHelperId() : undefined);

    return html`
      <div class="w-full">
        ${this.renderLabel()}
        <div class="relative">
          <input
            class="${this.getInputClasses()}"
            name="${this.name}"
            .value=${displayValue}
            placeholder="${placeholder}"
            readonly
            @click=${this.onToggleOpen}
            @focus=${this.onInputFocus}
            @blur=${this.onInputBlur}
            aria-invalid=${this.error ? 'true' : 'false'}
            aria-required=${this.required ? 'true' : 'false'}
            aria-describedby=${ariaDescribedBy || nothing}
            aria-labelledby=${this.hasSlot('Label') ? this.getLabelId() : nothing}
            aria-label=${displayValue || placeholder}
          />
          <button
            class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
            @click=${this.onToggleOpen}
            ?disabled=${!this.canInteract()}
            aria-label="${this.msg.hour}"
          >
            🕒
          </button>
        </div>

        ${this.loading
        ? html`<div class="mt-2 text-xs text-slate-500 dark:text-slate-400">${this.msg.loading}</div>`
        : nothing}

        ${this.isOpen && !this.loading
        ? html`
              <div class="${this.getPanelClasses()}" role="dialog" aria-modal="true">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">${this.getStepLabel()}</span>
                  ${this.renderAmPm()}
                </div>
                ${this.renderClockOptions()}
                <div class="mt-3 flex items-center justify-between">
                  <button
                    class="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                    @click=${this.onClear}
                  >
                    ${this.msg.clear}
                  </button>
                  <button
                    class="px-3 py-1 rounded-md text-xs border border-sky-500 dark:border-sky-400 text-sky-700 dark:text-sky-300"
                    @click=${this.onConfirm}
                  >
                    ${this.msg.confirm}
                  </button>
                </div>
              </div>
            `
        : nothing}

        ${this.renderHelperOrError()}
      </div>
    `;
  }
}
