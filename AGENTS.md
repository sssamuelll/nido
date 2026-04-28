# Agent notes for Nido

Conventions and gotchas that an AI coding agent (or human reading this for the first time) needs to know before touching code. Keep this file short and load-bearing — do not add prose that is "nice to know but optional".

---

## Error handling taxonomy

Nido errors live on two orthogonal axes: **sync vs async** × **user-initiated vs automatic**. The 5 categories that fall out of those axes:

| Cat | What | Pattern |
|---|---|---|
| 1 | Sync validation pre-submit ("Ingresa un monto") | `showToast(msg)` neutral (info), or `setError(string)` + inline render for forms |
| 2 | Async operation expected-but-falible (server says no) | `handleApiError(err, fallback)` |
| 3 user-init | Async unexpected during a button click / submit | `handleApiError(err, fallback)` (same as Cat 2 — call site can't distinguish) |
| 3 auto | Async unexpected during background load / polling | `console.error('contexto:', err)` — silent for user |
| 4 | The page's primary fetch failed and the page can't render | `<ErrorView message={...} onRetry={...} />` |
| 5 | Success of a user-initiated action | `showToast(msg, 'success')` |

**Entry point**: `src/lib/handleApiError.ts`. Use it for any `catch` block in a user-initiated async flow.

**Mnemonic**: if the user is waiting for feedback, give it. If they are not (mount load, polling, background refresh), do not interrupt them — just log.

**Cat 1 is neutral, not red.** Validation messages guide the user; they are not system failures.

## 401 has its own channel — do not replicate

`src/api.ts` registers a global `unauthorizedHandler` (`Api.setUnauthorizedHandler`) that fires whenever a non-auth endpoint returns 401. The auth provider redirects to login. **Do not catch 401 in feature code, do not show toasts for 401, do not treat it as Cat 2.** The handler is the single source of truth.

If you want to know "am I logged in?", call `Api.getMe()` and treat its rejection accordingly — don't watch raw 401 status from other endpoints.

---

## Other conventions

- Money formatting: `src/lib/money.ts` (`formatMoney` for compact KPIs, `formatMoneyExact` for individual-row céntimos).
- Date helpers: `src/lib/dates.ts` (`todayISO`, `yesterdayISO`, `parseISODate`, `formatDateLabel`).
- Loading screen: `src/components/LoadingScreen.tsx`.
- Cycle classification (in-active / in-closed / no-cycle): `src/lib/resolveCycleForDate.ts`.

When unsure whether a pattern already has a canonical helper, search `src/lib/` and `src/components/` first.
