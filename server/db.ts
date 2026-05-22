import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { databaseUrl } from './config.js';
import { logger } from './logger.js';
import { runPendingMigrations } from './migrate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: Database | undefined;

const defaultDatabasePath = path.join(__dirname, '..', 'nido.db');

const hasColumn = async (database: Database, tableName: string, columnName: string) => {
  const columns = await database.all<{ name: string }[]>(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
};

const ensureColumn = async (database: Database, tableName: string, columnName: string, definition: string) => {
  if (!(await hasColumn(database, tableName, columnName))) {
    await database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
};

/**
 * Kept as a public helper because auth.ts has a defensive retry path that
 * calls this when a session INSERT fails against a legacy DB missing
 * sessions.user_agent. Migration 001 also adds the column at boot, so this
 * runtime fallback is belt-and-suspenders.
 */
export const ensureSessionColumns = async (database: Database) => {
  await ensureColumn(database, 'sessions', 'user_agent', 'TEXT');
};

export const initDatabase = async () => {
  const dbPath = databaseUrl || defaultDatabasePath;
  const database = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });
  db = database;

  await database.exec('PRAGMA foreign_keys = ON');

  await runPendingMigrations(database, { dbPath });

  logger.info('database initialized');
  return database;
};

export const findAppUserIdByUsername = async (username: string) => {
  const database = getDatabase();
  const user = await database.get<{ id: number }>(
    `SELECT id FROM app_users WHERE username = ?`,
    username
  );
  return user?.id ?? null;
};

export async function createNotification(opts: {
  household_id: string;
  recipient_user_id: number | null;
  type: string;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}) {
  const database = getDatabase();
  await database.run(
    `INSERT INTO notifications (household_id, recipient_user_id, type, title, body, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    opts.household_id,
    opts.recipient_user_id,
    opts.type,
    opts.title,
    opts.body || null,
    opts.metadata ? JSON.stringify(opts.metadata) : null
  );
}

/** Notify the partner in the same household. Silently no-ops on failure. */
export async function notifyPartner(
  userId: number,
  username: string,
  type: string,
  title: string,
  body: string,
  metadata?: Record<string, unknown>,
) {
  try {
    const database = getDatabase();
    const user = await database.get<{ household_id: string }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      userId
    );
    if (!user) return;
    const partner = await database.get<{ id: number }>(
      'SELECT id FROM app_users WHERE household_id = ? AND id != ?',
      user.household_id,
      userId
    );
    if (!partner) return;
    const displayName = username === 'maria' ? 'María' : 'Samuel';
    await createNotification({
      household_id: user.household_id,
      recipient_user_id: partner.id,
      type,
      title,
      body: body.replace('{name}', displayName),
      metadata,
    });
  } catch (err) {
    logger.error({ err, userId, type }, 'notification create failed');
  }
}

export const closeDatabase = async () => {
  if (db) {
    await db.close();
    db = undefined;
  }
};

export const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
};

export default { getDatabase };
