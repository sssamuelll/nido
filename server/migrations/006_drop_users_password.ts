import type { Database } from 'sqlite';

export const name = 'drop_users_password';

/**
 * Drops the legacy `users.password` column. Auth migrated to passkeys ages
 * ago; the column was dead weight. SQLite < 3.35 does not support DROP COLUMN
 * — on those builds we swallow the error and still mark the migration applied
 * so subsequent boots don't retry. This matches the behavior of the original
 * inline migration in db.ts.
 *
 * Name kept as the legacy slug ("drop_users_password") so that prod DBs which
 * already recorded the original migration auto-skip via name match.
 */
export async function up(db: Database): Promise<void> {
  const cols = await db.all<{ name: string }[]>(`PRAGMA table_info(users)`);
  if (!cols.some((c) => c.name === 'password')) {
    return; // nothing to drop
  }
  try {
    await db.exec(`ALTER TABLE users DROP COLUMN password`);
  } catch {
    // SQLite < 3.35.0 lacks DROP COLUMN. We leave the column alone but still
    // record the migration so we don't retry on every boot.
  }
}

export async function down(_db: Database): Promise<void> {
  // Re-adding the column without its data is not a real rollback. Refuse.
  throw new Error(
    'drop_users_password is not rollback-safe — the password data is irrecoverable.'
  );
}
