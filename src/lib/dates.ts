/**
 * Canonical date formatting for the app.
 *
 * App is local-first: created_at timestamps assume device-local time, and
 * 'yyyy-MM-dd' strings are anchored at T12:00:00 local (see parseISODate)
 * to avoid the UTC date-shift edge case in negative-offset timezones.
 *
 * No Intl/ICU deps — month/day names render through manual ES arrays so
 * output is deterministic across Node/browser ICU versions.
 */
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export const MONTHS_ES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'] as const;
export const MONTHS_ES_FULL  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'] as const;
export const DAYS_ES         = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'] as const;

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

const INVALID = '—';

const toDate = (input: Date | string): Date | null => {
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input !== 'string' || input === '') return null;
  const isoDateOnly = input.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(input);
  const d = isoDateOnly ? parseISODate(input) : new Date(input);
  return isNaN(d.getTime()) ? null : d;
};

const sameYMD = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const isToday = (d: Date): boolean => sameYMD(d, parseISODate(todayISO()));
const isYesterday = (d: Date): boolean => sameYMD(d, parseISODate(yesterdayISO()));
const needsYear = (d: Date): boolean => d.getFullYear() !== new Date().getFullYear();

/** "Hoy" | "Ayer" | "27 Abr" | "27 Abr 2024" (auto-año si distinto al actual). */
export const formatDayLabel = (input: Date | string): string => {
  const d = toDate(input);
  if (!d) return INVALID;
  if (isToday(d)) return 'Hoy';
  if (isYesterday(d)) return 'Ayer';
  const base = `${d.getDate()} ${MONTHS_ES_SHORT[d.getMonth()]}`;
  return needsYear(d) ? `${base} ${d.getFullYear()}` : base;
};

/** "Hoy" | "Ayer" | "Mié 27" | "Mié 27 2024" (auto-año si distinto al actual). */
export const formatDayLabelWithWeekday = (input: Date | string): string => {
  const d = toDate(input);
  if (!d) return INVALID;
  if (isToday(d)) return 'Hoy';
  if (isYesterday(d)) return 'Ayer';
  const base = `${DAYS_ES[d.getDay()]} ${d.getDate()}`;
  return needsYear(d) ? `${base} ${d.getFullYear()}` : base;
};

/** "Desde 27 Abr". */
export const formatCycleLabel = (input: Date | string): string => {
  const d = toDate(input);
  if (!d) return INVALID;
  return `Desde ${d.getDate()} ${MONTHS_ES_SHORT[d.getMonth()]}`;
};

/** "Abril 2026". */
export const formatMonthYear = (input: Date | string): string => {
  const d = toDate(input);
  if (!d) return INVALID;
  return `${MONTHS_ES_FULL[d.getMonth()]} ${d.getFullYear()}`;
};

/** "27 Abril 2026" — full month + year, sin weekday. */
export const formatDateLong = (input: Date | string): string => {
  const d = toDate(input);
  if (!d) return INVALID;
  return `${d.getDate()} ${MONTHS_ES_FULL[d.getMonth()]} ${d.getFullYear()}`;
};

/** "hace 3 minutos" — relative time, locale es. */
export const formatRelative = (input: Date | string): string => {
  const d = toDate(input);
  if (!d) return INVALID;
  return formatDistanceToNow(d, { addSuffix: true, locale: es });
};

/** "27 Abr — 26 May" — cycle range with em-dash. */
export const formatCycleRange = (start: Date | string, end: Date | string): string => {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return INVALID;
  return `${s.getDate()} ${MONTHS_ES_SHORT[s.getMonth()]} — ${e.getDate()} ${MONTHS_ES_SHORT[e.getMonth()]}`;
};
