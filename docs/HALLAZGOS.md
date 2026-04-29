# Hallazgos durante el refactor de unificación de patrones

Hallazgos detectados mientras se ejecuta el refactor `unify/*`. **No son bugs activos** salvo que se anote — son cosas a evaluar y decidir aparte.

---

## Eje B (Dates) — drift de UX, no de código

Nido muestra fechas en **4 formatos distintos según vista**:

| Vista | Función actual | Salida |
|---|---|---|
| `views/Goals.tsx`, `views/AddExpense.tsx` (unificadas en `lib/dates.formatDateLabel`) | `formatDateLabel` | `Hoy` / `Ayer` / `27 Abr` |
| `views/Dashboard.tsx` | `formatDatePill` | `Hoy` / `Ayer` / `Lun 27` (día-de-semana 3 letras + número de día, sin mes) |
| `views/History.tsx` | `formatDayLabel` | `Hoy — 27 Abr` / `Ayer — 27 Abr` / `27 Abr` (con em-dash, formato expandido) |
| `views/EventDetail.tsx` | `formatDateLabel` | `LUN 27` (día-de-semana en mayúsculas + número, sin lógica Hoy/Ayer) |

Puede ser intencional o drift de UX. **No se unifica en este refactor — requiere decisión de diseño** ("¿queremos un único formato de fecha cross-app, o cada vista mantiene su propio?"). Si se unifica, tocará al menos firmas: ¿agregamos parámetros (`verbose`, `casing`, `withWeekday`)? ¿o un puñado de helpers nombrados (`formatDayMonth`, `formatWeekdayDay`, etc.)?

### Sub-hallazgo: pattern buggy de "ayer" en History

`views/History.tsx:388` calcula yesterday vía `format(new Date(Date.now() - 86400000), 'yyyy-MM-dd')`. En días de cambio de horario en España (2 veces al año) esto cae en el día equivocado. Si en el futuro se unifica esa función con `lib/dates.yesterdayISO`, el fix viene gratis. Bajo impacto (2 días/año, comparación de date string solo afecta el label "Ayer").

### Sub-hallazgo: `todayStr` duplicado en Goals.tsx

`views/Goals.tsx:21` define `const todayStr = () => format(new Date(), 'yyyy-MM-dd');` que es funcionalmente idéntico a `lib/dates.todayISO`. No se reemplazó porque está fuera del scope estricto del eje (function name distinta, no es un copy-paste de la función unificada). Reemplazo trivial en un follow-up.

---

## Eje A (Money) — convención de céntimos cementada + bugfixes visibles

Convención adoptada (por decisión de producto): **céntimos solo en filas individuales y balance Samuel↔María; todo lo demás, enteros**. Recurring section también con céntimos por consistencia con sus rows.

Helpers canónicos en `src/lib/money.ts`:
- `formatMoney(amount)` → `€1.234.567` (compact, ceros decimales redondeados)
- `formatMoneyExact(amount)` → `€1.234,50` (siempre 2 decimales)

Ambos asumen `amount >= 0`; el call site construye el signo.

**Cambios de comportamiento visibles** (intencionales, todos preservan o mejoran):

| Sitio | Antes | Después | Tipo |
|---|---|---|---|
| `EventDetail.tsx:142` (transacción de evento) | `−€1234.50` (punto, sin separador) | `−€1234,50` (coma) | **Bugfix** — formato es-ES correcto. |
| `Dashboard.tsx:550` (transacción reciente) | `−€1234.50` | `−€1234,50` | **Bugfix.** |
| `PersonalDashboard.tsx:246` (transacción personal) | `−€1234.50` | `−€1234,50` | **Bugfix.** |
| `History.tsx:446` (fila de gasto) | `−€1234.50` | `−€1234,50` | **Bugfix.** |
| `History.tsx:593,597` (Total / Media KPIs) | `€1234.56` (con céntimos) | `€1235` (compact) | **Cambio de convención** — aggregates van enteros. Pierdes los céntimos en el KPI. |
| `Analytics.tsx:481` (avgTicket KPI) | `€42,50` | `€43` (redondeado) | **Cambio de convención** — KPI avgTicket pierde céntimos. |
| `BudgetCapsule.tsx:46` | locale `de-DE` | locale `es-ES` | Cosmético (mismo output para enteros ≤4 dígitos). |

### Sub-hallazgo: separador de miles en 4-dígitos

`Intl.NumberFormat('es-ES')` por defecto **no añade separador a 4-dígitos** (`€1234`, no `€1.234`) por convención tradicional pre-2010 RAE. Esto preserva el comportamiento existente del repo. Si en el futuro se quiere `€1.234`, basta con pasar `useGrouping: 'always'` en una sola línea de `lib/money.ts`. **Pendiente decisión de producto** si se quiere "ver más fintech".

### Sub-hallazgo: `Intl.NumberFormat` cacheado vs `toLocaleString` por llamada

El helper usa instancias `Intl.NumberFormat` cacheadas a nivel módulo. Esto es ~30× más rápido que `toLocaleString` por llamada (cada `toLocaleString` instancia un formatter nuevo). En vistas con 50+ filas (History) la diferencia se nota.

---

## Eje G (Cycle types) — un bug serio descubierto durante la unificación

### `RecurringSection.tsx:113` — `requested_by` no coincide con la respuesta del server

**Archivo:línea**: `src/components/RecurringSection.tsx:113` (`showApprovalBanner`).

**Comportamiento actual**:
```tsx
const showApprovalBanner = cycle?.status === 'pending'
  && (cycle as unknown as { requested_by?: number }).requested_by !== userId;
```
El componente lee `cycle.requested_by`, pero el server (`server/routes/cycles.ts:27` `getCycleWithApprovalState`) devuelve el campo como **`requested_by_user_id`**. La comparación queda como `undefined !== userId`, que siempre evalúa a `true`.

**Comportamiento esperado**: el banner debería mostrarse al usuario que **NO** solicitó el ciclo (para que apruebe). Cuando un ciclo está pendiente porque Samuel lo pidió, el banner debe aparecerle a María, no a Samuel.

**Síntoma observable para el usuario**: el banner "Ciclo pendiente de aprobación" + botón "Aprobar" aparece **al usuario que solicitó el ciclo** en vez de al partner. Cuando Samuel solicita un nuevo ciclo, él mismo ve el banner pidiéndole aprobar (que no puede, porque la aprobación es del otro miembro). María no ve nada hasta que abre la app y refresca.

**Test que lo demuestra**: `src/components/RecurringSection.bug.test.ts` — usa `it.fails` para una aserción del comportamiento correcto (que falla hoy) y un test que pin-ea el síntoma actual. Cuando el bug se arregle, ambos tests indicarán que es momento de borrar el archivo.

**Fix en otro PR**: cambiar el campo a `requested_by_user_id`, o (mejor) agregar `requested_by_user_id` al schema Zod en `src/api-types/cycles.ts` y actualizar el call site para usar el nombre correcto sin cast. Adjunta el bug-test deletion en el mismo PR.

### Sub-hallazgo: `'in-closed'` es misnomer para ciclos `pending`

`src/lib/resolveCycleForDate.ts` clasifica cualquier ciclo no-`active` como `'in-closed'`. Pero el schema de `billing_cycles` solo permite estados `'pending'` y `'active'` (ver `server/db.ts:303` CHECK constraint). Un ciclo `'pending'` clasificado como `'in-closed'` semánticamente confuso. Renombrar a `'in-other'` o `'non-active'` sería más correcto pero rompe consumers. Out of scope.

---

## Eje E.a — hallazgos detectados durante la migración (2026-04-28)

### 1. 14 tests pre-existentes rotos en `main`

Detectado al validar Eje E.a. Verificado vía `git stash` que los 14 también fallan en main limpio — **no introducidos por la migración**. Patrón común: rot de tests vs cambios deliberados de comportamiento (refactors de respuesta del server, privacy, schema). No flakes — todos son assertion mismatches reproducibles.

⚠ **Bloquea Eje O**: 4 de los 5 archivos afectados (`server/auth.test.ts`, `server/routes/{analytics,expenses,goals}.test.ts`) son justamente los que el Eje O quiere refactorizar (extraer `mockDb`/`getRouteHandler`/`createResponse` a helper común). Antes de tocar el helper, conviene fijar o saltar las aserciones rotas para tener una baseline limpia donde verificar que la extracción no rompe nada.

| # | Archivo | Test | Diagnóstico probable |
|---|---|---|---|
| 1 | `server/auth.test.ts` | `authenticateToken returns 401 when no session cookie is present` | Middleware retorna shape de error distinto al esperado (`{error: 'Unauthorized'}`). Probable refactor del middleware sin actualizar test. |
| 2 | `server/routes/analytics.test.ts` | `GET / returns monthly totals grouped correctly` | Test accede a `res.json.mock.calls[0][0]` esperando array; recibe `undefined`. Cambió la forma de respuesta (probablemente ahora devuelve `{monthly:[...], kpis:..., insights:...}` y el test espera el array suelto). |
| 3 | `server/routes/analytics.test.ts` | `calculates KPIs correctly` | `expected 600, got 0`. Misma causa: shape de respuesta cambió, test no extrae KPIs del nuevo wrapper. |
| 4 | `server/routes/analytics.test.ts` | `calculates category breakdown percentages` | `expected length 3, got 0`. Misma causa. |
| 5 | `server/routes/analytics.test.ts` | `generates positive trend insight when spending decreased` | `insights.find(...)` returns undefined. Insights no se generan o cambió el `type`. |
| 6 | `server/routes/analytics.test.ts` | `generates budget warning insight at 80%+` | Misma causa. |
| 7 | `server/routes/analytics.test.ts` | `returns 500 on database error` | `res.status` nunca llamado con `500`. Probable cambio a `next(err)` con error middleware central, en vez de `res.status(500)` inline. |
| 8 | `server/routes/expenses.test.ts` | `creates a new expense using the authenticated user as paid_by` | `INSERT INTO expenses` con set de columnas distinto al esperado. Schema cambió (probable: nueva columna `cycle_id`, `category_id`, etc.) y el test no se actualizó. |
| 9 | `server/routes/expenses.test.ts` | `forbids deleting another user personal expense` | Mensaje de error o status code distinto. Probable cambio de "Forbidden 403" → "Not found 404" por privacy (no revelar existencia del recurso). |
| 10 | `server/routes/goals.test.ts` | `POST / creates goal with correct household_id from auth user` | Spy comparison falla — el SQL recibido coincide pero algún arg posicional difiere. Posible reorden de columnas en INSERT. |
| 11 | `server/routes/goals.test.ts` | `POST / sets owner_user_id when owner_type is personal` | Misma causa. |
| 12 | `server/routes/goals.test.ts` | `PUT /:id returns 403 when editing another user personal goal` | Mensaje de error distinto. Igual que #9: probable privacy refactor. |
| 13 | `server/routes/goals.test.ts` | `PUT /:id returns 404 for goal not in household` | Mensaje de error distinto. |
| 14 | `src/views/privacy.test.ts` | `builds a dashboard card only for the authenticated user personal data` | `expected avatar:'👨‍💻', got 'S'`. Cambió la lógica de avatar de emoji a inicial del nombre. Test no actualizado. |

**Acción sugerida**: PR aparte que actualiza estas 14 aserciones para reflejar el comportamiento actual (o, donde el comportamiento sea regresión, revertirlo). No es trabajo del Eje O.

### 2. `tsc --noEmit` del cliente está roto en este repo

Ejecutar `npx tsc --noEmit -p tsconfig.json` falla con 4 errores **en el propio `tsconfig.json`**, antes de tocar código fuente:

```
tsconfig.json(8,25): TS6046: Argument for '--moduleResolution' option must be: 'node', 'classic', 'node16', 'nodenext'.
tsconfig.json(9,5):  TS5023: Unknown compiler option 'allowImportingTsExtensions'.
tsconfig.json(10,5): TS5070: Option '--resolveJsonModule' cannot be specified without 'node' module resolution strategy.
tsconfig.json(25,18): TS6306: Referenced project '...server/tsconfig.json' must have setting "composite": true.
```

Causa: `tsconfig.json` usa `moduleResolution: "bundler"` y `allowImportingTsExtensions` — ambos requieren TypeScript ≥5.0. Pero `package.json` pinea `typescript: ^4.9.5`. Además, `vite build` **no** hace type-checking (usa esbuild para transpilar, sin chequeo de tipos; `vite.config.ts` no carga `vite-plugin-checker` ni similar). El único `tsc` que se ejecuta hoy es `tsc -p server` durante el build, que solo cubre el server.

Conclusión: **el cliente no se type-checkea en CI/CLI**. Solo el editor (que trae su propia versión de TS).

**Acciones posibles** (cualquiera, fuera del scope del audit de drift):
- (a) Subir `typescript` a `^5.x` en `package.json` y verificar que el cliente compila limpio.
- (b) Bajar `tsconfig.json` a sintaxis TS 4.9 (`moduleResolution: "node"`, sin `allowImportingTsExtensions`). Pierdes import de `.tsx` explícito.
- (c) Añadir `vite-plugin-checker` con preset typescript para que `vite build` falle ante errores de tipo. Cubre CI sin tocar TS.

### 3. No hay script `lint` en `package.json`

`package.json` no expone ningún script `lint`. No hay `.eslintrc*` ni `eslint.config.*` en la raíz. El prompt original asumía `pnpm lint`; en este repo no aplica. Si se quiere lint en CI, hay que añadirlo (eslint + plugin-react + plugin-react-hooks). Out of scope del audit.

### 4. `currentMonth` ghost dep en Dashboard.tsx

`src/views/Dashboard.tsx:114` declara `const currentMonth = format(new Date(), 'yyyy-MM');` y la incluye en las deps del `useCallback` de `loadDashboardDataFn` (línea 161). **No se usa en el body del callback**, ni en ninguna otra parte del componente. Es un dep fantasma — heredado del refactor previo cuando el load por mes calendario fue reemplazado por load por ciclo de facturación, y el local quedó sin consumidor. Comportamiento idéntico al de antes (la string es estable dentro del minuto, así que no dispara refetch espurio), pero deuda visible. Cleanup trivial post-audit: borrar la línea y la entrada del array de deps. Fuera del scope de Eje E.a por la regla "cero cambios fuera del eje".

### 5. Eje I — comentario justificando `{ silent: true }` no aplicado uniformemente

En `src/auth.tsx:53` y `:94`, los dos sitios silent llevan un comentario en línea explicando **por qué** son silent (bootstrap implícito; logout limpia local state en finally — toast confundiría). En los otros 7 sitios silent migrados en Eje I (RecurringSection.tsx:77, useCategoryManagement.ts:25, Analytics.tsx:409, AddExpense.tsx:60, Settings.tsx:250, PersonalDashboard.tsx:57, Dashboard.tsx:139) **no hay comentario equivalente** — el `{ silent: true }` queda sin justificación textual.

Sin comentario, el siguiente refactor no puede distinguir si la decisión fue deliberada (Cat 3-auto: ciclo activo / lista de ciclos / categorías son ancillary, no page-blocking) o copy-paste mecánico. Un agente futuro podría:
- Quitar el flag pensando que era un descuido (regresión: toast indeseado para fetches background).
- O añadir flag a sitios nuevos sin pensar (degradar la observabilidad si era Cat 2 o 3-user-init).

Cleanup post-audit: añadir 1 línea de comentario en cada uno de los 7 sitios explicando qué fetch background-tolerante representa. Trabajo trivial (~7 minutos), pero importante para que el patrón sobreviva a la próxima persona/agente.

### 6. Deuda de strictness TS — 31 errores latentes tras bump a TS 5.9.3

El bump de TypeScript (4.9 → 5.9) ejecutado pre-Eje-D destapó 44 errores de tipo en código fuente que nunca se chequeó porque `tsc` 4.9 no podía leer el `tsconfig.json` con `moduleResolution: "bundler"`. Se arreglaron 13 (3 bugs reales + 8 jest-dom typing-setup + 2 dup imports). Los 31 restantes quedan como deuda explícita:

| Código | Cuenta | Causa | Carácter |
|---|---|---|---|
| `TS6133` | 15 | Unused locals/imports (`noUnusedLocals` strict) | Cleanup mecánico. Dead imports (`Download`, `LogOut`, `CheckCircle`, `AlertCircle`, `Button`, `useEffect`, `vi`, `fetchData`, etc.) y locals (`maxBar`, `emoji`, `user`, `remainingShared`, `sharedProgress`, `personalCard`, `userName`). Borrar línea por línea, ~5 min. |
| `TS2322` | 10 | Type not assignable | Casi todo en `BudgetCapsule.tsx:6-11` — typing entre `lucide-react` icons (`ForwardRefExoticComponent<LucideProps>`) y un `FC<{size,color}>` propio. Necesita widen-to-FC o assertion. ~15 min. |
| `TS2345` | 3 | Argument not assignable | Llamadas con args incompatibles. Caso por caso. |
| `TS2353` | 2 | Unknown property | Prop pasada a componente que no la declara. |
| `TS2339` | 1 | Property doesn't exist | Ver hallazgo #7 (residuo de Eje G). |

Total ~30-45 min de cleanup mecánico. Candidato a un commit `chore: clean up TS strictness backlog` post-audit.

### 7. Residuo de Eje G — `Settings.tsx` declara `currentCycle` inline en vez de usar `CycleInfo`

`src/views/Settings.tsx:209-219` declara su propio tipo inline para el state `currentCycle`:

```ts
const [currentCycle, setCurrentCycle] = useState<{
  id: number;
  month: string;
  status: 'pending' | 'active' | 'closed';
  start_date?: string;
  requested_by_user_id: number;
  // ... (no end_date)
} | null>(null);
```

Eje G unificó los tipos de ciclo en `src/api-types/cycles.ts` como `CycleInfo`, pero **este caller se le escapó**. El tipo inline está desactualizado: `Api.getCurrentCycle()` devuelve un `end_date` (presente en `CycleInfo`), pero el inline no lo declara. `Settings.tsx:388` lo usa (`currentCycle.end_date ?? undefined`) — el código es defensivo, runtime correcto, pero tsc reporta TS2339.

Fix: reemplazar el tipo inline por `CycleInfo` importado de `api-types/cycles`. Trivial. Es el cleanup explícito que Eje G dejó pendiente.

### 8. `vite ^4.0.0` + `@vitejs/plugin-react ^3.1.0` con TS 5.9 — matriz no oficial

El bump TS 5.9 funciona en este repo porque Vite usa `esbuild` (parser TS independiente) para transpilar. Pero la matriz oficialmente probada es:
- Vite 4 → TS 4.9 (release-time pair)
- Vite 5 → TS 5.x (release-time pair)

Hoy estamos cruzados: Vite 4 + TS 5.9. Sin urgencia (el build pasa, los tests pasan), pero próxima vez que se toque tooling: Vite 5 + `@vitejs/plugin-react ^4.x` es la combinación natural. Candidato para limpieza de tooling post-audit.

### 9. Eje O — shim aliases locales en cada test file

Para preservar literalmente los callsites de las aserciones, cada uno de los 7 archivos migrados en Eje O conserva un par de aliases locales tipo:

```ts
const getRouteHandler = (path: string, method: 'get'|'post'|'put'|'delete') =>
  resolveRouteHandler(goalsRouter, path, method);
const createResponse = createMockResponse;
```

Esto deja ~3 LOC × 7 archivos = ~21 LOC de ceremonia repetida. Decisión defensible para minimizar diff dentro de los tests durante el unify, pero técnicamente drift mínimo: si alguien agrega un test #8 va a copiar el shim del archivo más cercano. **Segundo pase opcional post-audit**: actualizar callsites a `getRouteHandler(router, ...)` directo desde los helpers compartidos y eliminar los shims. Ganancia ~30 LOC y eliminación de la copia ceremonial; riesgo mecánico bajo (cambio sintáctico uniforme). Candidato para cleanup final.

---

## Eje D — follow-ups post-Commit-5

### 1. Refetch manual del badge de notificaciones en Dashboard quedó redundante

Tras Commit 5c, `NotificationCenter` invalida `CACHE_KEYS.notifications` después de `markNotificationAsRead` y `markAllNotificationsRead`. Dashboard ya está suscrito a `notifications` (Commit 4), así que el refetch del badge ocurre vía `cacheBus` automáticamente.

El callback manual que Dashboard pasa al `onClose` del panel para refetchar el unread-count sigue disparándose. Es dead-weight inofensivo (un refetch extra cuando se cierra el panel, no afecta corrección), pero es candidato a borrado en un pase de limpieza dedicado. **Out of scope para Commit 5** por la regla del handoff: no mezclar invalidaciones con cleanup de prop-drilling histórico.

### 2. Entidades fuera del set canónico (sin hallazgos)

Sección reservada por el handoff de Commit 5 para registrar mutaciones cuya entidad estuviera fuera de `CACHE_KEYS` (members, passkeys, household, app_users, sessions). Tras revisar las 27 mutaciones in-scope: **ninguna** quedó fuera del set. Las 3 mutaciones explícitamente fuera de scope (`updatePin`, dos `createInvite`) tocan auth/members, no entidades del bus. Sin acción pendiente.

---

### Race latente en `useResource`: in-flight requests sin cancelación

`src/hooks/useResource.ts` (y por extensión `useAsyncEffect`) no cancela fetches in-flight cuando el `loader` cambia o cuando llega un `cacheBus.invalidate(...)`. Si la red es lenta, una promesa vieja puede resolverse **después** de una nueva y sobreescribir el state con datos obsoletos (último-en-resolver gana, no último-en-disparar).

**Ejemplo**: `AddExpense.tsx:110` carga eventos con loader que cierra sobre `type` (`'shared' | 'personal'`). Si el usuario alterna el toggle rápido y la primera petición es lenta, el resultado del `type` viejo puede pisar al del `type` nuevo. Síntoma: lista de eventos del contexto contrario aparece momentáneamente.

**Probabilidad realista**: baja. Toggle UI es rápido, mismo host, payloads pequeños. La siguiente invalidación corrige el state.

**Si surge como bug reproducible**: NO parchear el bus añadiendo `AbortController`, dedup de in-flight, o token-de-fetch — eso violaría las **PROHIBITED FEATURES** documentadas inline en `src/lib/cacheBus.ts:1-10`. La regla del repo es explícita: "if we find ourselves needing 2+ of these, the bus has lost its reason to exist. Migrate. Don't grow the bus into a half-TQ." Escalar a migración a TanStack Query (o equivalente) según la regla del comentario.

**Por qué este hallazgo merece visibilidad propia**: pertenece al canónico cacheBus de Eje D, no es residuo de un eje pasado. Debe ser encontrable buscando "useResource" o "race", no escarbando en handoffs históricos. Sin esta entrada, en 6 meses alguien va a sugerir parchear con AbortController y violar la regla sin saberlo.

---

## Tier 3 cleanup — falsos positivos verificados

### SCHEMA-2 — POST /api/categories sin Zod (resuelto upstream)

Reportes anteriores del audit de drift listaban este sitio como "POST /api/categories en `server/index.ts:~760` sin validación Zod". **Falso positivo confirmado el 2026-04-29**:

- `server/index.ts` ahora tiene 352 líneas (la línea 760 referida ya no existe — el archivo se redujo en refactors posteriores).
- `POST /api/categories` está en `server/index.ts:178` con `validate(categoryUpsertSchema)` middleware aplicado:
  ```ts
  app.post('/api/categories', authenticateToken, apiLimiter,
           validate(categoryUpsertSchema), async (req, res) => { ... });
  ```
- Wiring vía PR #209/#210 (hardening pre-existente, ver memoria `nido/decisions/PR-210-merge-note`).
- El resto de POST/PUT/DELETE declarados directamente en `server/index.ts` también validan: `/auth/verify-pin` y `/auth/update-pin` usan `pinSchema.safeParse` inline; `/auth/logout` no tiene body; `DELETE /api/categories/:id` solo recibe `:id` param.

**Acción**: ninguna. Documentado aquí para evitar que un futuro audit redescubra este "drift" inexistente.

**Fuera de scope**: validación en sub-routers (`expensesRouter`, `goalsRouter`, `cyclesRouter`, etc.) — si surge la duda, es un eje aparte.

---

## Deferred architectural decisions

### `shared/` folder for cross-tier utilities

shared/ folder for cross-tier utilities — currently 1 consumer (server/routes/cycles.ts duplicates es-ES Intl formatter from src/lib/money.ts:formatMoneyExact). Trigger to extract: 2nd request for an src/lib/* helper from server-side. When triggered, evaluate location (src/shared/ vs top-level shared/), tsconfig path setup, and migration cost of moving src/lib/money.ts (78 consumers).

---

## Single-site patterns watch

### `parseFloat(x.toFixed(2))` round-to-cents

parseFloat(x.toFixed(2)) round-to-cents — currently 2 instances same file (src/views/AddExpense.tsx:203, :240). Watch for diffusion. Trigger to create lib/money roundCents(): a consumer outside AddExpense, or a 3rd instance accumulating drift in styles.

---

## Test coverage gaps

### History search filter (post-MONEY-1)

`src/views/History.tsx` filter logic (incl. money search via `matchesMoneySearch`) no tiene test unitario. Verificación post-MONEY-1 se basa en (i) tests del helper `matchesMoneySearch` en `src/lib/money.test.ts` (cubren la lógica del helper), y (ii) baseline-comparison que confirma que la migración no introduce nuevo FAIL. Test del filter component completo es follow-up tras un eventual extracto del filter logic a hook propio (no scope MONEY-1).
