import { describe, it, expect } from 'vitest';
import { formatMoney, formatMoneyExact, matchesMoneySearch } from './money';

describe('formatMoney (compact)', () => {
  it('formats whole numbers', () => {
    expect(formatMoney(0)).toBe('€0');
    expect(formatMoney(50)).toBe('€50');
    // thousands separator from 4-digit amounts upward
    expect(formatMoney(1234)).toBe('€1.234');
  });

  it('rounds away decimals', () => {
    expect(formatMoney(1234.5)).toBe('€1.235');
    expect(formatMoney(1234.49)).toBe('€1.234');
    expect(formatMoney(0.99)).toBe('€1');
  });

  it('uses thousands separator on 4+ digit numbers', () => {
    expect(formatMoney(12_345)).toBe('€12.345');
    expect(formatMoney(1_234_567)).toBe('€1.234.567');
  });
});

describe('formatMoneyExact', () => {
  it('always shows two decimals', () => {
    expect(formatMoneyExact(0)).toBe('€0,00');
    expect(formatMoneyExact(50)).toBe('€50,00');
    // thousands separator from 4-digit amounts upward
    expect(formatMoneyExact(1234.5)).toBe('€1.234,50');
    expect(formatMoneyExact(1234)).toBe('€1.234,00');
  });

  it('rounds to two decimals when given more', () => {
    expect(formatMoneyExact(1.005)).toBe('€1,01');
  });

  it('uses thousands separator + comma decimal', () => {
    expect(formatMoneyExact(1234567.89)).toBe('€1.234.567,89');
  });
});

describe('matchesMoneySearch', () => {
  it('matches numeric prefix (preserves current behavior)', () => {
    expect(matchesMoneySearch(1234.5, '1234')).toBe(true);
  });
  it('matches numeric exact with cents (preserves current behavior)', () => {
    expect(matchesMoneySearch(1234.5, '1234.50')).toBe(true);
  });
  it('matches one-decimal form (preserves current behavior via toFixed)', () => {
    expect(matchesMoneySearch(1234.5, '1234.5')).toBe(true);
  });
  it('matches es-ES decimal separator', () => {
    expect(matchesMoneySearch(1234.5, '1234,50')).toBe(true);
  });
  it('matches es-ES thousands separator (BUGFIX)', () => {
    expect(matchesMoneySearch(1234.5, '1.234')).toBe(true);
  });
  it('matches es-ES full display form (BUGFIX)', () => {
    expect(matchesMoneySearch(1234.5, '1.234,50')).toBe(true);
  });
  it('matches display form with euro sign for 5+ digit amounts (BUGFIX)', () => {
    expect(matchesMoneySearch(12345.67, '€12.345')).toBe(true);
  });
  it('rejects unrelated terms', () => {
    expect(matchesMoneySearch(1234.5, 'abc')).toBe(false);
    expect(matchesMoneySearch(1234.5, '5678')).toBe(false);
  });
  it('returns false for empty searchTerm', () => {
    expect(matchesMoneySearch(1234.5, '')).toBe(false);
  });
  it('rejects similar but distinct amounts (no false positives)', () => {
    expect(matchesMoneySearch(234.50, '1.234')).toBe(false);
    expect(matchesMoneySearch(1234.5, '12.345')).toBe(false);
  });
  it('matches display form with separator on 4-digit amounts', () => {
    expect(matchesMoneySearch(1234.5, '€1.234')).toBe(true);
  });
  it('matches 4-digit thousands separator query without euro sign', () => {
    expect(matchesMoneySearch(1000, '1.000')).toBe(true);
  });
});
