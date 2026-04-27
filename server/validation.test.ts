import { describe, it, expect, vi } from 'vitest';
import {
  analyticsQuerySchema,
  dateSchema,
  expenseCreateSchema,
  expenseUpdateSchema,
  eventCreateSchema,
  eventUpdateSchema,
  expenseListQuerySchema,
  expenseSummaryQuerySchema,
  expenseExportQuerySchema,
  validateQuery,
} from './validation.js';

describe('Validation Schemas', () => {
  describe('dateSchema', () => {
    it('should validate correct date format', () => {
      expect(dateSchema.safeParse('2024-12-31').success).toBe(true);
      expect(dateSchema.safeParse('2024-01-01').success).toBe(true);
    });

    it('should reject invalid date format', () => {
      expect(dateSchema.safeParse('2024-12-32').success).toBe(false);
      expect(dateSchema.safeParse('2024-13-01').success).toBe(false);
      expect(dateSchema.safeParse('2024-1-1').success).toBe(false);
      expect(dateSchema.safeParse('2024/12/31').success).toBe(false);
      expect(dateSchema.safeParse('').success).toBe(false);
    });
  });

  describe('expenseCreateSchema', () => {
    const validExpense = {
      description: 'Dinner',
      amount: 45.50,
      category: 'Restaurant',
      date: '2024-12-31',
      paid_by: 'samuel',
      type: 'shared',
      status: 'paid'
    };

    it('should validate correct expense', () => {
      expect(expenseCreateSchema.safeParse(validExpense).success).toBe(true);
    });

    it('should reject negative amount', () => {
      const invalid = { ...validExpense, amount: -10 };
      expect(expenseCreateSchema.safeParse(invalid).success).toBe(false);
    });

    it('should reject zero amount', () => {
      const invalid = { ...validExpense, amount: 0 };
      expect(expenseCreateSchema.safeParse(invalid).success).toBe(false);
    });

    it('should accept any category string', () => {
      const valid = { ...validExpense, category: 'InvalidCategory' };
      expect(expenseCreateSchema.safeParse(valid).success).toBe(true);
    });

    it('should reject invalid date format', () => {
      const invalid = { ...validExpense, date: '31/12/2024' };
      expect(expenseCreateSchema.safeParse(invalid).success).toBe(false);
    });

    it('should ignore client-side paid_by and still validate the payload shape', () => {
      const withLegacyPaidBy = { ...validExpense, paid_by: 'john' };
      expect(expenseCreateSchema.safeParse(withLegacyPaidBy).success).toBe(true);
    });

    it('should reject invalid type', () => {
      const invalid = { ...validExpense, type: 'invalid' };
      expect(expenseCreateSchema.safeParse(invalid).success).toBe(false);
    });

    it('should accept optional status with default', () => {
      const withoutStatus = { ...validExpense };
      delete withoutStatus.status;
      const result = expenseCreateSchema.safeParse(withoutStatus);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('paid');
      }
    });

    it('should coerce string amount to number', () => {
      const withStringAmount = { ...validExpense, amount: '45.50' };
      const result = expenseCreateSchema.safeParse(withStringAmount);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amount).toBe(45.50);
      }
    });
  });

  describe('expenseUpdateSchema', () => {
    it('should have same validation rules as create schema', () => {
      // Should be identical for now
      expect(expenseUpdateSchema).toBe(expenseCreateSchema);
    });
  });

  describe('eventCreateSchema', () => {
    const validEvent = {
      name: 'Vacaciones',
      emoji: '✈️',
      budget_amount: 1500,
      start_date: '2024-12-01',
      end_date: '2024-12-15',
      context: 'shared',
      subcategories: [
        { name: 'Vuelos', emoji: '✈️', color: '#60A5FA' },
      ],
    };

    it('accepts a valid event', () => {
      const result = eventCreateSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it('defaults context to shared when omitted', () => {
      const { context: _ctx, ...rest } = validEvent;
      const result = eventCreateSchema.safeParse(rest);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.context).toBe('shared');
    });

    it('rejects when required name is missing', () => {
      const { name: _n, ...rest } = validEvent;
      expect(eventCreateSchema.safeParse(rest).success).toBe(false);
    });

    it('rejects when required start_date is missing', () => {
      const { start_date: _s, ...rest } = validEvent;
      expect(eventCreateSchema.safeParse(rest).success).toBe(false);
    });

    it('rejects when required end_date is missing', () => {
      const { end_date: _e, ...rest } = validEvent;
      expect(eventCreateSchema.safeParse(rest).success).toBe(false);
    });

    it('rejects name of wrong type', () => {
      expect(eventCreateSchema.safeParse({ ...validEvent, name: 123 }).success).toBe(false);
      expect(eventCreateSchema.safeParse({ ...validEvent, name: { length: 1 } }).success).toBe(false);
      expect(eventCreateSchema.safeParse({ ...validEvent, name: ['a'] }).success).toBe(false);
    });

    it('rejects empty name string', () => {
      expect(eventCreateSchema.safeParse({ ...validEvent, name: '' }).success).toBe(false);
    });

    it('rejects name longer than max length', () => {
      const tooLong = 'x'.repeat(101);
      expect(eventCreateSchema.safeParse({ ...validEvent, name: tooLong }).success).toBe(false);
    });

    it('rejects name containing a null byte', () => {
      expect(eventCreateSchema.safeParse({ ...validEvent, name: 'Trip\u0000DROP' }).success).toBe(false);
    });

    it('rejects budget_amount = NaN', () => {
      expect(eventCreateSchema.safeParse({ ...validEvent, budget_amount: NaN }).success).toBe(false);
    });

    it('rejects budget_amount = Infinity', () => {
      expect(eventCreateSchema.safeParse({ ...validEvent, budget_amount: Infinity }).success).toBe(false);
      expect(eventCreateSchema.safeParse({ ...validEvent, budget_amount: -Infinity }).success).toBe(false);
    });

    it('accepts budget_amount = -0 as zero', () => {
      const result = eventCreateSchema.safeParse({ ...validEvent, budget_amount: -0 });
      expect(result.success).toBe(true);
      if (result.success) expect(Object.is(result.data.budget_amount, -0) || result.data.budget_amount === 0).toBe(true);
    });

    it('rejects negative budget_amount', () => {
      expect(eventCreateSchema.safeParse({ ...validEvent, budget_amount: -1 }).success).toBe(false);
    });

    it('rejects budget_amount above the cap', () => {
      expect(eventCreateSchema.safeParse({ ...validEvent, budget_amount: 1e10 }).success).toBe(false);
    });

    it('rejects malformed start_date', () => {
      expect(eventCreateSchema.safeParse({ ...validEvent, start_date: 'yesterday' }).success).toBe(false);
      expect(eventCreateSchema.safeParse({ ...validEvent, start_date: '2024-13-99' }).success).toBe(false);
      expect(eventCreateSchema.safeParse({ ...validEvent, start_date: '2024/12/01' }).success).toBe(false);
    });

    it('rejects when end_date precedes start_date (semantically impossible)', () => {
      const result = eventCreateSchema.safeParse({
        ...validEvent,
        start_date: '2024-12-15',
        end_date: '2024-12-01',
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown context value', () => {
      expect(eventCreateSchema.safeParse({ ...validEvent, context: 'household' }).success).toBe(false);
      expect(eventCreateSchema.safeParse({ ...validEvent, context: 1 }).success).toBe(false);
    });

    it('strips unknown extra fields silently (forward-compat)', () => {
      const result = eventCreateSchema.safeParse({ ...validEvent, currency: 'EUR', tags: ['x'] });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>).currency).toBeUndefined();
        expect((result.data as Record<string, unknown>).tags).toBeUndefined();
      }
    });

    it('rejects null body', () => {
      expect(eventCreateSchema.safeParse(null).success).toBe(false);
    });

    it('rejects undefined body', () => {
      expect(eventCreateSchema.safeParse(undefined).success).toBe(false);
    });

    it('rejects array body', () => {
      expect(eventCreateSchema.safeParse([]).success).toBe(false);
    });

    it('rejects empty object', () => {
      expect(eventCreateSchema.safeParse({}).success).toBe(false);
    });

    it('rejects subcategories array longer than the cap (DoS defense)', () => {
      const huge = Array(51).fill({ name: 'x', emoji: 'x', color: '#FFFFFF' });
      const result = eventCreateSchema.safeParse({ ...validEvent, subcategories: huge });
      expect(result.success).toBe(false);
    });

    it('accepts subcategories array exactly at the cap', () => {
      const atCap = Array(50).fill({ name: 'x', emoji: 'x', color: '#FFFFFF' });
      expect(eventCreateSchema.safeParse({ ...validEvent, subcategories: atCap }).success).toBe(true);
    });

    it('rejects subcategory with malformed color', () => {
      const bad = [{ name: 'x', emoji: 'x', color: 'red; background:url(http://evil)' }];
      expect(eventCreateSchema.safeParse({ ...validEvent, subcategories: bad }).success).toBe(false);
    });

    it('rejects subcategory with non-string name', () => {
      const bad = [{ name: 123 as unknown as string, emoji: 'x', color: '#FFFFFF' }];
      expect(eventCreateSchema.safeParse({ ...validEvent, subcategories: bad }).success).toBe(false);
    });

    it('rejects oversized emoji (length cap defense)', () => {
      const bad = 'x'.repeat(21);
      expect(eventCreateSchema.safeParse({ ...validEvent, emoji: bad }).success).toBe(false);
    });
  });

  describe('eventUpdateSchema', () => {
    it('accepts a fully empty payload (all fields optional)', () => {
      expect(eventUpdateSchema.safeParse({}).success).toBe(true);
    });

    it('accepts partial update with only name', () => {
      expect(eventUpdateSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
    });

    it('rejects NaN budget_amount on update', () => {
      expect(eventUpdateSchema.safeParse({ budget_amount: NaN }).success).toBe(false);
    });

    it('rejects malformed end_date on update', () => {
      expect(eventUpdateSchema.safeParse({ end_date: 'soon' }).success).toBe(false);
    });

    it('rejects when both dates given and end precedes start', () => {
      const result = eventUpdateSchema.safeParse({
        start_date: '2024-12-15',
        end_date: '2024-12-01',
      });
      expect(result.success).toBe(false);
    });

    it('accepts updating only start_date without re-checking against unknown end_date', () => {
      expect(eventUpdateSchema.safeParse({ start_date: '2024-12-15' }).success).toBe(true);
    });

    it('rejects subcategory array beyond the cap on update', () => {
      const huge = Array(51).fill({ name: 'x', emoji: 'x', color: '#FFFFFF' });
      expect(eventUpdateSchema.safeParse({ subcategories: huge }).success).toBe(false);
    });
  });

  describe('expenseListQuerySchema', () => {
    it('accepts an empty query (no filter)', () => {
      const result = expenseListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({});
      }
    });

    it('accepts a fully populated valid query and yields a strong type', () => {
      const result = expenseListQuerySchema.safeParse({
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        month: '2024-06',
        event_id: '7',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.start_date).toBe('2024-01-01');
        expect(result.data.end_date).toBe('2024-12-31');
        expect(result.data.month).toBe('2024-06');
        expect(result.data.event_id).toBe(7);
      }
    });

    it('rejects start_date as an array (?start_date=a&start_date=b)', () => {
      const result = expenseListQuerySchema.safeParse({ start_date: ['2024-01-01', '2024-12-31'] });
      expect(result.success).toBe(false);
    });

    it('rejects start_date as a nested object (?start_date[$gt]=zzz)', () => {
      const result = expenseListQuerySchema.safeParse({ start_date: { $gt: 'zzz' } });
      expect(result.success).toBe(false);
    });

    it('rejects malformed start_date string', () => {
      expect(expenseListQuerySchema.safeParse({ start_date: 'hola' }).success).toBe(false);
      expect(expenseListQuerySchema.safeParse({ start_date: '2024/01/01' }).success).toBe(false);
      expect(expenseListQuerySchema.safeParse({ start_date: '2024-13-01' }).success).toBe(false);
      expect(expenseListQuerySchema.safeParse({ start_date: '2024-02-30' }).success).toBe(false);
    });

    it('rejects malformed month (must be YYYY-MM)', () => {
      expect(expenseListQuerySchema.safeParse({ month: '2024-1' }).success).toBe(false);
      expect(expenseListQuerySchema.safeParse({ month: '2024-01-01' }).success).toBe(false);
      expect(expenseListQuerySchema.safeParse({ month: 'foo' }).success).toBe(false);
      expect(expenseListQuerySchema.safeParse({ month: '' }).success).toBe(false);
    });

    it('rejects event_id = "abc" (would silently match 0 in SQLite TEXT/INT comparison)', () => {
      expect(expenseListQuerySchema.safeParse({ event_id: 'abc' }).success).toBe(false);
    });

    it('rejects event_id = NaN, Infinity, -Infinity, -0, 0, negative, float', () => {
      expect(expenseListQuerySchema.safeParse({ event_id: NaN }).success).toBe(false);
      expect(expenseListQuerySchema.safeParse({ event_id: Infinity }).success).toBe(false);
      expect(expenseListQuerySchema.safeParse({ event_id: -Infinity }).success).toBe(false);
      expect(expenseListQuerySchema.safeParse({ event_id: -0 }).success).toBe(false);
      expect(expenseListQuerySchema.safeParse({ event_id: 0 }).success).toBe(false);
      expect(expenseListQuerySchema.safeParse({ event_id: -5 }).success).toBe(false);
      expect(expenseListQuerySchema.safeParse({ event_id: 1.5 }).success).toBe(false);
    });

    it('rejects event_id = empty string (qs collapses ?event_id= to "")', () => {
      // Number('') === 0, fails .positive() — would otherwise quietly select event_id = 0
      expect(expenseListQuerySchema.safeParse({ event_id: '' }).success).toBe(false);
    });

    it('rejects event_id as an array', () => {
      expect(expenseListQuerySchema.safeParse({ event_id: ['1', '2'] }).success).toBe(false);
    });

    it('rejects month containing a null byte', () => {
      expect(expenseListQuerySchema.safeParse({ month: '2024- ' }).success).toBe(false);
      expect(expenseListQuerySchema.safeParse({ month: ' 2024-06' }).success).toBe(false);
    });

    it('rejects month longer than the YYYY-MM regex (DoS / log-poisoning hostile string)', () => {
      const long = 'x'.repeat(10_000);
      expect(expenseListQuerySchema.safeParse({ month: long }).success).toBe(false);
    });

    it('strips unknown extra fields silently (forward-compat: ?utm_source=…)', () => {
      const result = expenseListQuerySchema.safeParse({
        start_date: '2024-01-01',
        utm_source: 'newsletter',
        fbclid: 'abc',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>).utm_source).toBeUndefined();
        expect((result.data as Record<string, unknown>).fbclid).toBeUndefined();
        expect(result.data.start_date).toBe('2024-01-01');
      }
    });

    it('rejects null, undefined, and array as the whole query', () => {
      expect(expenseListQuerySchema.safeParse(null).success).toBe(false);
      expect(expenseListQuerySchema.safeParse(undefined).success).toBe(false);
      expect(expenseListQuerySchema.safeParse([]).success).toBe(false);
    });

    it('rejects when end_date precedes start_date (semantically impossible)', () => {
      const result = expenseListQuerySchema.safeParse({
        start_date: '2024-12-15',
        end_date: '2024-12-01',
      });
      expect(result.success).toBe(false);
    });

    it('accepts only one date side without invoking the cross-field check', () => {
      expect(expenseListQuerySchema.safeParse({ start_date: '2024-12-15' }).success).toBe(true);
      expect(expenseListQuerySchema.safeParse({ end_date: '2024-12-01' }).success).toBe(true);
    });
  });

  describe('expenseSummaryQuerySchema', () => {
    it('accepts the same date+month shape as the list schema', () => {
      const result = expenseSummaryQuerySchema.safeParse({
        start_date: '2024-01-01',
        end_date: '2024-12-31',
      });
      expect(result.success).toBe(true);
    });

    it('strips event_id silently (summary route does not consume it)', () => {
      const result = expenseSummaryQuerySchema.safeParse({ event_id: '7' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>).event_id).toBeUndefined();
      }
    });

    it('still rejects invalid dates', () => {
      expect(expenseSummaryQuerySchema.safeParse({ start_date: 'nope' }).success).toBe(false);
    });
  });

  describe('expenseExportQuerySchema', () => {
    it('accepts a valid context and date range', () => {
      const result = expenseExportQuerySchema.safeParse({
        start_date: '2024-01-01',
        end_date: '2024-06-30',
        context: 'shared',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.context).toBe('shared');
    });

    it('rejects an unknown context value', () => {
      expect(expenseExportQuerySchema.safeParse({ context: 'household' }).success).toBe(false);
      expect(expenseExportQuerySchema.safeParse({ context: 1 }).success).toBe(false);
      expect(expenseExportQuerySchema.safeParse({ context: ['shared'] }).success).toBe(false);
    });

    it('accepts missing context (route falls back to a safe default)', () => {
      expect(expenseExportQuerySchema.safeParse({}).success).toBe(true);
    });
  });

  describe('analyticsQuerySchema', () => {
    it('accepts an empty query and defaults context to shared', () => {
      const result = analyticsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context).toBe('shared');
        expect(result.data.start_date).toBeUndefined();
        expect(result.data.end_date).toBeUndefined();
      }
    });

    it('accepts a fully populated valid query and yields a strong type', () => {
      const result = analyticsQuerySchema.safeParse({
        context: 'personal',
        start_date: '2025-01-01',
        end_date: '2025-03-31',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        const ctx: 'shared' | 'personal' = result.data.context;
        expect(ctx).toBe('personal');
        expect(result.data.start_date).toBe('2025-01-01');
        expect(result.data.end_date).toBe('2025-03-31');
      }
    });

    // Paso 1.c.1: ?context=personal&context=shared → qs collapses to an array.
    // The pre-parser cast `as string` was a lie and the ternary fell to the
    // default 'shared', silently returning the wrong household context.
    it('rejects context as an array (?context=a&context=b)', () => {
      const result = analyticsQuerySchema.safeParse({ context: ['shared', 'personal'] });
      expect(result.success).toBe(false);
    });

    it('rejects context as a number (typeof mismatch)', () => {
      expect(analyticsQuerySchema.safeParse({ context: 1 }).success).toBe(false);
    });

    it('rejects an unknown context enum value', () => {
      expect(analyticsQuerySchema.safeParse({ context: 'household' }).success).toBe(false);
      expect(analyticsQuerySchema.safeParse({ context: '__proto__' }).success).toBe(false);
    });

    // Paso 1.c.2: ?start_date[$gt]=zzz → qs collapses to a nested object.
    // The pre-parser cast `as string | undefined` lied and sqlite3 bindings
    // threw TypeError 30 frames later, surfaced as a contextless 500.
    it('rejects start_date as a nested object (?start_date[$gt]=zzz)', () => {
      const result = analyticsQuerySchema.safeParse({ start_date: { $gt: 'zzz' } });
      expect(result.success).toBe(false);
    });

    // Paso 1.c.3: ?start_date=foo → SQL did `WHERE date >= 'foo'` (lex compare)
    // and `new Date('foo')` produced NaN that propagated into periodDays /
    // dailyRate / vsPrevPeriod and rendered as €NaN insights.
    it('rejects malformed start_date string (foo)', () => {
      expect(analyticsQuerySchema.safeParse({ start_date: 'foo' }).success).toBe(false);
    });

    it('rejects start_date with valid YYYY-MM-DD shape but invalid calendar date', () => {
      expect(analyticsQuerySchema.safeParse({ start_date: '2025-13-01' }).success).toBe(false);
      expect(analyticsQuerySchema.safeParse({ start_date: '2025-02-31' }).success).toBe(false);
    });

    it('rejects empty start_date string (qs collapses ?start_date= to "")', () => {
      expect(analyticsQuerySchema.safeParse({ start_date: '' }).success).toBe(false);
    });

    it('rejects start_date longer than the YYYY-MM-DD regex (DoS / log-poisoning)', () => {
      const oversized = '2025-01-01' + 'x'.repeat(10000);
      expect(analyticsQuerySchema.safeParse({ start_date: oversized }).success).toBe(false);
    });

    it('rejects start_date containing a null byte', () => {
      expect(analyticsQuerySchema.safeParse({ start_date: '2025-01- 1' }).success).toBe(false);
    });

    // Paso 1.c.4: ?start_date=2025-01-31&end_date=2025-01-01 → SQL returns 0
    // rows, periodDays goes negative, dailyRate goes negative — KPIs silently
    // wrong with no telemetry.
    it('rejects when end_date precedes start_date (semantically impossible)', () => {
      const result = analyticsQuerySchema.safeParse({
        start_date: '2025-01-31',
        end_date: '2025-01-01',
      });
      expect(result.success).toBe(false);
    });

    it('accepts a single date side without invoking the cross-field check', () => {
      expect(analyticsQuerySchema.safeParse({ start_date: '2025-01-01' }).success).toBe(true);
      expect(analyticsQuerySchema.safeParse({ end_date: '2025-01-01' }).success).toBe(true);
    });

    it('rejects null, undefined, and array as the whole query', () => {
      expect(analyticsQuerySchema.safeParse(null).success).toBe(false);
      expect(analyticsQuerySchema.safeParse(undefined).success).toBe(false);
      expect(analyticsQuerySchema.safeParse([]).success).toBe(false);
    });

    // Decision (Paso 2.d): default zod strip — unknown keys silently dropped.
    // Forward-compat for client params we may add later (?range=last30 etc.)
    // without coordinating a server deploy first. Strip is laxer than strict
    // but does NOT reach the handler with unknown keys.
    it('strips unknown extra fields silently (forward-compat)', () => {
      const result = analyticsQuerySchema.safeParse({
        context: 'shared',
        utm_source: 'newsletter',
        range: 'last30',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>).utm_source).toBeUndefined();
        expect((result.data as Record<string, unknown>).range).toBeUndefined();
      }
    });

    // No numeric fields in this schema, so NaN/Infinity/-0 input attacks land
    // on dateSchema and queryContextSchema instead — they are typed `string`
    // / enum and reject all three by failing the typeof check before regex.
    it('rejects NaN / Infinity / -0 in any field (none are number-typed)', () => {
      expect(analyticsQuerySchema.safeParse({ start_date: NaN }).success).toBe(false);
      expect(analyticsQuerySchema.safeParse({ end_date: Infinity }).success).toBe(false);
      expect(analyticsQuerySchema.safeParse({ context: -0 }).success).toBe(false);
    });

    it('does not mutate the input', () => {
      const input = { context: 'personal', start_date: '2025-01-01', extra: 'x' };
      const snapshot = JSON.stringify(input);
      analyticsQuerySchema.safeParse(input);
      expect(JSON.stringify(input)).toBe(snapshot);
    });

    it('is deterministic for identical inputs', () => {
      const a = analyticsQuerySchema.safeParse({ context: 'personal', start_date: '2025-01-01' });
      const b = analyticsQuerySchema.safeParse({ context: 'personal', start_date: '2025-01-01' });
      expect(a).toEqual(b);
    });

    it('error path includes field name but no input value (no PII leak)', () => {
      const result = analyticsQuerySchema.safeParse({ start_date: 'super-secret-token-1234' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        expect(messages.some(m => m.startsWith('start_date:'))).toBe(true);
        expect(messages.some(m => m.includes('super-secret-token-1234'))).toBe(false);
      }
    });
  });

  describe('validateQuery middleware', () => {
    const buildReq = (query: unknown) =>
      ({ query, body: {} }) as unknown as Parameters<ReturnType<typeof validateQuery>>[0];
    const buildRes = () => {
      const res = {
        status: vi.fn(),
        json: vi.fn(),
      } as unknown as Parameters<ReturnType<typeof validateQuery>>[1] & {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
      };
      (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
      (res.json as ReturnType<typeof vi.fn>).mockReturnValue(res);
      return res;
    };

    it('attaches validatedQuery to the request and calls next on success', () => {
      const req = buildReq({ start_date: '2024-01-01', event_id: '7' });
      const res = buildRes();
      const next = vi.fn();

      validateQuery(expenseListQuerySchema)(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect((res.status as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
      const validatedQuery = (req as unknown as { validatedQuery: { start_date: string; event_id: number } }).validatedQuery;
      expect(validatedQuery).toEqual({ start_date: '2024-01-01', event_id: 7 });
    });

    it('responds 400 with structured details and does NOT call next on failure', () => {
      const req = buildReq({ start_date: ['2024-01-01', '2024-12-31'] });
      const res = buildRes();
      const next = vi.fn();

      validateQuery(expenseListQuerySchema)(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(400);
      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.error).toBe('Error de validación');
      expect(Array.isArray(payload.details)).toBe(true);
      expect(payload.details.some((d: string) => d.startsWith('start_date:'))).toBe(true);
    });

    it('does not mutate req.query', () => {
      const original = { start_date: '2024-01-01' };
      const req = buildReq(original);
      const res = buildRes();
      validateQuery(expenseListQuerySchema)(req, res, vi.fn());
      expect(original).toEqual({ start_date: '2024-01-01' });
    });

    it('is deterministic for identical inputs', () => {
      const a = expenseListQuerySchema.safeParse({ start_date: '2024-01-01', event_id: '7' });
      const b = expenseListQuerySchema.safeParse({ start_date: '2024-01-01', event_id: '7' });
      expect(a).toEqual(b);
    });
  });

  describe('cycle_id support', () => {
    it('expenseCreateSchema accepts a positive integer cycle_id', () => {
      const r = expenseCreateSchema.safeParse({
        description: 'x', amount: 1, category: 'a', date: '2026-04-24', type: 'shared', cycle_id: 7,
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.cycle_id).toBe(7);
    });

    it('expenseCreateSchema accepts omitted cycle_id', () => {
      const r = expenseCreateSchema.safeParse({
        description: 'x', amount: 1, category: 'a', date: '2026-04-24', type: 'shared',
      });
      expect(r.success).toBe(true);
    });

    it('expenseCreateSchema accepts null cycle_id', () => {
      const r = expenseCreateSchema.safeParse({
        description: 'x', amount: 1, category: 'a', date: '2026-04-24', type: 'shared', cycle_id: null,
      });
      expect(r.success).toBe(true);
    });

    it('expenseListQuerySchema accepts cycle_id', () => {
      const r = expenseListQuerySchema.safeParse({ cycle_id: '5' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.cycle_id).toBe(5);
    });

    it('expenseSummaryQuerySchema accepts cycle_id', () => {
      const r = expenseSummaryQuerySchema.safeParse({ cycle_id: '5' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.cycle_id).toBe(5);
    });
  });

});
