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
