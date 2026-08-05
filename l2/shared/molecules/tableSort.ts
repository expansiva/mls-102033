/// <mls fileReference="_102033_/l2/shared/molecules/tableSort.ts" enhancement="_blank" />

// Table cell sorting, shared by the GroupViewTable molecules.
//
// It exists because the same rule had already been written — and written WRONG — in three
// different places. Each table had its own way of turning cell text into something comparable,
// and all of them broke on the Brazilian format:
//
//   ml-advanced-data-table   `R$ 1.234,50` → 1.234   (only the 1st comma became a dot)
//   ml-data-table            `R$ 1.234,50` → 1.2345  (the comma was stripped)
//   ml-lazy-record-detail    `R$ 1.234,50` → 1       (parseFloat stopped at the dot)
//
// The number rule: when BOTH separators are present, the last one is the decimal and the other is
// the grouping separator — that covers `1.234,50` (pt-BR) and `1,234.50` (en-US) without having to
// know the locale.

/**
 * The value the cell wants to be sorted by.
 *
 * Sorting by TEXT is misleading in every column whose text does not sort like the data: masked
 * currency, `dd/mm/yyyy` dates, status labels. That is why a cell may declare its real value:
 *
 *     <TableCell sort-value="987">R$ 987,00</TableCell>
 *     <TableCell sort-value="2026-01-02">2 de janeiro</TableCell>
 *
 * `liveText` is for molecules with live slots, which must read from the projected nodes instead of
 * the source `textContent` — the source is empty once projected.
 */
export function cellSortKey(cell: Element | null | undefined, liveText?: string): string {
  if (!cell) return '';
  const declared = cell.getAttribute('sort-value');
  if (declared !== null) return declared.trim();
  const text = liveText && liveText.length > 0 ? liveText : cell.textContent || '';
  return text.trim();
}

/** Number out of formatted text. `null` when there is no recognizable number. */
export function parseFormattedNumber(text: string): number | null {
  let s = String(text ?? '').replace(/[^0-9.,\-]/g, '').trim();
  if (!s || s === '-' || s === '.' || s === ',') return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    const decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const grouping = decimal === '.' ? ',' : '.';
    s = s.split(grouping).join('');
    if (decimal === ',') s = s.replace(',', '.');
  } else if (hasComma) {
    s = s.replace(',', '.');
  } else if (hasDot) {
    // A lone dot is ambiguous: `1.234` may be one thousand two hundred (pt-BR) or one point two
    // (en-US). Groups of exactly 3 digits are treated as grouping, which is this project's format.
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.split('.').join('');
  }

  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

/**
 * Compares two keys: numeric when both are numbers, otherwise text with natural collation.
 * Always returns the ASCENDING order — direction is up to the caller.
 */
export function compareSortKeys(a: string, b: string): number {
  const na = parseFormattedNumber(a);
  const nb = parseFormattedNumber(b);
  if (na !== null && nb !== null) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
