import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  todayISO, yesterdayISO, parseISODate,
  formatDayLabel, formatDayLabelWithWeekday, formatCycleLabel,
  formatMonthYear, formatDateLong, formatRelative, formatCycleRange,
  MONTHS_ES_SHORT, MONTHS_ES_FULL, DAYS_ES,
} from './dates';

const currentYear = (): number => new Date().getFullYear();
const ymd = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

describe('dates helpers', () => {
  it('todayISO returns yyyy-MM-dd of local today', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayISO()).toBe(expected);
  });

  it('yesterdayISO is exactly one calendar day before today', () => {
    const today = parseISODate(todayISO());
    const yesterday = parseISODate(yesterdayISO());
    const diffDays = Math.round((today.getTime() - yesterday.getTime()) / 86400000);
    expect(diffDays).toBe(1);
  });

  it('parseISODate keeps the day stable across timezones (midday anchor)', () => {
    const d = parseISODate('2026-04-27');
    expect(d.getDate()).toBe(27);
    expect(d.getMonth()).toBe(3); // April
    expect(d.getFullYear()).toBe(2026);
  });

});

describe('canonical formatters — arrays', () => {
  it('MONTHS_ES_SHORT has 12 abbreviated entries', () => {
    expect(MONTHS_ES_SHORT).toHaveLength(12);
    expect(MONTHS_ES_SHORT[0]).toBe('Ene');
    expect(MONTHS_ES_SHORT[3]).toBe('Abr');
    expect(MONTHS_ES_SHORT[11]).toBe('Dic');
  });

  it('MONTHS_ES_FULL has 12 full entries', () => {
    expect(MONTHS_ES_FULL).toHaveLength(12);
    expect(MONTHS_ES_FULL[0]).toBe('Enero');
    expect(MONTHS_ES_FULL[3]).toBe('Abril');
    expect(MONTHS_ES_FULL[11]).toBe('Diciembre');
  });

  it('DAYS_ES has 7 Title-case entries with RAE tildes', () => {
    expect(DAYS_ES).toHaveLength(7);
    expect(DAYS_ES[0]).toBe('Dom');
    expect(DAYS_ES[3]).toBe('Mié');
    expect(DAYS_ES[6]).toBe('Sáb');
  });

  it('Mar (mes Marzo) y Mar (día Martes) comparten short form by design', () => {
    expect(MONTHS_ES_SHORT[2]).toBe('Mar');
    expect(MONTHS_ES_FULL[2]).toBe('Marzo');
    expect(DAYS_ES[2]).toBe('Mar');
  });
});

describe('formatDayLabel', () => {
  // Clock pinned so ymd(currentYear(), …) inputs never coincide with system
  // today/yesterday and trigger the 'Hoy'/'Ayer' shortcut path.
  beforeEach(() => { vi.setSystemTime(new Date('2026-07-15T12:00:00')); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns "Hoy" for today', () => {
    expect(formatDayLabel(todayISO())).toBe('Hoy');
  });

  it('returns "Ayer" for yesterday', () => {
    expect(formatDayLabel(yesterdayISO())).toBe('Ayer');
  });

  it('returns "<day> <short-month>" for current-year dates (no auto-año)', () => {
    expect(formatDayLabel(ymd(currentYear(), 1, 5))).toBe('5 Ene');
    expect(formatDayLabel(ymd(currentYear(), 12, 31))).toBe('31 Dic');
  });

  it('auto-includes year for past dates outside current year', () => {
    expect(formatDayLabel('2020-04-27')).toBe('27 Abr 2020');
    expect(formatDayLabel('2020-01-05')).toBe('5 Ene 2020');
  });

  it('treats future dates without special handling (auto-año aplica)', () => {
    expect(formatDayLabel('2099-04-27')).toBe('27 Abr 2099');
  });

  it('accepts Date instances', () => {
    const d = parseISODate(ymd(currentYear(), 6, 15));
    expect(formatDayLabel(d)).toBe('15 Jun');
  });

  it('returns "—" for invalid inputs', () => {
    expect(formatDayLabel('')).toBe('—');
    expect(formatDayLabel('not-a-date')).toBe('—');
    expect(formatDayLabel(new Date('Invalid'))).toBe('—');
  });
});

describe('formatDayLabelWithWeekday', () => {
  it('returns "Hoy" / "Ayer" with fallback', () => {
    expect(formatDayLabelWithWeekday(todayISO())).toBe('Hoy');
    expect(formatDayLabelWithWeekday(yesterdayISO())).toBe('Ayer');
  });

  it('uses Title-case weekday with RAE tilde "Mié" (2099-04-29 = miércoles)', () => {
    expect(formatDayLabelWithWeekday('2099-04-29')).toBe('Mié 29 2099');
  });

  it('uses Title-case weekday with RAE tilde "Sáb" (2099-05-02 = sábado)', () => {
    expect(formatDayLabelWithWeekday('2099-05-02')).toBe('Sáb 2 2099');
  });

  it('auto-includes year for past dates outside current year', () => {
    // 2020-04-15 was Wednesday (Mié)
    expect(formatDayLabelWithWeekday('2020-04-15')).toBe('Mié 15 2020');
  });

  it('returns "—" for invalid inputs', () => {
    expect(formatDayLabelWithWeekday('')).toBe('—');
    expect(formatDayLabelWithWeekday('not-a-date')).toBe('—');
  });
});

describe('formatCycleLabel', () => {
  it('returns "Desde <day> <short-month>"', () => {
    expect(formatCycleLabel('2026-04-27')).toBe('Desde 27 Abr');
    expect(formatCycleLabel('2026-01-01')).toBe('Desde 1 Ene');
  });

  it('accepts Date instances', () => {
    expect(formatCycleLabel(parseISODate('2026-12-15'))).toBe('Desde 15 Dic');
  });

  it('returns "—" for invalid inputs', () => {
    expect(formatCycleLabel('')).toBe('—');
    expect(formatCycleLabel('garbage')).toBe('—');
  });
});

describe('formatMonthYear', () => {
  it('returns "<full-month> <year>"', () => {
    expect(formatMonthYear('2026-04-15')).toBe('Abril 2026');
    expect(formatMonthYear('2024-12-01')).toBe('Diciembre 2024');
  });

  it('returns "—" for invalid', () => {
    expect(formatMonthYear('')).toBe('—');
  });
});

describe('formatDateLong', () => {
  it('returns "<day> <full-month> <year>"', () => {
    expect(formatDateLong('2026-04-27')).toBe('27 Abril 2026');
    expect(formatDateLong('2024-01-05')).toBe('5 Enero 2024');
  });

  it('returns "—" for empty string (Settings:684 fallback pattern)', () => {
    expect(formatDateLong('')).toBe('—');
  });

  it('returns "—" for invalid Date', () => {
    expect(formatDateLong(new Date('Invalid'))).toBe('—');
  });
});

describe('formatRelative', () => {
  it('returns "hace <n> <unit>" with es locale for past dates', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelative(fiveMinAgo)).toMatch(/^hace .+/);
  });

  it('accepts ISO timestamp strings (created_at format)', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(formatRelative(oneHourAgo)).toMatch(/^hace .+/);
  });

  it('returns "—" for invalid', () => {
    expect(formatRelative('')).toBe('—');
    expect(formatRelative('not-a-date')).toBe('—');
  });
});

describe('formatCycleRange', () => {
  it('returns "<start> — <end>" with em-dash', () => {
    expect(formatCycleRange('2026-04-27', '2026-05-26')).toBe('27 Abr — 26 May');
    expect(formatCycleRange('2026-01-01', '2026-12-31')).toBe('1 Ene — 31 Dic');
  });

  it('returns "—" if either bound invalid', () => {
    expect(formatCycleRange('', '2026-05-26')).toBe('—');
    expect(formatCycleRange('2026-04-27', '')).toBe('—');
    expect(formatCycleRange('garbage', 'also-garbage')).toBe('—');
  });
});
