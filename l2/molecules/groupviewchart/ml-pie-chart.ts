/// <mls fileReference="_102033_/l2/molecules/groupviewchart/ml-pie-chart.ts" enhancement="_102020_/l2/enhancementAura" />

// =============================================================================
// GROUPVIEWCHART — PIE CHART MOLECULE
// =============================================================================
// Skill Group: groupViewChart
// This molecule does NOT contain business logic.
import { html, svg, TemplateResult} from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { customElement, property, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators.js';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
  empty: 'No data available',
  loading: 'Loading chart...',
  ariaLabel: 'Pie chart',
};

type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
  en: message_en,
  pt: {
    empty: 'Nenhum dado disponível',
    loading: 'Carregando gráfico...',
    ariaLabel: 'Gráfico de pizza',
  },
};
/// **collab_i18n_end**

type ParsedPoint = {
  label: string;
  value: number;
  color: string;
  series?: string;
};

type ParsedSeries = {
  name: string;
  color: string;
  points: ParsedPoint[];
};

type HoverState = {
  label: string;
  value: number;
  series?: string;
  color: string;
  x: number;
  y: number;
} | null;

@customElement('groupviewchart--ml-pie-chart')
export class PieChartMolecule extends MoleculeAuraElement {
  private msg: MessageType = messages.en;

  // =========================================================================
  // SLOT TAGS
  // =========================================================================
  slotTags = ['Label', 'Series', 'Point', 'Empty'];

  // =========================================================================
  // PROPERTIES — From Contract
  // =========================================================================
  @propertyDataSource({ type: Boolean, attribute: 'show-legend' })
  showLegend = true;

  @propertyDataSource({ type: Boolean, attribute: 'show-values' })
  showValues = false;

  @propertyDataSource({ type: Boolean })
  loading = false;

  // =========================================================================
  // INTERNAL STATE
  // =========================================================================
  @state()
  private hoverState: HoverState = null;

  // =========================================================================
  // DATA PARSING
  // =========================================================================
  private palette = [
    '#0ea5e9',
    '#22c55e',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#14b8a6',
    '#f97316',
    '#3b82f6',
    '#e11d48',
    '#64748b',
  ];

  private parsePoint(el: Element, index: number, fallbackColor: string, seriesName?: string): ParsedPoint | null {
    const label = el.getAttribute('label');
    const valueRaw = el.getAttribute('value');
    if (!label || !valueRaw) return null;
    const value = Number(valueRaw);
    if (Number.isNaN(value) || value <= 0) return null;
    const color = el.getAttribute('color') || fallbackColor || this.palette[index % this.palette.length];
    return { label, value, color, series: seriesName };
  }

  private readSeries(): ParsedSeries[] {
    const seriesEls = this.getSlots('Series');
    return seriesEls
      .map((seriesEl, idx) => {
        const name = seriesEl.getAttribute('name') || `Series ${idx + 1}`;
        const seriesColor = seriesEl.getAttribute('color') || this.palette[idx % this.palette.length];
        const pointEls = Array.from(seriesEl.querySelectorAll('Point'));
        const points = pointEls
          .map((pointEl, pIdx) => this.parsePoint(pointEl, pIdx, seriesColor, name))
          .filter((p): p is ParsedPoint => Boolean(p));
        return { name, color: seriesColor, points };
      })
      .filter((s) => s.points.length > 0);
  }

  private readStandalonePoints(): ParsedPoint[] {
    const allPointEls = this.getSlots('Point');
    const rootPoints = allPointEls.filter((el) => !el.closest('Series'));

    console.info({ allPointEls, rootPoints })
    return rootPoints
      .map((pointEl, idx) => this.parsePoint(pointEl, idx, this.palette[idx % this.palette.length]))
      .filter((p): p is ParsedPoint => Boolean(p));
  }

  private getSegments(): ParsedPoint[] {
    const series = this.readSeries();
    if (series.length > 0) {
      return series.flatMap((s) => s.points);
    }
    return this.readStandalonePoints();
  }

  // =========================================================================
  // EVENT HANDLERS
  // =========================================================================
  private handlePointClick(point: ParsedPoint) {
    this.dispatchEvent(
      new CustomEvent('pointClick', {
        bubbles: true,
        composed: true,
        detail: {
          label: point.label,
          value: point.value,
          series: point.series,
        },
      })
    );
  }

  private handlePointKeydown(e: KeyboardEvent, point: ParsedPoint) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.handlePointClick(point);
    }
  }

  private handlePointEnter(e: MouseEvent, point: ParsedPoint) {
    const rect = this.getBoundingClientRect();
    this.hoverState = {
      label: point.label,
      value: point.value,
      series: point.series,
      color: point.color,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private handlePointLeave() {
    this.hoverState = null;
  }

  // =========================================================================
  // CHART GEOMETRY
  // =========================================================================
  private polarToCartesian(cx: number, cy: number, r: number, angle: number) {
    const rad = ((angle - 90) * Math.PI) / 180.0;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  private describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
    const start = this.polarToCartesian(cx, cy, r, startAngle);
    const end = this.polarToCartesian(cx, cy, r, endAngle);
    const largeArcFlag = endAngle - startAngle > 180 ? '1' : '0';
    return [
      `M ${cx} ${cy}`,
      `L ${start.x} ${start.y}`,
      `A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
      'Z',
    ].join(' ');
  }

  // =========================================================================
  // RENDER HELPERS
  // =========================================================================
  private renderLabel(): TemplateResult {
    if (!this.hasSlot('Label')) return html``;
    const content = this.getSlotContent('Label');
    return html`<div class="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">${unsafeHTML(content)}</div>`;
  }

  private renderLoading(): TemplateResult {
    return html`
      <div class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
        <div class="h-4 w-40 rounded bg-slate-200 dark:bg-slate-700 animate-pulse"></div>
        <div class="mt-4 h-40 w-full rounded-full bg-slate-100 dark:bg-slate-700 animate-pulse"></div>
        <div class="mt-3 text-xs text-slate-500 dark:text-slate-400">${this.msg.loading}</div>
      </div>
    `;
  }

  private renderEmpty(): TemplateResult {
    const content = this.hasSlot('Empty') ? this.getSlotContent('Empty') : this.msg.empty;
    return html`
      <div class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
        <div class="text-sm text-slate-500 dark:text-slate-400">${unsafeHTML(content)}</div>
      </div>
    `;
  }

  private renderLegend(series: ParsedSeries[], points: ParsedPoint[]): TemplateResult {
    if (!this.showLegend) return html``;
    const items = series.length > 0
      ? series.map((s) => ({ label: s.name, color: s.color }))
      : points.map((p) => ({ label: p.label, color: p.color }));

    if (items.length === 0) return html``;

    return html`
      <div class="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
        ${items.map(
      (item) => html`
            <div class="flex items-center gap-2">
              <span class="inline-block h-3 w-3 rounded-full" style="background:${item.color}"></span>
              <span>${item.label}</span>
            </div>
          `
    )}
      </div>
    `;
  }

  private renderAccessibleTable(points: ParsedPoint[]): TemplateResult {
    if (points.length === 0) return html``;
    return html`
      <table class="sr-only" aria-hidden="false">
        <thead>
          <tr>
            <th>Label</th>
            <th>Value</th>
            <th>Series</th>
          </tr>
        </thead>
        <tbody>
          ${points.map(
      (p) => html`
              <tr>
                <td>${p.label}</td>
                <td>${p.value}</td>
                <td>${p.series || ''}</td>
              </tr>
            `
    )}
        </tbody>
      </table>
    `;
  }

  private renderTooltip(): TemplateResult {
    if (!this.hoverState) return html``;
    const { label, value, series, color, x, y } = this.hoverState;
    const seriesLabel = series ? html`<div class="text-[10px] text-slate-500 dark:text-slate-400">${series}</div>` : html``;
    return html`
      <div
        class="pointer-events-none absolute z-10 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 shadow"
        style="left:${x + 12}px; top:${y + 12}px;"
      >
        <div class="flex items-center gap-2">
          <span class="inline-block h-2.5 w-2.5 rounded-full" style="background:${color}"></span>
          <span class="font-medium">${label}</span>
        </div>
        ${seriesLabel}
        <div class="mt-1 text-slate-600 dark:text-slate-400">${value}</div>
      </div>
    `;
  }

  private renderChart(points: ParsedPoint[], series: ParsedSeries[]): TemplateResult {
    const total = points.reduce((sum, p) => sum + p.value, 0);
    let startAngle = 0;
    const center = 50;
    const radius = 42;

    return html`
      <div class="relative w-full">
        ${this.renderTooltip()}
        <svg
          class="w-full max-w-[320px]"
          viewBox="0 0 100 100"
          role="img"
          aria-label="${this.getSlotContent('Label') || this.msg.ariaLabel}"
        >
          ${points.map((point) => {
      const angle = (point.value / total) * 360;
      const endAngle = startAngle + angle;
      const d = this.describeArc(center, center, radius, startAngle, endAngle);
      const midAngle = startAngle + angle / 2;
      const labelPos = this.polarToCartesian(center, center, radius * 0.65, midAngle);
      startAngle = endAngle;
      return svg`
              <g>
                <path
                  d="${d}"
                  style="fill: ${point.color}"
                  role="button"
                  tabindex="0"
                  aria-label="${point.label} ${point.value}${point.series ? ` ${point.series}` : ''}"
                  @mouseenter=${(e: MouseEvent) => this.handlePointEnter(e, point)}
                  @mousemove=${(e: MouseEvent) => this.handlePointEnter(e, point)}
                  @mouseleave=${this.handlePointLeave}
                  @focus=${(e: MouseEvent) => this.handlePointEnter(e, point)}
                  @blur=${this.handlePointLeave}
                  @keydown=${(e: KeyboardEvent) => this.handlePointKeydown(e, point)}
                  @click=${() => this.handlePointClick(point)}
                ></path>
                ${this.showValues
          ? html`
                      <text
                        x="${labelPos.x}"
                        y="${labelPos.y}"
                        text-anchor="middle"
                        dominant-baseline="middle"
                        class="text-[6px] fill-slate-900 dark:fill-slate-100"
                      >
                        ${point.value}
                      </text>
                    `
          : html``}
              </g>
            `;
    })}
        </svg>
        ${this.renderAccessibleTable(points)}
      </div>
      ${this.renderLegend(series, points)}
    `;
  }

  // =========================================================================
  // RENDER
  // =========================================================================
  render() {
    const lang = this.getMessageKey(messages);
    this.msg = messages[lang];

    const series = this.readSeries();
    const points = this.getSegments();

    return html`
      <div class="w-full">
        ${this.renderLabel()}
        ${this.loading
        ? this.renderLoading()
        : points.length === 0
          ? this.renderEmpty()
          : this.renderChart(points, series)}
      </div>
    `;
  }
}
