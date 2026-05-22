import bcrypt from 'bcryptjs';
import type { Database } from 'sqlite';

export const name = '005_hash_plaintext_pins';

/**
 * Re-hashes any `users.pin` value that isn't already a bcrypt digest. The
 * legacy schema used a plaintext '1234' default, and ALTER TABLE ADD COLUMN
 * pin TEXT DEFAULT '1234' on an existing-rows table set the literal string
 * as the value, not the hash. This migration catches those rows.
 */
export async function up(db: Database): Promise<void> {
  const rows = await db.all<{ id: number; pin: string }[]>(
    `SELECT id, pin FROM users WHERE pin NOT LIKE '$2a$%' AND pin NOT LIKE '$2b$%'`
  );
  for (const row of rows) {
    const hashed = bcrypt.hashSync(row.pin, 10);
    await db.run(`UPDATE users SET pin = ? WHERE id = ?`, hashed, row.id);
  }
}

export async function down(_db: Database): Promise<void> {
  throw new Error(
    '005_hash_plaintext_pins is not rollback-safe — bcrypt is one-way. ' +
      'The plaintext PINs are gone.'
  );
}
