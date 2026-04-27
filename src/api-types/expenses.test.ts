import { describe, expect, it } from 'vitest';
import { ExpenseParseError, parseExpenseList, type Expense } from './expenses';

// F4 — Api.getExpenses() response. Until this PR the client typed the
// response as Promise<any[]>. PersonalDashboard.tsx:246 then did
// `expense.amount.toFixed(2)`; if the server ever returned amount as
// string/null/missing (a NaN that F1 used to allow into the DB, a future
// schema drift, a buggy migration), the call threw an uncaught TypeError
// during render. parseExpenseList moves the failure to a typed
// ExpenseParseError thrown at the fetch boundary, where the existing
// try/catch in the views already shows "Error al cargar".

const validExpense = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  description: 'Cena',
  amount: 45.5,
  category: 'Restaurante',
  category_id: 3,
  date: '2026-04-01',
  type: 'shared',
  status: 'paid',
  paid_by: 'samuel',
  paid_by_user_id: 7,
  created_at: '2026-04-01 19:00:00',
  ...overrides,
});

const expectParseError = (input: unknown, pathFragment: string | number) => {
  try {
    parseExpenseList(input);
    throw new Error('expected parseExpenseList to throw');
  } catch (err) {
    expect(err).toBeInstanceOf(ExpenseParseError);
    const e = err as ExpenseParseError;
    expect(e.path).toContain(pathFragment);
  }
};

describe('parseExpenseList — happy path', () => {
  it('accepts a well-formed expense array and yields a strong type', () => {
    const result = parseExpenseList([validExpense()]);
    const first: Expense = result[0];
    expect(first.id).toBe(1);
    expect(first.amount).toBe(45.5);
    expect(first.type).toBe('shared');
  });

  it('accepts an empty array', () => {
    expect(parseExpenseList([])).toEqual([]);
  });

  it('accepts amount = 0', () => {
    const result = parseExpenseList([validExpense({ amount: 0 })]);
    expect(result[0].amount).toBe(0);
  });

  it('accepts negative amount (refund / reversal)', () => {
    const result = parseExpenseList([validExpense({ amount: -10 })]);
    expect(result[0].amount).toBe(-10);
  });

  it('accepts personal type and status pending', () => {
    const result = parseExpenseList([
      validExpense({ id: 2, type: 'personal', status: 'pending' }),
    ]);
    expect(result[0].type).toBe('personal');
    expect(result[0].status).toBe('pending');
  });

  it('accepts null for nullable fields (category_id, paid_by_user_id, event_id)', () => {
    const result = parseExpenseList([
      validExpense({ category_id: null, paid_by_user_id: null, event_id: null }),
    ]);
    expect(result[0].category_id).toBeNull();
    expect(result[0].paid_by_user_id).toBeNull();
  });

  it('rejects paid_by = null (DB column is NOT NULL with CHECK)', () => {
    expectParseError([validExpense({ paid_by: null })], 'paid_by');
  });
});

describe('parseExpenseList — required fields', () => {
  it('rejects when id is missing', () => {
    const { id: _omit, ...rest } = validExpense();
    void _omit;
    expectParseError([rest], 'id');
  });

  it('rejects when amount is missing', () => {
    const { amount: _omit, ...rest } = validExpense();
    void _omit;
    expectParseError([rest], 'amount');
  });

  it('rejects when category is missing', () => {
    const { category: _omit, ...rest } = validExpense();
    void _omit;
    expectParseError([rest], 'category');
  });

  it('rejects when type is missing', () => {
    const { type: _omit, ...rest } = validExpense();
    void _omit;
    expectParseError([rest], 'type');
  });

  it('rejects when date is missing', () => {
    const { date: _omit, ...rest } = validExpense();
    void _omit;
    expectParseError([rest], 'date');
  });
});

describe('parseExpenseList — required field type confusion (the original bug)', () => {
  it('rejects amount as a string ("45.50") — the .toFixed(2) crash trigger', () => {
    expectParseError([validExpense({ amount: '45.50' })], 'amount');
  });

  it('rejects amount as null', () => {
    expectParseError([validExpense({ amount: null })], 'amount');
  });

  it('rejects amount as boolean', () => {
    expectParseError([validExpense({ amount: true })], 'amount');
  });

  it('rejects id as a string', () => {
    expectParseError([validExpense({ id: '7' })], 'id');
  });

  it('rejects description as a number', () => {
    expectParseError([validExpense({ description: 42 })], 'description');
  });
});

describe('parseExpenseList — numeric edge cases on amount', () => {
  it('rejects amount = NaN (the persisted-corruption shadow of F1)', () => {
    expectParseError([validExpense({ amount: Number.NaN })], 'amount');
  });

  it('rejects amount = Infinity', () => {
    expectParseError([validExpense({ amount: Number.POSITIVE_INFINITY })], 'amount');
  });

  it('rejects amount = -Infinity', () => {
    expectParseError([validExpense({ amount: Number.NEGATIVE_INFINITY })], 'amount');
  });

  it('accepts amount = -0 (numerically equal to 0; .toFixed works)', () => {
    const result = parseExpenseList([validExpense({ amount: -0 })]);
    expect(result[0].amount === 0 || Object.is(result[0].amount, -0)).toBe(true);
  });
});

describe('parseExpenseList — string edge cases on description', () => {
  it('accepts an empty description (legacy rows allow it)', () => {
    const result = parseExpenseList([validExpense({ description: '' })]);
    expect(result[0].description).toBe('');
  });

  it('rejects description above max length', () => {
    expectParseError([validExpense({ description: 'x'.repeat(501) })], 'description');
  });

  it('passes a description with a null byte through (passthrough on string content; row already exists in DB)', () => {
    const result = parseExpenseList([validExpense({ description: 'a b' })]);
    expect(result[0].description).toContain('a');
  });
});

describe('parseExpenseList — type / status enums', () => {
  it('rejects unknown type value', () => {
    expectParseError([validExpense({ type: 'business' })], 'type');
  });

  it('rejects unknown status value', () => {
    expectParseError([validExpense({ status: 'unknown' })], 'status');
  });

  it('accepts both documented types and statuses', () => {
    const result = parseExpenseList([
      validExpense({ id: 1, type: 'shared', status: 'paid' }),
      validExpense({ id: 2, type: 'personal', status: 'pending' }),
    ]);
    expect(result.map(e => e.type)).toEqual(['shared', 'personal']);
  });
});

describe('parseExpenseList — date format', () => {
  it('rejects a garbage date string', () => {
    expectParseError([validExpense({ date: 'not-a-date' })], 'date');
  });

  it('rejects an ISO date in DD-MM-YYYY', () => {
    expectParseError([validExpense({ date: '01-04-2026' })], 'date');
  });

  it('rejects date as a number (epoch)', () => {
    expectParseError([validExpense({ date: 1717200000 })], 'date');
  });
});

describe('parseExpenseList — forward-compat (passthrough decision)', () => {
  it('passes extra fields through without rejection', () => {
    const result = parseExpenseList([
      validExpense({ tags: ['food'], future_field: { nested: true } }),
    ]);
    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>).tags).toEqual(['food']);
  });
});

describe('parseExpenseList — null / undefined / shape mismatches at the root', () => {
  it('rejects null input', () => {
    expect(() => parseExpenseList(null)).toThrow(ExpenseParseError);
  });

  it('rejects undefined input', () => {
    expect(() => parseExpenseList(undefined)).toThrow(ExpenseParseError);
  });

  it('rejects non-array input (object)', () => {
    expect(() => parseExpenseList({ id: 1 })).toThrow(ExpenseParseError);
  });

  it('rejects a null element inside the array', () => {
    expectParseError([null], 0);
  });

  it('rejects an empty object element inside the array', () => {
    expectParseError([{}], 0);
  });
});

describe('parseExpenseList — array-level defenses', () => {
  it('rejects an array that exceeds the max length cap (DoS defense)', () => {
    const huge = Array.from({ length: 5001 }, (_, i) => validExpense({ id: i + 1 }));
    expect(() => parseExpenseList(huge)).toThrow(ExpenseParseError);
  });
});

describe('parseExpenseList — error surface', () => {
  it('attaches a path, a receivedKind, and no raw payload to the thrown error', () => {
    try {
      parseExpenseList([validExpense({ id: 'nope', secret_token: 'pii-like' })]);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ExpenseParseError);
      const e = err as ExpenseParseError;
      expect(e.path[0]).toBe(0);
      expect(e.path).toContain('id');
      expect(e.receivedKind).toBe('array(len=1)');
      expect(e.message).not.toContain('pii-like');
      expect(e.message).not.toContain('secret_token');
    }
  });
});

describe('parseExpenseList — purity', () => {
  it('does not mutate the input array', () => {
    const input = [validExpense({ extra: 'x' })];
    const snapshot = JSON.stringify(input);
    parseExpenseList(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('is deterministic for identical input', () => {
    const input = [validExpense(), validExpense({ id: 2, type: 'personal' })];
    const a = parseExpenseList(input);
    const b = parseExpenseList(input);
    expect(a).toEqual(b);
  });
});
