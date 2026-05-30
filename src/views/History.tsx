import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Api } from '../api';
import { formatCycleLabel, formatCycleRange, formatDayLabelWithWeekday } from '../lib/dates';
import { useCategoryManagement } from '../hooks/useCategoryManagement';
import { useContextSelector } from '../hooks/useContextSelector';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../auth';
import { useIsMobile } from '../hooks/useMediaQuery';
import { CACHE_KEYS, cacheBus } from '../lib/cacheBus';
import { showToast } from '../components/Toast';
import { resolveCycleForDate } from '../lib/resolveCycleForDate';
import type { CycleSummary } from '../api-types/cycles';
import { formatMoney, formatMoneyExact, matchesMoneySearch } from '../lib/money';
import { ErrorView } from '../components/ErrorView';
import { handleApiError } from '../lib/handleApiError';
import type { Expense } from '../api-types/expenses';
import {
  Card, Eyebrow, Bar, CatIcon, Seg, IconBtn, Btn, FilterChip, Who, Icon,
  CONTEXT_SEG_OPTIONS, Portal,
} from '../components/nido';

type GroupMode = 'day' | 'cat' | 'person';
type SortKey = 'date' | 'amount';
type SortDir = 'asc' | 'desc';

const toNum = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export const History: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const incomingState = (location.state ?? {}) as { initialContext?: 'shared' | 'personal'; initialCategory?: string };
  const { activeContext, setActiveContext } = useContextSelector(incomingState.initialContext ?? 'shared');
  const { categories, getCategoryDef } = useCategoryManagement(activeContext);

  const normalizedUserKey = (user?.username || '').toLowerCase().includes('maria') || (user?.username || '').toLowerCase().includes('mara') ? 'maria' : 'samuel';
  const whoMeta = (e: Expense) => {
    const mine = (user?.id && e.paid_by_user_id != null) ? e.paid_by_user_id === user.id : e.paid_by === normalizedUserKey;
    const label = mine ? 'Tú' : (e.paid_by === 'maria' ? 'María' : e.paid_by === 'samuel' ? 'Samuel' : cap(e.paid_by || '—'));
    return { mine, label };
  };

  // cycle navigation
  const loadCyclesFn = useCallback(async () => {
    const data = await Api.listCycles();
    return Array.isArray(data) ? data : [];
  }, []);
  const { data: cyclesData } = useResource<CycleSummary[]>(loadCyclesFn, { invalidationKey: CACHE_KEYS.cycles });
  const cycles = cyclesData ?? [];
  const [cycleIndex, setCycleIndex] = useState(0);
  const currentCycle = cycles.length > 0 ? cycles[cycleIndex] : null;

  // controls
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(incomingState.initialCategory ?? '');
  const [groupMode, setGroupMode] = useState<GroupMode>('day');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);

  // bulk select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // edit modal (interim glass overlay — readable over paper; restyled in widgets pass)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editTargetCycleId, setEditTargetCycleId] = useState<number | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('0');
  const [editCategory, setEditCategory] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editType, setEditType] = useState<'shared' | 'personal'>('shared');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);
  const cmdRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cmdRef.current && !cmdRef.current.contains(e.target as Node)) setCmdOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadExpensesFn = useCallback(async (): Promise<Expense[]> => {
    const data = currentCycle?.start_date
      ? await Api.getExpenses({ start_date: currentCycle.start_date, end_date: currentCycle.end_date ?? undefined, cycle_id: currentCycle.id })
      : await Api.getExpenses();
    return Array.isArray(data) ? data : [];
  }, [currentCycle?.id, currentCycle?.start_date, currentCycle?.end_date]);

  const { data: expensesData, loading, error, reload: loadExpenses } = useResource<Expense[]>(loadExpensesFn, {
    fallbackMessage: 'Error al cargar movimientos',
    invalidationKey: CACHE_KEYS.expenses,
  });
  const expenses = expensesData ?? [];

  const navigateCycle = (dir: -1 | 1) => setCycleIndex((prev) => Math.max(0, Math.min(cycles.length - 1, prev + dir)));

  const cycleLabel = !currentCycle
    ? 'Todos los gastos'
    : (cycleIndex === 0 && currentCycle.status === 'active')
      ? 'Ciclo actual'
      : currentCycle.start_date ? formatCycleLabel(currentCycle.start_date) : 'Ciclo';
  const cycleRange = currentCycle?.start_date
    ? formatCycleRange(currentCycle.start_date, currentCycle.end_date ?? new Date().toISOString().slice(0, 10))
    : '';

  const filteredExpenses = useMemo(() => {
    const result = expenses.filter((e) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term || e.description.toLowerCase().includes(term) || e.category.toLowerCase().includes(term) || matchesMoneySearch(e.amount, searchTerm);
      const matchesContext = activeContext === 'shared' ? e.type === 'shared' : e.type === 'personal';
      const matchesCategory = selectedCategory === '' || e.category === selectedCategory;
      const matchesDateFrom = !dateFrom || e.date >= dateFrom;
      const matchesDateTo = !dateTo || e.date <= dateTo;
      return matchesSearch && matchesContext && matchesCategory && matchesDateFrom && matchesDateTo;
    });
    result.sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'amount') return (a.amount - b.amount) * mul;
      return a.date.localeCompare(b.date) * mul;
    });
    return result;
  }, [expenses, searchTerm, activeContext, selectedCategory, dateFrom, dateTo, sortKey, sortDir]);

  const total = filteredExpenses.reduce((sum, e) => sum + toNum(e.amount), 0);
  const average = filteredExpenses.length > 0 ? total / filteredExpenses.length : 0;
  const dayCount = new Set(filteredExpenses.map((e) => e.date)).size;
  const hasDateFilter = !!(dateFrom || dateTo);

  useEffect(() => {
    if (!selectedCategory) return;
    if (!categories.some((item) => item.name === selectedCategory)) setSelectedCategory('');
  }, [categories, selectedCategory]);

  // grouping
  interface Group { key: string; label: string; rows: Expense[]; sub: number; emoji?: string; color?: string; payer?: { mine: boolean; label: string } }
  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();
    for (const e of filteredExpenses) {
      const who = whoMeta(e);
      const key = groupMode === 'cat' ? e.category : groupMode === 'person' ? who.label : e.date;
      if (!map.has(key)) {
        const def = groupMode === 'cat' ? getCategoryDef(e.category) : undefined;
        map.set(key, {
          key,
          label: groupMode === 'day' ? formatDayLabelWithWeekday(e.date) : key,
          rows: [],
          sub: 0,
          emoji: def?.emoji,
          color: def?.color,
          payer: groupMode === 'person' ? who : undefined,
        });
      }
      const g = map.get(key)!;
      g.rows.push(e);
      g.sub += toNum(e.amount);
    }
    const arr = [...map.values()];
    if (groupMode === 'day') {
      arr.sort((a, b) => (sortDir === 'desc' ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key)));
    } else {
      arr.sort((a, b) => b.sub - a.sub);
    }
    return arr;
  }, [filteredExpenses, groupMode, sortDir, categories]);

  const dayMax = Math.max(...groups.map((g) => g.sub), 1);

  // category breakdown for the side panel
  const breakdown = useMemo(() => {
    const map = new Map<string, { cat: string; emoji?: string; color?: string; v: number; n: number }>();
    for (const e of filteredExpenses) {
      if (!map.has(e.category)) {
        const def = getCategoryDef(e.category);
        map.set(e.category, { cat: e.category, emoji: def?.emoji, color: def?.color, v: 0, n: 0 });
      }
      const c = map.get(e.category)!;
      c.v += toNum(e.amount);
      c.n += 1;
    }
    return [...map.values()].sort((a, b) => b.v - a.v);
  }, [filteredExpenses, categories]);
  const breakdownMax = Math.max(...breakdown.map((c) => c.v), 1);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
    // group-by-day only makes sense with date sort; switch to day grouping when sorting by date
    if (key === 'amount' && groupMode === 'day') setGroupMode('day');
  };

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setEditDescription(expense.description);
    setEditAmount(String(expense.amount));
    setEditCategory(expense.category);
    setEditDate(expense.date);
    setEditType(expense.type);
    setEditTargetCycleId(expense.cycle_id ?? null);
    setEditError('');
    setCategorySearch('');
    setCmdOpen(false);
  };
  const closeEditModal = () => {
    if (savingEdit) return;
    setEditingExpense(null); setEditError(''); setCategorySearch(''); setCmdOpen(false);
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    const editAmt = parseFloat(editAmount);
    if (!Number.isFinite(editAmt) || editAmt <= 0) return setEditError('Ingresa un monto válido');
    if (!editDescription.trim()) return setEditError('Ingresa una descripción');
    if (!editCategory.trim()) return setEditError('Selecciona una categoría');
    if (!editDate) return setEditError('Selecciona una fecha');
    try {
      setSavingEdit(true); setEditError('');
      await Api.updateExpense(editingExpense.id, {
        description: editDescription.trim(),
        amount: editAmt,
        category: editCategory.trim(),
        date: editDate,
        type: editType,
        status: editingExpense.status ?? 'paid',
        cycle_id: editTargetCycleId,
      });
      cacheBus.invalidate(CACHE_KEYS.expenses, CACHE_KEYS.summary, CACHE_KEYS.categories);
      showToast('Gasto actualizado', 'success');
      closeEditModal();
    } catch (err) {
      handleApiError(err, 'Error al actualizar el gasto');
      setEditError('Error al actualizar el gasto');
    } finally { setSavingEdit(false); }
  };

  const handleDeleteExpense = async () => {
    if (!editingExpense) return;
    if (!confirm('¿Eliminar este gasto? Esta acción no se puede deshacer.')) return;
    try {
      setSavingEdit(true);
      await Api.deleteExpense(editingExpense.id);
      cacheBus.invalidate(CACHE_KEYS.expenses, CACHE_KEYS.summary, CACHE_KEYS.categories);
      showToast('Gasto eliminado', 'success');
      closeEditModal();
    } catch (err) {
      handleApiError(err, 'Error al eliminar el gasto');
      setEditError('Error al eliminar el gasto');
    } finally { setSavingEdit(false); }
  };

  const handleDuplicateExpense = async () => {
    if (!editingExpense) return;
    const dupAmt = parseFloat(editAmount);
    if (!Number.isFinite(dupAmt) || dupAmt <= 0) { setEditError('Ingresa un monto válido'); return; }
    if (!editDescription.trim() || !editCategory.trim() || !editDate) { setEditError('Completa los campos antes de duplicar'); return; }
    try {
      setSavingEdit(true); setEditError('');
      await Api.createExpense({
        description: editDescription.trim(),
        amount: dupAmt,
        category: editCategory.trim(),
        category_id: categories.find((c) => c.name === editCategory.trim())?.id,
        date: editDate,
        type: editType,
        cycle_id: editTargetCycleId,
      });
      cacheBus.invalidate(CACHE_KEYS.expenses, CACHE_KEYS.summary, CACHE_KEYS.categories);
      showToast('Gasto duplicado', 'success');
      closeEditModal();
    } catch (err) {
      handleApiError(err, 'Error al duplicar el gasto');
    } finally { setSavingEdit(false); }
  };

  const toggleSelected = (id: number) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const handleSelectAll = () => {
    if (selectedIds.size === filteredExpenses.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredExpenses.map((e) => e.id)));
  };
  const handleBulkDelete = async () => {
    if (!confirm(`¿Eliminar ${selectedIds.size} gastos? Esta acción no se puede deshacer.`)) return;
    try {
      setBulkDeleting(true);
      for (const id of selectedIds) await Api.deleteExpense(id);
      cacheBus.invalidate(CACHE_KEYS.expenses, CACHE_KEYS.summary, CACHE_KEYS.categories);
      showToast(`${selectedIds.size} gastos eliminados`, 'success');
      setSelectedIds(new Set()); setSelectMode(false);
    } catch (err) {
      handleApiError(err, 'Error al eliminar gastos');
    } finally { setBulkDeleting(false); }
  };

  const exportCsv = async () => {
    try {
      const params = new URLSearchParams({ context: activeContext });
      if (currentCycle?.start_date) params.set('start_date', currentCycle.start_date);
      if (currentCycle?.end_date) params.set('end_date', currentCycle.end_date);
      const resp = await fetch(`/api/expenses/export?${params}`, { credentials: 'include' });
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nido-gastos-${currentCycle?.start_date || 'todos'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      handleApiError(err, 'No se pudo exportar el CSV');
    }
  };

  /* ── expense row ─────────────────────────────────────────────── */
  const expenseRow = (e: Expense) => {
    const def = getCategoryDef(e.category);
    const who = whoMeta(e);
    const selected = selectedIds.has(e.id);
    return (
      <div
        key={e.id}
        className="hrow"
        onClick={selectMode ? () => toggleSelected(e.id) : () => openEditModal(e)}
        style={{ cursor: 'pointer' }}
      >
        {selectMode ? (
          <span style={{ width: 36, height: 36, borderRadius: 11, flex: '0 0 auto', display: 'grid', placeItems: 'center', border: `1.6px solid ${selected ? 'var(--clay)' : 'var(--line-2)'}`, background: selected ? 'var(--clay)' : 'transparent', color: '#fff' }}>
            {selected ? <span style={{ display: 'flex', width: 16, height: 16 }}><Icon.check /></span> : null}
          </span>
        ) : (
          <CatIcon color={def?.color} bg={def?.color ? `${def.color}1A` : undefined} tone={def?.color ? undefined : 'ink'} size={36} radius={10}>
            <span style={{ fontSize: 16 }}>{def?.emoji ?? '📂'}</span>
          </CatIcon>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.description}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{e.category}</div>
        </div>
        {!isMobile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 110, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>pagó</span>
            <Who mine={who.mine}>{who.label}</Who>
          </div>
        ) : null}
        <div style={{ textAlign: 'right', minWidth: isMobile ? 80 : 96 }}>
          <div className="amt amt-neg" style={{ fontSize: 15 }}>−{formatMoneyExact(toNum(e.amount))}</div>
          {isMobile ? <div style={{ marginTop: 2 }}><Who mine={who.mine}>{who.label}</Who></div> : null}
        </div>
      </div>
    );
  };

  const groupBlock = (g: Group) => (
    <div key={g.key}>
      <div className="ghead">
        {groupMode === 'cat' ? (
          <CatIcon color={g.color} bg={g.color ? `${g.color}1A` : undefined} tone={g.color ? undefined : 'ink'} size={26} radius={8}>
            <span style={{ fontSize: 13 }}>{g.emoji ?? '📂'}</span>
          </CatIcon>
        ) : null}
        {groupMode === 'person' && g.payer ? <Who mine={g.payer.mine}>{g.payer.label}</Who> : null}
        <span className="eyebrow">{g.label}</span>
        <span className="gsub">· {g.rows.length} {g.rows.length === 1 ? 'gasto' : 'gastos'}</span>
        <span className="gtot">−{formatMoney(g.sub)}</span>
      </div>
      {groupMode === 'day' ? (
        <div className="bar thin" style={{ margin: '0 16px 6px' }}>
          <i style={{ width: `${(g.sub / dayMax) * 100}%`, background: 'var(--clay)', opacity: 0.4 }} />
        </div>
      ) : null}
      {g.rows.map(expenseRow)}
    </div>
  );

  const sidePanel = (
    <Card pad style={{ position: isMobile ? undefined : 'sticky', top: 20 }}>
      <h3 className="serif" style={{ fontSize: 21, marginBottom: 3 }}>En qué se va</h3>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 18 }}>Por categoría · {cycleLabel.toLowerCase()}</div>
      {breakdown.length ? breakdown.map((c) => (
        <div key={c.cat} style={{ marginBottom: 15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
            <CatIcon color={c.color} bg={c.color ? `${c.color}1A` : undefined} tone={c.color ? undefined : 'ink'} size={24} radius={8}>
              <span style={{ fontSize: 13 }}>{c.emoji ?? '📂'}</span>
            </CatIcon>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{c.cat}</span>
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{formatMoney(c.v)}</span>
          </div>
          <Bar pct={(c.v / breakdownMax) * 100} color={c.color || 'var(--clay)'} thin />
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{Math.round((c.v / (total || 1)) * 100)}% · {c.n} {c.n === 1 ? 'gasto' : 'gastos'}</div>
        </div>
      )) : <div style={{ color: 'var(--ink-3)', fontSize: 13.5 }}>Sin movimientos con este filtro.</div>}
    </Card>
  );

  /* ── header / controls ───────────────────────────────────────── */
  const header = (
    <div style={{ display: 'flex', alignItems: isMobile ? 'center' : 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: isMobile ? 14 : 20 }}>
      <div>
        <h1 className={isMobile ? 'serif' : 'ptitle'} style={isMobile ? { fontSize: 26, lineHeight: 1 } : undefined}>Historial</h1>
        <div className="psub" style={isMobile ? { fontSize: 12, marginTop: 2 } : undefined}>El libro de cuentas del nido</div>
      </div>
    </div>
  );

  const cycleNav = (
    <div className="seg" style={{ padding: 4, ...(isMobile ? { width: '100%' } : null) }}>
      <button type="button" onClick={() => navigateCycle(1)} disabled={cycleIndex >= cycles.length - 1} style={{ padding: '8px 12px', opacity: cycleIndex >= cycles.length - 1 ? 0.35 : 1 }} aria-label="Ciclo anterior"><Icon.back /></button>
      <button type="button" className="on" style={{ flex: isMobile ? 1 : undefined, justifyContent: 'center', gap: 8 }}>
        <Icon.cal /><span>{cycleLabel}</span>{!isMobile && cycleRange ? <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>· {cycleRange}</span> : null}
      </button>
      <button type="button" onClick={() => navigateCycle(-1)} disabled={cycleIndex <= 0} style={{ padding: '8px 12px', opacity: cycleIndex <= 0 ? 0.35 : 1 }} aria-label="Ciclo siguiente"><Icon.fwd /></button>
    </div>
  );

  const GROUP_BTNS: Array<[GroupMode, string]> = [['day', 'Día'], ['cat', 'Categoría'], ['person', 'Persona']];

  const controls = (
    <Card pad style={{ padding: isMobile ? '14px 16px' : '18px 20px', marginBottom: isMobile ? 14 : 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <label className="search" style={{ flex: 1, minWidth: 180 }}>
          <Icon.search />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar comercio, categoría o importe…"
            style={{ border: 0, background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: 14, color: 'var(--ink)', width: '100%' }}
          />
        </label>
        {!isMobile ? (
          <div className="seg">
            {GROUP_BTNS.map(([k, l]) => (
              <button key={k} type="button" className={groupMode === k ? 'on' : ''} onClick={() => setGroupMode(k)} style={{ padding: '8px 16px' }}>{l}</button>
            ))}
          </div>
        ) : null}
        <IconBtn aria-label="Filtrar por fecha" onClick={() => setShowDateFilter((v) => !v)} style={hasDateFilter ? { borderColor: 'var(--clay)', color: 'var(--clay)' } : undefined}><Icon.cal /></IconBtn>
        <IconBtn aria-label="Seleccionar gastos" onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }} style={selectMode ? { borderColor: 'var(--clay)', color: 'var(--clay)' } : undefined}><Icon.check /></IconBtn>
        <IconBtn aria-label="Exportar CSV" onClick={exportCsv}><Icon.doc /></IconBtn>
      </div>

      {isMobile ? (
        <div className="seg" style={{ width: '100%', marginBottom: 12 }}>
          {GROUP_BTNS.map(([k, l]) => (
            <button key={k} type="button" className={groupMode === k ? 'on' : ''} onClick={() => setGroupMode(k)} style={{ flex: 1, justifyContent: 'center' }}>{l}</button>
          ))}
        </div>
      ) : null}

      {showDateFilter ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 140 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Desde</div>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface-2)', fontFamily: 'inherit', color: 'var(--ink)' }} />
          </label>
          <label style={{ flex: 1, minWidth: 140 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Hasta</div>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface-2)', fontFamily: 'inherit', color: 'var(--ink)' }} />
          </label>
          {hasDateFilter ? <Btn variant="ghost" onClick={() => { setDateFrom(''); setDateTo(''); }}><Icon.x /> Limpiar</Btn> : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <FilterChip on={selectedCategory === ''} onClick={() => setSelectedCategory('')}>Todas</FilterChip>
        {categories.map((c) => (
          <FilterChip key={c.id ?? c.name} on={selectedCategory === c.name} hasIcon onClick={() => setSelectedCategory((cur) => (cur === c.name ? '' : c.name))}>
            <CatIcon color={c.color} bg={c.color ? `${c.color}1A` : undefined} size={22} radius={7}><span style={{ fontSize: 13 }}>{c.emoji ?? '📂'}</span></CatIcon>
            {c.name}
          </FilterChip>
        ))}
        <button type="button" onClick={() => toggleSort('amount')} className="fchip" style={{ marginLeft: 'auto' }}>
          <Icon.trend /> Monto {sortKey === 'amount' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
        </button>
        <button type="button" onClick={() => toggleSort('date')} className="fchip">
          <Icon.cal /> Fecha {sortKey === 'date' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
        </button>
      </div>
    </Card>
  );

  const summaryCard = (
    <Card pad style={{ marginBottom: isMobile ? 14 : 18, background: 'linear-gradient(140deg, var(--surface) 60%, var(--paper-2))', padding: isMobile ? '18px 20px' : '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Eyebrow>Gastado · {cycleRange || cycleLabel}</Eyebrow>
      </div>
      <div className="serif" style={{ fontSize: isMobile ? 44 : 52, lineHeight: 0.9, margin: '8px 0 10px' }}>{formatMoney(total)}</div>
      <div style={{ display: 'flex', gap: isMobile ? 18 : 26, flexWrap: 'wrap' }}>
        {[[String(filteredExpenses.length), 'gastos'], [formatMoney(average), 'ticket medio'], [String(dayCount), 'días con gasto']].map(([v, l]) => (
          <div key={l}>
            <div style={{ fontSize: isMobile ? 17 : 22, fontWeight: 700 }}>{v}</div>
            <Eyebrow style={{ fontSize: 10, marginTop: 1 }}>{l}</Eyebrow>
          </div>
        ))}
      </div>
    </Card>
  );

  const listCard = error ? (
    <ErrorView message={error} onRetry={loadExpenses} />
  ) : (loading || bulkDeleting) ? (
    <Card pad style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[0, 1, 2, 3].map((i) => <div key={i} className="hrow" style={{ height: 56, opacity: 0.4 - i * 0.07, background: 'var(--inset)', borderRadius: 12 }} />)}
    </Card>
  ) : filteredExpenses.length === 0 ? (
    <Card pad style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 15, color: 'var(--ink-2)', fontWeight: 600, marginBottom: 4 }}>
        {searchTerm || selectedCategory || hasDateFilter ? 'Sin movimientos con este filtro' : 'Aún no hay gastos en este ciclo'}
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>
        {searchTerm || selectedCategory || hasDateFilter ? 'Prueba a quitar algún filtro.' : 'Cuando apuntéis el primero, aparecerá aquí.'}
      </div>
    </Card>
  ) : (
    <Card pad style={{ padding: '8px 10px 16px' }}>
      {groups.map(groupBlock)}
    </Card>
  );

  const content = isMobile ? (
    <>
      {header}
      <div style={{ marginBottom: 12 }}>{cycleNav}</div>
      <div style={{ marginBottom: 12 }}><Seg value={activeContext} options={CONTEXT_SEG_OPTIONS} onChange={setActiveContext} full /></div>
      {summaryCard}
      {controls}
      {listCard}
      {breakdown.length > 0 && filteredExpenses.length > 0 ? <div style={{ marginTop: 14 }}>{sidePanel}</div> : null}
    </>
  ) : (
    <>
      {header}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
        {cycleNav}
        <Seg value={activeContext} options={CONTEXT_SEG_OPTIONS} onChange={setActiveContext} />
      </div>
      {summaryCard}
      {controls}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 22, alignItems: 'start' }}>
        {listCard}
        {sidePanel}
      </div>
    </>
  );

  return (
    <>
      {content}

      {selectMode && selectedIds.size > 0 ? (
        <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: isMobile ? 100 : 28, zIndex: 30, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderRadius: 999, background: 'var(--surface-2)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          <button type="button" onClick={handleSelectAll} style={{ background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 13.5, color: 'var(--ink-2)' }}>
            {selectedIds.size === filteredExpenses.length ? 'Deseleccionar' : 'Seleccionar todo'}
          </button>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{selectedIds.size} seleccionados</span>
          <Btn onClick={handleBulkDelete} style={{ borderColor: 'var(--berry)', color: 'var(--berry)' }}><Icon.trash /> Eliminar</Btn>
        </div>
      ) : null}

      {editingExpense ? (
        <Portal>
        <div className="modal-overlay open" onClick={closeEditModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: 'calc(100% - 24px)' }}>
            <h3>Editar gasto</h3>
            <p>Corrige categoría, monto, nombre, fecha o tipo sin crear un movimiento nuevo.</p>
            <form onSubmit={handleUpdateExpense}>
              <div className="form-row" style={{ marginBottom: 16 }}>
                <label>Descripción</label>
                <input className="form-input" value={editDescription} onChange={(e) => { setEditDescription(e.target.value); if (editError) setEditError(''); }} placeholder="¿En qué gastaste?" />
              </div>
              <div className="form-row" style={{ marginBottom: 16 }}>
                <label>Monto</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }}>€</span>
                  <input className="form-input" style={{ paddingLeft: 32 }} type="number" inputMode="decimal" min="0" step="0.01" value={editAmount} onChange={(e) => { setEditAmount(e.target.value); if (editError) setEditError(''); }} />
                </div>
              </div>
              <div className="form-row" style={{ marginBottom: 16, position: 'relative' }} ref={cmdRef}>
                <label>Categoría</label>
                <div className="cmd-palette" style={{ flex: 1, marginBottom: 0 }}>
                  <div className="cmd-input-wrap">
                    {editCategory ? (() => {
                      const def = getCategoryDef(editCategory);
                      return (
                        <span className="cmd-selected">
                          <div className="cmd-icon" style={{ background: def?.iconBg ?? 'var(--inset)', width: 20, height: 20 }}><span style={{ fontSize: 12 }}>{def?.emoji ?? '📂'}</span></div>
                          {editCategory}
                          <span className="cmd-x" onClick={(e) => { e.stopPropagation(); setEditCategory(''); }}>&times;</span>
                        </span>
                      );
                    })() : null}
                    <input className="cmd-input" placeholder="Buscar categoría…" value={categorySearch} onFocus={() => setCmdOpen(true)} onChange={(e) => { setCategorySearch(e.target.value); setCmdOpen(true); }} />
                  </div>
                  <div className={`cmd-dropdown${cmdOpen ? ' open' : ''}`}>
                    <div className="cmd-list">
                      {categories.filter((c) => c.name.toLowerCase().includes(categorySearch.toLowerCase()) || categorySearch === '').map((item) => (
                        <div key={item.id ?? item.name} className={`cmd-option${editCategory === item.name ? ' selected' : ''}`} onClick={() => { setEditCategory(item.name); setCategorySearch(''); setCmdOpen(false); }}>
                          <div className="cmd-icon" style={{ background: item.iconBg ?? 'var(--inset)' }}><span style={{ fontSize: 14 }}>{item.emoji ?? '📂'}</span></div>
                          {item.name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="form-row" style={{ marginBottom: 16 }}>
                <label>Fecha</label>
                <input className="form-input" type="date" value={editDate} onChange={(e) => { setEditDate(e.target.value); if (editError) setEditError(''); }} />
              </div>
              {(() => {
                const resolution = resolveCycleForDate(editDate, cycles);
                const active = cycles.find((c) => c.status === 'active');
                if (resolution.kind === 'in-active' || !active) return null;
                return (
                  <div className="cycle-attribution" style={{ marginBottom: 16 }}>
                    <div className="cycle-attribution__hint">
                      {resolution.kind === 'in-closed' ? 'Esta fecha cae fuera del ciclo actual' : 'No hay ciclo registrado en esa fecha'}
                    </div>
                    <div className="cycle-attribution__toggle">
                      <button type="button" className={`type-sel ${editTargetCycleId !== active.id ? 'type-sel--active' : ''}`} disabled={resolution.kind === 'no-cycle'} onClick={() => { if (resolution.kind === 'in-closed') setEditTargetCycleId(resolution.cycle.id); }}>
                        {resolution.kind === 'in-closed' ? `Ciclo ${resolution.cycle.month ?? resolution.cycle.start_date}` : 'Ciclo de esa fecha (sin datos)'}
                      </button>
                      <button type="button" className={`type-sel ${editTargetCycleId === active.id ? 'type-sel--active' : ''}`} onClick={() => setEditTargetCycleId(active.id)}>Ciclo actual</button>
                    </div>
                  </div>
                );
              })()}
              <div style={{ marginBottom: 16 }}>
                <div className="label">Tipo de gasto</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className={`type-sel${editType === 'shared' ? ' type-sel--active' : ''}`} onClick={() => setEditType('shared')}>Compartido</div>
                  <div className={`type-sel${editType === 'personal' ? ' type-sel--active' : ''}`} onClick={() => setEditType('personal')}>Personal</div>
                </div>
              </div>
              {editError ? <div className="add-expense__error-msg">{editError}</div> : null}
              <div className="edit-modal-actions">
                <div className="edit-modal-actions__secondary">
                  <button type="button" className="btn btn-danger-outline btn-sm" onClick={handleDeleteExpense} disabled={savingEdit}>Eliminar</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={handleDuplicateExpense} disabled={savingEdit}>Duplicar</button>
                </div>
                <div className="edit-modal-actions__primary">
                  <button type="button" className="btn btn-outline" onClick={closeEditModal} disabled={savingEdit}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={savingEdit}>{savingEdit ? 'Guardando…' : 'Guardar'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      ) : null}
    </>
  );
};
