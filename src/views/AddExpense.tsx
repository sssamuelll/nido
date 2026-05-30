import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Api } from '../api';
import { showToast } from '../components/Toast';
import { useCategoryManagement } from '../hooks/useCategoryManagement';
import { useAsyncEffect, useResource } from '../hooks/useResource';
import { useIsMobile } from '../hooks/useMediaQuery';
import { resolveCycleForDate } from '../lib/resolveCycleForDate';
import { handleApiError } from '../lib/handleApiError';
import { CACHE_KEYS, cacheBus } from '../lib/cacheBus';
import { formatDayLabel, todayISO } from '../lib/dates';
import { formatMoney, formatMoneyExact } from '../lib/money';
import { NidoShell } from '../components/nido/NidoShell';
import { Card, Eyebrow, Bar, CatIcon, Seg, Btn, FilterChip, Icon, CONTEXT_SEG_OPTIONS } from '../components/nido';
import type { CategoryDef } from '../hooks/useCategoryManagement';
import type { CycleSummary } from '../api-types/cycles';

interface SummaryBreakdownRow { category: string; total: number; budget: number; count: number }
interface EventOption { id: number; name: string; emoji?: string; end_date: string }
interface AddSummary {
  categoryBreakdown?: SummaryBreakdownRow[];
  personalCategoryBreakdown?: SummaryBreakdownRow[];
}

const toNum = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/* ── amount keypad calculator (mobile) ─────────────────────────
   Digit entry is the 99% path and is exact; the operator keys do a
   simple left-to-right calculation (no expression parsing), rounded to
   céntimos. Values are held with a comma decimal (es-ES) and converted to
   a dot-decimal numeric string only at submit. */
type Op = '+' | '−' | '×' | '÷';
interface CalcState { acc: number | null; op: Op | null; entry: string }
const CALC_ZERO: CalcState = { acc: null, op: null, entry: '' };
const isOp = (k: string): k is Op => k === '+' || k === '−' || k === '×' || k === '÷';

const round2 = (n: number) => Math.round(n * 100) / 100;
const applyOp = (a: number, op: Op, b: number): number => {
  if (op === '+') return round2(a + b);
  if (op === '−') return round2(a - b);
  if (op === '×') return round2(a * b);
  return b === 0 ? a : round2(a / b); // ÷ by zero is a no-op
};
const entryToNum = (entry: string) => parseFloat(entry.replace(',', '.')) || 0;

const calcValue = (s: CalcState): number => {
  if (s.entry !== '') {
    const e = entryToNum(s.entry);
    return s.acc !== null && s.op ? applyOp(s.acc, s.op, e) : e;
  }
  return s.acc ?? 0;
};

const pressKey = (s: CalcState, k: string): CalcState => {
  if (k === '⌫') {
    if (s.entry !== '') return { ...s, entry: s.entry.slice(0, -1) };
    if (s.op) return { ...s, op: null };
    if (s.acc !== null) return { ...s, acc: null };
    return s;
  }
  if (k === ',') {
    if (s.entry.includes(',')) return s;
    return { ...s, entry: (s.entry === '' ? '0' : s.entry) + ',' };
  }
  if (isOp(k)) {
    if (s.entry === '') return { ...s, acc: s.acc ?? 0, op: k };
    const e = entryToNum(s.entry);
    const newAcc = s.acc !== null && s.op ? applyOp(s.acc, s.op, e) : e;
    return { acc: newAcc, op: k, entry: '' };
  }
  // digit: cap whole part at 9 digits and decimals at 2
  if (s.entry.includes(',')) {
    const dec = s.entry.split(',')[1] ?? '';
    if (dec.length >= 2) return s;
  } else if (s.entry.replace(/[^0-9]/g, '').length >= 9) {
    return s;
  }
  return { ...s, entry: s.entry === '0' ? k : s.entry + k };
};

const calcDisplay = (s: CalcState): string => {
  if (s.entry !== '') return s.entry;
  const v = s.acc ?? 0;
  return v.toLocaleString('es-ES', { maximumFractionDigits: 2 });
};

const KEYS = ['1', '2', '3', '÷', '4', '5', '6', '×', '7', '8', '9', '−', ',', '0', '⌫', '+'];

export const AddExpense: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { categories } = useCategoryManagement();

  const [calc, setCalc] = useState<CalcState>(CALC_ZERO);
  const [amount, setAmount] = useState(''); // desktop text path (dot-decimal)
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState<'shared' | 'personal'>('shared');
  const [date, setDate] = useState(todayISO());
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1); // mobile only

  const preset = location.state as { initialContext?: 'shared' | 'personal'; initialCategory?: string; eventId?: number } | null;
  useEffect(() => {
    if (preset?.initialContext) setType(preset.initialContext);
    if (preset?.initialCategory) setCategory(preset.initialCategory);
    if (preset?.eventId) setSelectedEventId(preset.eventId);
  }, [preset]);

  // Cycle attribution (PR #213): a back-dated expense whose date falls outside
  // the active cycle is attributed to the cycle that owns that date, not the
  // active one. We surface a small note + toggle only when that mismatch exists.
  const loadCyclesFn = useCallback(async () => {
    const d = await Api.listCycles();
    return Array.isArray(d) ? d : [];
  }, []);
  const { data: cyclesData } = useResource<CycleSummary[]>(loadCyclesFn, {
    fallbackMessage: 'Error al cargar ciclos',
    invalidationKey: CACHE_KEYS.cycles,
  });
  const cycles = cyclesData ?? [];
  const activeCycle = cycles.find((c) => c.status === 'active');
  const [targetCycleId, setTargetCycleId] = useState<number | null>(null);
  const cycleResolution = useMemo(() => resolveCycleForDate(date, cycles), [date, cycles]);
  useEffect(() => {
    if (cycleResolution.kind === 'in-active') setTargetCycleId(null);
    else if (cycleResolution.kind === 'in-closed') setTargetCycleId(cycleResolution.cycle.id);
    else setTargetCycleId(activeCycle?.id ?? null);
  }, [cycleResolution.kind, cycleResolution.kind === 'in-closed' ? cycleResolution.cycle.id : null, activeCycle?.id]);

  // Event tagging: shared expense → shared events; personal expense → shared +
  // own personal events (a personal souvenir during a shared trip). Active only.
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const loadEventsFn = useCallback(async () => {
    const lists = type === 'shared'
      ? [await Api.getEvents('shared')]
      : await Promise.all([Api.getEvents('shared'), Api.getEvents('personal')]);
    return lists.flat().filter((ev: EventOption) => new Date(ev.end_date) >= new Date());
  }, [type]);
  const { data: eventsData } = useResource<EventOption[]>(loadEventsFn, { invalidationKey: CACHE_KEYS.events });
  const events = eventsData ?? [];

  // summary (for the calm budget-impact preview); optional — silent on failure
  const [summary, setSummary] = useState<AddSummary | null>(null);
  const loadSummary = useCallback(async () => {
    try {
      const cycle = await Api.getCurrentCycle();
      const s = cycle?.start_date
        ? await Api.getSummary({ start_date: cycle.start_date, end_date: cycle.end_date ?? undefined, cycle_id: cycle.id })
        : await Api.getSummary();
      setSummary(s);
    } catch {
      setSummary(null); // preview just won't render
    }
  }, []);
  useAsyncEffect(loadSummary, {
    fallbackMessage: 'Error al cargar presupuesto',
    invalidationKeys: [CACHE_KEYS.summary, CACHE_KEYS.expenses, CACHE_KEYS.budget, CACHE_KEYS.cycles],
  });

  const numericAmount = isMobile ? calcValue(calc) : (Number(amount) || 0);

  // budget impact for the chosen category in the chosen context
  const impact = useMemo(() => {
    if (!category || numericAmount <= 0) return null;
    const rows = type === 'shared' ? summary?.categoryBreakdown : summary?.personalCategoryBreakdown;
    const row = rows?.find((r) => r.category === category);
    if (!row || toNum(row.budget) <= 0) return null;
    const budget = toNum(row.budget);
    const after = toNum(row.total) + numericAmount;
    const over = after > budget;
    const pct = Math.min(100, Math.round((after / budget) * 100));
    return { budget, after, over, pct, overBy: over ? after - budget : 0 };
  }, [category, numericAmount, type, summary]);

  const handleAmountChange = (value: string) => {
    const sanitized = value.replace(/[^0-9.,]/g, '').replace(',', '.');
    if (sanitized.split('.').length > 2) return;
    setAmount(sanitized);
  };

  const validate = (): boolean => {
    if (numericAmount <= 0 || !Number.isFinite(numericAmount)) {
      showToast('Ingresa un monto válido', 'error');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      await Api.createExpense({
        description: description.trim() || category || 'Gasto',
        amount: numericAmount,
        category: category || 'Otros',
        category_id: categories.find((c) => c.name === category)?.id,
        date,
        type,
        event_id: selectedEventId || undefined,
        cycle_id: targetCycleId,
      });
      cacheBus.invalidate(CACHE_KEYS.expenses, CACHE_KEYS.summary, CACHE_KEYS.budget);
      showToast('Gasto añadido', 'success');
      navigate('/');
    } catch (err) {
      handleApiError(err, 'No se pudo añadir el gasto');
    } finally {
      setSubmitting(false);
    }
  };

  const goToDetails = () => {
    if (!validate()) return;
    setStep(2);
  };

  /* ── shared sub-blocks ─────────────────────────────────────── */

  const dateField = (
    <label style={{ position: 'relative', display: 'block' }}>
      <div style={{ padding: '14px 16px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
        <Icon.cal /> {formatDayLabel(date)}
      </div>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Fecha del gasto"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 0, cursor: 'pointer' }}
      />
    </label>
  );

  const typeToggle = (
    <Seg value={type} options={CONTEXT_SEG_OPTIONS} onChange={setType} full />
  );

  const eventSelector = events.length > 0 ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <FilterChip on={selectedEventId === null} onClick={() => setSelectedEventId(null)}>Sin evento</FilterChip>
      {events.map((ev) => (
        <FilterChip key={ev.id} on={selectedEventId === ev.id} onClick={() => setSelectedEventId(ev.id)}>
          {ev.emoji ? `${ev.emoji} ` : ''}{ev.name}
        </FilterChip>
      ))}
    </div>
  ) : null;

  const cycleNote = (cycleResolution.kind !== 'in-active' && activeCycle) ? (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '12px 14px', borderRadius: 12, background: 'var(--honey-tint)', border: '1px solid #e6d3a0' }}>
      <span style={{ color: 'var(--honey)', flex: '0 0 auto', marginTop: 1 }}><Icon.info /></span>
      <div style={{ fontSize: 12.5, color: '#7a5512', lineHeight: 1.4 }}>
        {cycleResolution.kind === 'in-closed'
          ? <>Esta fecha cae en un ciclo ya cerrado. El gasto se atribuirá a <b>ese</b> ciclo, no al actual.</>
          : <>No hay ciclo registrado en esa fecha. El gasto se atribuirá al ciclo actual.</>}
      </div>
    </div>
  ) : null;

  const descriptionField = (
    <input
      value={description}
      onChange={(e) => setDescription(e.target.value)}
      placeholder="¿En qué gastaste?"
      style={{ width: '100%', padding: '14px 16px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
    />
  );

  const categoryChips = (scroll: boolean) => (
    <div
      style={scroll
        ? { display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -20px', padding: '0 20px 2px' }
        : { display: 'flex', flexWrap: 'wrap', gap: 9 }}
    >
      {categories.map((c: CategoryDef) => (
        <FilterChip
          key={c.name}
          on={category === c.name}
          hasIcon
          onClick={() => setCategory(c.name)}
          style={scroll ? { flex: '0 0 auto' } : undefined}
        >
          <CatIcon color={c.color} bg={c.color ? `${c.color}1A` : undefined} size={24} radius={7}>
            <span style={{ fontSize: 14 }}>{c.emoji}</span>
          </CatIcon>
          {c.name}
        </FilterChip>
      ))}
      {categories.length === 0 ? (
        <span style={{ fontSize: 13, color: 'var(--ink-3)', padding: '7px 4px' }}>Aún no hay categorías. Crea una desde Inicio.</span>
      ) : null}
    </div>
  );

  const budgetImpact = impact ? (
    <div style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--inset)', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600 }}>Tras añadirlo · {category}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{formatMoney(impact.after)}<span style={{ color: 'var(--ink-3)' }}>/{formatMoney(impact.budget)}</span></span>
      </div>
      <Bar pct={impact.pct} over={impact.over} fill="pine" thin />
      {impact.over ? (
        <div style={{ fontSize: 11.5, color: 'var(--honey)', fontWeight: 600, marginTop: 7 }}>Se pasará {formatMoney(impact.overBy)} del tope</div>
      ) : null}
    </div>
  ) : null;

  /* ── MOBILE: two stacked steps ─────────────────────────────── */
  if (isMobile) {
    return (
      <div className="nido grain" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '14px 20px 24px', maxWidth: 480, width: '100%', margin: '0 auto' }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                aria-label={step === 1 ? 'Cancelar' : 'Volver al importe'}
                onClick={() => (step === 1 ? navigate(-1) : setStep(1))}
                style={{ color: 'var(--ink-2)', background: 'none', border: 0, cursor: 'pointer', display: 'flex' }}
              >
                {step === 1 ? <Icon.x /> : <Icon.back />}
              </button>
              <h1 className="serif" style={{ fontSize: 24 }}>Nuevo gasto</h1>
            </div>
            <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>Paso {step} de 2</span>
          </div>
          {/* step dots */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <span style={{ width: 24, height: 5, borderRadius: 3, background: 'var(--clay)' }} />
            <span style={{ width: 24, height: 5, borderRadius: 3, background: step >= 2 ? 'var(--clay)' : 'var(--line-2)' }} />
          </div>

          {step === 1 ? (
            <>
              <div style={{ textAlign: 'center', margin: '32px 0 26px' }}>
                <Eyebrow style={{ marginBottom: 8 }}>Importe</Eyebrow>
                <div>
                  <span style={{ fontSize: 26, color: 'var(--ink-3)', verticalAlign: 'top' }}>€</span>
                  <span style={{ fontSize: 66, fontWeight: 700, letterSpacing: '-.02em' }}>{calcDisplay(calc)}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 9, flex: 1, minHeight: 0 }}>
                {KEYS.map((k) => {
                  const op = isOp(k) || k === '⌫';
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setCalc((s) => pressKey(s, k))}
                      style={{ font: 'inherit', cursor: 'pointer', border: '1px solid var(--line)', minHeight: 52, background: op ? 'var(--inset)' : 'var(--surface-2)', color: op ? 'var(--ink-2)' : 'var(--ink)', borderRadius: 14, fontSize: op ? 18 : 22, fontWeight: 600, display: 'grid', placeItems: 'center' }}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
              <Btn variant="primary" onClick={goToDetails} style={{ marginTop: 14, width: '100%', height: 52, fontSize: 16 }}>
                Siguiente <Icon.fwd />
              </Btn>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
              {/* amount summary → editable (returns to step 1) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderRadius: 16, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                <div>
                  <Eyebrow style={{ marginBottom: 5 }}>Importe</Eyebrow>
                  <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1 }}>{formatMoneyExact(numericAmount)}</div>
                </div>
                <Btn variant="ghost" onClick={() => setStep(1)} style={{ color: 'var(--clay)' }}><Icon.edit /> Editar</Btn>
              </div>

              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Descripción</label>
                {descriptionField}
              </div>

              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 10 }}>Categoría</label>
                {categoryChips(true)}
              </div>

              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Fecha</label>
                {dateField}
              </div>

              {cycleNote}

              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Tipo</label>
                {typeToggle}
              </div>

              {eventSelector ? (
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 10 }}>Evento</label>
                  {eventSelector}
                </div>
              ) : null}

              {budgetImpact}

              <Btn variant="primary" onClick={handleSubmit} disabled={submitting} style={{ width: '100%', height: 54, fontSize: 16, marginTop: 4 }}>
                <Icon.check /> {submitting ? 'Guardando…' : 'Añadir gasto'}
              </Btn>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── DESKTOP: single screen inside the rail shell ──────────── */
  return (
    <NidoShell active="add">
      <div style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
        <div className="phead">
          <div>
            <h1 className="ptitle">Nuevo gasto</h1>
            <div className="psub">Apúntalo en un momento</div>
          </div>
          <Btn variant="ghost" onClick={() => navigate(-1)}><Icon.x /> Cancelar</Btn>
        </div>

        {/* amount hero */}
        <Card pad style={{ marginBottom: 18, textAlign: 'center', padding: '34px 26px' }}>
          <Eyebrow style={{ marginBottom: 10 }}>Importe</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span style={{ fontSize: 34, color: 'var(--ink-3)' }}>€</span>
            <input
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              autoFocus
              size={Math.max(2, amount.length || 1)}
              style={{ fontSize: 64, fontWeight: 700, letterSpacing: '-.02em', border: 0, background: 'transparent', textAlign: 'center', outline: 'none', fontFamily: 'inherit', color: 'var(--ink)' }}
            />
          </div>
        </Card>

        {/* details */}
        <Card pad style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Descripción</label>
            {descriptionField}
          </div>
          <div>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 10 }}>Categoría</label>
            {categoryChips(false)}
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Fecha</label>
              {dateField}
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Tipo</label>
              {typeToggle}
            </div>
          </div>
          {cycleNote}
          {eventSelector ? (
            <div>
              <label className="eyebrow" style={{ display: 'block', marginBottom: 10 }}>Evento</label>
              {eventSelector}
            </div>
          ) : null}
          {budgetImpact}
          <Btn variant="primary" onClick={handleSubmit} disabled={submitting} style={{ width: '100%', justifyContent: 'center', height: 52, fontSize: 16 }}>
            <Icon.check /> {submitting ? 'Guardando…' : 'Añadir gasto'}
          </Btn>
        </Card>
      </div>
    </NidoShell>
  );
};
