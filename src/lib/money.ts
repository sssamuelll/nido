const compactFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const exactFmt = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
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
 *   "1.234"     → true (es-ES thousands sep → numeric, BUGFIX case)
 *   "1.234,50"  → true (es-ES full → numeric)
 *
 * Note: amounts ≤ 4 digits omit thousands separator per es-ES traditional
 * convention (see formatMoneyExact). The "1.234" → 1234.50 bugfix therefore
 * goes through normalized numeric matching, not display matching. Display
 * matching activates for 5+ digit amounts (e.g. "€12.345" matches 12345.67).
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
