# Past-cycle expense attribution

**Date:** 2026-04-27
**Status:** spec

## Problem

A user adds an expense for a date that falls outside the currently active billing cycle (forgot a bill, late receipt). Today the expense is saved with the chosen date and is excluded from the active-cycle dashboard, but:

- If the date falls in a previously closed cycle, the expense appears in History when navigating to that cycle. Acceptable.
- If the date is **before any** existing billing cycle, the expense is invisible in every cycle-bound view. Orphaned.
- Either way, there is no UI cue at submit time telling the user "this date is outside the current cycle" — silent attribution.

The user also wants the option to **force** an expense into a specific cycle while keeping its real date (e.g. "I bought it Friday but I want it to count this cycle's budget").

## Approach

Two changes:

1. **Data**: add an optional `cycle_id` override on `expenses`. NULL → attribute by date-range (current behavior). NOT NULL → attribute to that specific cycle regardless of date. The user-picked date is always preserved.
2. **UI**: in AddExpense, when the chosen date does not fall in the active cycle, show a segmented toggle below the date picker letting the user pick: "Ciclo de esa fecha" (default, when a covering cycle exists) vs "Ciclo actual".

Default behavior is unchanged for any expense whose date falls inside the active cycle — no toggle, no extra clicks.

## Data model

### `expenses.cycle_id` (new column)

```sql
ALTER TABLE expenses ADD COLUMN cycle_id INTEGER REFERENCES billing_cycles(id) ON DELETE SET NULL;
CREATE INDEX idx_expenses_cycle_id ON expenses(cycle_id);
```

- NULL: date-based attribution (default).
- NOT NULL: explicit override, takes precedence over date-range matching.
- `ON DELETE SET NULL`: if the referenced cycle is deleted, the expense falls back to date-based attribution. No cascade because we don't want to lose the expense itself.

### Normalization rule

When persisting `cycle_id`:

- If the supplied `cycle_id` corresponds to a cycle whose date range already covers the expense's `date`, store `cycle_id = NULL`. The override is redundant.
- Otherwise store the supplied `cycle_id`.

Rationale: keeps the column minimally populated. Future queries do not have to consider redundant overrides. Matches the "honest data" preference of the project.

### Migration

`expenses_add_cycle_id` (one-shot, recorded in `migrations` table):

1. Add column via `ensureColumn` (idempotent).
2. Create the index.
3. No backfill. All pre-existing rows keep `cycle_id = NULL` and continue to behave by date-range. Zero retroactive change.

## Backend

### Cycle membership predicate

Replace the current `(date >= ? AND (? IS NULL OR date < ?))` filter (used in `summary`, history list, analytics, events) with:

```sql
(
  expenses.cycle_id = ?            -- explicit override
  OR (
    expenses.cycle_id IS NULL
    AND date >= ?                  -- date-based, current behavior
    AND (? IS NULL OR date < ?)
  )
)
```

Parameters: `cycleId, startDate, endDate, endDate`. The `cycleId` parameter is the cycle whose membership is being queried (not necessarily the active one — e.g. when History navigates a past cycle, that cycle's id is bound here).

This predicate preserves 100% of behavior for expenses without override and respects the override when set. Apply in:

- `server/routes/expenses.ts`: `visibleExpensesWhereRange` constant and `/summary` aggregation.
- `server/routes/analytics.ts`: cycle-bound queries.
- `server/routes/events.ts`: where event totals overlap with cycle ranges.
- `History.tsx` route: `Api.getExpenses({ start_date, end_date })` already passes the range; the route handler needs to also pass the cycle id when known.

> Note: `getExpenses` will need to accept `cycle_id?: number` so the History view can pass the navigated cycle's id alongside the date range. Without `cycle_id`, the predicate degrades to date-only (today's behavior).

### Endpoints accepting `cycle_id`

- `POST /api/expenses` — accept optional `cycle_id` in body. Validate it belongs to the requester's household. Apply normalization rule before insert.
- `PUT /api/expenses/:id` — same.
- `POST /api/recurring` and `activateCycle`'s materialization continue to insert with `cycle_id = NULL` (the date is set to today, which always falls in the active cycle, so no override needed).

### Validation

`expenseUpsertSchema` (or wherever expense input is validated) gains:

```ts
cycle_id: z.number().int().positive().nullable().optional()
```

Server-side, additionally verify `cycle.household_id === user.household_id`. Reject with 400 otherwise.

## Frontend

### Helper

Pure helper, easy to unit test:

```ts
type CycleResolution =
  | { kind: 'in-active'; cycle: Cycle }       // date is in active cycle — no toggle needed
  | { kind: 'in-closed'; cycle: Cycle }       // date is in a past closed cycle — toggle with default = past cycle
  | { kind: 'no-cycle' }                      // date is before any cycle — toggle with only "active" available

function resolveCycleForDate(date: string, cycles: Cycle[]): CycleResolution
```

### AddExpense

Below the date picker, render the toggle conditionally:

- `kind === 'in-active'`: render nothing.
- `kind === 'in-closed'`:
  ```
  ⓘ Esta fecha cae fuera del ciclo actual
  [ Ciclo {cycle.label} ✓ ] [ Ciclo actual ]
  ```
  Default selected: cycle of the date. State `targetCycleId = cycle.id`. If user toggles to "Ciclo actual", `targetCycleId = activeCycle.id`.
- `kind === 'no-cycle'`:
  ```
  ⓘ No hay ciclo registrado en esa fecha
  [ Ciclo de esa fecha (sin datos) ] [ Ciclo actual ✓ ]
  ```
  Left option disabled/greyed. Right pre-selected. State `targetCycleId = activeCycle.id`.

Visual: same `type-sel` segmented-control pattern already used by Compartido/Personal — consistency and zero new component.

### Submit

`Api.createExpense` payload gains `cycle_id`. The form computes:

```ts
const cycleId = targetCycleId ?? null;
```

Backend handles normalization, so the frontend can submit the override even if it would be redundant — the server will write NULL.

### History edit modal

The same toggle appears when editing an existing expense whose date is moved across cycle boundaries. Initial state derives from the expense's existing `cycle_id` and current date.

### State plumbing

- New: `targetCycleId: number | null` in form state, `activeCycle` and `cycles` already loaded somewhere.
- Touch points: `src/views/AddExpense.tsx`, `src/views/History.tsx` (edit modal), `src/api.ts` (typing).

## Edge cases

| Case | Behavior |
|---|---|
| Date is in active cycle | No toggle; `cycle_id = NULL` always. |
| Date is in closed cycle, user keeps default | `cycle_id = NULL` (date-based attribution to closed cycle). |
| Date is in closed cycle, user picks "Ciclo actual" | `cycle_id = activeCycle.id`. |
| Date is before any cycle | Toggle shown with only "Ciclo actual" actionable. `cycle_id = activeCycle.id`. |
| Editing an expense, change date so it now falls naturally in the assigned cycle | Server normalizes `cycle_id` to NULL on save. |
| Editing an expense with override, user changes date to a different cycle | Toggle appears again, user re-decides. |
| Cycle is deleted | `ON DELETE SET NULL` — expense reverts to date-based. |
| Expense linked to an event (`event_id`) | `cycle_id` and `event_id` are independent. Event totals already use their own date range. No conflict. |
| Recurring materialization (`activateCycle`) | Inserts `cycle_id = NULL`. Date is today, which falls in the active cycle naturally. |
| Past-dated recurring creation (POST `/api/recurring`) — see PR #211 | Same: inserts `cycle_id = NULL`, date = today. |

## Testing

Backend:
- `expenses.test.ts`: summary returns expense with `cycle_id` override even when its date falls in another cycle.
- `expenses.test.ts`: summary excludes an expense whose `cycle_id` points elsewhere despite date in range.
- `expenses.test.ts`: POST normalizes `cycle_id = NULL` when date already covers it.
- `expenses.test.ts`: POST rejects `cycle_id` from another household.

Frontend:
- `resolveCycleForDate` unit tests covering the three `kind` outcomes.
- (Stretch) component test for the toggle visibility based on date selection.

## Out of scope

- Per-cycle category budget snapshots in the History view (already exist as `category_budget_snapshots` but the breakdown queries don't read them — separate spec).
- Retroactive cycle creation from the form ("create a March cycle to put this expense in").
- Bulk move expenses across cycles.

## Migration & rollout

- Database: idempotent migration runs on next server boot via `tsx watch` locally and via deploy on production. No backfill, zero behavior change for existing data.
- Frontend & backend ship together in a single PR. The frontend never sends `cycle_id` for in-active-cycle dates, so the API change is additive and safe.
- No feature flag needed — the toggle only appears when relevant; users with no past cycles never see it.
