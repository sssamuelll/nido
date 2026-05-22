import type { Database } from 'sqlite';

export const name = '001_initial_schema';

/**
 * Creates the full Nido schema in its current shape. Consolidates everything
 * the legacy server/db.ts created — base CREATE TABLE statements plus the
 * columns previously added via ensureColumn (sessions.user_agent,
 * expenses.paid_by_user_id, billing_cycles.start_date, expenses.event_id,
 * expenses.cycle_id) — into one migration.
 *
 * IF NOT EXISTS on every table/index is load-bearing for the legacy test in
 * server/db.test.ts:90, which seeds a pre-app_users DB (users + expenses +
 * category_budgets) and expects initDatabase to migrate it. Bootstrap detection
 * in migrate.ts shadow-registers this migration on the prod DB so the up()
 * doesn't re-run there.
 */
export async function up(db: Database): Promise<void> {
  // Tables — ordered so FK targets exist before referencers
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      pin TEXT DEFAULT '1234',
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
      user_agent TEXT,
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

    CREATE TABLE IF NOT EXISTS billing_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      requested_by_user_id INTEGER NOT NULL,
      approved_by_user_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
      started_at DATETIME,
      start_date TEXT,
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

    CREATE TABLE IF NOT EXISTS category_budget_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      budget_amount REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(cycle_id, category_id)
    );

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_by_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
      event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
      cycle_id INTEGER REFERENCES billing_cycles(id) ON DELETE SET NULL
    );
  `);

  // Ancient legacy DBs created via the very-first server/db.ts had expenses
  // and sessions without the columns that ensureColumn later added. The
  // CREATE TABLE IF NOT EXISTS above is a no-op against those rows, so add
  // the columns explicitly when the table already exists without them.
  await ensureColumn(db, 'expenses', 'paid_by_user_id', 'INTEGER REFERENCES app_users(id) ON DELETE SET NULL');
  await ensureColumn(db, 'expenses', 'event_id', 'INTEGER REFERENCES events(id) ON DELETE SET NULL');
  await ensureColumn(db, 'expenses', 'cycle_id', 'INTEGER REFERENCES billing_cycles(id) ON DELETE SET NULL');
  await ensureColumn(db, 'expenses', 'category_id', 'INTEGER REFERENCES categories(id) ON DELETE SET NULL');
  await ensureColumn(db, 'sessions', 'user_agent', 'TEXT');
  await ensureColumn(db, 'billing_cycles', 'start_date', 'TEXT');
  await ensureColumn(db, 'users', 'pin', `TEXT DEFAULT '1234'`);
  await ensureColumn(db, 'categories', 'context', `TEXT NOT NULL DEFAULT 'shared'`);
  await ensureColumn(db, 'categories', 'owner_user_id', 'INTEGER REFERENCES app_users(id) ON DELETE CASCADE');
  await ensureColumn(db, 'categories', 'budget_amount', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn(db, 'recurring_expenses', 'category_id', 'INTEGER REFERENCES categories(id) ON DELETE SET NULL');
  await ensureColumn(db, 'recurring_expenses', 'every_n_cycles', 'INTEGER NOT NULL DEFAULT 1');
  await ensureColumn(db, 'recurring_expenses', 'last_registered_cycle_id', 'INTEGER REFERENCES billing_cycles(id)');
  await ensureColumn(db, 'goals', 'start_date', 'TEXT');

  // Indices
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by);
    CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(type);
    CREATE INDEX IF NOT EXISTS idx_expenses_paid_by_user_id ON expenses(paid_by_user_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_cycle_id ON expenses(cycle_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
    CREATE INDEX IF NOT EXISTS idx_app_users_household_id ON app_users(household_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_app_user_id ON sessions(app_user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_identity
      ON categories(household_id, name, context, COALESCE(owner_user_id, -1));
    CREATE INDEX IF NOT EXISTS idx_categories_household_id ON categories(household_id);
    CREATE INDEX IF NOT EXISTS idx_categories_household_context_owner ON categories(household_id, context, owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_goals_household_id ON goals(household_id);
    CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal_id ON goal_contributions(goal_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_household_id ON notifications(household_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id);
    CREATE INDEX IF NOT EXISTS idx_billing_cycle_approvals_cycle_id ON billing_cycle_approvals(cycle_id);
    CREATE INDEX IF NOT EXISTS idx_billing_cycle_approvals_user_id ON billing_cycle_approvals(user_id);
    CREATE INDEX IF NOT EXISTS idx_recurring_category_id ON recurring_expenses(category_id);
  `);
}

/**
 * Dropping the initial schema means wiping every table. Refuse — the operator
 * should rm the DB file and re-init from empty rather than rollback through
 * this path.
 */
export async function down(_db: Database): Promise<void> {
  throw new Error(
    '001_initial_schema is not rollback-safe — it would drop every table. ' +
      'Remove the SQLite file and re-run migrations from empty instead.'
  );
}

async function ensureColumn(db: Database, table: string, column: string, definition: string): Promise<void> {
  const cols = await db.all<{ name: string }[]>(`PRAGMA table_info(${table})`);
  if (cols.some((c) => c.name === column)) return;
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
