import { describe, expect, it } from 'vitest';
import { getPersonalBalanceCardModel, toVisibleBudgetFormData } from './privacy';

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
      avatar: '👨💻',
      balance: 370,
      monthChange: -80,
      progress: 18,
    });
  });

  it('maps budget payloads to a single visible personal budget field', () => {
    const budget = toVisibleBudgetFormData({
      month: '2026-03',
      total_budget: 3000,
      rent: 1000,
      savings: 300,
      personal_budget: 650,
      personal_samuel: 450,
      personal_maria: 700,
      categories: { Restaurant: 250 },
    }, '2026-03');

    expect(budget).toEqual({
      month: '2026-03',
      total_budget: 3000,
      rent: 1000,
      savings: 300,
      personal_budget: 650,
      categories: { Restaurant: 250 },
    });
  });
});
