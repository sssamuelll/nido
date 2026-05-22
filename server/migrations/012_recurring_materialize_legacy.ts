import type { Database } from 'sqlite';
import { logger } from '../logger.js';

export const name = 'recurring_materialize_legacy';

/**
 * One-time data migration: for every household with an active cycle, drops an
 * expense row for each unpaused recurring whose last_registered_cycle_id is
 * NULL, so existing fixed costs start counting against their category in the
 * current cycle. After this run, the recurring's last_registered_cycle_id is
 * stamped so the next cycle activation doesn't double-charge.
 *
 * On fresh DBs there are no recurrings → no-op. Name kept as the legacy slug.
 */
export async function up(db: Database): Promise<void> {
  const activeCycles = await db.all<{ id: number; household_id: number }[]>(
    `SELECT id, household_id FROM billing_cycles WHERE status = 'active'`
  );

  const today = new Date().toISOString().slice(0, 10);
  let materialized = 0;

  for (const cycle of activeCycles) {
    const items = await db.all<
      Array<{
        id: number;
        name: string;
        amount: number;
        category: string;
        category_id: number | null;
        type: string;
        created_by_user_id: number;
        creator_username: string;
      }>
    >(
      `SELECT re.id, re.name, re.amount, re.category, re.category_id, re.type,
              re.created_by_user_id, au.username AS creator_username
       FROM recurring_expenses re
       LEFT JOIN app_users au ON au.id = re.created_by_user_id
       WHERE re.household_id = ? AND re.paused = 0 AND re.last_registered_cycle_id IS NULL`,
      cycle.household_id
    );

    for (const item of items) {
      await db.run(
        `INSERT INTO expenses (description, amount, category, category_id, date, paid_by, paid_by_user_id, type, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid')`,
        item.name,
        item.amount,
        item.category,
        item.category_id,
        today,
        item.creator_username || 'unknown',
        item.created_by_user_id,
        item.type
      );
      await db.run(
        `UPDATE recurring_expenses SET last_registered_cycle_id = ? WHERE id = ?`,
        cycle.id,
        item.id
      );
      materialized++;
    }
  }

  if (materialized > 0) {
    logger.info({ migration: name, materialized }, 'recurring materialization complete');
  }
}

export async function down(_db: Database): Promise<void> {
  throw new Error(
    'recurring_materialize_legacy created expense rows that downstream balances ' +
      'depend on — not rollback-safe.'
  );
}
