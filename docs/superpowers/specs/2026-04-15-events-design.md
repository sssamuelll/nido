# Events Feature — Design Spec

## Problem

When tracking expenses during a trip or special occasion, lumping everything into a single category ("Viaje") loses granularity. Users need a way to group expenses under a time-bounded event while still categorizing each expense normally (Restauración, Transporte, etc.). This enables per-event budget tracking, category breakdowns, and transaction history — all isolated from the regular cycle-based flow.

## Naming

The feature is called **"Evento"** everywhere — UI, code, API, database. No aliases (viaje, trip, super categoría).

## Data Model

### New table: `events`

```sql
CREATE TABLE events (
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);
```

### New table: `event_categories`

Subcategories specific to an event that don't exist globally.

```sql
CREATE TABLE event_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  color TEXT NOT NULL,
  UNIQUE(event_id, name)
);
```

### Modification to `expenses`

```sql
ALTER TABLE expenses ADD COLUMN event_id INTEGER REFERENCES events(id) ON DELETE SET NULL;
```

### Relationships

```
expense.category_id  → categories.id    (what kind of expense)
expense.event_id     → events.id        (in which event context)
events.goal_id       → goals.id         (funding source)
```

### Funding logic

- If `event.goal_id` is set → budget comes from the linked goal's savings
- If `event.goal_id` is NULL → budget is standalone (doesn't subtract from household shared budget)
- The event's `budget_amount` is always explicit — the goal link is informational/tracking

## API Endpoints

### CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/events` | List events for household. Query params: `context` (shared/personal), `start_date`, `end_date` |
| `GET` | `/events/:id` | Full event detail: event metadata + KPIs + category breakdown + expenses |
| `POST` | `/events` | Create event |
| `PUT` | `/events/:id` | Update event |
| `DELETE` | `/events/:id` | Delete event (expenses lose event_id, are not deleted) |

### `GET /events/:id` response

```json
{
  "event": {
    "id": 1,
    "name": "Spain Trip 2024",
    "emoji": "🇪🇸",
    "budget_amount": 2500,
    "start_date": "2026-04-08",
    "end_date": "2026-04-15",
    "goal_id": 3,
    "context": "shared"
  },
  "kpis": {
    "budget": 2500,
    "spent": 1875,
    "remaining": 625
  },
  "categories": [
    { "name": "Restauración", "emoji": "🍽️", "color": "#F87171", "amount": 750, "pct": 40 },
    { "name": "Transporte", "emoji": "🚗", "color": "#60A5FA", "amount": 468.75, "pct": 25 }
  ],
  "expenses": [
    {
      "id": 10,
      "description": "Cena en La Boqueria",
      "amount": 85.50,
      "category": "Restauración",
      "date": "2026-04-12",
      "paid_by": "maria"
    }
  ]
}
```

### Modifications to existing endpoints

**`POST /expenses`** and **`PUT /expenses/:id`**: Accept optional `event_id` field. Validate event exists and belongs to the household.

**`GET /expenses`**: Accept optional `event_id` query param to filter expenses by event.

## UI: CategoryModal — Event Toggle

The existing CategoryModal is NOT restructured. A toggle is added that reveals extra fields via progressive disclosure.

### Toggle behavior

- Position: after the subtitle, before the name field
- Default: off
- Label when off: "Convertir en evento"
- Label when on: "Evento" (highlighted)

### When toggle is ON, extra fields appear (below existing fields)

All existing fields remain (name, emoji, color, budget/límite):
- **Fecha inicio** — date input, required
- **Fecha fin** — date input, required
- **Fondeo** — dropdown select:
  - "Presupuesto compartido" (default, goal_id = null)
  - List of shared goals with current savings balance (e.g., "🎯 Viaje España (€3,200)")

### When toggle is OFF

Modal works exactly as today. No changes.

### Edit mode

When editing an event, toggle is ON and fields are populated. User can turn toggle OFF to "demote" back to regular category — this deletes the event row and sets `event_id = NULL` on all linked expenses (they become regular expenses). A confirmation dialog warns: "Los gastos asociados se mantendrán pero ya no estarán vinculados al evento."

## UI: Dashboard — Event Cards in Budget List

Events appear in the same budget category list in Dashboard's "Presupuesto" section.

### Ordering

1. Active events (end_date >= today), sorted by nearest end_date first
2. Finalized events of the current cycle (end_date < today), with reduced opacity
3. Regular categories (as today)

### Event card layout

Same budget-item structure but with:
- **Badge**: green pill "Evento" at top-left
- **Name**: event name (instead of category name)
- **Meta**: "X días restantes" (calculated from end_date - today)
- **Amount**: total spent (right-aligned)
- **Progress bar**: spent / budget_amount
- **Click action**: navigate to `/events/:id` (dedicated event view)

Finalized events show "Finalizado" instead of days remaining.

## UI: Event Detail View (`/events/:id`)

New route and view component: `src/views/EventDetail.tsx`

### Layout (top to bottom)

1. **Back link**: "← Volver al dashboard" — navigates to `/`
2. **Title**: Event emoji + name, large heading
3. **3 KPI cards** in a row:
   - Presupuesto Total: `budget_amount` + % used mini-bar
   - Gastado: total spent + green progress bar
   - Restante: `budget - spent` + yellow/orange progress bar
4. **Category donut chart**: Reuse `SpendingDonut` component from Analytics. Data comes from `GET /events/:id` → `categories` array. Same hover/click behavior.
5. **Transaction list**: Expenses grouped by date (descending). Each row shows: emoji + description + subcategory label + amount + paid_by. Same visual pattern as History view expense rows.

## UI: AddExpense — Event Dropdown

### Placement

After the CATEGORÍA selector, before the numpad.

### Behavior

- **Only visible** if there are active events (end_date >= today) for the current context (shared/personal)
- **Label**: "EVENTO (OPCIONAL)"
- **Dropdown**: shows active events with emoji + name
- **Default**: none selected (regular expense)
- **Selection**: sets `event_id` on the expense when submitted
- Pre-selects the event if the user navigated from an event detail view (via location state)
- When an event is selected, the category selector shows both global categories AND event-specific subcategories (from `event_categories`). Event subcategories appear first, marked with a subtle indicator.
- If the user types a new category name while an event is selected and it doesn't exist globally, it gets created as an `event_category` AND as a regular category (so the expense FK works)

## Scope Boundaries

### In scope
- Events CRUD (create, read, update, delete)
- Event toggle in CategoryModal with progressive disclosure
- Event cards in Dashboard budget list
- Event detail view with KPIs, donut, transactions
- Event dropdown in AddExpense
- Funding link to goals (informational)

### Out of scope
- Event notifications to partner
- Event-specific recurring expenses
- Event sharing/export
- Multi-event expense assignment (one expense → one event max)
- Event templates or duplication
