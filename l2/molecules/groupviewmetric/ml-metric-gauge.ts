/// <mls fileReference="_102033_/l2/molecules/groupviewmetric/ml-metric-gauge.ts" enhancement="_102020_/l2/enhancementAura" />

// =============================================================================
// METRIC GAUGE MOLECULE
// =============================================================================
// Skill Group: groupViewMetric
// This molecule does NOT contain business logic.
import { html, TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { customElement } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

@customElement('groupviewmetric--ml-metric-gauge')
export class MetricGaugeMolecule extends MoleculeAuraElement {
  // =========================================================================
  // SLOT TAGS
  // =========================================================================
  slotTags = ['Label', 'Value', 'Icon', 'Trend', 'Helper'];

  // =========================================================================
  // PROPERTIES — From Contract
  // =========================================================================
  @propertyDataSource({ type: Boolean })
  loading = false;

  // =========================================================================
  // RENDER
  // =========================================================================
  render() {
    if (this.loading) {
      return this.renderLoading();
    }

    const ariaLabel = this.getAriaLabel();

    return html`
      <div
        class="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4"
        role="figure"
        aria-label=${ifDefined(ariaLabel)}
      >
        <div class="flex items-start gap-3">
          ${this.renderIcon()}
          <div class="flex-1 min-w-0">
            ${this.renderLabel()}
            <div class="mt-1 flex items-end justify-between gap-3">
              ${this.renderValue()}
              ${this.renderTrend()}
            </div>
            ${this.renderGauge()}
            ${this.renderHelper()}
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // RENDER PARTS
  // =========================================================================
  private renderIcon(): TemplateResult {
    if (!this.hasSlot('Icon')) return html``;
    const content = this.getSlotContent('Icon');
    return html`
      <div
        class="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300"
      >
        ${unsafeHTML(content)}
      </div>
    `;
  }

  private renderLabel(): TemplateResult {
    if (!this.hasSlot('Label')) return html``;
    const content = this.getSlotContent('Label');
    return html`
      <div class="text-sm font-medium text-slate-600 dark:text-slate-400">
        ${unsafeHTML(content)}
      </div>
    `;
  }

  private renderValue(): TemplateResult {
    const content = this.getSlotContent('Value');
    return html`
      <div
        class="text-2xl font-semibold text-slate-900 dark:text-slate-100"
        aria-live="polite"
      >
        ${unsafeHTML(content)}
      </div>
    `;
  }

  private renderTrend(): TemplateResult {
    if (!this.hasSlot('Trend')) return html``;
    const direction = this.getSlotAttr('Trend', 'direction') || 'neutral';
    const content = this.getSlotContent('Trend');
    const classes = this.getTrendClasses(direction);
    return html`
      <div
        class=${classes}
        aria-label=${`Trend: ${direction}`}
      >
        ${unsafeHTML(content)}
      </div>
    `;
  }

  private renderHelper(): TemplateResult {
    if (!this.hasSlot('Helper')) return html``;
    const content = this.getSlotContent('Helper');
    return html`
      <div class="mt-2 text-xs text-slate-500 dark:text-slate-400">
        ${unsafeHTML(content)}
      </div>
    `;
  }

  private renderGauge(): TemplateResult {
    return html`
      <div class="mt-3">
        <div
          class="relative h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
        >
          <div
            class="absolute left-0 top-0 h-2 w-2/3 bg-sky-500/60 dark:bg-sky-400/50"
          ></div>
          <div
            class="absolute left-2/3 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-sky-500 dark:bg-sky-400 border-2 border-white dark:border-slate-800"
          ></div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // LOADING
  // =========================================================================
  private renderLoading(): TemplateResult {
    return html`
      <div
        class="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 animate-pulse"
        role="figure"
      >
        <div class="flex items-start gap-3">
          <div class="h-10 w-10 rounded-lg bg-slate-200 dark:bg-slate-700"></div>
          <div class="flex-1">
            <div class="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700"></div>
            <div class="mt-2 h-7 w-40 rounded bg-slate-200 dark:bg-slate-700"></div>
            <div class="mt-3 h-2 w-full rounded bg-slate-200 dark:bg-slate-700"></div>
            <div class="mt-2 h-3 w-24 rounded bg-slate-200 dark:bg-slate-700"></div>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // HELPERS
  // =========================================================================
  private getAriaLabel(): string | undefined {
    const labelEl = this.getSlot('Label');
    const text = labelEl?.textContent?.trim() || '';
    return text ? text : undefined;
  }

  private getTrendClasses(direction: string): string {
    const base = [
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border',
      'bg-slate-50 dark:bg-slate-900',
    ];

    const color =
      direction === 'up'
        ? 'text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
        : direction === 'down'
          ? 'text-red-600 dark:text-red-400 border-red-200 dark:border-red-800'
          : 'text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700';

    return [...base, color].join(' ');
  }
}
