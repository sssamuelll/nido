import type { Database } from 'sqlite';
import { logger } from '../logger.js';

export const name = 'drop_users_password';

/**
 * Drops the legacy `users.password` column. Auth migrated to passkeys ages
 * ago; the column was dead weight.
 *
 * SQLite < 3.35 does not support DROP COLUMN. On those builds we log the
 * error (so operators know why the column they expect dropped is still
 * present) and still mark the migration applied so subsequent boots don't
 * retry on every restart. Other ALTER failures (locks, permissions, etc.)
 * re-throw and abort the boot — silently swallowing those would hide real
 * production issues. Name kept as the legacy slug so prod DBs auto-skip
 * via name match.
 */
export async function up(db: Database): Promise<void> {
  const cols = await db.all<{ name: string }[]>(`PRAGMA table_info(users)`);
  if (!cols.some((c) => c.name === 'password')) {
    return; // nothing to drop
  }
  try {
    await db.exec(`ALTER TABLE users DROP COLUMN password`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // SQLite < 3.35.0 reports "near \"DROP\": syntax error" because the parser
    // doesn't recognize DROP COLUMN at all. Anything else (lock contention,
    // permissions, FK constraint) should bubble up — those aren't routine.
    if (!/syntax error/i.test(message)) {
      throw err;
    }
    logger.warn(
      { err, migration: name },
      'DROP COLUMN users.password unsupported (SQLite < 3.35); leaving column in place'
    );
  }
}

export async function down(_db: Database): Promise<void> {
  // Re-adding the column without its data is not a real rollback. Refuse.
  throw new Error(
    'drop_users_password is not rollback-safe — the password data is irrecoverable.'
  );
}
