import type { Database } from 'sqlite';
import { logger } from '../logger.js';

export const name = 'backfill_expense_category_ids';

/**
 * One-time backfill: re-links expenses with category_id IS NULL to the matching
 * categories row. AddExpense historically saved the expense before the category
 * existed (creating an orphan), and POST /api/categories now heals the gap on
 * insert — but this catches anything that pre-dates that fix.
 *
 * On fresh DBs there are no expenses → no-op. Name kept as the legacy slug.
 */
export async function up(db: Database): Promise<void> {
  const sharedResult = await db.run(
    `UPDATE expenses
     SET category_id = (
       SELECT c.id FROM categories c
       WHERE c.name = expenses.category
         AND c.context = 'shared'
         AND c.owner_user_id IS NULL
         AND c.household_id = (SELECT household_id FROM app_users WHERE id = expenses.paid_by_user_id)
     )
     WHERE category_id IS NULL
       AND type = 'shared'
       AND category IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM categories c
         WHERE c.name = expenses.category
           AND c.context = 'shared'
           AND c.owner_user_id IS NULL
           AND c.household_id = (SELECT household_id FROM app_users WHERE id = expenses.paid_by_user_id)
       )`
  );

  const personalResult = await db.run(
    `UPDATE expenses
     SET category_id = (
       SELECT c.id FROM categories c
       WHERE c.name = expenses.category
         AND c.context = 'personal'
         AND c.owner_user_id = expenses.paid_by_user_id
     )
     WHERE category_id IS NULL
       AND type = 'personal'
       AND category IS NOT NULL
       AND paid_by_user_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM categories c
         WHERE c.name = expenses.category
           AND c.context = 'personal'
           AND c.owner_user_id = expenses.paid_by_user_id
       )`
  );

  const sharedChanges = sharedResult.changes ?? 0;
  const personalChanges = personalResult.changes ?? 0;
  if (sharedChanges + personalChanges > 0) {
    logger.info(
      { migration: name, sharedChanges, personalChanges },
      'orphan expenses linked to categories'
    );
  }
}

export async function down(_db: Database): Promise<void> {
  throw new Error(
    'backfill_expense_category_ids cannot be cleanly reversed — NULLing category_id ' +
      'would lose information.'
  );
}
