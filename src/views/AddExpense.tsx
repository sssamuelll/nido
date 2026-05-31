import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { Eyebrow, Bar, CatIcon, Seg, Btn, FilterChip, Icon, Portal, CONTEXT_SEG_OPTIONS } from '../components/nido';
import type { CategoryDef } from '../hooks/useCategoryManagement';
import type { Expense } from '../api-types/expenses';
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
  // While typing the first operand (no operator pending), show the raw entry so
  // in-progress decimals like "42," render. Once an operator is pending, show
  // the live computed value (calcValue) so the displayed number ALWAYS equals
  // what submit will post — there is no "=" key to resolve it otherwise.
  if (s.entry !== '' && !(s.acc !== null && s.op)) return s.entry;
  return calcValue(s).toLocaleString('es-ES', { maximumFractionDigits: 2 });
};

const KEYS = ['1', '2', '3', '÷', '4', '5', '6', '×', '7', '8', '9', '−', ',', '0', '⌫', '+'];

export const AddExpense: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { categories } = useCategoryManagement();

  const [calc, setCalc] = useState<CalcState>(CALC_ZERO);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState<'shared' | 'personal'>('shared');
  const [date, setDate] = useState(todayISO());
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1); // mobile only
  const [repeatCount, setRepeatCount] = useState(1); // log N identical expenses at once
  const [categorySearch, setCategorySearch] = useState(''); // filter existing / create new
  const [catExpanded, setCatExpanded] = useState(false); // modal: reveal full category search
  const [recentOpen, setRecentOpen] = useState(false);   // modal: repeat-a-previous-expense menu

  const preset = location.state as { initialContext?: 'shared' | 'personal'; initialCategory?: string; eventId?: number } | null;
  useEffect(() => {
    if (preset?.initialContext) setType(preset.initialContext);
    if (preset?.initialCategory) setCategory(preset.initialCategory);
    if (preset?.eventId) setSelectedEventId(preset.eventId);
  }, [preset]);

  // Desktop renders as a modal over the dashboard: lock background scroll and
  // close on Escape. Mobile is a full stacked screen, so this is a no-op there.
  useEffect(() => {
    if (isMobile) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') navigate(-1); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isMobile, navigate]);

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

  // Recent expenses feed the modal's "Repetir un gasto anterior" quick-fill:
  // pick a past expense to clone its description / category / type / amount.
  const loadRecentFn = useCallback(async () => {
    const list = await Api.getExpenses();
    return Array.isArray(list) ? list : [];
  }, []);
  const { data: recentData } = useResource<Expense[]>(loadRecentFn, { invalidationKey: CACHE_KEYS.expenses });
  const recentExpenses = useMemo(() => {
    const sorted = (recentData ?? []).slice().sort((a, b) =>
      b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    const seen = new Set<string>();
    const out: Expense[] = [];
    for (const e of sorted) {
      const k = `${(e.description ?? '').toLowerCase()}|${e.amount}|${e.category ?? ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
      if (out.length >= 6) break;
    }
    return out;
  }, [recentData]);

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

  const numericAmount = calcValue(calc);

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
      // A brand-new category name (not in the existing list) self-heals on the
      // server: the expense POST creates + links the category row (AGENTS.md).
      const payload = {
        description: description.trim() || category || 'Gasto',
        amount: numericAmount,
        category: category || 'Otros',
        category_id: categories.find((c) => c.name === category)?.id,
        date,
        type,
        event_id: selectedEventId || undefined,
        cycle_id: targetCycleId,
      };
      const n = Math.max(1, Math.min(20, repeatCount));
      for (let i = 0; i < n; i++) {
        await Api.createExpense(payload);
      }
      // Include `categories`: a new category may have been created server-side,
      // so the cached category list must refresh.
      cacheBus.invalidate(CACHE_KEYS.expenses, CACHE_KEYS.summary, CACHE_KEYS.budget, CACHE_KEYS.categories);
      showToast(n > 1 ? `${n} gastos añadidos` : 'Gasto añadido', 'success');
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

  const closeModal = () => navigate(-1);

  // Clone a previous expense into the form (desktop "Repetir un gasto anterior").
  const applyRecent = (e: Expense) => {
    setDescription(e.description ?? '');
    setCategory(e.category ?? '');
    setType(e.type === 'personal' ? 'personal' : 'shared');
    const amt = Math.round((e.amount ?? 0) * 100) / 100;
    setCalc({ acc: null, op: null, entry: amt ? String(amt).replace('.', ',') : '' });
    setRecentOpen(false);
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

  // Compact, centred date field for the desktop modal. The label opens the
  // native picker (showPicker) so back-dating a gasto is one click; the overlay
  // input stays as a fallback for browsers without showPicker.
  const dateInputRef = useRef<HTMLInputElement>(null);
  const dateFieldModal = (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => dateInputRef.current?.showPicker?.()}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface-2)', color: 'var(--ink)', font: 'inherit', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}
      >
        <Icon.cal /> {formatDayLabel(date)}
      </button>
      <input
        ref={dateInputRef}
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Fecha del gasto"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 0, cursor: 'pointer' }}
      />
    </div>
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

  const trimmedCatSearch = categorySearch.trim();
  const filteredCats = categories.filter((c) => c.name.toLowerCase().includes(trimmedCatSearch.toLowerCase()));
  const customSelected = category !== '' && !categories.some((c) => c.name === category);
  const canCreateCat = trimmedCatSearch !== '' && !categories.some((c) => c.name.toLowerCase() === trimmedCatSearch.toLowerCase());

  const categoryPicker = (scroll: boolean) => (
    <div>
      <input
        value={categorySearch}
        onChange={(e) => setCategorySearch(e.target.value)}
        placeholder="Buscar o crear categoría…"
        style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14, outline: 'none', marginBottom: 10 }}
      />
      <div style={scroll ? { display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -20px', padding: '0 20px 2px' } : { display: 'flex', flexWrap: 'wrap', gap: 9 }}>
        {/* a custom (newly-typed) category stays visible as the selected chip */}
        {customSelected ? (
          <FilterChip on hasIcon onClick={() => {}} style={scroll ? { flex: '0 0 auto' } : undefined}>
            <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22 }}><Icon.tag /></span>
            {category}
          </FilterChip>
        ) : null}
        {filteredCats.map((c: CategoryDef) => (
          <FilterChip
            key={c.name}
            on={category === c.name}
            hasIcon
            onClick={() => { setCategory(c.name); setCategorySearch(''); }}
            style={scroll ? { flex: '0 0 auto' } : undefined}
          >
            <CatIcon color={c.color} bg={c.color ? `${c.color}1A` : undefined} size={24} radius={7}>
              <span style={{ fontSize: 14 }}>{c.emoji}</span>
            </CatIcon>
            {c.name}
          </FilterChip>
        ))}
        {canCreateCat && trimmedCatSearch.toLowerCase() !== category.toLowerCase() ? (
          <FilterChip hasIcon onClick={() => { setCategory(trimmedCatSearch); setCategorySearch(''); }} style={{ ...(scroll ? { flex: '0 0 auto' } : null), borderStyle: 'dashed' }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22 }}><Icon.plusS /></span>
            Crear «{trimmedCatSearch}»
          </FilterChip>
        ) : null}
        {categories.length === 0 && !trimmedCatSearch ? (
          <span style={{ fontSize: 13, color: 'var(--ink-3)', padding: '7px 4px' }}>Escribe el nombre de una categoría para crearla.</span>
        ) : null}
      </div>
    </div>
  );

  // Modal category section: a compact chip row (first 6 + "Más"). "Más" reveals
  // the full search-or-create picker, so a new category can still be created.
  const modalCategory = catExpanded ? categoryPicker(false) : (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
      {customSelected ? (
        <FilterChip on hasIcon onClick={() => {}}>
          <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22 }}><Icon.tag /></span>
          {category}
        </FilterChip>
      ) : null}
      {categories.slice(0, 6).map((c: CategoryDef) => (
        <FilterChip key={c.name} on={category === c.name} hasIcon onClick={() => setCategory(c.name)}>
          <CatIcon color={c.color} bg={c.color ? `${c.color}1A` : undefined} size={24} radius={7}>
            <span style={{ fontSize: 14 }}>{c.emoji}</span>
          </CatIcon>
          {c.name}
        </FilterChip>
      ))}
      <FilterChip hasIcon onClick={() => setCatExpanded(true)} style={{ borderStyle: 'dashed' }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22 }}><Icon.plusS /></span>
        Más
      </FilterChip>
    </div>
  );

  const repeatStepper = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Repetir gasto</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Añade varias copias iguales</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface-2)' }}>
        <button type="button" aria-label="Menos" onClick={() => setRepeatCount((c) => Math.max(1, c - 1))} disabled={repeatCount <= 1} style={{ font: 'inherit', cursor: 'pointer', border: 0, background: 'transparent', color: 'var(--ink-2)', width: 40, height: 40, fontSize: 18, fontWeight: 600, opacity: repeatCount <= 1 ? 0.4 : 1 }}>−</button>
        <span style={{ minWidth: 40, textAlign: 'center', fontWeight: 700, fontSize: 15 }}>×{repeatCount}</span>
        <button type="button" aria-label="Más" onClick={() => setRepeatCount((c) => Math.min(20, c + 1))} disabled={repeatCount >= 20} style={{ font: 'inherit', cursor: 'pointer', border: 0, background: 'transparent', color: 'var(--ink-2)', width: 40, height: 40, fontSize: 18, fontWeight: 600, opacity: repeatCount >= 20 ? 0.4 : 1 }}>+</button>
      </div>
    </div>
  );

  const submitLabel = submitting ? 'Guardando…' : repeatCount > 1 ? `Añadir ${repeatCount} gastos` : 'Añadir gasto';

  const budgetImpact = impact ? (
    <div style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--inset)', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600 }}>Tras añadirlo · {category}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{formatMoney(impact.after)}<span style={{ color: 'var(--ink-3)' }}>/{formatMoney(impact.budget)}</span></span>
      </div>
      <Bar pct={impact.pct} over={impact.over} fill="pine" thin />
      {impact.over ? (
        <div style={{ fontSize: 11.5, color: 'var(--honey-ink)', fontWeight: 600, marginTop: 7 }}>Se pasará {formatMoney(impact.overBy)} del tope de {category}</div>
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
                {categoryPicker(true)}
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

              {repeatStepper}

              <Btn variant="primary" onClick={handleSubmit} disabled={submitting} style={{ width: '100%', height: 54, fontSize: 16, marginTop: 4 }}>
                <Icon.check /> {submitLabel}
              </Btn>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── DESKTOP: a centred modal painted over the dashboard ───── */
  return (
    <Portal>
      <div
        onClick={closeModal}
        style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(43,38,32,.42)', backdropFilter: 'blur(3px)' }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Nuevo gasto"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 26,
            width: '100%',
            maxWidth: 860,
            maxHeight: 'calc(100vh - 48px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 30px 70px rgba(43,38,32,.30)',
            animation: 'nido-pop .18s cubic-bezier(.2,.9,.3,1.2)',
          }}
        >
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 26px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ display: 'flex', color: 'var(--clay)' }}><Icon.plus /></span>
              <h2 className="serif" style={{ fontSize: 24, lineHeight: 1 }}>Nuevo gasto</h2>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={closeModal}
              style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 999, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink-2)', cursor: 'pointer' }}
            >
              <Icon.x />
            </button>
          </div>

          {/* body: details (left) + amount keypad (right) */}
          <div style={{ display: 'flex', minHeight: 0, overflowY: 'auto' }}>
            <div style={{ flex: '1 1 0', minWidth: 0, background: 'var(--surface)', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Descripción</label>
                {descriptionField}
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '0 0 148px', minWidth: 130 }}>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Fecha</label>
                  {dateFieldModal}
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Tipo</label>
                  {typeToggle}
                </div>
              </div>
              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 10 }}>Categoría</label>
                {modalCategory}
              </div>
              {cycleNote}
              {eventSelector ? (
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 10 }}>Evento</label>
                  {eventSelector}
                </div>
              ) : null}
              {budgetImpact}
            </div>

            <div style={{ flex: '0 0 332px', background: 'var(--inset)', display: 'flex', flexDirection: 'column', padding: '22px 24px', gap: 18 }}>
              <div style={{ textAlign: 'right' }}>
                <Eyebrow style={{ marginBottom: 6 }}>Importe</Eyebrow>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 6 }}>
                  <span style={{ fontSize: 26, color: 'var(--ink-3)' }}>€</span>
                  <span style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1 }}>{calcDisplay(calc)}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, flex: 1, minHeight: 0 }}>
                {KEYS.map((k) => {
                  const op = isOp(k) || k === '⌫';
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setCalc((s) => pressKey(s, k))}
                      style={{ font: 'inherit', cursor: 'pointer', border: '1px solid var(--line)', minHeight: 56, background: op ? 'var(--inset)' : 'var(--surface-2)', color: op ? 'var(--ink-2)' : 'var(--ink)', borderRadius: 14, fontSize: op ? 19 : 22, fontWeight: 600, display: 'grid', placeItems: 'center' }}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 26px', borderTop: '1px solid var(--line)' }}>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                disabled={recentExpenses.length === 0}
                onClick={() => setRecentOpen((o) => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'inherit', fontSize: 13.5, fontWeight: 600, color: recentExpenses.length ? 'var(--ink-2)' : 'var(--ink-3)', background: 'none', border: 0, cursor: recentExpenses.length ? 'pointer' : 'default', padding: '6px 4px' }}
              >
                <Icon.repeat /> Repetir un gasto anterior
              </button>
              {recentOpen && recentExpenses.length ? (
                <>
                  <div onClick={() => setRecentOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1 }} />
                  <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 2, width: 300, maxHeight: 320, overflowY: 'auto', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: '0 18px 44px rgba(43,38,32,.22)', padding: 6 }}>
                    {recentExpenses.map((e) => {
                      const def = categories.find((c) => c.name === e.category);
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => applyRecent(e)}
                          style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', font: 'inherit', background: 'none', border: 0, borderRadius: 11, padding: '9px 10px', cursor: 'pointer' }}
                          onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--inset)'; }}
                          onMouseLeave={(ev) => { ev.currentTarget.style.background = 'none'; }}
                        >
                          <CatIcon color={def?.color} bg={def?.color ? `${def.color}1A` : 'var(--inset)'} size={32} radius={9}>
                            <span style={{ fontSize: 16 }}>{def?.emoji ?? '🧾'}</span>
                          </CatIcon>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.description || e.category || 'Gasto'}</span>
                            <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)' }}>{e.category || 'Sin categoría'}</span>
                          </span>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{formatMoney(e.amount)}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
            <Btn variant="primary" onClick={handleSubmit} disabled={submitting} style={{ height: 50, fontSize: 15.5, paddingInline: 22 }}>
              <Icon.check /> {submitLabel}
            </Btn>
          </div>
        </div>
      </div>
    </Portal>
  );
};
