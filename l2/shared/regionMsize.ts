/// <mls fileReference="_102033_/l2/shared/regionMsize.ts" enhancement="_blank" />
// Host-side msize helpers for the runtime shell. The studio collab-page already
// cascades msize through splitter → nav3 → service; this module is the shell's
// own copy of that contract for classic regions and for keeping the service
// host height on the CURRENT attribute (serviceBase writes style.height from
// the previous this.msize because it reads the property before super).

export type MsizeRect = { width: number; height: number; top: number; left: number };

export function formatMsize(rect: MsizeRect): string {
  return [rect.width.toFixed(2), rect.height.toFixed(2), rect.top.toFixed(2), rect.left.toFixed(2)].join(',');
}

export function msizeForRect(rect: MsizeRect): string | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  return formatMsize(rect);
}

export function parseMsizeHeight(msize: string | null | undefined, fallbackStyleHeight = ''): number | null {
  let height = parseFloat((msize || '').split(',')[1] || '');
  if (!Number.isFinite(height) || height <= 0) height = parseFloat(fallbackStyleHeight || '');
  if (!Number.isFinite(height) || height <= 0) return null;
  return height;
}

export type MsizeHost = {
  setAttribute: (name: string, value: string) => void;
  layout?: () => void;
};

export function writeMsize(el: MsizeHost, msize: string): void {
  el.setAttribute('msize', msize);
  el.layout?.();
}

export function writeMsizeForRect(el: MsizeHost, rect: MsizeRect): boolean {
  const msize = msizeForRect(rect);
  if (!msize) return false;
  writeMsize(el, msize);
  return true;
}

export function createCoalescedRunner(
  run: () => void,
  schedule: (cb: () => void) => number,
  cancel: (id: number) => void,
): { trigger: () => void; cancel: () => void } {
  let id = 0;
  return {
    trigger() {
      if (id) return;
      id = schedule(() => {
        id = 0;
        run();
      });
    },
    cancel() {
      if (!id) return;
      cancel(id);
      id = 0;
    },
  };
}

export type ViewportMsizeEnv = {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  visualViewport?: {
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
  } | null;
};

export function attachViewportMsizeListeners(env: ViewportMsizeEnv, onResize: () => void): () => void {
  env.addEventListener('resize', onResize);
  env.visualViewport?.addEventListener('resize', onResize);
  return () => {
    env.removeEventListener('resize', onResize);
    env.visualViewport?.removeEventListener('resize', onResize);
  };
}
