import { describe, it, expect } from 'vitest';
import { todayISO, yesterdayISO, parseISODate, formatDateLabel } from './dates';

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

  it('formatDateLabel returns "Hoy" for today', () => {
    expect(formatDateLabel(todayISO())).toBe('Hoy');
  });

  it('formatDateLabel returns "Ayer" for yesterday', () => {
    expect(formatDateLabel(yesterdayISO())).toBe('Ayer');
  });

  it('formatDateLabel returns "<day> <month>" for other dates', () => {
    // Far future to avoid colliding with today/yesterday.
    expect(formatDateLabel('2099-04-27')).toBe('27 Abr');
    expect(formatDateLabel('2099-01-05')).toBe('5 Ene');
    expect(formatDateLabel('2099-12-31')).toBe('31 Dic');
  });
});
