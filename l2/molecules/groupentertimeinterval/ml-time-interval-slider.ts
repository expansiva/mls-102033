/// <mls fileReference="_102033_/l2/molecules/groupentertimeinterval/ml-time-interval-slider.ts" enhancement="_102020_/l2/enhancementAura" />
// =============================================================================
// TIME INTERVAL SLIDER MOLECULE
// =============================================================================
// Skill Group: enter + time-interval
// This molecule does NOT contain business logic.
import { html, TemplateResult, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
  empty: '—',
  nextDay: '(+1)',
  loading: 'Loading...',
  labelStart: 'Start',
  labelEnd: 'End',
};

type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
  en: message_en,
  pt: {
    empty: '—',
    nextDay: '(+1)',
    loading: 'Carregando...',
    labelStart: 'Início',
    labelEnd: 'Fim',
  },
};
/// **collab_i18n_end**

@customElement('groupentertimeinterval--ml-time-interval-slider')
export class TimeIntervalSliderMolecule extends MoleculeAuraElement {
  private msg: MessageType = messages.en;
  private baseId = `ti-${Math.random().toString(36).slice(2, 9)}`;

  // =========================================================================
  // SLOT TAGS
  // =========================================================================
  slotTags = ['Label', 'LabelStart', 'LabelEnd', 'Helper'];

  // =========================================================================
  // PROPERTIES — Data
  // =========================================================================
  @propertyDataSource({ type: String, attribute: 'start-time' })
  startTime: string | null = null;

  @propertyDataSource({ type: String, attribute: 'end-time' })
  endTime: string | null = null;

  @propertyDataSource({ type: String })
  error: string = '';

  @propertyDataSource({ type: String })
  name: string = '';

  // =========================================================================
  // PROPERTIES — Configuration
  // =========================================================================
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

  @propertyDataSource({ type: Number, attribute: 'min-duration-minutes' })
  minDurationMinutes: number = 0;

  @propertyDataSource({ type: Number, attribute: 'max-duration-minutes' })
  maxDurationMinutes: number = 0;

  @propertyDataSource({ type: Boolean, attribute: 'allow-overnight' })
  allowOvernight: boolean = false;

  @propertyDataSource({ type: Boolean, attribute: 'allow-same-time' })
  allowSameTime: boolean = false;

  // =========================================================================
  // PROPERTIES — States
  // =========================================================================
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
  private activeField: string | null = null;

  @state()
  private draftStartSeconds: number | null = null;

  @state()
  private draftEndSeconds: number | null = null;

  // =========================================================================
  // STATE CHANGE HANDLER — Sync draft when bound states change
  // =========================================================================
  handleIcaStateChange(key: string, value: any) {
    const startAttr = this.getAttribute('start-time');
    const endAttr = this.getAttribute('end-time');
    if (startAttr === `{{${key}}}` || endAttr === `{{${key}}}`) {
      this.syncDraftFromValues();
    }
    this.requestUpdate();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('startTime') || changed.has('endTime') || changed.has('showSeconds')) {
      this.syncDraftFromValues();
    }
  }

  private syncDraftFromValues() {
    this.draftStartSeconds = null;
    this.draftEndSeconds = null;
  }

  // =========================================================================
  // EVENT HANDLERS
  // =========================================================================
  private handleFocus(field: 'start' | 'end') {
    if (!this.isEditing) return;
    this.activeField = field;
    this.dispatchEvent(new CustomEvent('focus', { bubbles: true, composed: true }));
  }

  private handleBlur() {
    this.activeField = null;
    this.dispatchEvent(new CustomEvent('blur', { bubbles: true, composed: true }));
  }

  private handleStartInput(e: Event) {
    if (!this.canInteract()) return;
    const value = Number((e.target as HTMLInputElement).value);
    this.draftStartSeconds = value;
  }

  private handleEndInput(e: Event) {
    if (!this.canInteract()) return;
    const value = Number((e.target as HTMLInputElement).value);
    this.draftEndSeconds = value;
  }

  private handleStartChange(e: Event) {
    if (!this.canInteract()) return;
    const value = Number((e.target as HTMLInputElement).value);
    if (!this.isValidStart(value)) {
      this.draftStartSeconds = null;
      return;
    }
    const formatted = this.secondsToTime(value);
    this.startTime = formatted;
    this.draftStartSeconds = null;
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
    }
  }

  private handleEndChange(e: Event) {
    if (!this.canInteract()) return;
    const value = Number((e.target as HTMLInputElement).value);
    if (!this.isValidEnd(value)) {
      this.draftEndSeconds = null;
      return;
    }
    const formatted = this.secondsToTime(value);
    this.endTime = formatted;
    this.draftEndSeconds = null;
    this.dispatchEvent(new CustomEvent('endChange', {
      bubbles: true,
      composed: true,
      detail: { value: this.endTime },
    }));
    if (this.startTime) {
      this.dispatchEvent(new CustomEvent('change', {
        bubbles: true,
        composed: true,
        detail: { startTime: this.startTime, endTime: this.endTime },
      }));
    }
  }

  // =========================================================================
  // HELPERS
  // =========================================================================
  private canInteract(): boolean {
    return this.isEditing && !this.disabled && !this.readonly && !this.loading;
  }

  private toSeconds(time: string | null): number | null {
    if (!time) return null;
    const parts = time.split(':').map((p) => Number(p));
    if (parts.length < 2) return null;
    const [h, m, s] = [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    return h * 3600 + m * 60 + s;
  }

  private secondsToTime(seconds: number): string {
    const total = Math.max(0, Math.min(86399, seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return this.showSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
  }

  private formatDisplay(time: string | null, fallback: string): string {
    if (!time) return fallback;
    const seconds = this.toSeconds(time) ?? 0;
    const date = new Date(Date.UTC(1970, 0, 1, 0, 0, 0));
    date.setUTCSeconds(seconds);
    return date.toLocaleTimeString(this.locale || undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: this.showSeconds ? '2-digit' : undefined,
      hour12: this.hour12,
      timeZone: 'UTC',
    });
  }

  private getMinMaxSeconds(): { min: number; max: number } {
    const min = this.toSeconds(this.minTime) ?? 0;
    const max = this.toSeconds(this.maxTime) ?? 86399;
    return {
      min: Math.max(0, Math.min(min, 86399)),
      max: Math.max(0, Math.min(max, 86399)),
    };
  }

  private getStepSeconds(): number {
    if (this.showSeconds) return 1;
    return Math.max(1, this.minuteStep) * 60;
  }

  private getCurrentStartSeconds(): number | null {
    if (this.draftStartSeconds !== null) return this.draftStartSeconds;
    return this.toSeconds(this.startTime);
  }

  private getCurrentEndSeconds(): number | null {
    if (this.draftEndSeconds !== null) return this.draftEndSeconds;
    return this.toSeconds(this.endTime);
  }

  private isOvernight(): boolean {
    const start = this.toSeconds(this.startTime);
    const end = this.toSeconds(this.endTime);
    return this.allowOvernight && start !== null && end !== null && end < start;
  }

  private durationMinutes(start: number, end: number): number {
    if (this.allowOvernight && end < start) {
      return (24 * 60) - Math.floor(start / 60) + Math.floor(end / 60);
    }
    return Math.floor((end - start) / 60);
  }

  private isValidInterval(start: number, end: number): boolean {
    if (!this.allowOvernight) {
      if (end < start) return false;
      if (end === start && !this.allowSameTime) return false;
      const duration = this.durationMinutes(start, end);
      if (this.minDurationMinutes > 0 && duration < this.minDurationMinutes) return false;
      if (this.maxDurationMinutes > 0 && duration > this.maxDurationMinutes) return false;
      return true;
    }
    if (end === start && !this.allowSameTime) return false;
    const duration = this.durationMinutes(start, end);
    if (this.minDurationMinutes > 0 && duration < this.minDurationMinutes) return false;
    if (this.maxDurationMinutes > 0 && duration > this.maxDurationMinutes) return false;
    return true;
  }

  private isValidStart(startSeconds: number): boolean {
    const endSeconds = this.toSeconds(this.endTime);
    const { min, max } = this.getMinMaxSeconds();
    if (startSeconds < min || startSeconds > max) return false;
    if (endSeconds === null) return true;
    return this.isValidInterval(startSeconds, endSeconds);
  }

  private isValidEnd(endSeconds: number): boolean {
    const startSeconds = this.toSeconds(this.startTime);
    const { min, max } = this.getMinMaxSeconds();
    if (endSeconds < min || endSeconds > max) return false;
    if (startSeconds === null) return true;
    return this.isValidInterval(startSeconds, endSeconds);
  }

  private getTrackSegmentStyles(start: number, end: number): { left: string; width: string } {
    const total = 86400;
    const left = (start / total) * 100;
    const width = ((end - start) / total) * 100;
    return { left: `${left}%`, width: `${width}%` };
  }

  private getContainerClasses(): string {
    return [
      'w-full rounded-lg border p-4 transition',
      'bg-white dark:bg-slate-800',
      'border-slate-200 dark:border-slate-700',
      this.error ? 'border-red-500 dark:border-red-400' : '',
      this.disabled ? 'opacity-50 cursor-not-allowed' : '',
    ].filter(Boolean).join(' ');
  }

  private getInputBoxClasses(active: boolean): string {
    return [
      'w-full rounded-md border px-3 py-2 text-sm transition',
      'bg-slate-50 dark:bg-slate-900',
      'text-slate-900 dark:text-slate-100',
      'border-slate-200 dark:border-slate-700',
      active ? 'border-sky-500 dark:border-sky-400 ring-2 ring-sky-500/20 dark:ring-sky-400/20' : '',
      this.readonly ? 'cursor-default' : 'cursor-pointer',
    ].filter(Boolean).join(' ');
  }

  private getRangeClasses(active: boolean): string {
    return [
      'absolute left-0 top-0 h-3 w-full appearance-none bg-transparent',
      'accent-sky-500 dark:accent-sky-400',
      active ? 'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400' : 'focus:outline-none',
      this.disabled || this.loading ? 'cursor-not-allowed' : 'cursor-pointer',
    ].filter(Boolean).join(' ');
  }

  private renderLabel(): TemplateResult {
    if (!this.hasSlot('Label')) return html``;
    const content = this.getSlotContent('Label');
    const required = this.required ? html`<span class="text-red-600 dark:text-red-400"> *</span>` : nothing;
    return html`
      <div id="${this.baseId}-label" class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
        ${unsafeHTML(content)}${required}
      </div>
    `;
  }

  private renderHelperOrError(): TemplateResult {
    if (!this.isEditing) return html``;
    if (this.error) {
      return html`<p id="${this.baseId}-error" class="mt-2 text-xs text-red-600 dark:text-red-400">${unsafeHTML(String(this.error))}</p>`;
    }
    if (this.hasSlot('Helper')) {
      return html`<p id="${this.baseId}-helper" class="mt-2 text-xs text-slate-500 dark:text-slate-400">${unsafeHTML(this.getSlotContent('Helper'))}</p>`;
    }
    return html``;
  }

  private renderViewMode(): TemplateResult {
    const startDisplay = this.formatDisplay(this.startTime, this.msg.empty);
    const endDisplay = this.formatDisplay(this.endTime, this.msg.empty);
    const hasBoth = this.startTime || this.endTime;
    const overnight = this.isOvernight();
    const display = !hasBoth
      ? this.msg.empty
      : `${startDisplay} – ${endDisplay}${overnight ? ` ${this.msg.nextDay}` : ''}`;

    return html`
      <div class="w-full">
        ${this.renderLabel()}
        <div class="text-sm text-slate-900 dark:text-slate-100">${display}</div>
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

    const startSeconds = this.getCurrentStartSeconds();
    const endSeconds = this.getCurrentEndSeconds();
    const startDisplay = startSeconds !== null ? this.formatDisplay(this.secondsToTime(startSeconds), this.msg.empty) : this.msg.empty;
    const endDisplay = endSeconds !== null ? this.formatDisplay(this.secondsToTime(endSeconds), this.msg.empty) : this.msg.empty;
    const overnight = this.isOvernight();

    const { min, max } = this.getMinMaxSeconds();
    const step = this.getStepSeconds();

    const ariaDescribedBy = this.error
      ? `${this.baseId}-error`
      : this.hasSlot('Helper') ? `${this.baseId}-helper` : undefined;

    const labelStart = this.hasSlot('LabelStart') ? unsafeHTML(this.getSlotContent('LabelStart')) : this.msg.labelStart;
    const labelEnd = this.hasSlot('LabelEnd') ? unsafeHTML(this.getSlotContent('LabelEnd')) : this.msg.labelEnd;

    const startId = `${this.baseId}-start-label`;
    const endId = `${this.baseId}-end-label`;

    const highlightSegments: TemplateResult[] = [];
    if (startSeconds !== null && endSeconds !== null) {
      if (!this.allowOvernight || endSeconds >= startSeconds) {
        const seg = this.getTrackSegmentStyles(startSeconds, endSeconds);
        highlightSegments.push(html`
          <div class="absolute top-0 h-3 rounded-full bg-sky-500/30 dark:bg-sky-400/30"
            style="left:${seg.left};width:${seg.width};"></div>
        `);
      } else {
        const seg1 = this.getTrackSegmentStyles(startSeconds, 86400);
        const seg2 = this.getTrackSegmentStyles(0, endSeconds);
        highlightSegments.push(html`
          <div class="absolute top-0 h-3 rounded-full bg-sky-500/30 dark:bg-sky-400/30"
            style="left:${seg1.left};width:${seg1.width};"></div>
          <div class="absolute top-0 h-3 rounded-full bg-sky-500/30 dark:bg-sky-400/30"
            style="left:${seg2.left};width:${seg2.width};"></div>
        `);
      }
    }

    return html`
      <div class="${this.getContainerClasses()}" aria-busy="${this.loading ? 'true' : 'false'}">
        ${this.renderLabel()}

        <div class="flex gap-3">
          <div class="flex-1">
            <div id="${startId}" class="mb-1 text-xs text-slate-600 dark:text-slate-400">${labelStart}</div>
            <div class="${this.getInputBoxClasses(this.activeField === 'start')}" aria-hidden="true">
              ${startDisplay}
            </div>
          </div>
          <div class="flex-1">
            <div id="${endId}" class="mb-1 text-xs text-slate-600 dark:text-slate-400">${labelEnd}</div>
            <div class="${this.getInputBoxClasses(this.activeField === 'end')}" aria-hidden="true">
              ${endDisplay}
              ${overnight ? html`<span class="ml-2 text-xs text-sky-700 dark:text-sky-300" aria-label="${this.msg.nextDay}">${this.msg.nextDay}</span>` : nothing}
            </div>
          </div>
        </div>

        <div class="mt-4">
          <div class="relative h-3 rounded-full bg-slate-100 dark:bg-slate-700">
            ${highlightSegments}
            <input
              type="range"
              class="${this.getRangeClasses(this.activeField === 'start')}"
              min="${min}"
              max="${max}"
              step="${step}"
              .value="${startSeconds ?? min}"
              ?disabled="${this.disabled || this.loading}"
              aria-labelledby="${startId}"
              aria-describedby="${ifDefined(ariaDescribedBy)}"
              aria-invalid="${this.error ? 'true' : 'false'}"
              aria-required="${this.required ? 'true' : 'false'}"
              @focus="${() => this.handleFocus('start')}"
              @blur="${this.handleBlur}"
              @input="${this.handleStartInput}"
              @change="${this.handleStartChange}"
            />
            <input
              type="range"
              class="${this.getRangeClasses(this.activeField === 'end')}"
              min="${min}"
              max="${max}"
              step="${step}"
              .value="${endSeconds ?? max}"
              ?disabled="${this.disabled || this.loading}"
              aria-labelledby="${endId}"
              aria-describedby="${ifDefined(ariaDescribedBy)}"
              aria-invalid="${this.error ? 'true' : 'false'}"
              aria-required="${this.required ? 'true' : 'false'}"
              @focus="${() => this.handleFocus('end')}"
              @blur="${this.handleBlur}"
              @input="${this.handleEndInput}"
              @change="${this.handleEndChange}"
            />
          </div>
        </div>

        ${this.loading ? html`<div class="mt-3 text-xs text-slate-500 dark:text-slate-400">${this.msg.loading}</div>` : nothing}
        ${this.renderHelperOrError()}
      </div>
    `;
  }
}
