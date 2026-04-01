import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { databaseUrl, isProduction } from './config.js';

const format = (d: Date, fmt: string) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: Database | undefined;

const defaultDatabasePath = path.join(__dirname, '..', 'nido.db');
const primaryHouseholdSlug = 'primary';
const primaryHouseholdName = 'Samuel & Maria';

const hasColumn = async (database: Database, tableName: string, columnName: string) => {
  const columns = await database.all<{ name: string }[]>(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
};

const ensureColumn = async (database: Database, tableName: string, columnName: string, definition: string) => {
  if (!(await hasColumn(database, tableName, columnName))) {
    await database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
};

export const ensureSessionColumns = async (database: Database) => {
  await ensureColumn(database, 'sessions', 'user_agent', 'TEXT');
};

const ensurePrimaryHousehold = async (database: Database) => {
  await database.run(
    `INSERT OR IGNORE INTO households (slug, name) VALUES (?, ?)`,
    primaryHouseholdSlug,
    primaryHouseholdName
  );

  const household = await database.get<{ id: number }>(
    `SELECT id FROM households WHERE slug = ?`,
    primaryHouseholdSlug
  );

  if (!household) {
    throw new Error('Failed to initialize primary household');
  }

  return household.id;
};

const syncAppUsersFromLegacyUsers = async (database: Database, householdId: number) => {
  const legacyUsers = await database.all<{ id: number; username: string; created_at: string }[]>(
    `SELECT id, username, created_at FROM users ORDER BY id`
  );

  for (const legacyUser of legacyUsers) {
    await database.run(
      `
        INSERT INTO app_users (household_id, legacy_user_id, username, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(legacy_user_id) DO UPDATE SET
          household_id = excluded.household_id,
          username = excluded.username
      `,
      householdId,
      legacyUser.id,
      legacyUser.username,
      legacyUser.created_at
    );
  }
};

const backfillExpenseUserIds = async (database: Database) => {
  await database.run(`
    UPDATE expenses
    SET paid_by_user_id = (
      SELECT app_users.id
      FROM app_users
      WHERE app_users.username = expenses.paid_by
    )
    WHERE paid_by_user_id IS NULL
  `);
};

const syncBudgetAllocations = async (database: Database) => {
  const appUsers = await database.all<{ id: number; username: string }[]>(
    `SELECT id, username FROM app_users WHERE username IN ('samuel', 'maria')`
  );
  const userIds = new Map(appUsers.map((user) => [user.username, user.id]));
  const budgets = await database.all<{
    id: number;
    personal_samuel: number;
    personal_maria: number;
  }[]>(`SELECT id, personal_samuel, personal_maria FROM budgets`);

  for (const budget of budgets) {
    const allocationEntries = [
      { username: 'samuel', amount: budget.personal_samuel },
      { username: 'maria', amount: budget.personal_maria },
    ];

    for (const entry of allocationEntries) {
      const appUserId = userIds.get(entry.username);
      if (!appUserId) {
        continue;
      }

      await database.run(
        `
          INSERT INTO budget_allocations (budget_id, app_user_id, allocation_type, amount)
          VALUES (?, ?, 'personal', ?)
          ON CONFLICT(budget_id, app_user_id, allocation_type) DO UPDATE SET
            amount = excluded.amount
        `,
        budget.id,
        appUserId,
        entry.amount
      );
    }
  }
};

// Initialize database
export const initDatabase = async () => {
  const database = await open({
    filename: databaseUrl || defaultDatabasePath,
    driver: sqlite3.Database
  });
  db = database;

  // Enable foreign keys
  await database.exec('PRAGMA foreign_keys = ON');

  // Create tables
  await database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      pin TEXT DEFAULT '1234',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT UNIQUE NOT NULL,
      total_budget REAL NOT NULL,
      rent REAL NOT NULL,
      savings REAL NOT NULL,
      personal_samuel REAL NOT NULL,
      personal_maria REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      paid_by TEXT NOT NULL CHECK (paid_by IN ('samuel', 'maria')),
      type TEXT NOT NULL CHECK (type IN ('shared', 'personal')),
      status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS category_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      context TEXT NOT NULL DEFAULT 'shared',
      UNIQUE(month, category, context)
    );

    CREATE TABLE IF NOT EXISTS households (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_id INTEGER NOT NULL,
      legacy_user_id INTEGER UNIQUE,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
      FOREIGN KEY (legacy_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      app_user_id INTEGER NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS budget_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id INTEGER NOT NULL,
      app_user_id INTEGER NOT NULL,
      allocation_type TEXT NOT NULL DEFAULT 'personal' CHECK (allocation_type IN ('personal')),
      amount REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(budget_id, app_user_id, allocation_type),
      FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
      FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by);
    CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(type);
    CREATE INDEX IF NOT EXISTS idx_app_users_household_id ON app_users(household_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_app_user_id ON sessions(app_user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      color TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT 'shared',
      owner_user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
      UNIQUE(household_id, name, context, owner_user_id)
    );

    CREATE TABLE IF NOT EXISTS budget_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id INTEGER NOT NULL,
      requested_by_user_id INTEGER NOT NULL,
      shared_available REAL NOT NULL,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      approved_by_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
      FOREIGN KEY (requested_by_user_id) REFERENCES app_users(id) ON DELETE CASCADE,
      FOREIGN KEY (approved_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
    );

    -- New budgets table structure (simplified)
    CREATE TABLE IF NOT EXISTS budgets_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT UNIQUE NOT NULL,
      shared_available REAL NOT NULL DEFAULT 0,
      personal_samuel REAL NOT NULL DEFAULT 0,
      personal_maria REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_id TEXT NOT NULL,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '🎯',
      target REAL NOT NULL,
      current REAL DEFAULT 0,
      deadline TEXT,
      owner_type TEXT NOT NULL DEFAULT 'shared',
      owner_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (household_id) REFERENCES households(id),
      FOREIGN KEY (owner_user_id) REFERENCES app_users(id)
    );

    CREATE TABLE IF NOT EXISTS goal_contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL,
      app_user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (goal_id) REFERENCES goals(id),
      FOREIGN KEY (app_user_id) REFERENCES app_users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_id TEXT NOT NULL,
      recipient_user_id INTEGER,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      metadata TEXT,
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (household_id) REFERENCES households(id),
      FOREIGN KEY (recipient_user_id) REFERENCES app_users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_categories_household_id ON categories(household_id);
    CREATE INDEX IF NOT EXISTS idx_budget_approvals_budget_id ON budget_approvals(budget_id);
    CREATE INDEX IF NOT EXISTS idx_budget_approvals_status ON budget_approvals(status);
    CREATE INDEX IF NOT EXISTS idx_goals_household_id ON goals(household_id);
    CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal_id ON goal_contributions(goal_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_household_id ON notifications(household_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id);

    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '📂',
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('shared', 'personal')),
      notes TEXT,
      paused INTEGER NOT NULL DEFAULT 0,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by_user_id) REFERENCES app_users(id)
    );

    CREATE TABLE IF NOT EXISTS billing_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      requested_by_user_id INTEGER NOT NULL,
      approved_by_user_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
      started_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
      UNIQUE(household_id, month)
    );

    CREATE TABLE IF NOT EXISTS billing_cycle_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved')),
      approved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(cycle_id, user_id),
      FOREIGN KEY (cycle_id) REFERENCES billing_cycles(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
    );
  `);

  // Migrations: Ensure 'pin' column exists
  await ensureColumn(database, 'users', 'pin', `TEXT DEFAULT '1234'`);
  await ensureColumn(database, 'expenses', 'paid_by_user_id', 'INTEGER REFERENCES app_users(id) ON DELETE SET NULL');
  await ensureColumn(database, 'categories', 'context', `TEXT NOT NULL DEFAULT 'shared'`);
  await ensureColumn(database, 'categories', 'owner_user_id', 'INTEGER REFERENCES app_users(id) ON DELETE CASCADE');
  await ensureSessionColumns(database);
  await database.exec('CREATE INDEX IF NOT EXISTS idx_expenses_paid_by_user_id ON expenses(paid_by_user_id)');
  await database.exec('CREATE INDEX IF NOT EXISTS idx_categories_household_context_owner ON categories(household_id, context, owner_user_id)');
  await database.exec('CREATE INDEX IF NOT EXISTS idx_billing_cycle_approvals_cycle_id ON billing_cycle_approvals(cycle_id)');
  await database.exec('CREATE INDEX IF NOT EXISTS idx_billing_cycle_approvals_user_id ON billing_cycle_approvals(user_id)');

  // Seed users (password column kept for schema compatibility; auth is via magic link)
  const hashedPin = bcrypt.hashSync('1234', 10);
  const placeholder = bcrypt.hashSync(randomBytes(16).toString('hex'), 10);
  await database.run('INSERT OR IGNORE INTO users (username, password, pin) VALUES (?, ?, ?)', ['samuel', placeholder, hashedPin]);
  await database.run('INSERT OR IGNORE INTO users (username, password, pin) VALUES (?, ?, ?)', ['maria', placeholder, hashedPin]);

  // Migration: Hash any plaintext PINs still in the database
  const usersWithPlaintextPin = await database.all<{ id: number; pin: string }[]>(
    `SELECT id, pin FROM users WHERE pin NOT LIKE '$2a$%' AND pin NOT LIKE '$2b$%'`
  );
  for (const user of usersWithPlaintextPin) {
    const hashed = bcrypt.hashSync(user.pin, 10);
    await database.run('UPDATE users SET pin = ? WHERE id = ?', [hashed, user.id]);
  }
  if (usersWithPlaintextPin.length > 0) {
    console.log(`Migrated ${usersWithPlaintextPin.length} plaintext PIN(s) to bcrypt`);
  }

  // Migration: Transfer data from budgets to budgets_new
  const budgetTableExists = await database.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'`
  );
  if (budgetTableExists && !(await hasColumn(database, 'budgets', 'shared_available'))) {
    await database.exec(`
      INSERT OR IGNORE INTO budgets_new (month, shared_available, personal_samuel, personal_maria, created_at)
      SELECT month, (rent + savings), personal_samuel, personal_maria, created_at FROM budgets
    `);
    await database.exec('DROP TABLE budgets');
    await database.exec('ALTER TABLE budgets_new RENAME TO budgets');
  }

  // Migration: category_budgets needs context + owner_user_id for per-user personal budgets
  if (!(await hasColumn(database, 'category_budgets', 'context')) || !(await hasColumn(database, 'category_budgets', 'owner_user_id'))) {
    await database.exec(`
      CREATE TABLE category_budgets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        month TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        context TEXT NOT NULL DEFAULT 'shared',
        owner_user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE,
        UNIQUE(month, category, context, owner_user_id)
      );
      INSERT INTO category_budgets_new (month, category, amount, context, owner_user_id)
        SELECT month, category, amount, COALESCE(context, 'shared'), NULL FROM category_budgets;
      DROP TABLE category_budgets;
      ALTER TABLE category_budgets_new RENAME TO category_budgets;
    `);
  }

  // Ensure primary household exists (no default categories seeded — users create their own)
  const householdId = await ensurePrimaryHousehold(database);

  // Migration: remove seeded default categories (run once, guarded by flag)
  await database.exec(`CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  const alreadyRan = await database.get<{ name: string }>(`SELECT name FROM migrations WHERE name = 'remove_seeded_categories'`);
  if (!alreadyRan) {
    const seededNames = ['Restaurant', 'Gastos', 'Servicios', 'Ocio', 'Inversión', 'Otros'];
    await database.run(
      `DELETE FROM categories WHERE household_id = ? AND name IN (${seededNames.map(() => '?').join(',')})`,
      [householdId, ...seededNames]
    );
    await database.run(`INSERT INTO migrations (name) VALUES ('remove_seeded_categories')`);
  }
  await syncAppUsersFromLegacyUsers(database, householdId);
  await backfillExpenseUserIds(database);
  await syncBudgetAllocations(database);

  console.log('Database initialized');
};

export const findAppUserIdByUsername = async (username: string) => {
  const database = getDatabase();
  const user = await database.get<{ id: number }>(
    `SELECT id FROM app_users WHERE username = ?`,
    username
  );
  return user?.id ?? null;
};

export const syncBudgetAllocationsForMonth = async (month: string) => {
  const database = getDatabase();
  const budget = await database.get<{ id: number }>(`SELECT id FROM budgets WHERE month = ?`, month);
  if (!budget) {
    return;
  }

  await syncBudgetAllocations(database);
};

export async function createNotification(opts: {
  household_id: string;
  recipient_user_id: number | null;
  type: string;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getDatabase();
  await db.run(
    `INSERT INTO notifications (household_id, recipient_user_id, type, title, body, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    opts.household_id, opts.recipient_user_id, opts.type, opts.title,
    opts.body || null, opts.metadata ? JSON.stringify(opts.metadata) : null
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
    const db = getDatabase();
    const user = await db.get<{ household_id: string }>('SELECT household_id FROM app_users WHERE id = ?', userId);
    if (!user) return;
    const partner = await db.get<{ id: number }>('SELECT id FROM app_users WHERE household_id = ? AND id != ?', user.household_id, userId);
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
    console.error('Notification error:', err);
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
