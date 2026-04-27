export interface Cycle {
  id: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  month?: string;
}

export type CycleResolution =
  | { kind: 'in-active'; cycle: Cycle }
  | { kind: 'in-closed'; cycle: Cycle }
  | { kind: 'no-cycle' };

export function resolveCycleForDate(date: string, cycles: Cycle[]): CycleResolution {
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
