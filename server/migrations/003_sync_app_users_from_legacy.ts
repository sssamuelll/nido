import type { Database } from 'sqlite';

export const name = '003_sync_app_users_from_legacy';

/**
 * Mirrors every row in `users` into `app_users`, scoped to the primary
 * household. ON CONFLICT(legacy_user_id) keeps the rows in sync if the username
 * ever changes. Originally lived in db.ts as syncAppUsersFromLegacyUsers and
 * ran every boot; running it once via the migration system is enough since the
 * `users` table is now write-only via 002.
 */
export async function up(db: Database): Promise<void> {
  const household = await db.get<{ id: number }>(
    `SELECT id FROM households WHERE slug = 'primary'`
  );
  if (!household) {
    throw new Error('primary household missing — migration 002 must run first');
  }

  const legacyUsers = await db.all<{ id: number; username: string; created_at: string }[]>(
    `SELECT id, username, created_at FROM users ORDER BY id`
  );

  for (const user of legacyUsers) {
    await db.run(
      `
        INSERT INTO app_users (household_id, legacy_user_id, username, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(legacy_user_id) DO UPDATE SET
          household_id = excluded.household_id,
          username = excluded.username
      `,
      household.id,
      user.id,
      user.username,
      user.created_at
    );
  }
}

export async function down(db: Database): Promise<void> {
  // Removes only rows tied to legacy users — leaves any future app_users alone.
  await db.run(`DELETE FROM app_users WHERE legacy_user_id IS NOT NULL`);
}
