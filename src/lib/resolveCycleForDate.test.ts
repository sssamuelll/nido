import { describe, it, expect } from 'vitest';
import { resolveCycleForDate, type Cycle } from './resolveCycleForDate';

const cycles: Cycle[] = [
  { id: 3, status: 'active', start_date: '2026-04-27', end_date: null },
  { id: 2, status: 'closed', start_date: '2026-03-01', end_date: '2026-04-27' },
  { id: 1, status: 'closed', start_date: '2026-02-01', end_date: '2026-03-01' },
];

describe('resolveCycleForDate', () => {
  it('returns in-active when date is in the active cycle', () => {
    expect(resolveCycleForDate('2026-04-28', cycles)).toEqual({ kind: 'in-active', cycle: cycles[0] });
  });

  it('returns in-closed when date falls in a past closed cycle', () => {
    expect(resolveCycleForDate('2026-03-15', cycles)).toEqual({ kind: 'in-closed', cycle: cycles[1] });
  });

  it('returns no-cycle when date is before the first cycle', () => {
    expect(resolveCycleForDate('2026-01-15', cycles)).toEqual({ kind: 'no-cycle' });
  });

  it('handles empty cycle list', () => {
    expect(resolveCycleForDate('2026-04-15', [])).toEqual({ kind: 'no-cycle' });
  });

  it('treats end_date as exclusive', () => {
    expect(resolveCycleForDate('2026-04-27', cycles)).toEqual({ kind: 'in-active', cycle: cycles[0] });
  });
});
