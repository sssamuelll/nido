# Eje D — Commit 5 handoff

Sesión nueva. Continúa Eje D Fase 3. Estado: commits 1–4 hechos, falta Commit 5
(mutaciones llaman `cacheBus.invalidate(...)` tras éxito).

> Lee este doc completo antes de tocar código. **No reinventes el inventario** —
> está abajo verificado con `grep` line-numbered.

---

## Estado del repo al cerrar la sesión anterior

- Branch: `main` (local). 15 commits ahead de `origin/main` antes del push;
  los commits viven también en la rama de batch pusheada (ver "Push" abajo).
- Working tree limpio.
- `npx tsc --noEmit -p tsconfig.json` → **31 errors** (deuda de strictness
  documentada en `docs/HALLAZGOS.md` secciones 6–8 — NO son tu problema).
- `npx vitest run` → **14 failed / 456 passed / 470 total**. Las 14 fallas
  son pre-existentes (rot de tests vs cambios de comportamiento previos —
  documentadas en `docs/HALLAZGOS.md` sección "Eje E.a — hallazgos").

## Commits ya hechos en Eje D

| # | Hash | Mensaje |
|---|---|---|
| 1 | `732bd16` | feat: cacheBus for cross-view invalidation (Eje D foundation) |
| 2 | `1821ae1` | feat: useResource/useAsyncEffect accept invalidationKey(s) (Eje D) |
| 3 | `7800f2b` | unify: subscribe multi-resource views to invalidation keys (Eje D) |
| 4 | `d1eec76` | unify: subscribe single-resource views to invalidation keys (Eje D) |

## API que vas a usar

```ts
import { CACHE_KEYS, cacheBus } from '../lib/cacheBus';

// Tras una mutación exitosa:
await Api.createExpense(...);
cacheBus.invalidate(CACHE_KEYS.expenses, CACHE_KEYS.summary, CACHE_KEYS.categories);
```

`CACHE_KEYS` es `as const` con union type `CacheKey`. Pasar un string que no
sea miembro del set fallará en tsc — eso es deliberado.

---

## Inventario completo de mutaciones (27 sitios in-scope)

Verificado con `grep -rn "Api\.\(create\|update\|delete\|contribute\|toggle\|approve\|request\|save\|mark\)" src/ --include="*.tsx" --include="*.ts" | grep -v "\.test\."`.
Cada fila: **archivo:línea** → llamada → keys que la mutación debe invalidar.

### Expenses (5 sitios → `expenses`, `summary`, `categories`)

| Archivo:línea | Llamada | Invalidate |
|---|---|---|
| `src/views/AddExpense.tsx:254` | `Api.createExpense(expenseData)` | `expenses`, `summary`, `categories` |
| `src/views/History.tsx:253` | `Api.deleteExpense(editingExpense.id)` (edit modal) | `expenses`, `summary`, `categories` |
| `src/views/History.tsx:269` | `Api.createExpense({...})` (duplicate) | `expenses`, `summary`, `categories` |
| `src/views/History.tsx:299` | `Api.updateExpense(...)` | `expenses`, `summary`, `categories` |
| `src/views/History.tsx:332` | `Api.deleteExpense(id)` (bulk) | `expenses`, `summary`, `categories` |

> **Por qué `categories`**: el server hace category self-heal en createExpense
> (PR #215) — puede crear categorías nuevas o backfillear `category_id`.

### Goals (4 sitios → `goals`)

| Archivo:línea | Llamada | Invalidate |
|---|---|---|
| `src/views/Goals.tsx:69` | `Api.contributeToGoal(id, amount)` | `goals` |
| `src/views/Goals.tsx:98` | `Api.deleteGoal(id)` | `goals` |
| `src/views/Goals.tsx:113` | `Api.updateGoal(editingGoal.id, ...)` | `goals` |
| `src/views/Goals.tsx:122` | `Api.createGoal({...})` | `goals` |

### Categories (3 sitios → `categories` ± `summary`)

| Archivo:línea | Llamada | Invalidate |
|---|---|---|
| `src/hooks/useCategoryModal.ts:56` | `Api.saveCategory({...})` | `categories` |
| `src/hooks/useCategoryModal.ts:82` | `Api.deleteCategory(existingCat.id)` | `categories`, `summary` |
| `src/views/AddExpense.tsx:696` | `Api.saveCategory({...})` (inline create from picker) | `categories` |

> **Por qué `summary` en delete pero no en save**: deleteCategory remueve un
> bucket; el summary's category breakdown cambia. saveCategory crea/edita pero
> el breakdown del summary se recompone vía expenses → ya está cubierto por
> mutaciones de expenses cuando aplique.

### Events (3 sitios → `events`)

| Archivo:línea | Llamada | Invalidate |
|---|---|---|
| `src/views/Dashboard.tsx:591` | `Api.updateEvent(editingEvent.id, eventData)` | `events` |
| `src/views/Dashboard.tsx:593` | `Api.createEvent(eventData)` | `events` |
| `src/views/Dashboard.tsx:614` | `Api.deleteEvent(editingEvent.id)` | `events` |

> **Por qué solo `events`**: events tienen budget propio (separado del household
> budget). EventDetail subscribe a `[events, expenses]` — esto cubre el detail.
> Dashboard subscribe a `events` directo. No invalidar `summary` aquí — el
> summary del household no ve event-level budgets.

### Budget (2 sitios → `budget`, `summary`)

| Archivo:línea | Llamada | Invalidate |
|---|---|---|
| `src/views/Settings.tsx:323` | `Api.updateHouseholdBudget({...})` | `budget`, `summary` |
| `src/views/Settings.tsx:345` | `Api.approveHouseholdBudget(...)` | `budget`, `summary` |

### Recurring (4 sitios → `recurring` ± `expenses`)

| Archivo:línea | Llamada | Invalidate |
|---|---|---|
| `src/components/RecurringSection.tsx:158` | `Api.updateRecurring(editItem.id, ...)` | `recurring` |
| `src/components/RecurringSection.tsx:169` | `Api.createRecurring({...})` | `recurring`, `expenses` |
| `src/components/RecurringSection.tsx:193` | `Api.togglePauseRecurring(editItem.id)` | `recurring` |
| `src/components/RecurringSection.tsx:208` | `Api.deleteRecurring(editItem.id)` | `recurring` |

> **Por qué `expenses` en createRecurring**: la creación materializa una expense
> row inmediatamente en el ciclo activo (PR #211, `last_registered_cycle_id`
> se estampa para evitar double-charge). Si no invalidas `expenses` aquí, el
> usuario no ve la transacción auto-materializada hasta full remount.

### Cycles (4 sitios → `cycles` ± `summary`)

| Archivo:línea | Llamada | Invalidate |
|---|---|---|
| `src/components/RecurringSection.tsx:222` | `Api.approveCycle(cycle.id)` | `cycles`, `summary` |
| `src/components/RecurringSection.tsx:233` | `Api.requestCycle()` | `cycles` |
| `src/views/Settings.tsx:359` | `Api.requestCycle()` | `cycles` |
| `src/views/Settings.tsx:374` | `Api.approveCycle(currentCycle.id)` | `cycles`, `summary` |

> **Por qué `summary` en approve pero no en request**: approval cambia el ciclo
> activo → summary del ciclo activo cambia. Request solo crea un pending cycle,
> el activo no se mueve hasta approve.

### Notifications (2 sitios → `notifications`)

| Archivo:línea | Llamada | Invalidate |
|---|---|---|
| `src/components/NotificationCenter.tsx:43` | `Api.markNotificationAsRead(id)` | `notifications` |
| `src/components/NotificationCenter.tsx:52` | `Api.markAllNotificationsRead()` | `notifications` |

> Dashboard hoy refetcha el unread badge tras cerrar el panel manualmente. Una
> vez Dashboard subscribe a `notifications`, ese refetch manual queda redundante
> pero **NO lo borres en este commit** — out of scope. Anótalo en HALLAZGOS si
> se siente relevante.

---

## Sitios FUERA de scope (no tocar)

| Archivo:línea | Llamada | Por qué fuera |
|---|---|---|
| `src/views/Settings.tsx:65` | `Api.updatePin(fullPin)` | Auth flow, no toca CACHE_KEYS |
| `src/views/Settings.tsx:291` | `Api.createInvite()` (passkey invite) | Auth flow |
| `src/views/Settings.tsx:302` | `Api.createInvite(partnerId)` (relink) | Auth flow |

---

## Regla crítica — NO extender `CACHE_KEYS` en este commit

El set canónico hoy es exactamente:

```
expenses · goals · categories · summary · events · budget · cycles · recurring · notifications
```

Si encuentras una mutación que toca una entidad **fuera** del set (members,
passkeys, household, app_users, sessions, etc.):

1. **NO agregues una key nueva** a `CACHE_KEYS`.
2. **NO llames `cacheBus.invalidate(...)`** ahí.
3. **Sí anota en `docs/HALLAZGOS.md`**: nombre del sitio, qué entidad toca, por
   qué quedó pendiente. Sección "Eje D — entidades fuera del set canónico
   (post-Commit-5)".

Razón: SAM dictó el set en Fase 2 explícitamente. Extensión silenciosa = drift
del propio canónico. Si una entidad nueva debe entrar al set, es decisión que
SAM toma fuera del Commit 5 — probablemente en sesión propia.

---

## Estructura de commits sugerida (flexible)

27 sitios es mucho para un commit limpio. Sugerencia: 3 sub-commits agrupados
por entidad. Cada uno verificado independiente, cada uno con su path-(b) check.

| Sub-commit | Sitios | Archivos |
|---|---|---|
| `unify: invalidate cache keys on expense/goal/category mutations (Eje D 5a)` | 12 | AddExpense.tsx, History.tsx, Goals.tsx, useCategoryModal.ts |
| `unify: invalidate cache keys on event/budget/cycle mutations (Eje D 5b)` | 9 | Dashboard.tsx (events), Settings.tsx (budget+cycles), RecurringSection.tsx (cycles) |
| `unify: invalidate cache keys on recurring/notification mutations (Eje D 5c)` | 6 | RecurringSection.tsx (recurring), NotificationCenter.tsx |

Si te sientes cómodo con uno solo: hazlo. La regla es que cada commit pase
typecheck + tests + el path-(b) check, no que sean N específicos.

---

## Protocolo path-(b) — verificación obligatoria por commit

Ya usado en Eje E.a, Eje O, Eje I, y los commits 1–4 de Eje D. **No saltarlo.**

```bash
# 1. Baseline ANTES de tocar código del sub-commit:
npx vitest run 2>&1 > /tmp/eje-d-c5-baseline.txt
grep -E "Test Files|^ *Tests " /tmp/eje-d-c5-baseline.txt

# 2. Hacer las invalidaciones del sub-commit.

# 3. Re-correr y comparar:
npx vitest run 2>&1 > /tmp/eje-d-c5-after.txt
grep -E "Test Files|^ *Tests " /tmp/eje-d-c5-after.txt

# 4. Sorted-set diff de las 14 fallas pre-existentes:
grep -E "^   ❯ " /tmp/eje-d-c5-baseline.txt | sort > /tmp/b.txt
grep -E "^   ❯ " /tmp/eje-d-c5-after.txt | sort > /tmp/a.txt
diff /tmp/b.txt /tmp/a.txt   # debe ser empty (exit 0)

# 5. Sorted diff de los assertion summaries:
grep -E "→ " /tmp/eje-d-c5-baseline.txt | sort > /tmp/b2.txt
grep -E "→ " /tmp/eje-d-c5-after.txt | sort > /tmp/a2.txt
diff /tmp/b2.txt /tmp/a2.txt   # debe ser empty (exit 0)
```

### Bandera roja explícita

> Si **cualquier** test transiciona FAIL→PASS o PASS→FAIL: **para, reporta,
> espera instrucciones**. Una invalidación correcta no debe mover el resultado
> de ningún test. Si lo mueve, hay un side-effect que no entendemos.

`tsc --noEmit -p tsconfig.json` debe seguir reportando 31 errores (los
documentados). Cualquier número distinto = regresión.

---

## Cosas que NO hacer en Commit 5

- No crear keys nuevas en `CACHE_KEYS`.
- No tocar el cuerpo de los hooks (`useResource`, `useAsyncEffect`, `cacheBus`).
- No tocar las suscripciones de las 7 vistas (commits 3 y 4 las cerraron).
- No "limpiar de paso" el callback manual de notifications en Dashboard
  (anotar en HALLAZGOS si quieres, pero no borrar).
- No hacer push hasta que SAM lo apruebe explícitamente (la rama de batch
  ya está en origin; nuevos commits van a esa rama o a una nueva, no a
  `origin/main` directo).

## Cosas que sí

- Cada `await Api.X(...)` exitoso (dentro del `try`, antes del `showToast` o
  `navigate` cuando aplique) seguido de `cacheBus.invalidate(...)`.
- Importar `cacheBus` y `CACHE_KEYS` en cada archivo afectado.
- Path-(b) verification por sub-commit.
- Después del último sub-commit: vite build limpio.

---

## Después de Commit 5

- **Eje D cerrado**.
- **Eje K** (validación query-params GET con Zod) en sesión nueva. No mezclar
  con D.
- Push de los nuevos commits: pregunta a SAM. Default es la rama de batch.
