# Unified Category & Budget Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify `categories` and `category_budgets` into a single source of truth, replace text-based category references with foreign keys, and add cycle-based budget snapshots for analytics.

**Architecture:** Single `categories` table holds definition + current budget. `household_budget` replaces month-indexed `budgets`. Snapshot tables record state at each cycle start. Expenses and recurring_expenses use `category_id` FK instead of text.

**Tech Stack:** SQLite (server/db.ts migrations), Express routes (TypeScript), React hooks + views.

**Spec:** `docs/superpowers/specs/2026-04-09-unified-category-budget-model.md`

---

### Task 1: Database Migration — New Tables & Schema Changes

**Files:**
- Modify: `server/db.ts`

This task creates the new tables, adds columns to existing tables, migrates data, and drops old tables. All wrapped in a migration gate.

- [ ] **Step 1: Add the migration function after existing migrations in `server/db.ts`**

Add after the `remove_seeded_categories` migration block (around line 432), before the `// Migration: Transfer data from budgets to budgets_new` block.

```typescript
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
```

- [ ] **Step 2: Update the initial CREATE TABLE block for fresh installs to match the new schema (remove old tables, add new ones)**

- [ ] **Step 3: Remove `syncBudgetAllocationsForMonth` function and its export from `server/db.ts`**

- [ ] **Step 4: Run migration locally, verify tables and data**

- [ ] **Step 5: Commit**

---

### Task 2: Backend — Household Budget Routes

**Files:**
- Create: `server/routes/household-budget.ts`
- Modify: `server/index.ts` (mount new router, remove old budgets import)
- Delete: `server/routes/budgets.ts`, `server/routes/budgets.test.ts`

- [ ] **Step 1: Create `server/routes/household-budget.ts` with GET /, PUT /, POST /approve endpoints** (see spec for full endpoint contracts)
- [ ] **Step 2: Mount at `/api/household/budget` in `server/index.ts`, remove old budgets router import and mount**
- [ ] **Step 3: Delete `server/routes/budgets.ts` and `server/routes/budgets.test.ts`**
- [ ] **Step 4: Commit**

---

### Task 3: Backend — Rewrite Category Endpoints

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Rewrite GET /api/categories — single query, no 3-source merge, returns budget_amount**
- [ ] **Step 2: Rewrite POST /api/categories — includes budget_amount, validates overflow against household total**
- [ ] **Step 3: Simplify DELETE /api/categories/:id — remove by-name endpoint, FK cascades handle cleanup**
- [ ] **Step 4: Remove unused imports**
- [ ] **Step 5: Commit**

---

### Task 4: Backend — Update Expenses, Cycles, Recurring, Analytics for category_id

**Files:**
- Modify: `server/routes/expenses.ts`
- Modify: `server/routes/cycles.ts`
- Modify: `server/routes/recurring.ts`
- Modify: `server/routes/analytics.ts`
- Modify: `server/validation.ts`

- [ ] **Step 1: POST /expenses accepts and resolves `category_id`**
- [ ] **Step 2: GET /expenses/summary uses category_id FK joins, reads budget from categories.budget_amount and household_budget**
- [ ] **Step 3: `activateCycle` creates budget snapshots (category_budget_snapshots + household_budget_snapshots), uses category_id for recurring expenses**
- [ ] **Step 4: Recurring routes accept and store category_id**
- [ ] **Step 5: Analytics reads from categories.budget_amount instead of category_budgets**
- [ ] **Step 6: Update validation schemas to accept category_id**
- [ ] **Step 7: Commit**

---

### Task 5: Frontend — Update API Client & Hooks

**Files:**
- Modify: `src/api.ts`
- Modify: `src/hooks/useCategoryManagement.ts`
- Modify: `src/hooks/useCategoryModal.ts`

- [ ] **Step 1: Replace budget API methods with household budget methods. Remove: getLatestBudgetMonth, getBudget, updateBudget, approveBudget, deleteCategoryByName. Add: getHouseholdBudget, updateHouseholdBudget, approveHouseholdBudget**
- [ ] **Step 2: Update saveCategory to include budget_amount, getCategories return type to include budget_amount, createExpense to accept category_id**
- [ ] **Step 3: Update CategoryDef — id is required (number, not optional), add budget_amount**
- [ ] **Step 4: Simplify useCategoryModal.save() — one API call with budget_amount, no separate updateBudget. Remove month/cycle_id/categoryBreakdown from opts**
- [ ] **Step 5: Simplify remove() — no more by-name fallback**
- [ ] **Step 6: Update openEdit signature to accept CategoryDef directly**
- [ ] **Step 7: Commit**

---

### Task 6: Frontend — Update Views

**Files:**
- Modify: `src/views/Dashboard.tsx`
- Modify: `src/views/PersonalDashboard.tsx`
- Modify: `src/views/Settings.tsx`
- Modify: `src/views/AddExpense.tsx`

- [ ] **Step 1: Dashboard — remove fallbackMonth, getLatestBudgetMonth. Load cycle + summary + categories. Remove budgetSaveContext. Update catModal.save() calls to new signature**
- [ ] **Step 2: PersonalDashboard — same simplification, remove getBudget calls**
- [ ] **Step 3: Settings — two sections: household budget (getHouseholdBudget/updateHouseholdBudget) and category list. Remove old budget loading/saving logic**
- [ ] **Step 4: AddExpense — send category_id in createExpense. Keep category text as fallback during transition**
- [ ] **Step 5: Commit**

---

### Task 7: Cleanup & Verify

**Files:** Various

- [ ] **Step 1: Type-check server: `npx tsc --noEmit -p server/tsconfig.json`**
- [ ] **Step 2: Build frontend: `npx vite build`**
- [ ] **Step 3: Run all tests: `npx vitest run` — fix or remove broken tests referencing old tables/endpoints**
- [ ] **Step 4: Test migration against production DB copy**
- [ ] **Step 5: Final commit**

---

### Task 8: Deploy

- [ ] **Step 1: Create branch, PR, merge to main**
- [ ] **Step 2: `npm run deploy`**
- [ ] **Step 3: Verify production — tables exist, data migrated, dashboard loads**
