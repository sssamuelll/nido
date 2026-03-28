# Recurring Expenses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to define recurring expenses that get generated as real expenses when a billing cycle is initiated and approved by both users.

**Architecture:** New `recurring_expenses` and `billing_cycles` tables, new route files for CRUD and cycles, new API methods, new RecurringSection component in Dashboard. Follows existing patterns for routes (Express Router + Zod), notifications (notifyPartner), and components.

**Tech Stack:** Express, SQLite, Zod, React, TypeScript

---

### Task 1: Database schema

**Files:**
- Modify: `server/db.ts`

Add these CREATE TABLE statements inside the existing `database.exec()` block:

- [ ] **Step 1: Add tables**

```sql
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
```

- [ ] **Step 2: Build**

Run: `npx tsc --noEmit --project server/tsconfig.json`

- [ ] **Step 3: Commit**

```bash
git add server/db.ts
git commit -m "feat: add recurring_expenses and billing_cycles tables"
```

---

### Task 2: Validation schemas

**Files:**
- Modify: `server/validation.ts`

- [ ] **Step 1: Add schemas**

```typescript
export const recurringExpenseCreateSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100),
  emoji: z.string().min(1).default('📂'),
  amount: z.coerce.number().positive('El monto debe ser positivo'),
  category: z.string().min(1, 'La categoría es requerida'),
  type: z.enum(['shared', 'personal']),
  notes: z.string().max(200).optional(),
});

export const recurringExpenseUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  emoji: z.string().min(1).optional(),
  amount: z.coerce.number().positive().optional(),
  category: z.string().min(1).optional(),
  type: z.enum(['shared', 'personal']).optional(),
  notes: z.string().max(200).nullable().optional(),
});

export type RecurringExpenseInput = z.infer<typeof recurringExpenseCreateSchema>;
export type RecurringExpenseUpdateInput = z.infer<typeof recurringExpenseUpdateSchema>;
```

- [ ] **Step 2: Build and commit**

```bash
npx tsc --noEmit --project server/tsconfig.json
git add server/validation.ts
git commit -m "feat: add recurring expense validation schemas"
```

---

### Task 3: Recurring expenses CRUD route

**Files:**
- Create: `server/routes/recurring.ts`

5 endpoints: GET / (list), POST / (create), PUT /:id (update), DELETE /:id (delete), PUT /:id/pause (toggle pause).

Each endpoint:
- Validates household membership
- Shared items visible to both users, personal only to creator
- Notifications via `notifyPartner` for shared items only
- Follows existing error handling pattern (try/catch + console.error)

See spec for notification types: `recurring_created`, `recurring_deleted`, `recurring_paused`, `recurring_resumed`.

- [ ] **Step 1: Create route file with all 5 endpoints**
- [ ] **Step 2: Build and commit**

```bash
npx tsc --noEmit --project server/tsconfig.json
git add server/routes/recurring.ts
git commit -m "feat: add recurring expenses CRUD routes"
```

---

### Task 4: Billing cycles route

**Files:**
- Create: `server/routes/cycles.ts`

3 endpoints:
- `GET /current` — get current month's cycle status
- `POST /request` — request cycle start (creates pending record, notifies partner)
- `POST /approve` — approve pending cycle. Requester cannot self-approve. On approve: generates expenses from all non-paused recurring items, updates cycle status, broadcasts notification to both users.

Expense generation: for each non-paused recurring_expense, INSERT into expenses table with today's date, paid_by from the recurring's creator.

- [ ] **Step 1: Create route file with 3 endpoints**
- [ ] **Step 2: Build and commit**

```bash
npx tsc --noEmit --project server/tsconfig.json
git add server/routes/cycles.ts
git commit -m "feat: add billing cycles routes (request/approve)"
```

---

### Task 5: Mount routes

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Import and mount**

```typescript
import recurringRouter from './routes/recurring.js';
import cyclesRouter from './routes/cycles.js';

// Add with other app.use lines:
app.use('/api/recurring', authenticateToken, recurringRouter);
app.use('/api/cycles', authenticateToken, cyclesRouter);
```

- [ ] **Step 2: Build and commit**

```bash
npx tsc --noEmit --project server/tsconfig.json
git add server/index.ts
git commit -m "feat: mount recurring and cycles routes"
```

---

### Task 6: Client API methods

**Files:**
- Modify: `src/api.ts`

- [ ] **Step 1: Add methods to Api class**

```typescript
// Recurring expenses
static async getRecurring() { return this.request('/recurring'); }
static async createRecurring(data: { name: string; emoji: string; amount: number; category: string; type: string; notes?: string }) {
  return this.request('/recurring', { method: 'POST', body: data });
}
static async updateRecurring(id: number, data: Record<string, unknown>) {
  return this.request(`/recurring/${id}`, { method: 'PUT', body: data });
}
static async deleteRecurring(id: number) { return this.request(`/recurring/${id}`, { method: 'DELETE' }); }
static async togglePauseRecurring(id: number) { return this.request(`/recurring/${id}/pause`, { method: 'PUT' }); }

// Billing cycles
static async getCurrentCycle() { return this.request('/cycles/current'); }
static async requestCycle() { return this.request('/cycles/request', { method: 'POST' }); }
static async approveCycle(cycleId: number) { return this.request('/cycles/approve', { method: 'POST', body: { cycle_id: cycleId } }); }
```

- [ ] **Step 2: Build and commit**

```bash
npx vite build --logLevel error
git add src/api.ts
git commit -m "feat: add recurring expenses and cycles API methods"
```

---

### Task 7: RecurringSection component

**Files:**
- Create: `src/components/RecurringSection.tsx`

Self-contained component that:
- Fetches recurring expenses and current cycle on mount
- Shows compact card with: header (title + total + cycle status badge), item list (emoji + name + amount + personal badge), approval banner if pending, action buttons (add + start cycle)
- Paused items shown at reduced opacity with "pausado" label
- Click item opens edit modal with: name, emoji (EmojiPicker), amount, category, type toggle, notes, pause/delete buttons
- Handles all CRUD + cycle request/approve internally

Props: `userId: number`, `onCycleApproved?: () => void`

Follow the mockup approved in brainstorming (compact card style).

- [ ] **Step 1: Create component**
- [ ] **Step 2: Build and commit**

```bash
npx vite build --logLevel error
git add src/components/RecurringSection.tsx
git commit -m "feat: add RecurringSection component"
```

---

### Task 8: Integrate into Dashboard

**Files:**
- Modify: `src/views/Dashboard.tsx`

- [ ] **Step 1: Import and render**

Add import:
```typescript
import { RecurringSection } from '../components/RecurringSection';
```

Insert between budget section and recent transactions section:
```tsx
<RecurringSection userId={user?.id ?? 0} onCycleApproved={loadDashboardData} />
```

- [ ] **Step 2: Build and commit**

```bash
npx vite build --logLevel error
git add src/views/Dashboard.tsx
git commit -m "feat: integrate RecurringSection into Dashboard"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full build (client + server)**

```bash
npx vite build --logLevel error
npx tsc --noEmit --project server/tsconfig.json
```

- [ ] **Step 2: Manual testing**

Start dev server, verify:
- Dashboard shows "Gastos fijos" section
- Add/edit/pause/delete recurring expenses work
- Cycle request sends notification
- Cycle approve generates expenses
- Notifications fire for shared actions

- [ ] **Step 3: Commit any fixes**
