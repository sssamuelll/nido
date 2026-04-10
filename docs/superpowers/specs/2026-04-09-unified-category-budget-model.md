# Unified Category & Budget Model

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Refactor the category and budget data model to eliminate loose text references, unify categories with their budget limits, and enable rich analytics via cycle-based snapshots.

---

## Problem

The current model has three independent sources of "categories" joined by text name:

- `categories` table (emoji, color, context)
- `category_budgets` table (monthly/cycle budget amounts)
- `expenses.category` TEXT column (loose reference)

This causes: duplicate budget rows on every save (SQLite NULL != NULL in UNIQUE), phantom categories with `id: 0`, delete operations that silently fail, and no foreign key integrity. The `budgets` table is also month-indexed, causing the dashboard to show zeros when the calendar month changes.

## Design

### New Data Model

#### Tables that stay (reformed)

**`categories`** — single source of truth for category definition AND current budget limit.

```sql
categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  color TEXT NOT NULL,
  budget_amount REAL NOT NULL DEFAULT 0,
  context TEXT NOT NULL DEFAULT 'shared' CHECK (context IN ('shared', 'personal')),
  owner_user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
)
-- Expression-based unique index (SQLite doesn't support expressions in UNIQUE table constraints)
CREATE UNIQUE INDEX uq_categories_identity
  ON categories(household_id, name, context, COALESCE(owner_user_id, -1));
```

- `budget_amount` is the **current** limit. Dashboard reads this directly.
- The unique index uses `COALESCE(owner_user_id, -1)` to avoid the SQLite NULL != NULL problem. This replaces the inline UNIQUE constraint.

**`expenses`** — `category TEXT` replaced by `category_id INTEGER`.

```sql
-- Add column:
category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL
-- Keep category TEXT temporarily for rollback safety. Drop in a later migration.
```

**`recurring_expenses`** — same change.

```sql
-- Add column:
category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL
```

#### New tables

**`household_budget`** — the total household budget (one row per household, not per month).

```sql
household_budget (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  total_amount REAL NOT NULL DEFAULT 2000,
  personal_samuel REAL NOT NULL DEFAULT 500,
  personal_maria REAL NOT NULL DEFAULT 500,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

- `sum(categories.budget_amount WHERE context='shared' AND household_id=X)` must not exceed `total_amount`. Enforced at the API level.

**`category_budget_snapshots`** — per-category budget at cycle start, for analytics.

```sql
category_budget_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  budget_amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cycle_id, category_id)
)
```

**`household_budget_snapshots`** — household budget at cycle start, for analytics.

```sql
household_budget_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
  total_amount REAL NOT NULL,
  personal_samuel REAL NOT NULL,
  personal_maria REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cycle_id)
)
```

#### Tables removed

- `category_budgets` — absorbed into `categories.budget_amount` + `category_budget_snapshots`
- `budgets` — replaced by `household_budget` (current) + `household_budget_snapshots` (history)
- `budget_allocations` — absorbed into `household_budget`
- `budget_approvals` — replaced by `household_budget_approvals` (see below)

**`household_budget_approvals`** — pending approval for household budget changes (replaces `budget_approvals`).

```sql
household_budget_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  requested_by_user_id INTEGER NOT NULL REFERENCES app_users(id),
  approved_by_user_id INTEGER REFERENCES app_users(id),
  total_amount REAL,
  personal_samuel REAL,
  personal_maria REAL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Data Migration

Executed as a single transaction during server startup, gated by the `migrations` table.

1. **Create new tables** (`household_budget`, `category_budget_snapshots`, `household_budget_snapshots`).

2. **Add `budget_amount` to `categories`**. For each row in `category_budgets` from the most recent month (`2026-03`), update the matching category's `budget_amount`. Match on `name + context + COALESCE(owner_user_id, -1)`. Use the MAX(id) row to get the latest value in case of duplicates.

3. **Create missing categories.** For every distinct `category` name in `expenses` and `recurring_expenses` that has no row in `categories`, insert one with emoji `📦`, color `#6B7280`, budget_amount `0`.

4. **Add `category_id` to `expenses` and `recurring_expenses`.** Backfill: set `category_id` to the matching `categories.id` by name + context (expenses.type maps to categories.context). Handle personal categories by matching `owner_user_id` through `paid_by_user_id` or `created_by_user_id`.

5. **Migrate `budgets` to `household_budget`.** Copy `shared_available`, `personal_samuel`, `personal_maria` from the most recent `budgets` row. One row per household.

6. **Validate integrity.** Assert all expenses have `category_id IS NOT NULL`. Assert `sum(shared category budgets) <= household total`. Log warnings for any violations (don't block startup).

7. **Drop old tables** (`category_budgets`, `budgets`, `budget_allocations`, `budget_approvals`). Keep `expenses.category` TEXT and `recurring_expenses.category` TEXT as readonly for one release (rollback safety). Remove in a follow-up migration.

### API Changes

#### Removed endpoints
- `GET /api/budgets/latest-month`
- `DELETE /api/categories/by-name/:name`

#### Simplified endpoints

**`GET /api/categories?context=shared|personal`**
- Single query: `SELECT * FROM categories WHERE household_id = ? AND context = ? AND (owner_user_id = ? OR owner_user_id IS NULL)`
- Returns: `[{ id, name, emoji, color, budget_amount, context }]`
- No more 3-source merge. No more `id: 0` fallback.

**`POST /api/categories`**
- Body: `{ id?, name, emoji, color, budget_amount, context? }`
- Creates or updates category including its budget limit.
- Validates: `sum(shared budgets) + new_amount <= household_budget.total_amount`.
- Replaces the current 2-step flow (saveCategory + updateBudget).

**`DELETE /api/categories/:id`**
- Deletes category. Expenses with that `category_id` become `NULL` (ON DELETE SET NULL).
- Displayed as "Sin categoria" in the UI.

**`GET /api/household/budget`** *(new, replaces GET /api/budgets)*
- Returns: `{ total_amount, personal_samuel, personal_maria, allocated, unallocated }`
- `allocated = sum(categories.budget_amount WHERE context='shared')`
- `unallocated = total_amount - allocated`

**`PUT /api/household/budget`** *(new, replaces PUT /api/budgets)*
- Body: `{ total_amount?, personal_samuel?, personal_maria? }`
- Changes to `total_amount` require partner approval (same flow as today).
- Validates: new `total_amount >= sum(shared category budgets)`.

**`GET /api/expenses/summary`**
- Joins expenses by `category_id` instead of text matching.
- Budget per category from `categories.budget_amount` (active cycle) or `category_budget_snapshots` (past cycles).

**`POST /api/cycles/approve`** (cycle activation)
- Snapshots all `categories.budget_amount` into `category_budget_snapshots`.
- Snapshots `household_budget` into `household_budget_snapshots`.
- Registers recurring expenses as today.

### Frontend Changes

**`useCategoryManagement`** — single fetch, no merge logic. Returns categories with `budget_amount` included.

**`useCategoryModal`** — `save()` becomes one API call (POST /api/categories with budget_amount). No separate budget update.

**`Dashboard`** — no more `fallbackMonth` / cycle+budget+summary parallel fetch. Loads cycle + summary + categories. Budget info is in categories.

**`Settings`** — two clear sections:
1. Household budget (total, personal splits) via `GET/PUT /api/household/budget`
2. Category list with inline budget editing via `POST /api/categories`

**`AddExpense`** — sends `category_id: number` instead of `category: string`. Category picker uses `categories` from the hook.

**Removed from frontend:**
- `Api.getBudget()` / `Api.updateBudget()` with month/cycle_id logic
- `Api.getLatestBudgetMonth()`
- `Api.deleteCategoryByName()`
- The `fallbackMonth` / `currentMonth` pattern in Dashboard and PersonalDashboard

### Analytics

**Active cycle:** budget from `categories.budget_amount`, expenses by date range.

**Past cycles:** budget from `category_budget_snapshots WHERE cycle_id = ?`, expenses by date range between cycle.start_date and next cycle's start_date.

**Cross-cycle comparison:** join `category_budget_snapshots` across cycles by `category_id`. Enables:
- "In March I used 90% of Restauracion (180/200), in April 75% (225/300)"
- "Budget for Restauracion increased 3 times in 6 months"
- Trend analysis of budget allocation shifts over time

**Mid-cycle changes:** the snapshot records the budget at cycle start. If the user changes a limit mid-cycle, `categories.budget_amount` updates but the snapshot stays. Analytics for that cycle can show both "started at X, ended at Y" if needed (compare snapshot vs next snapshot or current value).

### Error Handling

- **Budget overflow:** POST /api/categories returns 400 if `sum(shared budgets) + new > household total`. Message: "El presupuesto asignado excede el total del hogar (X de Y)"
- **Deleted category in expenses:** UI shows "Sin categoria" with a neutral icon. Expenses remain intact.
- **Missing category_id after migration:** logged as warning. Expense still visible but uncategorized.

### Testing Strategy

- **Migration test:** create a test DB with the old schema, run migration, verify all category_ids are set, budgets are correct, and old tables are dropped.
- **API tests:** update existing budget/category tests for new endpoints. Add tests for budget overflow validation and snapshot creation on cycle approval.
- **Frontend:** verify single-fetch category loading, budget editing in one step, and category deletion with orphaned expenses.
