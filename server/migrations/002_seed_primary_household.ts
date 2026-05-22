import bcrypt from 'bcryptjs';
import type { Database } from 'sqlite';

export const name = '002_seed_primary_household';

const PRIMARY_HOUSEHOLD_SLUG = 'primary';
const PRIMARY_HOUSEHOLD_NAME = 'Samuel & Maria';

/**
 * Inserts the singleton household ("Samuel & Maria") and the two legacy users
 * with a bcrypt-hashed default PIN. Both INSERTs use OR IGNORE — running this
 * against a DB that already has the household/users is a no-op.
 *
 * Auth has long since moved to passkeys, but the users row is still the
 * legacy_user_id target that app_users joins on (set up by migration 003).
 */
export async function up(db: Database): Promise<void> {
  await db.run(
    `INSERT OR IGNORE INTO households (slug, name) VALUES (?, ?)`,
    PRIMARY_HOUSEHOLD_SLUG,
    PRIMARY_HOUSEHOLD_NAME
  );

  const hashedPin = bcrypt.hashSync('1234', 10);
  await db.run(`INSERT OR IGNORE INTO users (username, pin) VALUES (?, ?)`, 'samuel', hashedPin);
  await db.run(`INSERT OR IGNORE INTO users (username, pin) VALUES (?, ?)`, 'maria', hashedPin);
}

export async function down(_db: Database): Promise<void> {
  throw new Error(
    '002_seed_primary_household is not rollback-safe — deleting the household ' +
      'cascades into every household-scoped row. Drop the DB file instead.'
  );
}
