/// <mls fileReference="_102033_/l2/shared/chartRuntimeLocal.ts" enhancement="_blank" />

import { noChange, type ElementPart } from 'lit';
import { AsyncDirective } from 'lit/async-directive.js';
import { directive, PartType, type PartInfo } from 'lit/directive.js';

export type EChartsCoreOption = Record<string, unknown>;

export interface ECharts {
  setOption(option: EChartsCoreOption, notMerge?: boolean): void;
  on(name: string, handler: (params: never) => void): void;
  off(name: string): void;
  resize(): void;
  dispose(): void;
}

const ECHARTS_RUNTIME_URL = '/_libs/echarts.min.js';

interface EChartsRuntime {
  init(element: HTMLElement, theme?: string | object, options?: object): ECharts;
}

/** Browser-safe local ECharts loader. This module intentionally has no bare ECharts import. */
export function loadECharts(): Promise<EChartsRuntime> {
  const runtimeWindow = window as unknown as {
    echarts?: EChartsRuntime;
    collabEChartsLocalRuntime?: Promise<EChartsRuntime>;
  };
  if (runtimeWindow.echarts) return Promise.resolve(runtimeWindow.echarts);
  if (runtimeWindow.collabEChartsLocalRuntime) return runtimeWindow.collabEChartsLocalRuntime;
  runtimeWindow.collabEChartsLocalRuntime = new Promise<EChartsRuntime>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = ECHARTS_RUNTIME_URL;
    script.async = true;
    script.dataset.collabEcharts = 'local';
    script.onload = () => runtimeWindow.echarts
      ? resolve(runtimeWindow.echarts)
      : reject(new Error('Local ECharts runtime loaded without exposing window.echarts.'));
    script.onerror = () => reject(new Error(`Unable to load local ECharts runtime at ${ECHARTS_RUNTIME_URL}.`));
    document.head.appendChild(script);
  });
  return runtimeWindow.collabEChartsLocalRuntime;
}

export type ChartEvents = Record<string, (params: never) => void>;

export const chart = directive(class extends AsyncDirective {
  #chart?: ECharts;
  #observer?: ResizeObserver;
  #element?: HTMLElement;
  #option?: EChartsCoreOption;
  #events?: ChartEvents;
  #needsOption = true;
  #bound: string[] = [];

  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) {
      throw new Error('chart() must be used as an element directive: <div ${chart(option)}></div>');
    }
  }

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
      this.#observer = new ResizeObserver(() => this.#chart?.resize());
      this.#observer.observe(element);
    }
    for (const name of this.#bound) this.#chart.off(name);
    this.#bound = Object.keys(this.#events ?? {});
    for (const name of this.#bound) this.#chart.on(name, this.#events![name] as never);
    if (this.#needsOption) {
      this.#chart.setOption(this.#option, true);
      this.#needsOption = false;
    }
  }

  override disconnected(): void {
    this.#observer?.disconnect();
    this.#observer = undefined;
    this.#element = undefined;
    this.#option = undefined;
    this.#events = undefined;
    this.#bound = [];
    this.#needsOption = true;
    this.#chart?.dispose();
    this.#chart = undefined;
  }

  override reconnected(): void {}
});
