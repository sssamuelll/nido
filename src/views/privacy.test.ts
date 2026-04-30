import { describe, expect, it } from 'vitest';
import {
  buildPersonalDetailModel,
  getPersonalBalanceCardModel,
  getPrivateExpensesForUser,
  toVisibleBudgetFormData,
} from './privacy';

describe('privacy view models', () => {
  it('builds a dashboard card only for the authenticated user personal data', () => {
    const card = getPersonalBalanceCardModel({
      budget: { personal: 450, availableShared: 1250 },
      spending: { totalSharedSpent: 50, remainingShared: 1200 },
      personal: { owner: 'samuel', spent: 80, budget: 450 },
    });

    expect(card).toMatchObject({
      owner: 'samuel',
      name: 'Samuel',
      avatar: 'S',
      balance: 370,
      monthChange: -80,
      progress: 18,
    });
  });

  it('maps budget payloads to a single visible personal budget field', () => {
    const budget = toVisibleBudgetFormData({
      month: '2026-03',
      shared_available: 2000,
      personal_budget: 650,
      categories: { Restaurant: 250 },
    }, '2026-03');

    expect(budget).toEqual({
      month: '2026-03',
      shared_available: 2000,
      personal_budget: 650,
      categories: { Restaurant: 250 },
    });
  });

  it('filters private expenses down to the logged-in user only', () => {
    const expenses = getPrivateExpensesForUser([
      { id: 1, description: 'Cena', amount: 25, category: 'Restaurant', date: '2026-03-10', paid_by: 'samuel', type: 'personal', created_at: '2026-03-10T10:00:00Z' },
      { id: 2, description: 'Compra casa', amount: 70, category: 'Gastos', date: '2026-03-11', paid_by: 'maria', type: 'shared', created_at: '2026-03-11T10:00:00Z' },
      { id: 3, description: 'Regalo', amount: 55, category: 'Otros', date: '2026-03-12', paid_by: 'maria', type: 'personal', created_at: '2026-03-12T10:00:00Z' },
      { id: 4, description: 'Taxi', amount: 14, category: 'Gastos', date: '2026-03-13', paid_by: 'samuel', type: 'personal', created_at: '2026-03-13T10:00:00Z' },
    ], 'samuel');

    expect(expenses.map((expense) => expense.id)).toEqual([4, 1]);
  });

  it('builds the personal detail view model without leaking the partner private data', () => {
    const detail = buildPersonalDetailModel({
      summary: {
        budget: { personal: 450, availableShared: 1250 },
        personal: { owner: 'samuel', spent: 80, budget: 450 },
      },
      budget: {
        month: '2026-03',
        total_budget: 3000,
        rent: 1000,
        savings: 300,
        personal_budget: 450,
        categories: {},
      },
      expenses: [
        { id: 1, description: 'Headphones', amount: 80, category: 'Otros', date: '2026-03-08', paid_by: 'samuel', type: 'personal', created_at: '2026-03-08T10:00:00Z' },
        { id: 2, description: 'Shared dinner', amount: 50, category: 'Restaurant', date: '2026-03-10', paid_by: 'maria', type: 'shared', created_at: '2026-03-10T12:00:00Z' },
        { id: 3, description: 'Gift', amount: 120, category: 'Ocio', date: '2026-03-12', paid_by: 'maria', type: 'personal', created_at: '2026-03-12T09:00:00Z' },
        { id: 4, description: 'Taxi', amount: 20, category: 'Gastos', date: '2026-03-14', paid_by: 'samuel', type: 'personal', created_at: '2026-03-14T09:00:00Z' },
      ],
      username: 'samuel',
    });

    expect(detail).toMatchObject({
      owner: 'samuel',
      name: 'Samuel',
      personalBudget: 450,
      personalSpent: 100,
      remaining: 350,
      progress: 22,
      topCategory: 'Otros',
    });
    expect(detail.categories).toEqual([
      expect.objectContaining({ category: 'Otros', total: 80, count: 1, budgetShare: 18, monthShare: 80 }),
      expect.objectContaining({ category: 'Gastos', total: 20, count: 1, budgetShare: 4, monthShare: 20 }),
    ]);
    expect(detail.recentExpenses.map((expense) => expense.id)).toEqual([4]);
    expect(detail.chart).toEqual([
      { label: 'Sem 1', total: 0 },
      { label: 'Sem 2', total: 100 },
      { label: 'Sem 3', total: 0 },
      { label: 'Sem 4', total: 0 },
      { label: 'Sem 5', total: 0 },
    ]);
  });
});
