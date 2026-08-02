/// <mls fileReference="_102033_/l2/shared/chartRuntime.ts" enhancement="_blank" />

// Shared business-chart runtime. Consumers should dynamically import this module so
// esbuild emits ECharts as an on-demand chunk shared by every chart in the publication.
import { noChange, type ElementPart } from 'lit';
import { AsyncDirective } from 'lit/async-directive.js';
import { directive, PartType, type PartInfo } from 'lit/directive.js';
import * as echarts from 'echarts/core';
import type { ECharts as EChartsInstance } from 'echarts/core';
import {
  BarChart,
  BoxplotChart,
  CandlestickChart,
  FunnelChart,
  GaugeChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  PieChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  TreemapChart,
} from 'echarts/charts';
import {
  AriaComponent,
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
} from 'echarts/components';
import { LabelLayout, UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  BoxplotChart,
  CandlestickChart,
  FunnelChart,
  GaugeChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  PieChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  TreemapChart,
  AriaComponent,
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
  LabelLayout,
  UniversalTransition,
  CanvasRenderer,
]);

export { echarts };
export type { ECharts, EChartsCoreOption } from 'echarts/core';

// ---------------------------------------------------------------------------
// `chart()` — the Lit way to put an ECharts chart on a page.
//
// A chart needs a DOM node that only exists AFTER render, plus resize handling and disposal on the way
// out. Written by hand that is four fields and three lifecycle methods (see the monitor home page), which
// a GENERATED page cannot have: its contract is render-only, and an organism is a plain function with no
// lifecycle at all. So the lifecycle lives here, once, and the page just writes:
//
//   html`<div class="h-80" ${chart(option)}></div>`
//
// Re-rendering with a new option updates the same instance (`setOption(option, true)`) instead of
// recreating it, so the chart keeps its canvas and animates between states.

/**
 * Handlers for ECharts events, by event name (`click`, `legendselectchanged`, `datazoom`, …).
 *
 * ECharts events do NOT reach the DOM: they are emitted on the instance via `chart.on(...)`, so
 * `@chartclick=${…}` in a Lit template is a listener that never fires — and it COMPILES, because any
 * `@name` is a valid Lit binding. A generated page wrote exactly that, which is why the handlers must
 * come through the directive instead.
 */
export type ChartEvents = Record<string, (params: never) => void>;

/**
 * Bind an ECharts option to the element this directive sits on.
 *
 * @param option a full EChartsCoreOption. Every chart type and component this runtime registers above is
 *        available — no `echarts.use()` needed at the call site, which is the whole point of the module:
 *        an unregistered piece renders BLANK with no error.
 * @param events optional handlers, e.g. `{ click: (p) => this.selectCategory(p.name) }`. Rebound on every
 *        update, so a closure over fresh state is always the one that runs.
 *
 * The element must have a height (ECharts measures its container; a container of height 0 draws nothing).
 */
export const chart = directive(class extends AsyncDirective {
  #chart?: EChartsInstance;
  #observer?: ResizeObserver;

  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) {
      throw new Error('chart() must be used as an element directive: <div ${chart(option)}></div>');
    }
  }

  #bound: string[] = [];

  render(_option: unknown, _events?: ChartEvents): typeof noChange {
    return noChange;
  }

  override update(part: ElementPart, [option, events]: [unknown, ChartEvents?]): typeof noChange {
    const element = part.element as HTMLElement;
    if (!this.#chart) {
      this.#chart = echarts.init(element);
      // The element can be resized by layout alone (a flex/grid sibling changing), which no Lit update
      // reports — so observe the node rather than hooking the render cycle.
      this.#observer = new ResizeObserver(() => this.#chart?.resize());
      this.#observer.observe(element);
    }
    // Rebind every update: the handlers are closures over the render's state, and keeping the first ones
    // would silently act on stale data. Only the names bound here are removed, so a handler attached by
    // some other code on the same instance survives.
    for (const name of this.#bound) this.#chart.off(name);
    this.#bound = Object.keys(events ?? {});
    for (const name of this.#bound) this.#chart.on(name, events![name] as never);
    // `true` replaces the option instead of merging: a page that re-renders with fewer series must not
    // keep the old ones on screen.
    this.#chart.setOption(option as never, true);
    return noChange;
  }

  /** Element left the DOM: release the canvas and the observer, or both leak for the session. */
  override disconnected(): void {
    this.#observer?.disconnect();
    this.#observer = undefined;
    this.#bound = [];
    // dispose() drops the handlers with the instance; the list is cleared so a reconnect starts clean.
    this.#chart?.dispose();
    this.#chart = undefined;
  }

  /** Lit reuses the directive when the element comes back; `update` runs again and re-inits. */
  override reconnected(): void {}
});
