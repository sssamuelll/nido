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
