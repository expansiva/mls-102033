/// <mls fileReference="_102033_/l2/shared/contentPageDevice.ts" enhancement="_blank" />
// The width decides the device, never the user agent — that is what keeps the browser's own
// "request desktop site" a user choice. Desktop and mobile pages are mirrors of each other
// (same pageId, same pageNN): only the /web/<device>/ path segment and the --web--<device>--
// tag segment differ. This derives the sibling renderer, or says why it cannot.

import type { MasterFrontendDeviceKind } from '/_102033_/l2/shared/contracts/bootstrap.js';

export interface ContentPageRenderer {
  tag: string;
  entrypoint: string;
}

export interface ContentPageDeviceChange {
  ok: boolean;
  nextTag: string;
  nextEntrypoint: string;
  /** Empty when the swap is structurally possible; otherwise why the shell stays on the current variant. */
  reason: string;
}

const TAG_DEVICE_SEGMENT = /--web--(?:desktop|mobile)--/u;
const ENTRYPOINT_DEVICE_SEGMENT = /\/web\/(?:desktop|mobile)\//u;

export function describeContentPageDeviceChange(
  current: ContentPageRenderer | undefined,
  device: MasterFrontendDeviceKind,
): ContentPageDeviceChange {
  if (!current) {
    return { ok: false, nextTag: '', nextEntrypoint: '', reason: 'no active content renderer' };
  }

  // Both segments move together: a tag and an entrypoint from different devices would load one
  // chunk and look for another element.
  const nextTag = current.tag.replace(TAG_DEVICE_SEGMENT, `--web--${device}--`);
  const nextEntrypoint = current.entrypoint.replace(ENTRYPOINT_DEVICE_SEGMENT, `/web/${device}/`);

  if (!TAG_DEVICE_SEGMENT.test(current.tag)) {
    return {
      ok: false, nextTag, nextEntrypoint,
      reason: `current tag '${current.tag}' has no --web--<device>-- segment to swap to ${device}`,
    };
  }
  if (!ENTRYPOINT_DEVICE_SEGMENT.test(current.entrypoint)) {
    return {
      ok: false, nextTag, nextEntrypoint,
      reason: `current entrypoint '${current.entrypoint}' has no /web/<device>/ segment to swap to ${device}`,
    };
  }

  return { ok: true, nextTag, nextEntrypoint, reason: '' };
}
