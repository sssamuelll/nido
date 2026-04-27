# Past-cycle expense attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users back-date expenses to a specific cycle (or override into the active cycle) via an optional `cycle_id` column on `expenses` and a contextual segmented toggle in AddExpense.

**Architecture:** New nullable `expenses.cycle_id` column acts as an attribution override. Cycle-bound queries (`/summary`, `/api/expenses` list, analytics) gain a hybrid predicate: `cycle_id = ? OR (cycle_id IS NULL AND date in range)`. Frontend exposes a 2-pill segmented toggle below the date picker, visible only when the picked date falls outside the active cycle.

**Tech Stack:** SQLite (sqlite3 wrapper), Express, Zod, React 18, TypeScript, vitest, date-fns.

**Spec:** `docs/superpowers/specs/2026-04-27-past-cycle-expense-attribution-design.md`

---

## File Structure

**Backend:**
- Modify `server/db.ts` — add `expenses_add_cycle_id` migration (idempotent via `migrations` table).
- Modify `server/validation.ts` — extend `expenseCreateSchema`, `expenseListQuerySchema`, `expenseSummaryQuerySchema` with optional `cycle_id`.
- Modify `server/routes/expenses.ts` — POST/PUT persist `cycle_id` with normalization + ownership check; rewrite `visibleExpensesWhereRange` to the hybrid predicate; thread `cycle_id` through `/`, `/summary` handlers.
- Modify `server/routes/analytics.ts` — apply hybrid predicate to cycle-bound queries.
- Modify `server/routes/expenses.test.ts` — coverage for cycle_id persistence, normalization, ownership, query attribution.

**Frontend:**
- Create `src/lib/resolveCycleForDate.ts` — pure helper returning `{ kind: 'in-active' | 'in-closed' | 'no-cycle', cycle?: Cycle }`.
- Create `src/lib/resolveCycleForDate.test.ts` — vitest unit tests.
- Modify `src/api.ts` — `createExpense`, `updateExpense`, `getExpenses` accept `cycle_id?: number | null`. (`getSummary` already does.)
- Modify `src/views/AddExpense.tsx` — render the segmented toggle below the date picker conditionally; track `targetCycleId`; submit it.
- Modify `src/views/History.tsx` — same toggle in the edit modal; pass `cycle_id` to `Api.getExpenses`.

---

## Task 1: DB migration adding `expenses.cycle_id`

**Files:**
- Modify: `server/db.ts` (insert new migration block before `console.log('Database initialized')`)
- Test: `server/db.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/db.test.ts`:

```ts
import { initDatabase, getDatabase } from './db.js';

it('adds cycle_id column to expenses table', async () => {
  await initDatabase();
  const db = getDatabase();
  const cols = await db.all<{ name: string }[]>(`PRAGMA table_info(expenses)`);
  expect(cols.some(c => c.name === 'cycle_id')).toBe(true);
  const idx = await db.all<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='expenses'`
  );
  expect(idx.some(i => i.name === 'idx_expenses_cycle_id')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run server/db.test.ts`

Expected: FAIL — `cycle_id` column not present.

- [ ] **Step 3: Add the migration**

In `server/db.ts`, immediately above `console.log('Database initialized')`:

```ts
await addCycleIdToExpenses(database);
```

And below `materializeLegacyRecurringExpenses`, add a function that does:
1. Read `migrations` table for `expenses_add_cycle_id`. If present, return.
2. Call `ensureColumn(database, 'expenses', 'cycle_id', 'INTEGER REFERENCES billing_cycles(id) ON DELETE SET NULL')`.
3. Run `CREATE INDEX IF NOT EXISTS idx_expenses_cycle_id ON expenses(cycle_id)` via `database.run` (not the bash exec — this is the SQLite client method).
4. Insert `('expenses_add_cycle_id')` into `migrations`.
5. `console.log('Migration expenses_add_cycle_id complete')`.

Mirror the structure of `dropLegacyCategoriesUnique` already in the file.

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run server/db.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add server/db.ts server/db.test.ts
git commit -m "feat: add cycle_id column to expenses for attribution override"
```

---

## Task 2: Extend Zod schemas with `cycle_id`

**Files:**
- Modify: `server/validation.ts` (around lines 13–30 and 199–210)
- Test: `server/validation.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/validation.test.ts`:

```ts
import { expenseCreateSchema, expenseListQuerySchema, expenseSummaryQuerySchema } from './validation.js';

it('expenseCreateSchema accepts optional cycle_id', () => {
  const ok = expenseCreateSchema.safeParse({
    description: 'x', amount: 1, category: 'a', date: '2026-04-24', type: 'shared', cycle_id: 7,
  });
  expect(ok.success).toBe(true);
  if (ok.success) expect(ok.data.cycle_id).toBe(7);

  const omitted = expenseCreateSchema.safeParse({
    description: 'x', amount: 1, category: 'a', date: '2026-04-24', type: 'shared',
  });
  expect(omitted.success).toBe(true);

  const nullVal = expenseCreateSchema.safeParse({
    description: 'x', amount: 1, category: 'a', date: '2026-04-24', type: 'shared', cycle_id: null,
  });
  expect(nullVal.success).toBe(true);
});

it('expenseListQuerySchema accepts cycle_id', () => {
  const r = expenseListQuerySchema.safeParse({ cycle_id: '5' });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.cycle_id).toBe(5);
});

it('expenseSummaryQuerySchema accepts cycle_id', () => {
  const r = expenseSummaryQuerySchema.safeParse({ cycle_id: '5' });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.cycle_id).toBe(5);
});
```

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run server/validation.test.ts -t cycle_id`

Expected: FAIL.

- [ ] **Step 3: Update schemas**

Edit `server/validation.ts`. Inside `expenseCreateSchema` (after `event_id`):

```ts
event_id: z.coerce.number().int().positive().optional(),
cycle_id: z.coerce.number().int().positive().nullable().optional(),
```

Inside `expenseListQuerySchema`:

```ts
cycle_id: z.coerce.number().int().positive().optional(),
```

Inside `expenseSummaryQuerySchema`:

```ts
cycle_id: z.coerce.number().int().positive().optional(),
```

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run server/validation.test.ts -t cycle_id`

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add server/validation.ts server/validation.test.ts
git commit -m "feat: validation schemas accept cycle_id for expenses"
```

---

## Task 3: Server helper to validate + normalize `cycle_id`

**Files:**
- Modify: `server/routes/expenses.ts` (top of file, near other helpers around line 65)
- Test: `server/routes/expenses.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/routes/expenses.test.ts`:

```ts
import { resolveCycleIdForExpense } from './expenses.js';
import { getDatabase, initDatabase } from '../db.js';

describe('resolveCycleIdForExpense', () => {
  beforeEach(async () => { await initDatabase(); });

  it('returns null when cycle_id is omitted', async () => {
    const db = getDatabase();
    const r = await resolveCycleIdForExpense(db, undefined, '2026-04-24', 1);
    expect(r).toEqual({ ok: true, cycleId: null });
  });

  it('rejects cycle from another household', async () => {
    const db = getDatabase();
    await db.run(`INSERT INTO households (id, name) VALUES (2, 'B')`);
    await db.run(`INSERT INTO billing_cycles (id, household_id, month, status) VALUES (99, 2, '2026-03-01', 'active')`);
    const r = await resolveCycleIdForExpense(db, 99, '2026-03-15', 1);
    expect(r.ok).toBe(false);
  });

  it('normalizes to null when date falls naturally in the chosen cycle', async () => {
    const db = getDatabase();
    await db.run(`INSERT INTO billing_cycles (id, household_id, month, status, start_date) VALUES (10, 1, '2026-04-01', 'active', '2026-04-01')`);
    const r = await resolveCycleIdForExpense(db, 10, '2026-04-15', 1);
    expect(r).toEqual({ ok: true, cycleId: null });
  });

  it('keeps cycle_id when date is outside the chosen cycle range', async () => {
    const db = getDatabase();
    await db.run(`INSERT INTO billing_cycles (id, household_id, month, status, start_date) VALUES (10, 1, '2026-04-27', 'active', '2026-04-27')`);
    const r = await resolveCycleIdForExpense(db, 10, '2026-04-24', 1);
    expect(r).toEqual({ ok: true, cycleId: 10 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run server/routes/expenses.test.ts -t resolveCycleIdForExpense`

Expected: FAIL.

- [ ] **Step 3: Implement and export the helper**

In `server/routes/expenses.ts`, near the top after existing helpers:

```ts
export const resolveCycleIdForExpense = async (
  db: ReturnType<typeof getDatabase>,
  rawCycleId: number | null | undefined,
  date: string,
  householdId: number
): Promise<{ ok: true; cycleId: number | null } | { ok: false; error: string }> => {
  if (rawCycleId === undefined || rawCycleId === null) return { ok: true, cycleId: null };

  const cycle = await db.get<{ id: number; household_id: number; start_date: string | null }>(
    `SELECT id, household_id, start_date FROM billing_cycles WHERE id = ?`,
    rawCycleId
  );
  if (!cycle || cycle.household_id !== householdId) {
    return { ok: false, error: 'Ciclo no válido' };
  }

  const next = await db.get<{ start_date: string | null }>(
    `SELECT start_date FROM billing_cycles
     WHERE household_id = ? AND start_date > COALESCE(?, '0000-00-00') AND id != ?
     ORDER BY start_date ASC LIMIT 1`,
    cycle.household_id, cycle.start_date, cycle.id
  );

  const inRange =
    cycle.start_date !== null &&
    date >= cycle.start_date &&
    (next?.start_date == null || date < next.start_date);

  return { ok: true, cycleId: inRange ? null : rawCycleId };
};
```

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run server/routes/expenses.test.ts -t resolveCycleIdForExpense`

Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```
git add server/routes/expenses.ts server/routes/expenses.test.ts
git commit -m "feat: resolveCycleIdForExpense — validate ownership + normalize override"
```

---

## Task 4: POST /api/expenses persists `cycle_id`

**Files:**
- Modify: `server/routes/expenses.ts` (POST handler)
- Test: `server/routes/expenses.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/routes/expenses.test.ts` (uses `app`, `request`, `sessionCookie` already wired in this file):

```ts
it('POST /api/expenses persists cycle_id when date is outside the chosen cycle', async () => {
  await getDatabase().run(`INSERT INTO billing_cycles (id, household_id, month, status, start_date) VALUES (20, 1, '2026-04-27', 'active', '2026-04-27')`);

  const res = await request(app).post('/api/expenses').set('Cookie', sessionCookie).send({
    description: 'D', amount: 18, category: 'Restauración', date: '2026-04-24', type: 'shared', cycle_id: 20,
  });
  expect(res.status).toBe(200);
  const row = await getDatabase().get<{ cycle_id: number | null }>(
    `SELECT cycle_id FROM expenses WHERE id = ?`, res.body.id
  );
  expect(row?.cycle_id).toBe(20);
});

it('POST /api/expenses normalizes cycle_id to NULL when date is in range', async () => {
  await getDatabase().run(`INSERT INTO billing_cycles (id, household_id, month, status, start_date) VALUES (21, 1, '2026-04-01', 'active', '2026-04-01')`);

  const res = await request(app).post('/api/expenses').set('Cookie', sessionCookie).send({
    description: 'D', amount: 1, category: 'Restauración', date: '2026-04-15', type: 'shared', cycle_id: 21,
  });
  expect(res.status).toBe(200);
  const row = await getDatabase().get<{ cycle_id: number | null }>(
    `SELECT cycle_id FROM expenses WHERE id = ?`, res.body.id
  );
  expect(row?.cycle_id).toBeNull();
});

it('POST /api/expenses rejects cycle_id from another household', async () => {
  await getDatabase().run(`INSERT INTO households (id, name) VALUES (2, 'B')`);
  await getDatabase().run(`INSERT INTO billing_cycles (id, household_id, month, status) VALUES (99, 2, '2026-04-01', 'active')`);

  const res = await request(app).post('/api/expenses').set('Cookie', sessionCookie).send({
    description: 'D', amount: 1, category: 'Restauración', date: '2026-04-15', type: 'shared', cycle_id: 99,
  });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run server/routes/expenses.test.ts -t "POST /api/expenses"`

Expected: FAIL.

- [ ] **Step 3: Update POST handler**

In `server/routes/expenses.ts`, the POST `/` handler. After resolving `householdId` and before the INSERT:

```ts
const resolved = await resolveCycleIdForExpense(db, data.cycle_id, data.date, householdId);
if (!resolved.ok) return res.status(400).json({ error: resolved.error });
const cycleIdToPersist = resolved.cycleId;
```

Update the INSERT to include `cycle_id`:

```ts
const result = await db.run(
  `INSERT INTO expenses (description, amount, category, category_id, date, paid_by, paid_by_user_id, type, status, event_id, cycle_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  data.description, data.amount, data.category, data.category_id, data.date,
  req.user!.username, req.user!.id, data.type, data.status ?? 'paid',
  data.event_id ?? null, cycleIdToPersist
);
```

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run server/routes/expenses.test.ts -t "POST /api/expenses"`

Expected: PASS (3 new cases).

- [ ] **Step 5: Commit**

```
git add server/routes/expenses.ts server/routes/expenses.test.ts
git commit -m "feat: POST /api/expenses persists cycle_id with ownership + normalization"
```

---

## Task 5: PUT /api/expenses/:id handles `cycle_id`

**Files:**
- Modify: `server/routes/expenses.ts` (PUT handler)
- Test: `server/routes/expenses.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('PUT /api/expenses/:id updates cycle_id and normalizes', async () => {
  await getDatabase().run(`INSERT INTO billing_cycles (id, household_id, month, status, start_date) VALUES (30, 1, '2026-04-01', 'active', '2026-04-01')`);
  const seed = await getDatabase().run(
    `INSERT INTO expenses (description, amount, category, date, paid_by, paid_by_user_id, type, status) VALUES ('seed', 5, 'Restauración', '2026-04-10', 'samuel', 1, 'shared', 'paid')`
  );
  const id = seed.lastID;

  const res = await request(app).put(`/api/expenses/${id}`).set('Cookie', sessionCookie).send({
    description: 'seed', amount: 5, category: 'Restauración', date: '2026-03-15', type: 'shared', cycle_id: 30,
  });
  expect(res.status).toBe(200);
  const row = await getDatabase().get<{ cycle_id: number | null }>(
    `SELECT cycle_id FROM expenses WHERE id = ?`, id
  );
  expect(row?.cycle_id).toBe(30);
});
```

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run server/routes/expenses.test.ts -t "PUT /api/expenses/:id updates cycle_id"`

Expected: FAIL.

- [ ] **Step 3: Update PUT handler**

Mirror the resolve+update pattern in the PUT `/:id` handler:

```ts
const resolved = await resolveCycleIdForExpense(db, data.cycle_id, data.date, householdId);
if (!resolved.ok) return res.status(400).json({ error: resolved.error });
```

Add `cycle_id = ?` to the UPDATE statement and pass `resolved.cycleId` in matching position.

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run server/routes/expenses.test.ts -t "PUT /api/expenses/:id updates cycle_id"`

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add server/routes/expenses.ts server/routes/expenses.test.ts
git commit -m "feat: PUT /api/expenses cycle_id override"
```

---

## Task 6: Hybrid predicate in `visibleExpensesWhereRange` + thread `cycle_id` through `/summary`

**Files:**
- Modify: `server/routes/expenses.ts`
- Test: `server/routes/expenses.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('GET /summary attributes by cycle_id override even when date is outside range', async () => {
  await getDatabase().run(`INSERT INTO billing_cycles (id, household_id, month, status, start_date) VALUES (40, 1, '2026-04-27', 'active', '2026-04-27')`);
  await getDatabase().run(
    `INSERT INTO expenses (description, amount, category, date, paid_by, paid_by_user_id, type, status, cycle_id) VALUES ('forced', 10, 'Restauración', '2026-04-24', 'samuel', 1, 'shared', 'paid', 40)`
  );

  const res = await request(app)
    .get('/api/expenses/summary')
    .query({ start_date: '2026-04-27', cycle_id: '40' })
    .set('Cookie', sessionCookie);

  expect(res.status).toBe(200);
  expect(res.body.totalSharedSpent).toBeGreaterThanOrEqual(10);
});

it('GET /summary excludes expenses whose cycle_id points elsewhere even if date is in range', async () => {
  await getDatabase().run(`INSERT INTO billing_cycles (id, household_id, month, status, start_date) VALUES (41, 1, '2026-04-01', 'active', '2026-04-01')`);
  await getDatabase().run(`INSERT INTO billing_cycles (id, household_id, month, status, start_date) VALUES (42, 1, '2026-05-01', 'pending', '2026-05-01')`);
  await getDatabase().run(
    `INSERT INTO expenses (description, amount, category, date, paid_by, paid_by_user_id, type, status, cycle_id) VALUES ('redirected', 100, 'Restauración', '2026-04-15', 'samuel', 1, 'shared', 'paid', 42)`
  );

  const res = await request(app)
    .get('/api/expenses/summary')
    .query({ start_date: '2026-04-01', end_date: '2026-05-01', cycle_id: '41' })
    .set('Cookie', sessionCookie);

  // The 'redirected' expense (€100) should NOT count toward cycle 41
  expect(res.body.totalSharedSpent).toBeLessThan(100);
});
```

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run server/routes/expenses.test.ts -t "GET /summary"`

Expected: FAIL.

- [ ] **Step 3: Rewrite `visibleExpensesWhereRange` and update `/summary` handler**

Replace the constant in `server/routes/expenses.ts`:

```ts
const visibleExpensesWhereRange = `
  (
    expenses.cycle_id = ?
    OR (
      expenses.cycle_id IS NULL
      AND date >= ?
      AND (? IS NULL OR date < ?)
    )
  )
  AND (
    type = 'shared'
    OR paid_by_user_id = ?
    OR (paid_by_user_id IS NULL AND paid_by = ?)
  )
`;
```

In the `/summary` handler, add `cycle_id` to the destructure and bind `cycleId ?? -1` first:

```ts
const { start_date: startDate, end_date: endDate, month, cycle_id: cycleId } =
  (req as AuthRequest & { validatedQuery: ExpenseSummaryQuery }).validatedQuery;

if (startDate) {
  expenses = await db.all<ExpenseRow[]>(
    `SELECT * FROM expenses WHERE ${visibleExpensesWhereRange}`,
    cycleId ?? -1, startDate, endDate ?? null, endDate ?? null,
    req.user!.id, req.user!.username
  );
}
```

The `-1` sentinel never matches a real cycle id, so the second branch handles all expenses when no cycle is bound.

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run server/routes/expenses.test.ts -t "GET /summary"`

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add server/routes/expenses.ts server/routes/expenses.test.ts
git commit -m "feat: hybrid cycle_id predicate in /summary"
```

---

## Task 7: Apply hybrid predicate to GET /api/expenses (history list)

**Files:**
- Modify: `server/routes/expenses.ts` (GET `/` handler)
- Test: `server/routes/expenses.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('GET /api/expenses returns overridden expenses when cycle_id is bound', async () => {
  await getDatabase().run(`INSERT INTO billing_cycles (id, household_id, month, status, start_date) VALUES (50, 1, '2026-04-27', 'active', '2026-04-27')`);
  await getDatabase().run(
    `INSERT INTO expenses (description, amount, category, date, paid_by, paid_by_user_id, type, status, cycle_id) VALUES ('forced-list', 7, 'Restauración', '2026-04-24', 'samuel', 1, 'shared', 'paid', 50)`
  );

  const res = await request(app)
    .get('/api/expenses')
    .query({ start_date: '2026-04-27', cycle_id: '50' })
    .set('Cookie', sessionCookie);

  const descs = res.body.map((e: { description: string }) => e.description);
  expect(descs).toContain('forced-list');
});
```

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run server/routes/expenses.test.ts -t "returns overridden expenses"`

Expected: FAIL.

- [ ] **Step 3: Update GET `/` handler binding**

```ts
const { start_date: startDate, end_date: endDate, month, event_id: eventId, cycle_id: cycleId } =
  (req as AuthRequest & { validatedQuery: ExpenseListQuery }).validatedQuery;

if (startDate) {
  expenses = await db.all(
    `SELECT * FROM expenses
     WHERE ${visibleExpensesWhereRange}${eventFilter}
     ORDER BY date DESC, created_at DESC`,
    ...(eventId !== undefined
      ? [cycleId ?? -1, startDate, endDate ?? null, endDate ?? null, req.user!.id, req.user!.username, eventId]
      : [cycleId ?? -1, startDate, endDate ?? null, endDate ?? null, req.user!.id, req.user!.username])
  );
}
```

The `month` branch stays unchanged (uses `visibleExpensesWhereMonth`, not cycle-bound).

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run server/routes/expenses.test.ts -t "returns overridden expenses"`

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add server/routes/expenses.ts server/routes/expenses.test.ts
git commit -m "feat: hybrid cycle_id predicate in GET /api/expenses"
```

---

## Task 8: Update analytics cycle-bound queries

**Files:**
- Modify: `server/routes/analytics.ts`
- Modify: `server/validation.ts` (analytics schema)
- Test: `server/routes/analytics.test.ts`

- [ ] **Step 1: Inspect current queries**

`grep -n "start_date\|date >=" server/routes/analytics.ts`

For each cycle-bound query that uses `date >= ? AND (? IS NULL OR date < ?)`, swap to the hybrid form. Add `cycle_id` to `analyticsQuerySchema` if not already there.

- [ ] **Step 2: Write a representative failing test**

Append to `server/routes/analytics.test.ts`:

```ts
it('GET /api/analytics respects cycle_id override', async () => {
  await getDatabase().run(`INSERT INTO billing_cycles (id, household_id, month, status, start_date) VALUES (60, 1, '2026-04-27', 'active', '2026-04-27')`);
  await getDatabase().run(
    `INSERT INTO expenses (description, amount, category, date, paid_by, paid_by_user_id, type, status, cycle_id) VALUES ('an-forced', 15, 'Restauración', '2026-04-24', 'samuel', 1, 'shared', 'paid', 60)`
  );

  const res = await request(app)
    .get('/api/analytics')
    .query({ start_date: '2026-04-27', cycle_id: '60', context: 'shared' })
    .set('Cookie', sessionCookie);

  expect(res.status).toBe(200);
  expect(res.body.totalSpent).toBeGreaterThanOrEqual(15);
});
```

- [ ] **Step 3: Run test to verify it fails**

`npx vitest run server/routes/analytics.test.ts -t "cycle_id override"`

Expected: FAIL.

- [ ] **Step 4: Update queries**

For every query in `server/routes/analytics.ts` that filters by `date >= ?`, prepend the hybrid clause:

```sql
(expenses.cycle_id = ? OR (expenses.cycle_id IS NULL AND date >= ? AND (? IS NULL OR date < ?)))
```

Adjust parameter bindings to add `cycleId ?? -1` first. Plumb `cycleId` from the validated query.

Also add `cycle_id: z.coerce.number().int().positive().optional()` to `analyticsQuerySchema` in `server/validation.ts`.

- [ ] **Step 5: Run test to verify it passes**

`npx vitest run server/routes/analytics.test.ts -t "cycle_id override"`

Expected: PASS.

- [ ] **Step 6: Commit**

```
git add server/routes/analytics.ts server/validation.ts server/routes/analytics.test.ts
git commit -m "feat: hybrid cycle_id predicate in analytics"
```

---

## Task 9: API client signatures pass `cycle_id`

**Files:**
- Modify: `src/api.ts`

- [ ] **Step 1: Update signatures**

```ts
static async createExpense(data: {
  description: string; amount: number; category?: string; category_id?: number;
  date: string; type: string; event_id?: number; cycle_id?: number | null;
}) {
  return this.request('/expenses', { method: 'POST', body: data });
}

static async updateExpense(id: number, data: {
  description: string; amount: number; category?: string; category_id?: number;
  date: string; type: string; event_id?: number; cycle_id?: number | null;
}) {
  return this.request(`/expenses/${id}`, { method: 'PUT', body: data });
}

static async getExpenses(opts?: {
  start_date?: string; end_date?: string | null; month?: string;
  event_id?: number; cycle_id?: number;
}): Promise<any[]> {
  if (!opts) return this.request('/expenses');
  const params = new URLSearchParams();
  if (opts.start_date) params.set('start_date', opts.start_date);
  if (opts.end_date) params.set('end_date', opts.end_date);
  if (opts.month) params.set('month', opts.month);
  if (opts.event_id !== undefined) params.set('event_id', String(opts.event_id));
  if (opts.cycle_id !== undefined) params.set('cycle_id', String(opts.cycle_id));
  return this.request(`/expenses?${params.toString()}`);
}
```

`getSummary` already accepts `cycle_id` (existing code).

- [ ] **Step 2: Type check**

`npx tsc --noEmit`

Expected: 0 errors related to api.ts.

- [ ] **Step 3: Commit**

```
git add src/api.ts
git commit -m "feat: API client createExpense/updateExpense/getExpenses accept cycle_id"
```

---

## Task 10: Frontend helper `resolveCycleForDate`

**Files:**
- Create: `src/lib/resolveCycleForDate.ts`
- Create: `src/lib/resolveCycleForDate.test.ts`

- [ ] **Step 1: Create the directory if missing**

`mkdir -p src/lib`

- [ ] **Step 2: Write the failing test**

`src/lib/resolveCycleForDate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveCycleForDate, type Cycle } from './resolveCycleForDate';

const cycles: Cycle[] = [
  { id: 3, status: 'active', start_date: '2026-04-27', end_date: null },
  { id: 2, status: 'closed', start_date: '2026-03-01', end_date: '2026-04-27' },
  { id: 1, status: 'closed', start_date: '2026-02-01', end_date: '2026-03-01' },
];

describe('resolveCycleForDate', () => {
  it('returns in-active when date is in the active cycle', () => {
    expect(resolveCycleForDate('2026-04-28', cycles)).toEqual({ kind: 'in-active', cycle: cycles[0] });
  });

  it('returns in-closed when date falls in a past closed cycle', () => {
    expect(resolveCycleForDate('2026-03-15', cycles)).toEqual({ kind: 'in-closed', cycle: cycles[1] });
  });

  it('returns no-cycle when date is before the first cycle', () => {
    expect(resolveCycleForDate('2026-01-15', cycles)).toEqual({ kind: 'no-cycle' });
  });

  it('handles empty cycle list', () => {
    expect(resolveCycleForDate('2026-04-15', [])).toEqual({ kind: 'no-cycle' });
  });

  it('treats end_date as exclusive', () => {
    expect(resolveCycleForDate('2026-04-27', cycles)).toEqual({ kind: 'in-active', cycle: cycles[0] });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

`npx vitest run src/lib/resolveCycleForDate.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement**

`src/lib/resolveCycleForDate.ts`:

```ts
export interface Cycle {
  id: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  month?: string;
}

export type CycleResolution =
  | { kind: 'in-active'; cycle: Cycle }
  | { kind: 'in-closed'; cycle: Cycle }
  | { kind: 'no-cycle' };

export function resolveCycleForDate(date: string, cycles: Cycle[]): CycleResolution {
  for (const c of cycles) {
    if (!c.start_date) continue;
    const startsBefore = date >= c.start_date;
    const endsAfter = c.end_date == null || date < c.end_date;
    if (startsBefore && endsAfter) {
      return { kind: c.status === 'active' ? 'in-active' : 'in-closed', cycle: c };
    }
  }
  return { kind: 'no-cycle' };
}
```

- [ ] **Step 5: Run test to verify it passes**

`npx vitest run src/lib/resolveCycleForDate.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```
git add src/lib/resolveCycleForDate.ts src/lib/resolveCycleForDate.test.ts
git commit -m "feat: resolveCycleForDate helper + tests"
```

---

## Task 11: AddExpense renders the segmented toggle

**Files:**
- Modify: `src/views/AddExpense.tsx` (around the date picker block, currently lines 327–365)

- [ ] **Step 1: Load cycles + active cycle**

In `AddExpense.tsx`, near other `useEffect` data loaders:

```tsx
import { resolveCycleForDate, type Cycle } from '../lib/resolveCycleForDate';
// ...
const [cycles, setCycles] = useState<Cycle[]>([]);
useEffect(() => {
  Api.listCycles().then(d => setCycles(Array.isArray(d) ? d : [])).catch(() => setCycles([]));
}, []);
const activeCycle = cycles.find(c => c.status === 'active');
```

- [ ] **Step 2: Track `targetCycleId`**

```tsx
const [targetCycleId, setTargetCycleId] = useState<number | null>(null);

const cycleResolution = useMemo(
  () => resolveCycleForDate(expenseDate, cycles),
  [expenseDate, cycles]
);

useEffect(() => {
  if (cycleResolution.kind === 'in-active') {
    setTargetCycleId(null);
  } else if (cycleResolution.kind === 'in-closed') {
    setTargetCycleId(cycleResolution.cycle.id);
  } else {
    setTargetCycleId(activeCycle?.id ?? null);
  }
}, [cycleResolution.kind, cycleResolution.kind === 'in-closed' ? cycleResolution.cycle.id : null, activeCycle?.id]);
```

- [ ] **Step 3: Render the toggle conditionally**

Inside the date-picker block, after `expense-date-input`:

```tsx
{cycleResolution.kind !== 'in-active' && activeCycle && (
  <div className="cycle-attribution">
    <div className="cycle-attribution__hint">
      {cycleResolution.kind === 'in-closed'
        ? 'Esta fecha cae fuera del ciclo actual'
        : 'No hay ciclo registrado en esa fecha'}
    </div>
    <div className="cycle-attribution__toggle">
      <button
        type="button"
        className={`type-sel ${targetCycleId !== activeCycle.id ? 'type-sel--active' : ''}`}
        disabled={cycleResolution.kind === 'no-cycle'}
        onClick={() => cycleResolution.kind === 'in-closed' && setTargetCycleId(cycleResolution.cycle.id)}
      >
        {cycleResolution.kind === 'in-closed'
          ? `Ciclo ${cycleResolution.cycle.month ?? cycleResolution.cycle.start_date}`
          : 'Ciclo de esa fecha (sin datos)'}
      </button>
      <button
        type="button"
        className={`type-sel ${targetCycleId === activeCycle.id ? 'type-sel--active' : ''}`}
        onClick={() => setTargetCycleId(activeCycle.id)}
      >
        Ciclo actual
      </button>
    </div>
  </div>
)}
```

(Extend the local `Cycle` type or use `any` for the `month` field if not in the helper's `Cycle` interface — adjust the helper interface to include `month?: string` to keep TS happy.)

- [ ] **Step 4: Submit `cycle_id`**

In `handleSubmit`:

```tsx
const expenseData = {
  description, amount: parseFloat(finalAmount.toFixed(2)),
  category, category_id: categories.find(c => c.name === category)?.id,
  date: expenseDate, type, event_id: selectedEventId || undefined,
  cycle_id: targetCycleId,
};
```

- [ ] **Step 5: Add minimal styles**

Append to `src/styles/index.css`:

```css
.cycle-attribution { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.cycle-attribution__hint { font-size: 12px; color: var(--tm); }
.cycle-attribution__toggle { display: flex; gap: 8px; }
```

- [ ] **Step 6: Manual smoke**

`npm run dev` → AddExpense → pick a date outside the current cycle → toggle appears.

- [ ] **Step 7: Commit**

```
git add src/views/AddExpense.tsx src/styles/index.css src/lib/resolveCycleForDate.ts
git commit -m "feat: AddExpense — segmented toggle for cycle attribution override"
```

---

## Task 12: History edit modal — same toggle + pass cycle_id

**Files:**
- Modify: `src/views/History.tsx`

- [ ] **Step 1: Add `editTargetCycleId` state**

```tsx
const [editTargetCycleId, setEditTargetCycleId] = useState<number | null>(null);

useEffect(() => {
  if (!editingExpense) return;
  setEditTargetCycleId(editingExpense.cycle_id ?? null);
}, [editingExpense?.id]);
```

- [ ] **Step 2: Render toggle inside the edit modal**

Reuse the same JSX block as Task 11 (inline for minimal scope; refactor into `CycleAttributionToggle` later if desired). Replace `expenseDate` with `editDate` and `targetCycleId` with `editTargetCycleId`.

- [ ] **Step 3: Pass `cycle_id` on save + on list fetch**

In modal save:

```tsx
await Api.updateExpense(editingExpense.id, {
  description: editDescription, amount: parseFloat(editAmount),
  category: editCategory, date: editDate, type: editType,
  cycle_id: editTargetCycleId,
});
```

In `loadExpenses`:

```tsx
data = await Api.getExpenses({
  start_date: currentCycle.start_date,
  end_date: currentCycle.end_date ?? undefined,
  cycle_id: currentCycle.id,
});
```

- [ ] **Step 4: Type check + manual smoke**

```
npx tsc --noEmit
npm run dev
```

Edit an expense → change date to out-of-cycle → toggle appears → save with override → switch cycles in History → confirm expense persists in chosen cycle.

- [ ] **Step 5: Commit**

```
git add src/views/History.tsx
git commit -m "feat: History edit modal — cycle attribution toggle + cycle_id on list"
```

---

## Task 13: Pass `cycle_id` from Dashboard's expense list fetch

**Files:**
- Modify: `src/views/Dashboard.tsx` (around line 173)

- [ ] **Step 1: Update the `Api.getExpenses` call**

```tsx
Api.getSummary({ ...range, cycle_id: activeCycle.id }),
Api.getExpenses({ ...range, cycle_id: activeCycle.id }),
```

- [ ] **Step 2: Type check**

`npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 3: Commit**

```
git add src/views/Dashboard.tsx
git commit -m "feat: Dashboard expense list also passes cycle_id"
```

---

## Task 14: End-to-end manual verification + ship

- [ ] **Step 1: Run all tests**

`npx vitest run`

Expected: tests added in this plan pass. Pre-existing unrelated failures are acceptable.

- [ ] **Step 2: Type check**

`npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 3: Push branch + open PR**

```
git push -u origin feat/past-cycle-expense-attribution
gh pr create --title "feat: past-cycle expense attribution"
```

- [ ] **Step 4: Merge after CI green**

```
gh pr merge --squash --delete-branch
```

- [ ] **Step 5: Post-deploy verification on https://nido.sdar.dev**

1. Add an expense dated before the active cycle's start. Toggle appears with two options.
2. Submit with default. Verify it lands in the expected cycle in History.
3. Toggle to "Ciclo actual" on a past-dated expense. Submit. Verify it appears in current cycle's category and not in past cycle.
4. Edit that expense in History, change date to active cycle's range. Verify `cycle_id` normalizes to NULL on save (override is dropped because date now covers it naturally).

---

## Self-review notes

- Spec coverage: every spec section maps to a task — migration (T1), validation (T2), helpers (T3, T10), POST/PUT (T4, T5), predicates (T6, T7, T8), API client (T9), AddExpense UI (T11), History UI (T12, T13), verification (T14).
- The spec mentions `event_id` independence — covered implicitly because the predicate change leaves `eventFilter` untouched and the `cycle_id` column doesn't constrain `event_id`. Worth a smoke check during T14.
- The `formatCycleLabel` open question in the spec is collapsed to "use `cycle.month ?? cycle.start_date`" inline in T11/T12 — acceptable for v1.
- T11 helper `Cycle` type includes optional `month` so the toggle label can show it. T10 test data includes `month: undefined` implicitly (the type marks it optional).
