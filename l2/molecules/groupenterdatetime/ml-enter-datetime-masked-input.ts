/// <mls fileReference="_102033_/l2/molecules/groupenterdatetime/ml-enter-datetime-masked-input.ts" enhancement="_102020_/l2/enhancementAura"/>

// =============================================================================
// ENTER DATETIME MASKED INPUT MOLECULE
// =============================================================================
// Skill Group: groupEnterDatetime
// This molecule does NOT contain business logic.
import { html, svg, TemplateResult, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators.js';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
  placeholder: 'MM/DD/YYYY HH:MM',
  loading: 'Loading...',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
  en: message_en,
  pt: {
    placeholder: 'DD/MM/AAAA HH:MM',
    loading: 'Carregando...',
  },
  de: {
    placeholder: 'TT.MM.JJJJ HH:MM',
    loading: 'Wird geladen...',
  },
};
/// **collab_i18n_end**

@customElement('groupenterdatetime--ml-enter-datetime-masked-input')
export class EnterDatetimeMaskedInputMolecule extends MoleculeAuraElement {
  private msg: MessageType = messages.en;

  // ==========================================================================
  // SLOT TAGS
  // ==========================================================================
  slotTags = ['Label', 'Helper'];

  // ==========================================================================
  // PROPERTIES — From Contract
  // ==========================================================================
  @propertyDataSource({ type: String })
  value: string | null = null;

  @propertyDataSource({ type: String })
  error: string = '';

  @propertyDataSource({ type: String })
  name: string = '';

  @propertyDataSource({ type: String })
  locale: string = '';

  @propertyDataSource({ type: String })
  timezone: string = '';

  @propertyDataSource({ type: String })
  minDatetime: string = '';

  @propertyDataSource({ type: String })
  maxDatetime: string = '';

  @propertyDataSource({ type: Number, attribute: 'minute-step' })
  minuteStep: number = 1;

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

  // ==========================================================================
  // INTERNAL STATE
  // ==========================================================================
  @state()
  private isOpen: boolean = false;

  @state()
  private isFocused: boolean = false;

  @state()
  private inputValue: string = '';

  private static idCounter = 0;
  private inputId = `dtm-input-${++EnterDatetimeMaskedInputMolecule.idCounter}`;
  private labelId = `dtm-label-${EnterDatetimeMaskedInputMolecule.idCounter}`;
  private helperId = `dtm-helper-${EnterDatetimeMaskedInputMolecule.idCounter}`;
  private errorId = `dtm-error-${EnterDatetimeMaskedInputMolecule.idCounter}`;

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================
  firstUpdated() {
    this.updateInputValueFromValue(this.value);
  }

  updated(changedProps: Map<string, unknown>) {
    if (changedProps.has('value') || changedProps.has('locale') || changedProps.has('timezone')) {
      this.updateInputValueFromValue(this.value);
    }
  }

  // ==========================================================================
  // STATE CHANGE HANDLER
  // ==========================================================================
  handleIcaStateChange(key: string, value: any) {
    const valueAttr = this.getAttribute('value');
    const localeAttr = this.getAttribute('locale');
    const timezoneAttr = this.getAttribute('timezone');
    if (valueAttr === `{{${key}}}` || localeAttr === `{{${key}}}` || timezoneAttr === `{{${key}}}`) {
      this.updateInputValueFromValue(this.value);
    }
    this.requestUpdate();
  }

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================
  private handleInput(event: Event) {
    if (this.disabled || this.readonly || this.loading) return;
    const input = event.target as HTMLInputElement;
    this.inputValue = this.applyMask(input.value);
  }

  private handleFocus() {
    if (this.disabled || this.loading) return;
    this.isFocused = true;
    this.dispatchEvent(new CustomEvent('focus', { bubbles: true, composed: true }));
  }

  private handleBlur() {
    if (this.disabled || this.loading) return;
    this.isFocused = false;
    this.commitInputValue();
    this.dispatchEvent(new CustomEvent('blur', { bubbles: true, composed: true }));
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitInputValue();
    }
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================
  render() {
    const lang = this.getMessageKey(messages);
    this.msg = messages[lang];

    if (!this.isEditing) {
      return this.renderViewMode();
    }

    const placeholder = this.placeholder || this.msg.placeholder;
    const hasError = Boolean(this.error);
    const describedBy = hasError
      ? this.errorId
      : this.hasSlot('Helper')
        ? this.helperId
        : undefined;

    return html`
      <div class="w-full">
        ${this.renderLabel()}
        <div class="relative">
          <input
            id=${this.inputId}
            name=${ifDefined(this.name || undefined)}
            class=${this.getInputClasses(hasError)}
            .value=${this.inputValue}
            placeholder=${placeholder}
            ?disabled=${this.disabled || this.loading}
            ?readonly=${this.readonly}
            aria-labelledby=${ifDefined(this.hasSlot('Label') ? this.labelId : undefined)}
            aria-describedby=${ifDefined(describedBy)}
            aria-invalid=${hasError ? 'true' : 'false'}
            aria-required=${this.required ? 'true' : 'false'}
            @input=${this.handleInput}
            @focus=${this.handleFocus}
            @blur=${this.handleBlur}
            @keydown=${this.handleKeydown}
          />
          <div class="absolute right-3 top-1/2 -translate-y-1/2">
            ${this.loading ? this.renderLoading() : this.renderIcon()}
          </div>
        </div>
        ${this.renderFeedback()}
      </div>
    `;
  }

  private renderViewMode(): TemplateResult {
    const displayValue = this.formatValueForDisplay(this.value);
    return html`
      <div class="w-full">
        ${this.renderLabel()}
        <div class="text-sm text-slate-900 dark:text-slate-100">
          ${displayValue || '—'}
        </div>
      </div>
    `;
  }

  private renderLabel(): TemplateResult {
    if (!this.hasSlot('Label')) return html``;
    return html`
      <label id=${this.labelId} for=${this.inputId} class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        ${unsafeHTML(this.getSlotContent('Label'))}
        ${this.required ? html`<span class="ml-1 text-red-600 dark:text-red-400">*</span>` : nothing}
      </label>
    `;
  }

  private renderFeedback(): TemplateResult {
    if (!this.isEditing) return html``;
    if (this.error) {
      return html`<p id=${this.errorId} class="mt-1 text-xs text-red-600 dark:text-red-400">${unsafeHTML(this.error)}</p>`;
    }
    if (this.hasSlot('Helper')) {
      return html`<p id=${this.helperId} class="mt-1 text-xs text-slate-500 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Helper'))}</p>`;
    }
    return html``;
  }

  private renderLoading(): TemplateResult {
    return html`
      <div class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-600 dark:border-t-slate-200"></div>
    `;
  }

  private renderIcon(): TemplateResult {
    return html`
      <svg viewBox="0 0 20 20" class="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true">
        ${svg`<path fill="currentColor" d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm10 8H4v6h12v-6Zm0-4H4v2h12V6Z"/>`}
      </svg>
    `;
  }

  // ==========================================================================
  // MASKING & PARSING
  // ==========================================================================
  private applyMask(raw: string): string {
    const { dateSep, order, hour12 } = this.getFormatConfig();
    const upper = raw.toUpperCase();
    const digits = upper.replace(/\D/g, '').slice(0, 12);
    let suffix = '';
    if (hour12) {
      const match = upper.match(/\b(AM|PM)\b/);
      if (match) {
        suffix = match[1];
      } else if (upper.includes('A')) {
        suffix = 'AM';
      } else if (upper.includes('P')) {
        suffix = 'PM';
      }
    }

    const parts = this.getSegmentsFromDigits(digits, order);
    const datePart = this.joinDateParts(parts, order, dateSep);
    const timePart = this.joinTimeParts(parts.hour, parts.minute);

    let formatted = datePart;
    if (timePart) {
      formatted = formatted ? `${formatted} ${timePart}` : timePart;
    }
    if (hour12 && suffix) {
      formatted = formatted ? `${formatted} ${suffix}` : suffix;
    }
    return formatted;
  }

  private commitInputValue() {
    if (this.disabled || this.readonly || this.loading) return;
    const parsed = this.parseInputToIso(this.inputValue);
    if (parsed === undefined) {
      this.updateInputValueFromValue(this.value);
      return;
    }
    this.value = parsed;
    this.updateInputValueFromValue(this.value);
    this.dispatchEvent(new CustomEvent('change', {
      bubbles: true,
      composed: true,
      detail: { value: this.value },
    }));
  }

  private parseInputToIso(input: string): string | null | undefined {
    const raw = input.trim();
    if (!raw) return null;

    const { order, hour12 } = this.getFormatConfig();
    const upper = raw.toUpperCase();
    const digits = upper.replace(/\D/g, '');
    if (digits.length < 12) return undefined;

    const parts = this.getSegmentsFromDigits(digits, order);
    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    let hour = Number(parts.hour);
    const minute = Number(parts.minute);

    if (!this.isValidDateParts(year, month, day)) return undefined;

    if (hour12) {
      const match = upper.match(/\b(AM|PM)\b/);
      const suffix = match ? match[1] : upper.includes('P') ? 'PM' : upper.includes('A') ? 'AM' : '';
      if (!suffix || hour < 1 || hour > 12) return undefined;
      if (suffix === 'AM') {
        hour = hour === 12 ? 0 : hour;
      } else {
        hour = hour === 12 ? 12 : hour + 12;
      }
    }

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;

    const step = Math.max(1, Math.floor(this.minuteStep || 1));
    if (minute % step !== 0) return undefined;

    const iso = `${this.pad(year, 4)}-${this.pad(month, 2)}-${this.pad(day, 2)}T${this.pad(hour, 2)}:${this.pad(minute, 2)}:00`;

    if (this.minDatetime && iso < this.minDatetime) return undefined;
    if (this.maxDatetime && iso > this.maxDatetime) return undefined;

    return iso;
  }

  private updateInputValueFromValue(value: string | null) {
    this.inputValue = value ? this.formatValueForDisplay(value) : '';
  }

  private formatValueForDisplay(value: string | null): string {
    if (!value) return '';
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return '';
      const locale = this.locale || undefined;
      const hour12 = this.getIs12HourLocale();
      const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12,
      };
      if (this.timezone) {
        options.timeZone = this.timezone;
      }
      return new Intl.DateTimeFormat(locale, options).format(date);
    } catch {
      return '';
    }
  }

  private getIs12HourLocale(): boolean {
    try {
      const locale = this.locale || undefined;
      const options: Intl.DateTimeFormatOptions = { hour: 'numeric' };
      if (this.timezone) {
        options.timeZone = this.timezone;
      }
      return new Intl.DateTimeFormat(locale, options).resolvedOptions().hour12 ?? false;
    } catch {
      return false;
    }
  }

  private getFormatConfig() {
    const locale = (this.locale || 'en-US').toLowerCase();
    const hour12 = this.getIs12HourLocale();
    const order = locale.startsWith('en-us') ? ['M', 'D', 'Y'] : ['D', 'M', 'Y'];
    const dateSep = locale.startsWith('de') ? '.' : '/';
    return { order, dateSep, hour12 };
  }

  private getSegmentsFromDigits(digits: string, order: string[]) {
    const d1 = digits.slice(0, 2);
    const d2 = digits.slice(2, 4);
    const d3 = digits.slice(4, 8);
    const hour = digits.slice(8, 10);
    const minute = digits.slice(10, 12);

    const map: Record<string, string> = {
      [order[0]]: d1,
      [order[1]]: d2,
      [order[2]]: d3,
    };

    return {
      day: map.D || '',
      month: map.M || '',
      year: map.Y || '',
      hour,
      minute,
    };
  }

  private joinDateParts(parts: { day: string; month: string; year: string }, order: string[], sep: string): string {
    const map: Record<string, string> = { D: parts.day, M: parts.month, Y: parts.year };
    const p1 = map[order[0]] || '';
    const p2 = map[order[1]] || '';
    const p3 = map[order[2]] || '';

    let output = '';
    if (p1) output += p1;
    if (p2) output += output ? `${sep}${p2}` : p2;
    if (p3) output += output ? `${sep}${p3}` : p3;
    return output;
  }

  private joinTimeParts(hour: string, minute: string): string {
    let output = '';
    if (hour) output += hour;
    if (minute) output += output ? `:${minute}` : minute;
    return output;
  }

  private isValidDateParts(year: number, month: number, day: number): boolean {
    if (year < 1000 || year > 9999) return false;
    if (month < 1 || month > 12) return false;
    const maxDay = new Date(year, month, 0).getDate();
    return day >= 1 && day <= maxDay;
  }

  private pad(value: number, size: number): string {
    return String(value).padStart(size, '0');
  }

  private getInputClasses(hasError: boolean): string {
    return [
      'w-full rounded-lg px-3 py-2 pr-10 text-sm border transition',
      'bg-white dark:bg-slate-900',
      'text-slate-900 dark:text-slate-100',
      'placeholder:text-slate-400 dark:placeholder:text-slate-500',
      hasError ? 'border-red-500 dark:border-red-400' : 'border-slate-200 dark:border-slate-700',
      this.isFocused ? 'ring-2 ring-sky-500 dark:ring-sky-400' : '',
      this.disabled || this.loading ? 'opacity-50 cursor-not-allowed' : 'focus:outline-none',
      this.readonly ? 'cursor-default' : 'cursor-text',
    ].filter(Boolean).join(' ');
  }
}
