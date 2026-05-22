import type { Database } from 'sqlite';

export const name = 'recurring_cycle_frequency';

/**
 * Adds the cycle-frequency columns to recurring_expenses for DBs created
 * before the columns were in the CREATE statement. 001 includes both columns,
 * so this is a no-op on fresh DBs. Name kept as the legacy slug.
 */
export async function up(db: Database): Promise<void> {
  const cols = await db.all<{ name: string }[]>(`PRAGMA table_info(recurring_expenses)`);
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('every_n_cycles')) {
    await db.exec(`ALTER TABLE recurring_expenses ADD COLUMN every_n_cycles INTEGER NOT NULL DEFAULT 1`);
  }
  if (!names.has('last_registered_cycle_id')) {
    await db.exec(`ALTER TABLE recurring_expenses ADD COLUMN last_registered_cycle_id INTEGER REFERENCES billing_cycles(id)`);
  }
}

export async function down(_db: Database): Promise<void> {
  throw new Error(
    'recurring_cycle_frequency down would drop columns that downstream features depend on; ' +
      'safer to leave applied and roll forward.'
  );
}
