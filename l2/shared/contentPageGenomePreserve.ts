/// <mls fileReference="_102033_/l2/shared/contentPageGenomePreserve.ts" enhancement="_blank" />
// Navigation may keep the current pageNN genome on the next route. There is
// nothing to keep when either tag has no --pageNN-- — do not invent page11.

export function contentPageGenomeToPreserve(
  currentGenome: number | undefined,
  nextGenome: number | undefined,
): number | undefined {
  if (currentGenome === undefined || nextGenome === undefined) {
    return undefined;
  }
  return currentGenome;
}
