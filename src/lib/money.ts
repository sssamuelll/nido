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
