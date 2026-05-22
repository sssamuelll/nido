import type { Database } from 'sqlite';

export const name = '004_backfill_expense_paid_by_user_id';

/**
 * Backfills expenses.paid_by_user_id from the string `paid_by` column when
 * NULL — matches each row to the app_user whose username equals paid_by.
 * Originally lived in db.ts as backfillExpenseUserIds and ran every boot.
 */
export async function up(db: Database): Promise<void> {
  await db.run(`
    UPDATE expenses
    SET paid_by_user_id = (
      SELECT app_users.id
      FROM app_users
      WHERE app_users.username = expenses.paid_by
    )
    WHERE paid_by_user_id IS NULL
  `);
}

export async function down(_db: Database): Promise<void> {
  // Setting the column back to NULL would lose the link, but the data is
  // reconstructable from `paid_by`, so the down is a destructive no-op marker.
  throw new Error(
    '004_backfill_expense_paid_by_user_id is not rollback-safe — re-NULLing the ' +
      'column would not restore prior state in a useful way. If you must roll ' +
      'back, run "UPDATE expenses SET paid_by_user_id = NULL" manually.'
  );
}
