/// <mls fileReference="_102033_/l2/molecules/groupviewchart/ml-bar-chart.ts" enhancement="_102020_/l2/enhancementAura"/>

// =============================================================================
// BAR CHART MOLECULE
// =============================================================================
// Skill Group: groupViewChart
// This molecule does NOT contain business logic.
import { html, TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { customElement, state } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators.js';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
    loading: 'Loading chart...',
    empty: 'No data available',
    chartLabel: 'Bar chart',
    legend: 'Legend',
    value: 'Value',
    label: 'Label',
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
    en: message_en,
    pt: {
        loading: 'Carregando gráfico...',
        empty: 'Nenhum dado disponível',
        chartLabel: 'Gráfico de barras',
        legend: 'Legenda',
        value: 'Valor',
        label: 'Rótulo',
    },
};
/// **collab_i18n_end**

type ParsedPoint = {
    label: string;
    value: number;
    color?: string;
    series?: string;
    seriesColor?: string;
};

type ParsedSeries = {
    name: string;
    color?: string;
    points: ParsedPoint[];
};

@customElement('groupviewchart--ml-bar-chart')
export class MlBarChartMolecule extends MoleculeAuraElement {
    private msg: MessageType = messages.en;

    // ===========================================================================
    // SLOT TAGS
    // ===========================================================================
    slotTags = ['Label', 'Series', 'Point', 'Empty'];

    // ===========================================================================
    // PROPERTIES — From Contract
    // ===========================================================================
    @propertyDataSource({ type: Boolean, attribute: 'show-legend' })
    showLegend = true;

    @propertyDataSource({ type: Boolean, attribute: 'show-values' })
    showValues = false;

    @propertyDataSource({ type: Boolean })
    loading = false;

    // ===========================================================================
    // INTERNAL STATE
    // ===========================================================================
    @state()
    private tooltip: {
        label: string;
        value: number;
        series?: string;
        left: number;
        top: number;
    } | null = null;

    // ===========================================================================
    // EVENT HANDLERS
    // ===========================================================================
    private handlePointMouseEnter(point: ParsedPoint, event: Event) {
        const target = event.currentTarget as HTMLElement;
        const container = this.querySelector('[data-chart-container]') as HTMLElement | null;
        if (!container || !target) return;
        const rect = target.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const left = rect.left - containerRect.left + rect.width / 2;
        const top = rect.top - containerRect.top - 8;
        this.tooltip = {
            label: point.label,
            value: point.value,
            series: point.series,
            left,
            top,
        };
    }

    private handlePointMouseLeave() {
        this.tooltip = null;
    }

    private handlePointClick(point: ParsedPoint) {
        this.dispatchEvent(new CustomEvent('pointClick', {
            bubbles: true,
            composed: true,
            detail: {
                label: point.label,
                value: point.value,
                series: point.series,
            },
        }));
    }

    private handlePointKeyDown(point: ParsedPoint, event: KeyboardEvent) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handlePointClick(point);
        }
    }

    // ===========================================================================
    // DATA PARSING
    // ===========================================================================
    private parsePoint(el: Element, seriesName?: string, seriesColor?: string): ParsedPoint {
        const label = el.getAttribute('label') || '';
        const rawValue = el.getAttribute('value') || '0';
        const value = Number(rawValue);
        const color = el.getAttribute('color') || undefined;
        return {
            label,
            value: Number.isNaN(value) ? 0 : value,
            color,
            series: seriesName,
            seriesColor,
        };
    }

    private readSeries(): ParsedSeries[] {
        const seriesElements = this.getSlots('Series');
        return seriesElements.map((seriesEl) => {
            const name = seriesEl.getAttribute('name') || '';
            const color = seriesEl.getAttribute('color') || undefined;
            const points = Array.from(seriesEl.querySelectorAll('Point')).map((pointEl) =>
                this.parsePoint(pointEl, name, color)
            );
            return { name, color, points };
        });
    }

    private readStandalonePoints(): ParsedPoint[] {
        const pointElements = this.getSlots('Point');
        const rootPoints = pointElements.filter((pointEl) => pointEl.parentElement?.tagName !== 'SERIES');
        return rootPoints.map((pointEl) => this.parsePoint(pointEl));
    }

    private getCategories(series: ParsedSeries[], points: ParsedPoint[]): string[] {
        if (series.length > 0) {
            const labels: string[] = [];
            series.forEach((s) => {
                s.points.forEach((p) => {
                    if (!labels.includes(p.label)) labels.push(p.label);
                });
            });
            return labels;
        }
        return points.map((p) => p.label);
    }

    private getMaxValue(series: ParsedSeries[], points: ParsedPoint[]): number {
        const values: number[] = [];
        series.forEach((s) => s.points.forEach((p) => values.push(p.value)));
        points.forEach((p) => values.push(p.value));
        return Math.max(0, ...values);
    }

    // ===========================================================================
    // RENDER HELPERS
    // ===========================================================================
    private renderLabel(): TemplateResult {
        if (!this.hasSlot('Label')) return html``;
        return html`
<div class="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
${unsafeHTML(this.getSlotContent('Label'))}
</div>
`;
    }

    private renderLoading(): TemplateResult {
        return html`
<div class="mt-4 flex flex-col gap-3 animate-pulse">
<div class="h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-700"></div>
<div class="h-40 w-full rounded bg-slate-100 dark:bg-slate-800"></div>
<div class="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-700"></div>
<span class="text-xs text-slate-500 dark:text-slate-400">${this.msg.loading}</span>
</div>
`;
    }

    private renderEmpty(): TemplateResult {
        const content = this.hasSlot('Empty') ? this.getSlotContent('Empty') : this.msg.empty;
        return html`
<div class="mt-4 rounded-md border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
${unsafeHTML(content)}
</div>
`;
    }

    private renderTooltip(): TemplateResult {
        if (!this.tooltip) return html``;
        const seriesInfo = this.tooltip.series ? ` • ${this.tooltip.series}` : '';
        return html`
<div
class="absolute z-10 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 shadow-lg"
style=${ifDefined(`left:${this.tooltip.left}px; top:${this.tooltip.top}px; transform: translate(-50%, -100%);`)}
>
<span class="font-semibold">${this.tooltip.label}</span>
<span class="text-slate-500 dark:text-slate-400">${seriesInfo}</span>
<div class="mt-1 text-slate-700 dark:text-slate-200">${this.formatNumber(this.tooltip.value)}</div>
</div>
`;
    }

    private renderLegend(series: ParsedSeries[], points: ParsedPoint[]): TemplateResult {
        if (!this.showLegend) return html``;
        if (series.length === 0 && points.length === 0) return html``;
        const items = series.length > 0
            ? series.map((s) => ({ label: s.name, color: s.color }))
            : points.map((p) => ({ label: p.label, color: p.color }));
        return html`
<div class="mt-4">
<div class="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">${this.msg.legend}</div>
<div class="flex flex-wrap gap-3">
${items.map((item) => html`
<div class="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
<span
class="h-3 w-3 rounded-full border border-slate-200 dark:border-slate-700"
style=${ifDefined(item.color ? `background-color:${item.color};` : undefined)}
></span>
<span>${item.label}</span>
</div>
`)}
</div>
</div>
`;
    }

    private renderDataTable(series: ParsedSeries[], points: ParsedPoint[]): TemplateResult {
        const categories = this.getCategories(series, points);
        if (series.length > 0) {
            return html`
<table class="sr-only">
<caption>${this.getAriaLabel()}</caption>
<thead>
<tr>
<th>${this.msg.label}</th>
${series.map((s) => html`<th>${s.name}</th>`)}
</tr>
</thead>
<tbody>
${categories.map((cat) => html`
<tr>
<td>${cat}</td>
${series.map((s) => {
                const point = s.points.find((p) => p.label === cat);
                const value = point ? point.value : 0;
                return html`<td>${this.formatNumber(value)}</td>`;
            })}
</tr>
`)}
</tbody>
</table>
`;
        }
        return html`
<table class="sr-only">
<caption>${this.getAriaLabel()}</caption>
<thead>
<tr>
<th>${this.msg.label}</th>
<th>${this.msg.value}</th>
</tr>
</thead>
<tbody>
${points.map((p) => html`
<tr>
<td>${p.label}</td>
<td>${this.formatNumber(p.value)}</td>
</tr>
`)}
</tbody>
</table>
`;
    }

    private getAriaLabel(): string {
        const content = this.getSlotContent('Label');
        if (!content) return this.msg.chartLabel;
        const div = document.createElement('div');
        div.innerHTML = content;
        return div.textContent?.trim() || this.msg.chartLabel;
    }

    private formatNumber(value: number): string {
        const lang = this.getMessageKey(messages) === 'pt' ? 'pt-BR' : 'en-US';
        return new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(value);
    }

    private getBarWidth(seriesCount: number): string {
        if (seriesCount <= 1) return 'w-8';
        if (seriesCount === 2) return 'w-6';
        if (seriesCount === 3) return 'w-5';
        return 'w-4';
    }

    private getBarClasses(): string {
        return [
            'rounded-t-md transition',
            'bg-sky-500 dark:bg-sky-400',
            'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
        ].join(' ');
    }

    private getCategoryLabelClasses(): string {
        return [
            'pt-2 text-xs text-slate-600 dark:text-slate-400 text-center',
            'whitespace-nowrap',
        ].join(' ');
    }

    private renderChart(series: ParsedSeries[], points: ParsedPoint[]): TemplateResult {
        const categories = this.getCategories(series, points);
        const maxValue = this.getMaxValue(series, points);
        const hasSeries = series.length > 0;
        const seriesCount = hasSeries ? series.length : 1;
        const barWidth = this.getBarWidth(seriesCount);
        return html`
<div class="relative" data-chart-container>
<div class="flex items-end gap-4 h-56 border-b border-slate-200 dark:border-slate-700">
${categories.map((category) => html`
<div class="flex flex-1 flex-col items-center justify-end h-full">
<div class="flex items-end gap-2 h-full">
${hasSeries
                ? series.map((s) => {
                    const point = s.points.find((p) => p.label === category) || { label: category, value: 0, series: s.name, seriesColor: s.color } as ParsedPoint;
                    const height = maxValue > 0 ? (point.value / maxValue) * 100 : 0;
                    const color = point.color || s.color;
                    const style = `height:${height}%;${color ? `background-color:${color};` : ''} min-height:${height > 0 ? '2px' : '0'};`;
                    const aria = `${point.label}: ${this.formatNumber(point.value)}${s.name ? ` - ${s.name}` : ''}`;
                    return html`
<div class="flex flex-col items-center justify-end h-full">
${this.showValues ? html`<span class="mb-1 text-xs text-slate-600 dark:text-slate-400">${this.formatNumber(point.value)}</span>` : html``}
<div
class="${this.getBarClasses()} ${barWidth} cursor-pointer"
style=${ifDefined(style)}
role="button"
aria-label=${aria}
tabindex="0"
@mouseenter=${(e: Event) => this.handlePointMouseEnter({ ...point, series: s.name, seriesColor: s.color }, e)}
@mouseleave=${this.handlePointMouseLeave}
@keydown=${(e: KeyboardEvent) => this.handlePointKeyDown({ ...point, series: s.name, seriesColor: s.color }, e)}
@click=${() => this.handlePointClick({ ...point, series: s.name, seriesColor: s.color })}
></div>
</div>
`;
                })
                : points.filter((p) => p.label === category).map((point) => {
                    const height = maxValue > 0 ? (point.value / maxValue) * 100 : 0;
                    const style = `height:${height}%;${point.color ? `background-color:${point.color};` : ''} min-height:${height > 0 ? '2px' : '0'};`;
                    const aria = `${point.label}: ${this.formatNumber(point.value)}`;
                    return html`
<div class="flex flex-col items-center justify-end h-full">
${this.showValues ? html`<span class="mb-1 text-xs text-slate-600 dark:text-slate-400">${this.formatNumber(point.value)}</span>` : html``}
<div
class="${this.getBarClasses()} ${barWidth} cursor-pointer"
style=${ifDefined(style)}
role="button"
aria-label=${aria}
tabindex="0"
@mouseenter=${(e: Event) => this.handlePointMouseEnter(point, e)}
@mouseleave=${this.handlePointMouseLeave}
@keydown=${(e: KeyboardEvent) => this.handlePointKeyDown(point, e)}
@click=${() => this.handlePointClick(point)}
></div>
</div>
`;
                })}
</div>
<div class="${this.getCategoryLabelClasses()}">${category}</div>
</div>
`)}
</div>
${this.renderTooltip()}
</div>
`;
    }

    // ===========================================================================
    // RENDER
    // ===========================================================================
    render() {
        const lang = this.getMessageKey(messages);
        this.msg = messages[lang];

        const series = this.readSeries().filter((s) => s.points.length > 0);
        const standalonePoints = this.readStandalonePoints();
        const isEmpty = series.length === 0 && standalonePoints.length === 0;

        return html`
<div role="img" aria-label="${this.getAriaLabel()}" class="w-full">
${this.renderLabel()}
${this.loading
                ? this.renderLoading()
                : isEmpty
                    ? this.renderEmpty()
                    : html`
${this.renderChart(series, standalonePoints)}
${this.renderLegend(series, standalonePoints)}
${this.renderDataTable(series, standalonePoints)}
`}
</div>
`;
    }
}
