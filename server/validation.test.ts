import { describe, it, expect } from 'vitest';
import { 
  monthSchema, 
  dateSchema, 
  expenseCreateSchema, 
  expenseUpdateSchema, 
  budgetUpdateSchema 
} from './validation.js';

describe('Validation Schemas', () => {
  describe('monthSchema', () => {
    it('should validate correct month format', () => {
      expect(monthSchema.safeParse('2024-12').success).toBe(true);
      expect(monthSchema.safeParse('2024-01').success).toBe(true);
    });

    it('should reject invalid month format', () => {
      expect(monthSchema.safeParse('2024-13').success).toBe(false);
      expect(monthSchema.safeParse('2024-1').success).toBe(false);
      expect(monthSchema.safeParse('24-12').success).toBe(false);
      expect(monthSchema.safeParse('2024/12').success).toBe(false);
      expect(monthSchema.safeParse('').success).toBe(false);
    });
  });

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

  describe('budgetUpdateSchema', () => {
    const validBudget = {
      month: '2024-12',
      shared_available: 2000,
      personal_budget: 500
    };

    it('should validate correct budget', () => {
      expect(budgetUpdateSchema.safeParse(validBudget).success).toBe(true);
    });

    it('should reject negative shared_available', () => {
      const invalid = { ...validBudget, shared_available: -100 };
      expect(budgetUpdateSchema.safeParse(invalid).success).toBe(false);
    });

    it('should accept zero shared_available', () => {
      const valid = { ...validBudget, shared_available: 0 };
      expect(budgetUpdateSchema.safeParse(valid).success).toBe(true);
    });

    it('should reject negative personal values', () => {
      const invalid = { ...validBudget, personal_budget: -10 };
      expect(budgetUpdateSchema.safeParse(invalid).success).toBe(false);
    });

    it('should accept all optional fields', () => {
      const full = {
        month: '2024-12',
        shared_available: 2000,
        personal_budget: 500,
        personal_samuel: 450,
        personal_maria: 550,
        categories: { Restaurant: 200 }
      };
      expect(budgetUpdateSchema.safeParse(full).success).toBe(true);
    });

    it('should coerce string numbers', () => {
      const withStrings = {
        month: '2024-12',
        shared_available: '2000',
        personal_budget: '500'
      };
      const result = budgetUpdateSchema.safeParse(withStrings);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.shared_available).toBe(2000);
      }
    });

    it('should accept legacy personal_samuel/personal_maria payload', () => {
      const legacyBudget = {
        month: '2024-12',
        personal_samuel: 500,
        personal_maria: 500,
      };

      expect(budgetUpdateSchema.safeParse(legacyBudget).success).toBe(true);
    });
  });
});
