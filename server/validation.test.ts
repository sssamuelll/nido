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

    it('should reject invalid category', () => {
      const invalid = { ...validExpense, category: 'InvalidCategory' };
      expect(expenseCreateSchema.safeParse(invalid).success).toBe(false);
    });

    it('should reject invalid date format', () => {
      const invalid = { ...validExpense, date: '31/12/2024' };
      expect(expenseCreateSchema.safeParse(invalid).success).toBe(false);
    });

    it('should reject invalid paid_by', () => {
      const invalid = { ...validExpense, paid_by: 'john' };
      expect(expenseCreateSchema.safeParse(invalid).success).toBe(false);
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
      total_budget: 2800,
      rent: 335,
      savings: 300,
      personal_budget: 500
    };

    it('should validate correct budget', () => {
      expect(budgetUpdateSchema.safeParse(validBudget).success).toBe(true);
    });

    it('should reject negative total_budget', () => {
      const invalid = { ...validBudget, total_budget: -100 };
      expect(budgetUpdateSchema.safeParse(invalid).success).toBe(false);
    });

    it('should reject zero total_budget', () => {
      const invalid = { ...validBudget, total_budget: 0 };
      expect(budgetUpdateSchema.safeParse(invalid).success).toBe(false);
    });

    it('should reject negative component values', () => {
      const invalid = { ...validBudget, rent: -10 };
      expect(budgetUpdateSchema.safeParse(invalid).success).toBe(false);
    });

    it('should accept zero component values', () => {
      const valid = { ...validBudget, savings: 0 };
      expect(budgetUpdateSchema.safeParse(valid).success).toBe(true);
    });

    it('should reject sum exceeding total_budget', () => {
      const invalid = { 
        ...validBudget, 
        rent: 1000,
        savings: 1000,
        personal_budget: 900 
      }; // Sum = 2900 > 2800
      expect(budgetUpdateSchema.safeParse(invalid).success).toBe(false);
    });

    it('should accept sum equal to total_budget', () => {
      const valid = { 
        ...validBudget, 
        rent: 800,
        savings: 800,
        personal_budget: 1200 
      }; // Sum = 2800
      expect(budgetUpdateSchema.safeParse(valid).success).toBe(true);
    });

    it('should coerce string numbers', () => {
      const withStrings = {
        month: '2024-12',
        total_budget: '2800',
        rent: '335',
        savings: '300',
        personal_budget: '500'
      };
      const result = budgetUpdateSchema.safeParse(withStrings);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.total_budget).toBe(2800);
      }
    });

    it('should accept the legacy full personal budget payload', () => {
      const legacyBudget = {
        month: '2024-12',
        total_budget: 2800,
        rent: 335,
        savings: 300,
        personal_samuel: 500,
        personal_maria: 500,
      };

      expect(budgetUpdateSchema.safeParse(legacyBudget).success).toBe(true);
    });
  });
});
