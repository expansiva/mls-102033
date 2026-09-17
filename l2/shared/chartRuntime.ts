/// <mls fileReference="_102033_/l2/shared/chartRuntime.ts" enhancement="_blank" />

// Shared business-chart runtime. Consumers should dynamically import this module so
// esbuild emits ECharts as an on-demand chunk shared by every chart in the publication.
import { noChange, type ElementPart } from 'lit';
import { AsyncDirective } from 'lit/async-directive.js';
import { directive, PartType, type PartInfo } from 'lit/directive.js';
import type { ECharts as EChartsInstance, EChartsCoreOption } from 'echarts/core';

export type { ECharts, EChartsCoreOption } from 'echarts/core';

const ECHARTS_RUNTIME_URL = '/_libs/echarts.min.js';

type EChartsRuntime = {
  init(element: HTMLElement, theme?: string | object, options?: object): EChartsInstance;
};

declare global {
  interface Window {
    echarts?: EChartsRuntime;
    collabEChartsRuntime?: Promise<EChartsRuntime>;
  }
}

/** Full local ECharts build shared by Studio and published applications; never uses a CDN. */
export function loadECharts(): Promise<EChartsRuntime> {
  if (window.echarts) return Promise.resolve(window.echarts);
  if (window.collabEChartsRuntime) return window.collabEChartsRuntime;
  window.collabEChartsRuntime = new Promise<EChartsRuntime>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = ECHARTS_RUNTIME_URL;
    script.async = true;
    script.dataset.collabEcharts = 'local';
    script.onload = () => window.echarts
      ? resolve(window.echarts)
      : reject(new Error('Local ECharts runtime loaded without exposing window.echarts.'));
    script.onerror = () => reject(new Error(`Unable to load local ECharts runtime at ${ECHARTS_RUNTIME_URL}.`));
    document.head.appendChild(script);
  });
  return window.collabEChartsRuntime;
}

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
  #element?: HTMLElement;
  #option?: EChartsCoreOption;
  #events?: ChartEvents;
  #needsOption = true;

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
    this.#element = part.element as HTMLElement;
    if (this.#option !== option) {
      this.#option = option as EChartsCoreOption;
      this.#needsOption = true;
    }
    this.#events = events;
    void loadECharts().then(runtime => this.#apply(runtime)).catch(error => console.error(error));
    return noChange;
  }

  #apply(runtime: EChartsRuntime): void {
    const element = this.#element;
    if (!element || !element.isConnected || !this.#option) return;
    if (!this.#chart) {
      this.#chart = runtime.init(element);
      this.#needsOption = true;
      // The element can be resized by layout alone (a flex/grid sibling changing), which no Lit update
      // reports — so observe the node rather than hooking the render cycle.
      this.#observer = new ResizeObserver(() => this.#chart?.resize());
      this.#observer.observe(element);
    }
    // Rebind every update: the handlers are closures over the render's state, and keeping the first ones
    // would silently act on stale data. Only the names bound here are removed, so a handler attached by
    // some other code on the same instance survives.
    for (const name of this.#bound) this.#chart.off(name);
    this.#bound = Object.keys(this.#events ?? {});
    for (const name of this.#bound) this.#chart.on(name, this.#events![name] as never);
    // Keep the current force-layout positions when only Lit state/event closures changed. A genuinely
    // new option still replaces the previous one so removed series never remain on screen.
    if (this.#needsOption) {
      this.#chart.setOption(this.#option as never, true);
      this.#needsOption = false;
    }
  }

  /** Element left the DOM: release the canvas and the observer, or both leak for the session. */
  override disconnected(): void {
    this.#observer?.disconnect();
    this.#observer = undefined;
    this.#element = undefined;
    this.#option = undefined;
    this.#events = undefined;
    this.#bound = [];
    this.#needsOption = true;
    // dispose() drops the handlers with the instance; the list is cleared so a reconnect starts clean.
    this.#chart?.dispose();
    this.#chart = undefined;
  }

  /** Lit reuses the directive when the element comes back; `update` runs again and re-inits. */
  override reconnected(): void {}
});
