import type { CycleSummary } from '../api-types/cycles';

export type CycleResolution =
  | { kind: 'in-active'; cycle: CycleSummary }
  | { kind: 'in-closed'; cycle: CycleSummary }
  | { kind: 'no-cycle' };

export function resolveCycleForDate(date: string, cycles: CycleSummary[]): CycleResolution {
  for (const c of cycles) {
    if (!c.start_date) continue;
    const startsBefore = date >= c.start_date;
    const endsAfter = c.end_date == null || date < c.end_date;
    if (startsBefore && endsAfter) {
      return { kind: c.status === 'active' ? 'in-active' : 'in-closed', cycle: c };
    }
  }
  return { kind: 'no-cycle' };
}
