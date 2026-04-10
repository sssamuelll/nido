/**
 * Single source of truth for mapping app_users to legacy DB column names.
 *
 * The household_budget table has columns `personal_samuel` and `personal_maria`,
 * and the expenses table stores `paid_by IN ('samuel','maria')` — both for legacy
 * reasons. This module abstracts that mapping so no other code needs to know the
 * actual column names.
 */

/**
 * Maps an app_user to their personal budget column key in household_budget.
 */
export const getPersonalBudgetKey = (user: { username?: string; email?: string | null }): 'samuel' | 'maria' => {
  const identity = `${user?.username ?? ''} ${user?.email ?? ''}`.toLowerCase();
  return identity.includes('maria') || identity.includes('mara') ? 'maria' : 'samuel';
};

export const getPersonalBudget = (
  budget: { personal_samuel: number; personal_maria: number },
  user: { username?: string; email?: string | null }
): number => {
  return getPersonalBudgetKey(user) === 'maria' ? budget.personal_maria : budget.personal_samuel;
};

export const getPersonalBudgetField = (user: { username?: string; email?: string | null }): string => {
  return getPersonalBudgetKey(user) === 'maria' ? 'personal_maria' : 'personal_samuel';
};

/**
 * For the legacy `paid_by` TEXT column in expenses.
 * DEPRECATED: prefer paid_by_user_id for all new reads.
 * This helper exists only because the CHECK constraint still requires a value.
 */
export const getLegacyPaidBy = (user: { username?: string; email?: string | null } | undefined): string => {
  return getPersonalBudgetKey((user ?? {}) as { username?: string; email?: string | null });
};
