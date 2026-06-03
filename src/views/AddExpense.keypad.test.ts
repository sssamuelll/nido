import { describe, it, expect } from 'vitest';
import { mapPhysicalKey, pressKey, calcValue, CALC_ZERO } from './AddExpense';

/* Type a physical-key sequence into a fresh calculator the way the desktop
   keydown listener does (map each KeyboardEvent.key, then pressKey), and read
   back the resolved numeric amount. Keys that don't map are ignored — exactly
   what the listener does when mapPhysicalKey returns null. */
function type(seq: string[]): number {
  let s = CALC_ZERO;
  for (const key of seq) {
    const mapped = mapPhysicalKey(key);
    if (mapped !== null) s = pressKey(s, mapped);
  }
  return calcValue(s);
}

describe('mapPhysicalKey', () => {
  it('maps main-row and numpad digits to themselves', () => {
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(mapPhysicalKey(d)).toBe(d);
    }
  });

  it('maps both decimal separators to the comma key', () => {
    expect(mapPhysicalKey(',')).toBe(','); // es-ES numpad / main row
    expect(mapPhysicalKey('.')).toBe(','); // US numpad decimal
  });

  it('maps the four operators to their keypad glyphs', () => {
    expect(mapPhysicalKey('+')).toBe('+');
    expect(mapPhysicalKey('-')).toBe('−'); // ASCII hyphen -> minus glyph
    expect(mapPhysicalKey('*')).toBe('×');
    expect(mapPhysicalKey('/')).toBe('÷');
  });

  it('maps Backspace to the delete key', () => {
    expect(mapPhysicalKey('Backspace')).toBe('⌫');
  });

  it('returns null for keys it does not drive', () => {
    for (const k of ['Enter', 'Escape', 'Shift', 'a', ' ', 'Tab', 'ArrowLeft', '=']) {
      expect(mapPhysicalKey(k)).toBeNull();
    }
  });
});

describe('typing the amount with the physical keyboard', () => {
  it('types a whole number', () => {
    expect(type(['1', '0', '0'])).toBe(100);
  });

  it('types a decimal with the comma separator', () => {
    expect(type(['1', '2', ',', '5', '0'])).toBe(12.5);
  });

  it('accepts the US numpad period as the decimal separator', () => {
    expect(type(['4', '.', '9', '9'])).toBe(4.99);
  });

  it('computes a pending operation live (no equals key)', () => {
    expect(type(['1', '0', '+', '5'])).toBe(15);
  });

  it('deletes the last digit on Backspace', () => {
    expect(type(['1', '2', '3', 'Backspace'])).toBe(12);
  });

  it('ignores unmapped keys mixed into the sequence', () => {
    expect(type(['4', 'a', '2', 'Enter'])).toBe(42);
  });
});
