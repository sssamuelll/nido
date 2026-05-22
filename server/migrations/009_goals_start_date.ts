import type { Database } from 'sqlite';

export const name = 'goals_start_date';

/**
 * Adds `goals.start_date` for goals created before that column existed.
 * 001 already includes start_date in its CREATE TABLE, so this is a no-op
 * on fresh DBs. Name kept as the legacy slug.
 */
export async function up(db: Database): Promise<void> {
  const cols = await db.all<{ name: string }[]>(`PRAGMA table_info(goals)`);
  if (cols.some((c) => c.name === 'start_date')) return;
  await db.exec(`ALTER TABLE goals ADD COLUMN start_date TEXT`);
}

export async function down(db: Database): Promise<void> {
  const cols = await db.all<{ name: string }[]>(`PRAGMA table_info(goals)`);
  if (!cols.some((c) => c.name === 'start_date')) return;
  try {
    await db.exec(`ALTER TABLE goals DROP COLUMN start_date`);
  } catch (err) {
    throw new Error(`goals_start_date down failed (SQLite < 3.35 lacks DROP COLUMN): ${(err as Error).message}`);
  }
}
