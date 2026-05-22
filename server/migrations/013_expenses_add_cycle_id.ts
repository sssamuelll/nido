import type { Database } from 'sqlite';

export const name = 'expenses_add_cycle_id';

/**
 * Adds `expenses.cycle_id` + index for DBs created before the column was in
 * the CREATE statement. 001 includes the column and index, so this is a no-op
 * on fresh DBs. Name kept as the legacy slug.
 */
export async function up(db: Database): Promise<void> {
  const cols = await db.all<{ name: string }[]>(`PRAGMA table_info(expenses)`);
  if (!cols.some((c) => c.name === 'cycle_id')) {
    await db.exec(`ALTER TABLE expenses ADD COLUMN cycle_id INTEGER REFERENCES billing_cycles(id) ON DELETE SET NULL`);
  }
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_cycle_id ON expenses(cycle_id)`);
}

export async function down(_db: Database): Promise<void> {
  throw new Error(
    'expenses_add_cycle_id down would drop a column that cycle-attribution code depends on; ' +
      'safer to leave applied.'
  );
}
