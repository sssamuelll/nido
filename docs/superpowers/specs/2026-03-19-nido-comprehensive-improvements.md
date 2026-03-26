# Nido Comprehensive Improvements — Design Spec

**Date:** 2026-03-19
**Status:** Approved
**Approach:** Vertical per feature (DB → API → Frontend → Tests)

## Overview

Nido is structurally strong: auth, expenses, budgets, categories, sidebar, PWA, and animations all work in production. This spec covers five improvements to fill the remaining gaps and bring the product to full completion.

**Execution order:**

1. Fix failing tests (stabilize the base)
2. Goals persistence (shared + personal)
3. Analytics with real data + actionable insights
4. NotificationCenter (in-app events)
5. Type safety cleanup (eliminate `any` throughout)

Each step leaves the project deployable.

---

## 1. Fix Failing Tests

### Current State

11 tests failing across 5 files:

| File | Failures | Root Cause |
|------|----------|------------|
| `server/validation.test.ts` | 6 | Zod schemas evolved with auth-v2, tests expect old format |
| `server/routes/budgets.test.ts` | 2 | Endpoint now filters by authenticated user; tests don't mock session |
| `server/db.test.ts` | 1 | Budget creation changed with allocations model |
| `src/views/privacy.test.ts` | 2 | `getPersonalBalanceCardModel` shape changed |
| `src/components/Sidebar.test.tsx` | 1 | React preamble error — vitest config issue |

### Approach

- Update each test to reflect current code behavior (don't change code to match old tests)
- Fix vitest config for React component preamble in `Sidebar.test.tsx`
- Verify full suite passes before touching any feature code

---

## 2. Goals — Full Persistence

### Database Schema

**Table: `goals`**

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| household_id | TEXT | NOT NULL, FK → households |
| name | TEXT | NOT NULL |
| icon | TEXT | Emoji or icon identifier |
| target | REAL | NOT NULL |
| current | REAL | DEFAULT 0 |
| deadline | TEXT | Free-form, e.g. "Jul 2026" |
| owner_type | TEXT | NOT NULL — 'shared' or 'personal' |
| owner_user_id | INTEGER | NULL, FK → app_users (NULL when owner_type='shared') |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

**Privacy filtering for `GET /api/goals`:**
- Returns goals where `owner_type = 'shared'` OR (`owner_type = 'personal'` AND `owner_user_id = current_user.id`)
- This uses `app_user_id` (not username strings), consistent with `budget_allocations` and `goal_contributions`

**Table: `goal_contributions`**

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| goal_id | INTEGER | NOT NULL, FK → goals |
| app_user_id | INTEGER | NOT NULL, FK → app_users |
| amount | REAL | NOT NULL |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

Contributions are tracked separately to know who contributed what — feeds into NotificationCenter.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/goals` | List goals (shared + current user's personal) |
| POST | `/api/goals` | Create goal |
| PUT | `/api/goals/:id` | Update goal (name, target, deadline, icon) |
| DELETE | `/api/goals/:id` | Delete goal |
| POST | `/api/goals/:id/contribute` | Register contribution `{ amount }` |

**Privacy rules:**
- Shared goals: visible and editable by both users
- Personal goals: visible and editable only by owner
- `current` field is auto-updated when contribution is registered (sum of contributions)

### Frontend Changes

- Replace `MOCK_GOALS` in `Goals.tsx` with `useEffect` fetch to `/api/goals`
- `handleContribute` calls `POST /api/goals/:id/contribute`
- Implement "Nuevo Objetivo" modal (inline modal, same pattern as category command palette)
- Implement "Editar" modal for existing goals
- Keep confetti + toast on contributions
- Update `Goal` type in `types.ts` to match API response shape:
  ```typescript
  interface GoalResponse {
    id: number;
    name: string;
    icon: string;          // emoji string (UI maps to SVG)
    target: number;
    current: number;
    deadline: string | null;
    owner_type: 'shared' | 'personal';
    owner_user_id: number | null;
    created_at: string;
  }
  ```

### Tests

- CRUD route tests (create, read, update, delete)
- Contribution endpoint test
- Privacy test: user A cannot see user B's personal goals
- Frontend: goal list renders from API data

---

## 3. Analytics — Real Data + Actionable Insights

### Backend — New Endpoint

**`GET /api/analytics?months=6&context=shared|personal`**

Response shape:

```typescript
interface AnalyticsResponse {
  // Monthly evolution (for bar chart)
  monthly: Array<{ month: string; total: number }>;

  // KPIs for selected period
  kpis: {
    totalSpent: number;
    netSavings: number;       // context=shared: shared_available - totalSharedSpent; context=personal: personal_allocation - personalSpent
    avgTicket: number;
    totalExpenses: number;    // count
    vsPrevPeriod: number;     // % change vs previous period
  };

  // Category breakdown
  categories: Array<{
    name: string;
    amount: number;
    pct: number;
    color: string;
  }>;

  // Generated insights
  insights: Array<{
    type: 'positive' | 'warning' | 'tip';
    message: string;
  }>;
}
```

### Insight Rules (deterministic, no ML)

| Rule | Condition | Type | Example |
|------|-----------|------|---------|
| Positive trend | Spent less than previous month | positive | "Gastaron 12% menos. Recorte principal: Restaurant." |
| Budget alert | Category > 80% of budget | warning | "Restaurant está al 92% del presupuesto." |
| Projection | Extrapolate current month spending | tip | "Si mantienen este ritmo, cerrarán con €420 de ahorro." |
| Anomaly | Category > 30% above its average | warning | "Ocio subió un 45% respecto a vuestra media." |
| Savings streak | 3+ consecutive months with savings | positive | "Llevan 3 meses ahorrando. ¿Crear un objetivo?" |

Insights are generated server-side. Frontend only renders them.

### Frontend Changes

- Replace all `MOCK_*` constants in `Analytics.tsx` with fetch to `/api/analytics`
- Period pills (`3M`, `6M`, `1A`, `Todo`) map to `months` param (3, 6, 12, 0)
- Shared/personal tabs pass `context` param
- Insight cards render `insights[]` array with color based on `type`:
  - `positive` → green
  - `warning` → orange/red
  - `tip` → blue

### Tests

- Endpoint test with multi-month expense data
- Each insight rule tested individually with specific data scenarios
- Category percentage calculations

---

## 4. NotificationCenter — In-App Events

### Database Schema

**Table: `notifications`**

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| household_id | TEXT | NOT NULL, FK → households |
| recipient_user_id | INTEGER | NULL (NULL = broadcast to all) |
| type | TEXT | NOT NULL — see types below |
| title | TEXT | NOT NULL |
| body | TEXT | |
| metadata | TEXT | JSON with relevant IDs |
| read | INTEGER | DEFAULT 0 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

**Notification types:** `expense_added`, `budget_warning`, `goal_contribution`, `goal_reached`

### Generation — Side Effects on Existing Actions

Notifications are created as side effects, not a separate system:

| Trigger | Notification | Recipient |
|---------|-------------|-----------|
| `POST /api/expenses` | "María añadió €45 en Restaurant" | Other user |
| `POST /api/goals/:id/contribute` | "Samuel aportó €50 a Vacaciones" | Other user |
| `GET /api/expenses/summary` | "Presupuesto de Restaurant al 87%" | Both (if not already generated for this month/category) |
| Goal `current >= target` | "¡Objetivo 'Vacaciones' completado!" | Both |

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | List user's notifications (own + broadcast), ordered by date |
| PUT | `/api/notifications/:id/read` | Mark as read |
| POST | `/api/notifications/read-all` | Mark all as read |

### Frontend Changes

**API client (`src/api.ts`):** Add missing methods — `Api.getNotifications()`, `Api.markNotificationAsRead(id)`, `Api.markAllNotificationsRead()`. These do not exist yet.

**Reconcile existing `NotificationCenter.tsx`:** The existing component uses `message` and `is_read` field names, but the DB schema uses `body` and `read`. The API response must map DB columns to the component's expected interface: `{ id, type, title, message (from body), is_read (from read), metadata, created_at }`. The existing component also has `budget_approval` type logic (`handleApprove`, `onBudgetApproved`) — remove this, it's not in scope.

- Connect `NotificationCenter.tsx` to the bell icon in Dashboard header
- Dropdown panel with notification list
- Badge with unread count on bell icon
- Click on notification marks it as read
- Poll or refetch on page navigation (no WebSocket needed)

### Tests

- Auto-creation on expense add
- Auto-creation on goal contribution
- Privacy: user only sees their own notifications
- Mark as read / read-all

---

## 5. Type Safety — Eliminate `any`

### Scope

~20 `any` usages across frontend and backend.

### Key Fixes

| Location | Current | Target |
|----------|---------|--------|
| `ApiOptions.body` | `any` | Generic `Api.post<T>(url, body: T)` |
| Route handlers `req.body` | `any` | `z.infer<typeof schema>` from existing Zod schemas |
| Server responses | untyped | `ExpenseResponse`, `GoalResponse`, `NotificationResponse` interfaces |
| `recentTransactions: any[]` in Dashboard | `any[]` | `Expense[]` from `types.ts` |
| Component callbacks (`tx: any`, `cat: any`) | `any` | Concrete types |

### Approach

Not a separate pass at the end. As each feature touches files, types are cleaned up in that same PR. Final sweep catches any remaining.

### Verification

- `tsc --noEmit` passes with zero errors as the gate
