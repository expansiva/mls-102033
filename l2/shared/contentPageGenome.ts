/// <mls fileReference="_102033_/l2/shared/contentPageGenome.ts" enhancement="_blank" />
// Pure helper for `mls.sites.setPage`: derive the next tag/entrypoint and a reason when it cannot.

export interface ContentPageRenderer {
  tag: string;
  entrypoint: string;
}

export interface ContentPageGenomeChange {
  ok: boolean;
  nextTag: string;
  nextEntrypoint: string;
  /** Empty when the swap is structurally possible; otherwise why setPage will stay on the current variant. */
  reason: string;
}

export function describeContentPageGenomeChange(
  current: ContentPageRenderer | undefined,
  genome: number,
): ContentPageGenomeChange {
  if (!current) {
    return { ok: false, nextTag: '', nextEntrypoint: '', reason: 'no active content renderer' };
  }
  const genomeStr = String(genome);
  if (!/^\d\d$/u.test(genomeStr)) {
    return {
      ok: false, nextTag: current.tag, nextEntrypoint: current.entrypoint,
      reason: `genome ${genome} is not a two-digit page index`,
    };
  }
  const nextTag = current.tag.replace(/--page\d\d--/u, `--page${genomeStr}--`);
  const nextEntrypoint = current.entrypoint.replace(/\/page\d\d\//u, `/page${genomeStr}/`);
  if (!/--page\d\d--/u.test(current.tag)) {
    return {
      ok: false, nextTag, nextEntrypoint,
      reason: `current tag '${current.tag}' has no --pageNN-- segment to swap to page${genomeStr}`,
    };
  }
  if (nextTag === current.tag && nextEntrypoint === current.entrypoint) {
    return { ok: true, nextTag, nextEntrypoint, reason: '' };
  }
  return { ok: true, nextTag, nextEntrypoint, reason: '' };
}
