/// <mls fileReference="_102033_/l2/shared/topBandScroll.ts" enhancement="_blank" />
// Pure decision for the mobile top band (client banner + collab-nav-1/2, 66px): hide it on a
// sustained scroll-down, bring it back on a sustained scroll-up — the Chrome address-bar
// behavior the Wagner asked for (rt37). No DOM here; `shell.ts` feeds it `scrollTop` pairs from
// a captured `scroll` listener and applies the resulting state.

export const TOP_BAND_HEIGHT_PX = 66;
export const TOP_BAND_SCROLL_THRESHOLD_PX = 24;

export type TopBandState = 'visible' | 'hidden';

export interface TopBandScrollInput {
  /** Current state before this scroll sample. */
  state: TopBandState;
  /** `scrollTop` from the previous sample of the SAME scrolling element. */
  prevScrollTop: number;
  /** `scrollTop` from this sample. */
  scrollTop: number;
  /** Signed px accumulated in the current direction since the last state change or reversal. */
  accumulated: number;
}

export interface TopBandScrollResult {
  state: TopBandState;
  accumulated: number;
}

/**
 * One scroll sample in, one decision out. Direction is accumulated (reset on reversal) so a
 * short back-and-forth scroll does not flip the state; only `TOP_BAND_SCROLL_THRESHOLD_PX` of
 * sustained movement in one direction does. Near the top of the scroll range (within the band's
 * own height) the band is always `visible`, regardless of direction.
 */
export function nextTopBandState(input: TopBandScrollInput): TopBandScrollResult {
  const { state, prevScrollTop, scrollTop, accumulated } = input;
  const delta = scrollTop - prevScrollTop;

  if (delta === 0) {
    // Horizontal-only scroll (or no movement): nothing to decide.
    return { state, accumulated };
  }

  if (scrollTop < TOP_BAND_HEIGHT_PX) {
    return { state: 'visible', accumulated: 0 };
  }

  if (delta > 0) {
    const nextAccumulated = accumulated > 0 ? accumulated + delta : delta;
    if (nextAccumulated >= TOP_BAND_SCROLL_THRESHOLD_PX) {
      return { state: 'hidden', accumulated: 0 };
    }
    return { state, accumulated: nextAccumulated };
  }

  const nextAccumulated = accumulated < 0 ? accumulated + delta : delta;
  if (nextAccumulated <= -TOP_BAND_SCROLL_THRESHOLD_PX) {
    return { state: 'visible', accumulated: 0 };
  }
  return { state, accumulated: nextAccumulated };
}
