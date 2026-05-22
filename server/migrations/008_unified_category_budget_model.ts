import type { Database } from 'sqlite';
import { logger } from '../logger.js';

export const name = 'unified_category_budget_model';

/**
 * Ports the historical "unified category & budget model" migration into the
 * versioned system. Kept under its original name so DBs that already recorded
 * it skip automatically.
 *
 * On a fresh DB created by 001+002, the table-creation and column-addition
 * steps below are guarded redundant: 001 already created household_budget,
 * the snapshots tables, categories.budget_amount, expenses.category_id, and
 * recurring_expenses.category_id. The IF NOT EXISTS / hasColumn guards make
 * those steps no-ops in that case. The remaining work — creating categories
 * from extant expenses/recurrings, backfilling category_id links, dropping
 * legacy budget tables if they exist — runs as needed.
 */
export async function up(db: Database): Promise<void> {
  // 1. Tables 008 originally introduced. 001 also creates them — IF NOT EXISTS
  // makes this a no-op on fresh DBs.
  await db.exec(`
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

  // 2. Ensure category budget_amount column.
  if (!(await hasColumn(db, 'categories', 'budget_amount'))) {
    await db.exec(`ALTER TABLE categories ADD COLUMN budget_amount REAL NOT NULL DEFAULT 0`);
  }

  // 3. Copy latest budget amounts from the legacy category_budgets table, if it exists.
  const legacyCategoryBudgets = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='category_budgets'`
  );
  if (legacyCategoryBudgets) {
    const latest = await db.get<{ month: string }>(
      `SELECT month FROM category_budgets ORDER BY month DESC LIMIT 1`
    );
    if (latest) {
      const rows = await db.all<
        { category: string; amount: number; context: string; owner_user_id: number | null }[]
      >(
        `SELECT category, amount, context, owner_user_id
         FROM category_budgets
         WHERE id IN (
           SELECT MAX(id) FROM category_budgets
           WHERE month = ?
           GROUP BY category, context, COALESCE(owner_user_id, -1)
         )`,
        latest.month
      );
      for (const r of rows) {
        await db.run(
          `UPDATE categories SET budget_amount = ?
           WHERE name = ? AND context = ? AND COALESCE(owner_user_id, -1) = ?
             AND household_id = (SELECT id FROM households LIMIT 1)`,
          r.amount,
          r.category,
          r.context,
          r.owner_user_id ?? -1
        );
      }
    }
  }

  // 4. Create category rows for any expense / recurring that references a name
  // that has no matching category yet.
  const household = await db.get<{ id: number }>(`SELECT id FROM households LIMIT 1`);
  const hhId = household?.id ?? 1;

  const missingShared = await db.all<{ category: string }[]>(
    `SELECT DISTINCT e.category FROM expenses e
     WHERE e.type = 'shared'
       AND NOT EXISTS (
         SELECT 1 FROM categories c
         WHERE c.name = e.category AND c.context = 'shared' AND c.household_id = ?
       )`,
    hhId
  );
  for (const { category } of missingShared) {
    await db.run(
      `INSERT OR IGNORE INTO categories (household_id, name, emoji, color, budget_amount, context, owner_user_id)
       VALUES (?, ?, '📦', '#6B7280', 0, 'shared', NULL)`,
      hhId,
      category
    );
  }

  const missingPersonal = await db.all<{ category: string; paid_by_user_id: number }[]>(
    `SELECT DISTINCT e.category, e.paid_by_user_id FROM expenses e
     WHERE e.type = 'personal' AND e.paid_by_user_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM categories c
         WHERE c.name = e.category AND c.context = 'personal' AND c.owner_user_id = e.paid_by_user_id
       )`
  );
  for (const { category, paid_by_user_id } of missingPersonal) {
    await db.run(
      `INSERT OR IGNORE INTO categories (household_id, name, emoji, color, budget_amount, context, owner_user_id)
       VALUES (?, ?, '📦', '#6B7280', 0, 'personal', ?)`,
      hhId,
      category,
      paid_by_user_id
    );
  }

  const missingRecurring = await db.all<{ category: string; type: string; created_by_user_id: number }[]>(
    `SELECT DISTINCT r.category, r.type, r.created_by_user_id FROM recurring_expenses r
     WHERE NOT EXISTS (
       SELECT 1 FROM categories c
       WHERE c.name = r.category AND c.context = r.type
         AND COALESCE(c.owner_user_id, -1) = CASE WHEN r.type = 'personal' THEN r.created_by_user_id ELSE -1 END
     )`
  );
  for (const { category, type, created_by_user_id } of missingRecurring) {
    await db.run(
      `INSERT OR IGNORE INTO categories (household_id, name, emoji, color, budget_amount, context, owner_user_id)
       VALUES (?, ?, '📦', '#6B7280', 0, ?, ?)`,
      hhId,
      category,
      type,
      type === 'personal' ? created_by_user_id : null
    );
  }

  // 5. category_id columns + backfill.
  if (!(await hasColumn(db, 'expenses', 'category_id'))) {
    await db.exec(`ALTER TABLE expenses ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL`);
  }
  if (!(await hasColumn(db, 'recurring_expenses', 'category_id'))) {
    await db.exec(`ALTER TABLE recurring_expenses ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL`);
  }

  await db.run(
    `UPDATE expenses SET category_id = (
       SELECT c.id FROM categories c
       WHERE c.name = expenses.category AND c.context = 'shared' AND c.owner_user_id IS NULL AND c.household_id = ?
     ) WHERE type = 'shared' AND category_id IS NULL`,
    hhId
  );
  await db.run(
    `UPDATE expenses SET category_id = (
       SELECT c.id FROM categories c
       WHERE c.name = expenses.category AND c.context = 'personal' AND c.owner_user_id = expenses.paid_by_user_id
     ) WHERE type = 'personal' AND paid_by_user_id IS NOT NULL AND category_id IS NULL`
  );
  await db.run(
    `UPDATE recurring_expenses SET category_id = (
       SELECT c.id FROM categories c
       WHERE c.name = recurring_expenses.category AND c.context = 'shared' AND c.owner_user_id IS NULL AND c.household_id = ?
     ) WHERE type = 'shared' AND category_id IS NULL`,
    hhId
  );
  await db.run(
    `UPDATE recurring_expenses SET category_id = (
       SELECT c.id FROM categories c
       WHERE c.name = recurring_expenses.category AND c.context = 'personal' AND c.owner_user_id = recurring_expenses.created_by_user_id
     ) WHERE type = 'personal' AND category_id IS NULL`
  );

  // 6. Migrate legacy `budgets` table if present.
  const legacyBudgets = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'`
  );
  if (legacyBudgets) {
    const latest = await db.get<{ shared_available: number; personal_samuel: number; personal_maria: number }>(
      `SELECT shared_available, personal_samuel, personal_maria FROM budgets ORDER BY month DESC LIMIT 1`
    );
    if (latest) {
      await db.run(
        `INSERT OR IGNORE INTO household_budget (household_id, total_amount, personal_samuel, personal_maria)
         VALUES (?, ?, ?, ?)`,
        hhId,
        latest.shared_available,
        latest.personal_samuel,
        latest.personal_maria
      );
    } else {
      await db.run(`INSERT OR IGNORE INTO household_budget (household_id) VALUES (?)`, hhId);
    }
  } else {
    await db.run(`INSERT OR IGNORE INTO household_budget (household_id) VALUES (?)`, hhId);
  }

  // 7. Sanity log if any expenses still have no category_id.
  const orphaned = await db.get<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM expenses WHERE category_id IS NULL`);
  if (orphaned && orphaned.cnt > 0) {
    logger.warn(
      { count: orphaned.cnt, migration: name },
      'expenses with no category_id will display as "Sin categoría"'
    );
  }

  // 8. Indices.
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_identity
      ON categories(household_id, name, context, COALESCE(owner_user_id, -1));
    CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
    CREATE INDEX IF NOT EXISTS idx_recurring_category_id ON recurring_expenses(category_id);
  `);

  // 9. Drop legacy budget tables now that data has moved.
  await db.exec(`DROP TABLE IF EXISTS category_budgets`);
  await db.exec(`DROP TABLE IF EXISTS budget_allocations`);
  await db.exec(`DROP TABLE IF EXISTS budget_approvals`);
  await db.exec(`DROP TABLE IF EXISTS budgets`);
}

export async function down(_db: Database): Promise<void> {
  throw new Error(
    'unified_category_budget_model dropped the legacy category_budgets/budgets tables ' +
      'and rewired data — it is not rollback-safe.'
  );
}

async function hasColumn(db: Database, table: string, column: string): Promise<boolean> {
  const cols = await db.all<{ name: string }[]>(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}
