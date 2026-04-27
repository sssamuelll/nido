import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { databaseUrl } from './config.js';

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
      pin TEXT DEFAULT '1234',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      paid_by TEXT NOT NULL CHECK (paid_by IN ('samuel', 'maria')),
      type TEXT NOT NULL CHECK (type IN ('shared', 'personal')),
      status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    CREATE TABLE IF NOT EXISTS passkey_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      sign_count INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      device_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS device_invitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      invited_by_user_id INTEGER NOT NULL REFERENCES app_users(id),
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      relink_user_id INTEGER REFERENCES app_users(id),
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      budget_amount REAL NOT NULL DEFAULT 0,
      context TEXT NOT NULL DEFAULT 'shared',
      owner_user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
    );
    -- Expression-based unique index: COALESCE avoids SQLite NULL != NULL in UNIQUE constraints
    CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_identity
      ON categories(household_id, name, context, COALESCE(owner_user_id, -1));

    CREATE TABLE IF NOT EXISTS household_budget (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_id INTEGER NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
      total_amount REAL NOT NULL DEFAULT 2000,
      personal_samuel REAL NOT NULL DEFAULT 500,
      personal_maria REAL NOT NULL DEFAULT 500,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS household_budget_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER NOT NULL REFERENCES app_users(id),
      approved_by_user_id INTEGER REFERENCES app_users(id),
      total_amount REAL,
      personal_samuel REAL,
      personal_maria REAL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS category_budget_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      budget_amount REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(cycle_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS household_budget_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
      total_amount REAL NOT NULL,
      personal_samuel REAL NOT NULL,
      personal_maria REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(cycle_id)
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_id TEXT NOT NULL,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '🎯',
      target REAL NOT NULL,
      current REAL DEFAULT 0,
      start_date TEXT,
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
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK (type IN ('shared', 'personal')),
      notes TEXT,
      every_n_cycles INTEGER NOT NULL DEFAULT 1,
      last_registered_cycle_id INTEGER REFERENCES billing_cycles(id),
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

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '✈️',
      budget_amount REAL NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
      context TEXT NOT NULL DEFAULT 'shared',
      owner_user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE,
      created_by INTEGER NOT NULL REFERENCES app_users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS event_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      color TEXT NOT NULL,
      UNIQUE(event_id, name)
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

  // Cycle-based architecture: cycles track start_date
  await ensureColumn(database, 'billing_cycles', 'start_date', 'TEXT');

  // Events feature: link expenses to events
  await ensureColumn(database, 'expenses', 'event_id', 'INTEGER REFERENCES events(id) ON DELETE SET NULL');

  // Seed users (auth is via passkeys; users table only stores username + PIN)
  const hashedPin = bcrypt.hashSync('1234', 10);
  await database.run('INSERT OR IGNORE INTO users (username, pin) VALUES (?, ?)', ['samuel', hashedPin]);
  await database.run('INSERT OR IGNORE INTO users (username, pin) VALUES (?, ?)', ['maria', hashedPin]);

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

  // === Migration: Unified category & budget model ===
  const unifiedModelRan = await database.get<{ name: string }>(
    `SELECT name FROM migrations WHERE name = 'unified_category_budget_model'`
  );

  if (!unifiedModelRan) {
    console.log('Running migration: unified_category_budget_model');

    // 1. Create new tables
    await database.exec(`
      CREATE TABLE IF NOT EXISTS household_budget (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        household_id INTEGER NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
        total_amount REAL NOT NULL DEFAULT 2000,
        personal_samuel REAL NOT NULL DEFAULT 500,
        personal_maria REAL NOT NULL DEFAULT 500,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS household_budget_approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        requested_by_user_id INTEGER NOT NULL REFERENCES app_users(id),
        approved_by_user_id INTEGER REFERENCES app_users(id),
        total_amount REAL,
        personal_samuel REAL,
        personal_maria REAL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS category_budget_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle_id INTEGER NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        budget_amount REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(cycle_id, category_id)
      );

      CREATE TABLE IF NOT EXISTS household_budget_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle_id INTEGER NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
        total_amount REAL NOT NULL,
        personal_samuel REAL NOT NULL,
        personal_maria REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(cycle_id)
      );
    `);

    // 2. Add budget_amount to categories
    const hasBudgetAmount = await hasColumn(database, 'categories', 'budget_amount');
    if (!hasBudgetAmount) {
      await database.exec(`ALTER TABLE categories ADD COLUMN budget_amount REAL NOT NULL DEFAULT 0`);
    }

    // Copy latest budget amounts from category_budgets to categories
    const categoryBudgetsExists = await database.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='category_budgets'`
    );
    if (categoryBudgetsExists) {
      const latestMonth = await database.get<{ month: string }>(
        `SELECT month FROM category_budgets ORDER BY month DESC LIMIT 1`
      );
      if (latestMonth) {
        const budgetRows = await database.all<{ category: string; amount: number; context: string; owner_user_id: number | null }[]>(
          `SELECT category, amount, context, owner_user_id
           FROM category_budgets
           WHERE id IN (
             SELECT MAX(id) FROM category_budgets
             WHERE month = ?
             GROUP BY category, context, COALESCE(owner_user_id, -1)
           )`,
          latestMonth.month
        );
        for (const row of budgetRows) {
          await database.run(
            `UPDATE categories SET budget_amount = ?
             WHERE name = ? AND context = ? AND COALESCE(owner_user_id, -1) = ?
             AND household_id = (SELECT id FROM households LIMIT 1)`,
            row.amount, row.category, row.context, row.owner_user_id ?? -1
          );
        }
      }
    }

    // 3. Create missing categories from expenses and recurring_expenses
    const householdRow = await database.get<{ id: number }>(`SELECT id FROM households LIMIT 1`);
    const hhId = householdRow?.id ?? 1;

    const missingShared = await database.all<{ category: string }[]>(
      `SELECT DISTINCT e.category FROM expenses e
       WHERE e.type = 'shared'
       AND NOT EXISTS (
         SELECT 1 FROM categories c
         WHERE c.name = e.category AND c.context = 'shared' AND c.household_id = ?
       )`, hhId
    );
    for (const { category } of missingShared) {
      await database.run(
        `INSERT OR IGNORE INTO categories (household_id, name, emoji, color, budget_amount, context, owner_user_id)
         VALUES (?, ?, '📦', '#6B7280', 0, 'shared', NULL)`, hhId, category
      );
    }

    const missingPersonal = await database.all<{ category: string; paid_by_user_id: number }[]>(
      `SELECT DISTINCT e.category, e.paid_by_user_id FROM expenses e
       WHERE e.type = 'personal' AND e.paid_by_user_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM categories c
         WHERE c.name = e.category AND c.context = 'personal' AND c.owner_user_id = e.paid_by_user_id
       )`
    );
    for (const { category, paid_by_user_id } of missingPersonal) {
      await database.run(
        `INSERT OR IGNORE INTO categories (household_id, name, emoji, color, budget_amount, context, owner_user_id)
         VALUES (?, ?, '📦', '#6B7280', 0, 'personal', ?)`, hhId, category, paid_by_user_id
      );
    }

    const missingRecurring = await database.all<{ category: string; type: string; created_by_user_id: number }[]>(
      `SELECT DISTINCT r.category, r.type, r.created_by_user_id FROM recurring_expenses r
       WHERE NOT EXISTS (
         SELECT 1 FROM categories c
         WHERE c.name = r.category AND c.context = r.type
         AND COALESCE(c.owner_user_id, -1) = CASE WHEN r.type = 'personal' THEN r.created_by_user_id ELSE -1 END
       )`
    );
    for (const { category, type, created_by_user_id } of missingRecurring) {
      await database.run(
        `INSERT OR IGNORE INTO categories (household_id, name, emoji, color, budget_amount, context, owner_user_id)
         VALUES (?, ?, '📦', '#6B7280', 0, ?, ?)`, hhId, category, type, type === 'personal' ? created_by_user_id : null
      );
    }

    // 4. Add category_id FK to expenses and recurring_expenses, backfill
    const expHasCatId = await hasColumn(database, 'expenses', 'category_id');
    if (!expHasCatId) {
      await database.exec(`ALTER TABLE expenses ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL`);
    }
    const recHasCatId = await hasColumn(database, 'recurring_expenses', 'category_id');
    if (!recHasCatId) {
      await database.exec(`ALTER TABLE recurring_expenses ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL`);
    }

    await database.run(
      `UPDATE expenses SET category_id = (
        SELECT c.id FROM categories c
        WHERE c.name = expenses.category AND c.context = 'shared' AND c.owner_user_id IS NULL AND c.household_id = ?
      ) WHERE type = 'shared' AND category_id IS NULL`, hhId
    );
    await database.run(
      `UPDATE expenses SET category_id = (
        SELECT c.id FROM categories c
        WHERE c.name = expenses.category AND c.context = 'personal' AND c.owner_user_id = expenses.paid_by_user_id
      ) WHERE type = 'personal' AND paid_by_user_id IS NOT NULL AND category_id IS NULL`
    );
    await database.run(
      `UPDATE recurring_expenses SET category_id = (
        SELECT c.id FROM categories c
        WHERE c.name = recurring_expenses.category AND c.context = 'shared' AND c.owner_user_id IS NULL AND c.household_id = ?
      ) WHERE type = 'shared' AND category_id IS NULL`, hhId
    );
    await database.run(
      `UPDATE recurring_expenses SET category_id = (
        SELECT c.id FROM categories c
        WHERE c.name = recurring_expenses.category AND c.context = 'personal' AND c.owner_user_id = recurring_expenses.created_by_user_id
      ) WHERE type = 'personal' AND category_id IS NULL`
    );

    // 5. Migrate budgets -> household_budget
    const budgetsTableExists = await database.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'`
    );
    if (budgetsTableExists) {
      const latestBudget = await database.get<{ shared_available: number; personal_samuel: number; personal_maria: number }>(
        `SELECT shared_available, personal_samuel, personal_maria FROM budgets ORDER BY month DESC LIMIT 1`
      );
      if (latestBudget) {
        await database.run(
          `INSERT OR IGNORE INTO household_budget (household_id, total_amount, personal_samuel, personal_maria)
           VALUES (?, ?, ?, ?)`, hhId, latestBudget.shared_available, latestBudget.personal_samuel, latestBudget.personal_maria
        );
      } else {
        await database.run(`INSERT OR IGNORE INTO household_budget (household_id) VALUES (?)`, hhId);
      }
    } else {
      await database.run(`INSERT OR IGNORE INTO household_budget (household_id) VALUES (?)`, hhId);
    }

    // 6. Validate
    const orphaned = await database.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM expenses WHERE category_id IS NULL`);
    if (orphaned && orphaned.cnt > 0) {
      console.warn(`Warning: ${orphaned.cnt} expenses have no category_id (will show as "Sin categoria")`);
    }

    // 7. Indexes
    await database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_identity ON categories(household_id, name, context, COALESCE(owner_user_id, -1))`);
    await database.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id)`);
    await database.exec(`CREATE INDEX IF NOT EXISTS idx_recurring_category_id ON recurring_expenses(category_id)`);

    // 8. Drop old tables
    await database.exec(`DROP TABLE IF EXISTS category_budgets`);
    await database.exec(`DROP TABLE IF EXISTS budget_allocations`);
    await database.exec(`DROP TABLE IF EXISTS budget_approvals`);
    await database.exec(`DROP TABLE IF EXISTS budgets`);

    await database.run(`INSERT INTO migrations (name) VALUES ('unified_category_budget_model')`);
    console.log('Migration unified_category_budget_model complete');
  }

  // === Migration: Drop unused password column from users table ===
  const dropPasswordRan = await database.get(`SELECT name FROM migrations WHERE name = 'drop_users_password'`);
  if (!dropPasswordRan) {
    try {
      await database.exec('ALTER TABLE users DROP COLUMN password');
      await database.run(`INSERT INTO migrations (name) VALUES ('drop_users_password')`);
      console.log('Migration drop_users_password complete');
    } catch (error) {
      // SQLite < 3.35.0 doesn't support DROP COLUMN — log and skip
      console.warn('Could not drop users.password column (SQLite version may not support DROP COLUMN)');
    }
  }

  // === Migration: Add start_date to goals ===
  const goalsStartDateRan = await database.get(`SELECT name FROM migrations WHERE name = 'goals_start_date'`);
  if (!goalsStartDateRan) {
    await ensureColumn(database, 'goals', 'start_date', 'TEXT');
    await database.run(`INSERT INTO migrations (name) VALUES ('goals_start_date')`);
  }

  // === Migration: Add cycle frequency to recurring expenses ===
  const recurringFreqRan = await database.get(`SELECT name FROM migrations WHERE name = 'recurring_cycle_frequency'`);
  if (!recurringFreqRan) {
    await ensureColumn(database, 'recurring_expenses', 'every_n_cycles', 'INTEGER NOT NULL DEFAULT 1');
    await ensureColumn(database, 'recurring_expenses', 'last_registered_cycle_id', 'INTEGER REFERENCES billing_cycles(id)');
    await database.run(`INSERT INTO migrations (name) VALUES ('recurring_cycle_frequency')`);
    console.log('Migration recurring_cycle_frequency complete');
  }

  await dropLegacyCategoriesUnique(database);
  await materializeLegacyRecurringExpenses(database);
  await addCycleIdToExpenses(database);
  await backfillExpenseCategoryIds(database);

  console.log('Database initialized');
};

const backfillExpenseCategoryIds = async (database: Database) => {
  const ran = await database.get(`SELECT name FROM migrations WHERE name = 'backfill_expense_category_ids'`);
  if (ran) return;

  // Re-link expenses where category_id IS NULL but a matching categories row exists.
  // Shared category: any expense in the household with type='shared' and matching name.
  const sharedResult = await database.run(
    `UPDATE expenses
     SET category_id = (
       SELECT c.id FROM categories c
       WHERE c.name = expenses.category
         AND c.context = 'shared'
         AND c.owner_user_id IS NULL
         AND c.household_id = (SELECT household_id FROM app_users WHERE id = expenses.paid_by_user_id)
     )
     WHERE category_id IS NULL
       AND type = 'shared'
       AND category IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM categories c
         WHERE c.name = expenses.category
           AND c.context = 'shared'
           AND c.owner_user_id IS NULL
           AND c.household_id = (SELECT household_id FROM app_users WHERE id = expenses.paid_by_user_id)
       )`
  );

  // Personal category: must match owner_user_id.
  const personalResult = await database.run(
    `UPDATE expenses
     SET category_id = (
       SELECT c.id FROM categories c
       WHERE c.name = expenses.category
         AND c.context = 'personal'
         AND c.owner_user_id = expenses.paid_by_user_id
     )
     WHERE category_id IS NULL
       AND type = 'personal'
       AND category IS NOT NULL
       AND paid_by_user_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM categories c
         WHERE c.name = expenses.category
           AND c.context = 'personal'
           AND c.owner_user_id = expenses.paid_by_user_id
       )`
  );

  await database.run(`INSERT INTO migrations (name) VALUES ('backfill_expense_category_ids')`);
  const sharedChanges = sharedResult.changes ?? 0;
  const personalChanges = personalResult.changes ?? 0;
  if (sharedChanges + personalChanges > 0) {
    console.log(`Migration backfill_expense_category_ids: linked ${sharedChanges} shared + ${personalChanges} personal expenses`);
  }
};

const materializeLegacyRecurringExpenses = async (database: Database) => {
  const ran = await database.get(`SELECT name FROM migrations WHERE name = 'recurring_materialize_legacy'`);
  if (ran) return;

  // For each household with an active cycle, materialize unregistered recurrings
  // (last_registered_cycle_id IS NULL, paused = 0) so existing fixed costs
  // start counting against their category in the current cycle.
  const activeCycles = await database.all<{ id: number; household_id: number }[]>(
    `SELECT id, household_id FROM billing_cycles WHERE status = 'active'`
  );

  const today = new Date().toISOString().slice(0, 10);
  let materialized = 0;

  for (const cycle of activeCycles) {
    const items = await database.all<Array<{
      id: number;
      name: string;
      amount: number;
      category: string;
      category_id: number | null;
      type: string;
      created_by_user_id: number;
      creator_username: string;
    }>>(
      `SELECT re.id, re.name, re.amount, re.category, re.category_id, re.type,
              re.created_by_user_id, au.username AS creator_username
       FROM recurring_expenses re
       LEFT JOIN app_users au ON au.id = re.created_by_user_id
       WHERE re.household_id = ? AND re.paused = 0 AND re.last_registered_cycle_id IS NULL`,
      cycle.household_id
    );

    for (const item of items) {
      await database.run(
        `INSERT INTO expenses (description, amount, category, category_id, date, paid_by, paid_by_user_id, type, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid')`,
        item.name, item.amount, item.category, item.category_id, today,
        item.creator_username || 'unknown', item.created_by_user_id, item.type
      );
      await database.run(
        `UPDATE recurring_expenses SET last_registered_cycle_id = ? WHERE id = ?`,
        cycle.id, item.id
      );
      materialized++;
    }
  }

  await database.run(`INSERT INTO migrations (name) VALUES ('recurring_materialize_legacy')`);
  if (materialized > 0) {
    console.log(`Migration recurring_materialize_legacy complete (${materialized} expenses materialized)`);
  }
};

const addCycleIdToExpenses = async (database: Database) => {
  const ran = await database.get(`SELECT name FROM migrations WHERE name = 'expenses_add_cycle_id'`);
  if (ran) return;

  await ensureColumn(database, 'expenses', 'cycle_id', 'INTEGER REFERENCES billing_cycles(id) ON DELETE SET NULL');
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_cycle_id ON expenses(cycle_id)`);
  await database.run(`INSERT INTO migrations (name) VALUES ('expenses_add_cycle_id')`);
  console.log('Migration expenses_add_cycle_id complete');
};

const dropLegacyCategoriesUnique = async (database: Database) => {
  const ran = await database.get(`SELECT name FROM migrations WHERE name = 'categories_drop_legacy_unique'`);
  if (ran) return;

  const tableInfo = await database.get<{ sql: string }>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'categories'`
  );
  if (!tableInfo?.sql.includes('UNIQUE(household_id, name)')) {
    await database.run(`INSERT INTO migrations (name) VALUES ('categories_drop_legacy_unique')`);
    return;
  }

  console.log('Running migration: categories_drop_legacy_unique');
  await database.run(`PRAGMA foreign_keys=OFF`);
  try {
    await database.run(`BEGIN TRANSACTION`);
    await database.run(`
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
      )
    `);
    await database.run(`
      INSERT INTO categories_new (id, household_id, name, emoji, color, budget_amount, context, owner_user_id, created_at)
        SELECT id, household_id, name, emoji, color, budget_amount, context, owner_user_id, created_at FROM categories
    `);
    await database.run(`DROP TABLE categories`);
    await database.run(`ALTER TABLE categories_new RENAME TO categories`);
    await database.run(`CREATE INDEX idx_categories_household_id ON categories(household_id)`);
    await database.run(`CREATE INDEX idx_categories_household_context_owner ON categories(household_id, context, owner_user_id)`);
    await database.run(`CREATE UNIQUE INDEX uq_categories_identity ON categories(household_id, name, context, COALESCE(owner_user_id, -1))`);
    const fkCheck = await database.all<{ table: string }[]>(`PRAGMA foreign_key_check`);
    if (fkCheck.length > 0) {
      throw new Error(`categories rebuild left dangling FKs: ${JSON.stringify(fkCheck)}`);
    }
    await database.run(`COMMIT`);
    await database.run(`INSERT INTO migrations (name) VALUES ('categories_drop_legacy_unique')`);
    console.log('Migration categories_drop_legacy_unique complete');
  } catch (error) {
    await database.run(`ROLLBACK`).catch(() => {});
    throw error;
  } finally {
    await database.run(`PRAGMA foreign_keys=ON`);
  }
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
