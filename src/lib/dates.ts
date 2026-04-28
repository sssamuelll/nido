import { format } from 'date-fns';

const MONTH_NAMES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Today as 'yyyy-MM-dd' in local time. */
export const todayISO = (): string => format(new Date(), 'yyyy-MM-dd');

/**
 * Yesterday as 'yyyy-MM-dd' in local time.
 * Uses setDate so DST transition days (twice a year in Spain) don't shift the
 * result by an extra hour and land on the same day.
 */
export const yesterdayISO = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return format(d, 'yyyy-MM-dd');
};

/**
 * Parse a 'yyyy-MM-dd' string into a Date anchored at local midday.
 * The midday anchor avoids the UTC-vs-local edge case where the date appears
 * one day earlier in negative-offset timezones when constructing
 * `new Date('yyyy-MM-dd')` directly.
 */
export const parseISODate = (dateStr: string): Date => new Date(dateStr + 'T12:00:00');

/** Short Spanish label for a 'yyyy-MM-dd' date: "Hoy", "Ayer", or "27 Abr". */
export const formatDateLabel = (dateStr: string): string => {
  if (dateStr === todayISO()) return 'Hoy';
  if (dateStr === yesterdayISO()) return 'Ayer';
  const d = parseISODate(dateStr);
  return `${d.getDate()} ${MONTH_NAMES_ES[d.getMonth()]}`;
};
