// useGrouping: boolean form for ES2020 lib compat ('always' alias per ECMA-402).
const compactFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: true });
const exactFmt = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

/**
 * Compact money label like "€1.234". Used for KPI cards, headlines, breakdown
 * totals, event budgets, goal progress — anywhere céntimos add visual noise.
 *
 * Assumes amount >= 0. The call site is responsible for any sign formatting
 * (e.g. `-${formatMoney(Math.abs(x))}` or a separate "+/-" indicator).
 */
export const formatMoney = (amount: number): string => `€${compactFmt.format(amount)}`;

/**
 * Exact money label like "€1.234,50". Used for individual transaction rows
 * and the Samuel↔María balance — anywhere céntimos must not be lost.
 *
 * Assumes amount >= 0. The call site is responsible for any sign formatting
 * (e.g. `-${formatMoneyExact(Math.abs(x))}` or a separate "+/-" indicator).
 */
export const formatMoneyExact = (amount: number): string => `€${exactFmt.format(amount)}`;

/**
 * Search-friendly amount matching for expense search/filter UIs.
 *
 * Matches both:
 *   - the numeric form `amount.toFixed(2)` (e.g. "1234.50")
 *   - the display form `formatMoneyExact(amount)` (e.g. "€1.234,56" for 5+ digits)
 *
 * The searchTerm is also matched after es-ES normalization (strip "." thousands
 * separators, replace "," decimal separator with ".") so users typing the
 * displayed format find their expenses.
 *
 * Examples (amount = 1234.50):
 *   "1234"      → true (numeric prefix, raw)
 *   "1234.50"   → true (numeric exact, raw)
 *   "1234,50"   → true (es-ES decimal sep → numeric)
 *   "1.234"     → true (es-ES thousands sep → display + normalized)
 *   "1.234,50"  → true (es-ES full → numeric)
 *   "€1.234"    → true (display form with euro sign)
 *
 * Note: formatMoneyExact applies thousands separators from 4-digit amounts
 * upward (e.g. "€1.234,50" for 1234.50), so display matching covers the
 * full range. Normalized numeric matching remains the path for queries
 * without the euro sign or expressed in raw numeric form.
 *
 * Returns false on empty searchTerm so direct callers don't accidentally match
 * everything; callers that want "no filter = match all" should gate themselves.
 */
export const matchesMoneySearch = (amount: number, searchTerm: string): boolean => {
  if (!searchTerm) return false;
  const exact = amount.toFixed(2);
  const display = formatMoneyExact(amount);
  const normalized = searchTerm.replace(/\./g, '').replace(/,/g, '.');
  return (
    exact.includes(searchTerm) ||
    exact.includes(normalized) ||
    display.includes(searchTerm)
  );
};
