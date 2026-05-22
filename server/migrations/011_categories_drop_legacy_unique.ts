import type { Database } from 'sqlite';
import { logger } from '../logger.js';

export const name = 'categories_drop_legacy_unique';

/**
 * Rebuilds the categories table to drop a legacy `UNIQUE(household_id, name)`
 * constraint that prevented the same name from existing as both shared and
 * personal contexts. Fresh DBs created by 001 already lack that constraint, so
 * this migration only fires when the old constraint is still present in
 * sqlite_master. Name kept as the legacy slug.
 */
export async function up(db: Database): Promise<void> {
  const info = await db.get<{ sql: string }>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'categories'`
  );
  if (!info?.sql.includes('UNIQUE(household_id, name)')) {
    return;
  }

  logger.info({ migration: name }, 'rebuilding categories to drop legacy unique constraint');

  // foreign_keys must be off while we rename, otherwise SQLite tries to repoint
  // referencing tables mid-flight. The runner already wraps this in a BEGIN, so
  // the manual transaction calls from the original implementation are removed.
  await db.run(`PRAGMA foreign_keys=OFF`);
  try {
    await db.exec(`
      CREATE TABLE categories_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        household_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL,
        color TEXT NOT NULL,
        budget_amount REAL NOT NULL DEFAULT 0,
        context TEXT NOT NULL DEFAULT 'shared',
        owner_user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
      );

      INSERT INTO categories_new (id, household_id, name, emoji, color, budget_amount, context, owner_user_id, created_at)
        SELECT id, household_id, name, emoji, color, budget_amount, context, owner_user_id, created_at FROM categories;

      DROP TABLE categories;
      ALTER TABLE categories_new RENAME TO categories;

      CREATE INDEX IF NOT EXISTS idx_categories_household_id ON categories(household_id);
      CREATE INDEX IF NOT EXISTS idx_categories_household_context_owner ON categories(household_id, context, owner_user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_identity
        ON categories(household_id, name, context, COALESCE(owner_user_id, -1));
    `);
    const fkCheck = await db.all<{ table: string }[]>(`PRAGMA foreign_key_check`);
    if (fkCheck.length > 0) {
      throw new Error(`categories rebuild left dangling FKs: ${JSON.stringify(fkCheck)}`);
    }
  } finally {
    await db.run(`PRAGMA foreign_keys=ON`);
  }
}

export async function down(_db: Database): Promise<void> {
  throw new Error(
    'categories_drop_legacy_unique cannot be reversed safely — re-adding ' +
      'UNIQUE(household_id, name) would fail against rows where the same name ' +
      'exists in both shared and personal contexts.'
  );
}
