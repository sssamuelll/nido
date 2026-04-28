# Agent notes for Nido

Map for the next agent (or human) entering this repo. Keep this file short and load-bearing — pointers, not prose. Long-form lives in `docs/`.

---

## Stack

- **Frontend**: React 18 + TypeScript + Vite. State via `useState`/custom hooks (no Redux/Zustand/Jotai). Router: react-router-dom. Tests: vitest.
- **Backend**: Express + SQLite (the `sqlite` npm wrapper, NOT better-sqlite3). Auth via passkeys (WebAuthn) + PIN. Tests: vitest.
- **Data layer**: SQLite file (`nido.db`) on the deploy host. Migrations run on server boot from `server/db.ts`. **Not Automerge, not CRDT, no event sourcing** — straight relational with idempotent migrations recorded in a `migrations` table.
- **Deploy**: GitHub Actions → SSH rsync to `/var/www/nido` → `systemctl restart nido`. Production at `https://nido.sdar.dev`. Single host, single household ("El Nido": Samuel + María).

---

## Canonical helpers

When unsure whether a pattern already has a helper, search `src/lib/` and `src/components/` first. These are the load-bearing ones:

| Concern | Where | Use |
|---|---|---|
| Date helpers | `src/lib/dates.ts` | `todayISO`, `yesterdayISO` (DST-safe), `parseISODate` (midday-anchor), `formatDateLabel` ("Hoy"/"Ayer"/"27 Abr") |
| Money formatting | `src/lib/money.ts` | `formatMoney` (compact `€1.234`), `formatMoneyExact` (céntimos `€1.234,50`) |
| Cycle classification | `src/lib/resolveCycleForDate.ts` | Returns `'in-active' \| 'in-closed' \| 'no-cycle'` for a given date |
| API error handler (user-init) | `src/lib/handleApiError.ts` | `handleApiError(err, fallback)` for any user-initiated catch |
| Cycle type | `src/api-types/cycles.ts` | `CycleInfo` — Zod-derived single source of truth |
| Loading screen | `src/components/LoadingScreen.tsx` | Full-page `<LoadingScreen text?="..." />` |
| Error view (Cat 4) | `src/components/ErrorView.tsx` | `<ErrorView message={...} onRetry={...} />` |
| Toast | `src/components/Toast.ts` | `showToast(msg, variant?)` — variants: `'success'`, `'error'`, `'info'` (default) |

---

## Error handling taxonomy

Two orthogonal axes: **sync vs async** × **user-initiated vs automatic**. Five categories:

| Cat | What | Pattern |
|---|---|---|
| 1 | Sync validation pre-submit ("Ingresa un monto") | `showToast(msg)` neutral, OR `setError(string)` + inline render for forms |
| 2 | Async expected-fail (server says no) | `handleApiError(err, fallback)` |
| 3 user-init | Async unexpected during a button/submit | `handleApiError(err, fallback)` (same as Cat 2 — call site can't distinguish) |
| 3 auto | Async unexpected during background load/poll | `handleApiError(err, fallback, { silent: true })` — logs through the central funnel without a toast |
| 4 | Page's primary fetch failed, page can't render | `<ErrorView message={...} onRetry={...} />` |
| 5 | User-initiated action succeeded | `showToast(msg, 'success')` |

**Mnemonic**: if the user is waiting for feedback, give it. Otherwise, just log.

**Cat 1 stays neutral** (info) — validations guide the user; they are not system failures. Red is for actual errors.

**Form pattern preserved**: Login, Setup, AddExpense submit forms keep `setError(string)` + inline render below the form. AGENTS-approved deviation from "everything goes through showToast" because inline-near-input is better UX for forms.

---

## 401 has its own channel — do not replicate

`src/api.ts` registers a global `unauthorizedHandler` (`Api.setUnauthorizedHandler`) that fires whenever a non-auth endpoint returns 401. The auth provider redirects to login. **Do not catch 401 in feature code, do not show toasts for 401, do not treat it as Cat 2.**

If you want to know "am I logged in?", call `Api.getMe()` and treat its rejection accordingly — don't watch raw 401 status from other endpoints.

---

## Product conventions cemented

These are decisions made with María, not technical choices the agent gets to revisit:

- **Céntimos visible only on**: individual transaction rows, Samuel↔María balance, recurring rows. Everything else (KPIs, breakdowns, event/goal cards, headlines) uses compact integers. Helpers `formatMoney` / `formatMoneyExact` enforce this.
- **Currency prefix `€X` no space**, not `X €`. Mobile readability over strict es-ES standard. One-line switch in `src/lib/money.ts` if ever wanted.
- **Date display: 4 distinct formats by view** (Goals/AddExpense `Hoy`/`Ayer`/`27 Abr`, Dashboard `Lun 27`, History `Hoy — 27 Abr`, EventDetail `LUN 27`). Documented as drift in `docs/HALLAZGOS.md`; UX call still pending.
- **Validation toasts neutral, not red**. Red is reserved for actual failures.

---

## Architectural notes

- **Cycle attribution**: the `expenses` table has both `date` and an optional `cycle_id` (override). Default behavior is date-based attribution; `cycle_id` only set when the user explicitly back-dates an expense and chooses to keep it in a different cycle from where its date naturally falls. Hybrid predicate `(cycle_id = ? OR (cycle_id IS NULL AND date in range))` applied across `/summary`, `/api/expenses` list, `/api/analytics`. See PR #213, spec at `docs/superpowers/specs/2026-04-27-past-cycle-expense-attribution-design.md`.
- **Recurring expenses materialize at creation**: when a user creates a recurring during an active cycle, an expense row is inserted immediately AND `last_registered_cycle_id` is stamped, so the next cycle activation doesn't double-charge. See PR #211.
- **Categories self-heal**: when POST `/api/categories` creates a new category row, the server also UPDATEs any orphan expenses (`category_id IS NULL` matching name + household + context) to point at the new id. Plus a one-time backfill migration `backfill_expense_category_ids` for existing data. See PR #215.
- **Events have `context` (shared/personal)**: an event is one or the other, with its own `budget_amount`. Personal expenses tagged to a shared event don't consume the shared budget — `total_spent` aggregations filter by `expenses.type = events.context`. Expense lists in event detail show all expenses regardless. See PR #217.

---

## Pending findings

`docs/HALLAZGOS.md` is the running ledger of things noticed during refactors that weren't unified in their PR. Skim it before starting unrelated work — sometimes a "small" task touches a known parking-lot item.

Notable open items as of 2026-04-28:
- **`RecurringSection.tsx:113` `requested_by` mismatch** — actionable bug ticket. Failing test at `src/components/RecurringSection.bug.test.ts` (uses `it.fails`). When fixed, the test starts failing → delete the file.
- **Date-format UX drift** (4 formats across views) — UX decision needed.
- **4-digit thousands separator** — `Intl.NumberFormat('es-ES')` doesn't add separators below 5 digits by default. Product call if "fintech-style" is wanted.

---

## Layout

```
nido/
├── server/                    # Express + SQLite
│   ├── db.ts                  # schema + migrations + helpers
│   ├── index.ts               # app + non-router routes (categories, household members, PIN)
│   ├── routes/                # one file per resource (expenses, cycles, events, etc.)
│   ├── validation.ts          # Zod schemas for inputs and query params
│   └── *.test.ts              # vitest, mostly mock-DB
├── src/                       # React app
│   ├── api.ts                 # Api class — every backend call goes through here
│   ├── api-types/             # Zod parsers + types for backend responses
│   ├── lib/                   # pure helpers (dates, money, error, resolver)
│   ├── components/            # shared UI
│   ├── views/                 # routed pages
│   ├── hooks/                 # custom hooks
│   └── styles/global.css      # Tailwind-less CSS (utility classes are bespoke)
├── docs/
│   ├── HALLAZGOS.md           # findings parking lot
│   ├── superpowers/specs/     # design specs for major features
│   └── superpowers/plans/     # implementation plans
└── AGENTS.md                  # this file
```

---

## Editing rules of thumb

- **Don't add features beyond what the task requires.** No "while I'm here" cleanups, no premature abstractions.
- **Don't introduce dependencies without explicit user approval.**
- **Don't touch `Api.unauthorizedHandler` in feature code.**
- **Don't rename variables for type-naming consistency** (`activeCycle: CycleInfo` is fine; the setter stays `setActiveCycle`, named for what it holds, not its type).
- **Migrations are idempotent and recorded** — copy the pattern from existing migrations in `server/db.ts`.
- **For UI/UX changes, test in a browser before claiming done.** Type-check and unit tests verify code correctness, not feature correctness.
