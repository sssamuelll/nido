import { describe, it, expect } from 'vitest';
import {
  dateSchema,
  expenseCreateSchema,
  expenseUpdateSchema,
  eventCreateSchema,
  eventUpdateSchema,
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

});
