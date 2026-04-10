import { describe, it, expect } from 'vitest';
import {
  dateSchema,
  expenseCreateSchema,
  expenseUpdateSchema,
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

});
