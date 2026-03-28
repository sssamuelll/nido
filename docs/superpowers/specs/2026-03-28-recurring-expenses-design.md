# Recurring Expenses Design Spec

**Date:** 2026-03-28
**Issue:** #86

## Goal

Allow users to define recurring expenses (rent, utilities, subscriptions) that get automatically generated as real expenses when a billing cycle is initiated and approved by both users.

## Key Decisions

- **Cycle trigger:** Manual — a user clicks "Iniciar ciclo" when María gets paid. No fixed calendar date.
- **Approval:** Both users must approve cycle start (like budget changes).
- **Scope:** Recurrentes can be shared or personal.
- **Pausable:** Individual recurrentes can be paused without deleting.
- **Generation:** On cycle approval, all non-paused recurrentes become real expenses immediately.

## Data Model

### `recurring_expenses` table
```sql
CREATE TABLE recurring_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
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
```

### `billing_cycles` table
```sql
CREATE TABLE billing_cycles (
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

## API Endpoints

### Recurring expenses
- `GET /api/recurring` — list all for household
- `POST /api/recurring` — create (body: name, emoji, amount, category, type, notes?)
- `PUT /api/recurring/:id` — update fields
- `DELETE /api/recurring/:id` — delete
- `PUT /api/recurring/:id/pause` — toggle paused state

### Billing cycles
- `GET /api/cycles/current` — current month's cycle status
- `POST /api/cycles/request` — request cycle start (creates pending cycle)
- `POST /api/cycles/approve` — approve pending cycle → generates expenses

## Cycle Approval Flow

1. User A clicks "Iniciar ciclo"
2. Server creates `billing_cycles` row with status=pending
3. Notification sent to User B: `cycle_requested`
4. User B clicks "Aprobar"
5. Server:
   - Updates cycle to status=active, sets started_at
   - For each non-paused recurring_expense: creates an expense in `expenses` table with current month's date, paid_by = the user who created the recurring
   - Sends notification to both: `cycle_approved` with count and total
6. If User A tries to request when a cycle already exists for this month: rejected

## Notifications

| Type | Title | Body | Recipient |
|------|-------|------|-----------|
| `cycle_requested` | Nuevo ciclo | "{name} solicitó iniciar el ciclo" | Partner |
| `cycle_approved` | Ciclo iniciado | "{name} aprobó el ciclo — X gastos (€Y)" | Partner |
| `recurring_created` | Nuevo gasto fijo | "{name} añadió {expense} (€{amount})" | Partner (shared only) |
| `recurring_paused` | Gasto fijo pausado | "{name} pausó {expense}" | Partner (shared only) |
| `recurring_resumed` | Gasto fijo activado | "{name} activó {expense}" | Partner (shared only) |

## Dashboard UI

Section "Gastos fijos" in the Dashboard (compact card style):

- Header: "Gastos fijos del ciclo" + total amount
- Badge: cycle status (Activo / Pendiente / Sin ciclo)
- List: emoji + name + amount per recurring, with "personal" badge if applicable
- Paused items shown with reduced opacity + "pausado" label
- Footer buttons: "Añadir recurrente" + "Iniciar ciclo" (or "Pendiente de aprobación")
- Click on item → edit modal (name, emoji, amount, category, type, notes, pause/delete)

## Personal recurrentes

- Personal recurrentes are only visible to the owner
- When cycle generates expenses, personal ones get `paid_by` = the creator's username
- No notification for personal recurring create/edit/pause (same pattern as personal expenses)
