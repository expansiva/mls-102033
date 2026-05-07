/// <mls fileReference="_102033_/l2/molecules/groupenternumber/ml-number-stepper.ts" enhancement="_102020_/l2/enhancementAura" />
// =============================================================================
// NUMBER STEPPER MOLECULE
// =============================================================================
// Skill Group: enter + number
// This molecule does NOT contain business logic.
import { html, TemplateResult, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators.js';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
  loading: 'Loading...',
  required: 'This field is required',
  increment: 'Increment',
  decrement: 'Decrement',
  emptyValue: '—',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
  en: message_en,
  pt: {
    loading: 'Carregando...',
    required: 'Este campo é obrigatório',
    increment: 'Incrementar',
    decrement: 'Decrementar',
    emptyValue: '—',
  },
};
/// **collab_i18n_end**

@customElement('groupenternumber--ml-number-stepper')
export class NumberStepperMolecule extends MoleculeAuraElement {
  private msg: MessageType = messages.en;

  // =========================================================================
  // SLOT TAGS
  // =========================================================================
  slotTags = ['Label', 'Helper', 'Prefix', 'Suffix'];

  // =========================================================================
  // PROPERTIES — From Contract
  // =========================================================================
  @propertyDataSource({ type: Number })
  value: number | null = null;

  @propertyDataSource({ type: String })
  error: string = '';

  @propertyDataSource({ type: String })
  name: string = '';

  @propertyDataSource({ type: Number })
  min: number | null = null;

  @propertyDataSource({ type: Number })
  max: number | null = null;

  @propertyDataSource({ type: Number })
  step: number = 1;

  @propertyDataSource({ type: Number })
  decimals: number = 0;

  @propertyDataSource({ type: String })
  locale: string = '';

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
  private rawValue: string = '';

  private inputId = `ml-number-stepper-${Math.random().toString(36).slice(2)}`;
  private labelId = `${this.inputId}-label`;
  private helperId = `${this.inputId}-helper`;
  private errorId = `${this.inputId}-error`;

  // =========================================================================
  // LIFECYCLE
  // =========================================================================
  connectedCallback() {
    super.connectedCallback();
    this.rawValue = this.formatToDisplay(this.value);
  }

  // =========================================================================
  // STATE CHANGE HANDLER
  // =========================================================================
  handleIcaStateChange(key: string, value: any) {
    const valueAttr = this.getAttribute('value');
    const decimalsAttr = this.getAttribute('decimals');
    const localeAttr = this.getAttribute('locale');
    if (valueAttr === `{{${key}}}` || decimalsAttr === `{{${key}}}` || localeAttr === `{{${key}}}`) {
      this.rawValue = this.formatToDisplay(this.value);
    }
    this.requestUpdate();
  }

  // =========================================================================
  // EVENT HANDLERS
  // =========================================================================
  private handleInput(e: Event) {
    if (!this.isEditing || this.disabled || this.readonly || this.loading) return;
    const input = e.target as HTMLInputElement;
    this.rawValue = input.value;
    const parsed = this.parseRawToNumber(this.rawValue);
    this.value = parsed;
    this.emitInput();
  }

  private handleBlur() {
    if (!this.isEditing) return;
    const normalized = this.normalizeValue(this.rawValue);
    this.value = normalized;
    this.rawValue = this.formatToDisplay(this.value);
    this.emitChange();
    this.dispatchEvent(
      new CustomEvent('blur', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleFocus() {
    if (!this.isEditing) return;
    this.dispatchEvent(
      new CustomEvent('focus', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private increment() {
    if (!this.isEditing || this.disabled || this.readonly || this.loading) return;
    const current = this.value ?? 0;
    const next = current + this.step;
    if (this.max !== null && next > this.max) return;
    this.value = this.roundToDecimals(next);
    this.rawValue = this.formatToDisplay(this.value);
    this.emitChange();
  }

  private decrement() {
    if (!this.isEditing || this.disabled || this.readonly || this.loading) return;
    const current = this.value ?? 0;
    const next = current - this.step;
    if (this.min !== null && next < this.min) return;
    this.value = this.roundToDecimals(next);
    this.rawValue = this.formatToDisplay(this.value);
    this.emitChange();
  }

  private emitInput() {
    this.dispatchEvent(
      new CustomEvent('input', {
        bubbles: true,
        composed: true,
        detail: { value: this.value },
      })
    );
  }

  private emitChange() {
    this.dispatchEvent(
      new CustomEvent('change', {
        bubbles: true,
        composed: true,
        detail: { value: this.value },
      })
    );
  }

  // =========================================================================
  // HELPERS
  // =========================================================================
  private formatToDisplay(value: number | null): string {
    if (value === null || value === undefined) return '';
    const options: Intl.NumberFormatOptions = {
      minimumFractionDigits: this.decimals,
      maximumFractionDigits: this.decimals,
    };
    const locale = this.locale && this.locale.trim().length > 0 ? this.locale : undefined;
    return new Intl.NumberFormat(locale, options).format(value);
  }

  private parseRawToNumber(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const { group, decimal } = this.getNumberSeparators();
    const cleaned = trimmed
      .split(group)
      .join('')
      .split(decimal)
      .join('.')
      .replace(/\s/g, '');
    const num = parseFloat(cleaned);
    if (Number.isNaN(num)) return null;
    return num;
  }

  private normalizeValue(raw: string): number | null {
    const parsed = this.parseRawToNumber(raw);
    if (parsed === null) return null;
    let value = this.roundToDecimals(parsed);
    if (this.min !== null && value < this.min) value = this.min;
    if (this.max !== null && value > this.max) value = this.max;
    return value;
  }

  private roundToDecimals(value: number): number {
    const factor = Math.pow(10, Math.max(0, this.decimals));
    return Math.round(value * factor) / factor;
  }

  private getNumberSeparators(): { group: string; decimal: string } {
    const locale = this.locale && this.locale.trim().length > 0 ? this.locale : undefined;
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    const group = parts.find(p => p.type === 'group')?.value ?? ',';
    const decimal = parts.find(p => p.type === 'decimal')?.value ?? '.';
    return { group, decimal };
  }

  private getInputClasses(hasError: boolean): string {
    return [
      'w-full flex-1 rounded-md px-3 py-2 text-sm border transition outline-none',
      'bg-white dark:bg-slate-900',
      'text-slate-900 dark:text-slate-100',
      'placeholder:text-slate-400 dark:placeholder:text-slate-500',
      hasError ? 'border-red-500 dark:border-red-400' : 'border-slate-200 dark:border-slate-700',
      'focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
      this.disabled || this.loading ? 'opacity-50 cursor-not-allowed' : '',
      this.readonly ? 'cursor-default' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private getButtonClasses(): string {
    return [
      'h-9 w-9 inline-flex items-center justify-center rounded-md border text-sm transition',
      'bg-white dark:bg-slate-800',
      'text-slate-900 dark:text-slate-100',
      'border-slate-200 dark:border-slate-700',
      !this.disabled && !this.readonly && !this.loading
        ? 'hover:bg-slate-50 dark:hover:bg-slate-700'
        : 'opacity-50 cursor-not-allowed',
      'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private getContainerClasses(): string {
    return [
      'w-full',
      this.disabled || this.loading ? 'opacity-50' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private getRowClasses(): string {
    return [
      'flex items-center gap-2',
      'rounded-lg',
    ]
      .filter(Boolean)
      .join(' ');
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

    const effectiveError = this.error || (this.required && (this.value === null || this.value === undefined) ? this.msg.required : '');
    const hasError = String(effectiveError).length > 0;
    const ariaDescribedBy = hasError ? this.errorId : this.hasSlot('Helper') ? this.helperId : undefined;
    const placeholder = this.placeholder || '';

    return html`
      <div class="${this.getContainerClasses()}">
        ${this.renderLabel()}
        <div class="${this.getRowClasses()}">
          ${this.renderPrefix()}
          <input
            id="${this.inputId}"
            class="${this.getInputClasses(hasError)}"
            type="text"
            inputmode="${this.decimals > 0 ? 'decimal' : 'numeric'}"
            .value=${this.rawValue}
            placeholder="${this.value === null ? placeholder : ''}"
            ?disabled=${this.disabled || this.loading}
            ?readonly=${this.readonly}
            aria-labelledby="${this.hasSlot('Label') ? this.labelId : nothing}"
            aria-describedby="${ariaDescribedBy || nothing}"
            aria-invalid="${hasError ? 'true' : 'false'}"
            aria-required="${this.required ? 'true' : 'false'}"
            @input=${this.handleInput}
            @blur=${this.handleBlur}
            @focus=${this.handleFocus}
          />
          ${this.renderSuffix()}
          <button
            type="button"
            class="${this.getButtonClasses()}"
            aria-label="${this.msg.decrement}"
            ?disabled=${this.disabled || this.readonly || this.loading}
            @click=${this.decrement}
          >
            −
          </button>
          <button
            type="button"
            class="${this.getButtonClasses()}"
            aria-label="${this.msg.increment}"
            ?disabled=${this.disabled || this.readonly || this.loading}
            @click=${this.increment}
          >
            +
          </button>
        </div>
        ${this.loading
          ? html`<div class="mt-2 text-xs text-slate-500 dark:text-slate-400">${this.msg.loading}</div>`
          : this.renderHelperOrError(effectiveError)}
      </div>
    `;
  }

  private renderViewMode(): TemplateResult {
    const display = this.value === null || this.value === undefined ? this.msg.emptyValue : this.formatToDisplay(this.value);
    return html`
      <div class="${this.getContainerClasses()}">
        ${this.renderLabel()}
        <div class="flex items-center gap-2 text-sm text-slate-900 dark:text-slate-100">
          ${this.renderPrefix()}
          <span>${display}</span>
          ${this.renderSuffix()}
        </div>
      </div>
    `;
  }

  private renderLabel(): TemplateResult {
    if (!this.hasSlot('Label')) return html``;
    return html`
      <label id="${this.labelId}" class="mb-1 block text-sm text-slate-600 dark:text-slate-400">
        ${unsafeHTML(this.getSlotContent('Label'))}
      </label>
    `;
  }

  private renderHelperOrError(effectiveError: string): TemplateResult {
    if (String(effectiveError).length > 0) {
      return html`
        <p id="${this.errorId}" class="mt-1 text-xs text-red-600 dark:text-red-400">
          ${unsafeHTML(String(effectiveError))}
        </p>
      `;
    }
    if (this.hasSlot('Helper')) {
      return html`
        <p id="${this.helperId}" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
          ${unsafeHTML(this.getSlotContent('Helper'))}
        </p>
      `;
    }
    return html``;
  }

  private renderPrefix(): TemplateResult {
    if (!this.hasSlot('Prefix')) return html``;
    return html`
      <span class="text-sm text-slate-600 dark:text-slate-400">
        ${unsafeHTML(this.getSlotContent('Prefix'))}
      </span>
    `;
  }

  private renderSuffix(): TemplateResult {
    if (!this.hasSlot('Suffix')) return html``;
    return html`
      <span class="text-sm text-slate-600 dark:text-slate-400">
        ${unsafeHTML(this.getSlotContent('Suffix'))}
      </span>
    `;
  }
}
