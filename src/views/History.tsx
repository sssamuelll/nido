import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Api } from '../api';
import { format } from 'date-fns';
import { useCategoryManagement } from '../hooks/useCategoryManagement';
import { useContextSelector } from '../hooks/useContextSelector';
import { ContextTabs } from '../components/ContextTabs';
import { MonthNavigator } from '../components/MonthNavigator';
import { showToast } from '../components/Toast';
import { ArrowUpDown, Calendar, X } from 'lucide-react';

const TagIcon = () => (
  <svg width="16" height="16" fill="none" stroke="var(--tm)" viewBox="0 0 24 24" strokeWidth={2}>
    <path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
  </svg>
);

const EditIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

const PlusIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path d="M12 4v16m-8-8h16" />
  </svg>
);

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

type Expense = {
  id: number;
  description: string;
  amount: number;
  category: string;
  date: string;
  paid_by: string;
  type: 'shared' | 'personal';
  status?: 'paid' | 'pending';
};

type CycleInfo = {
  id: number;
  month: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  started_at: string | null;
};

/* Category color map matching design reference icon-c backgrounds */
const CAT_COLORS: Record<string, { bg: string; stroke: string }> = {
  restaurant: { bg: 'var(--rl)', stroke: '#F87171' },
  gastos: { bg: 'var(--bl)', stroke: '#60A5FA' },
  supermercado: { bg: 'var(--bl)', stroke: '#60A5FA' },
  servicios: { bg: 'var(--ol)', stroke: '#FBBF24' },
  ocio: { bg: 'var(--pl)', stroke: '#A78BFA' },
  inversion: { bg: 'var(--gl)', stroke: '#34D399' },
};

/* Payer badge class matching design reference */
const PAYER_BADGE: Record<string, string> = {
  samuel: 'badge badge-g',
  maria: 'badge badge-p',
  María: 'badge badge-p',
  Samuel: 'badge badge-g',
  shared: 'badge badge-b',
};

const payerDisplayName = (p: string) => {
  if (!p || p === 'shared') return 'Compartido';
  return p.charAt(0).toUpperCase() + p.slice(1);
};

export const History: React.FC = () => {
  const location = useLocation();
  const incomingState = (location.state ?? {}) as { initialContext?: 'shared' | 'personal'; initialCategory?: string };
  const { activeContext, setActiveContext } = useContextSelector(incomingState.initialContext ?? 'shared');
  const { categories, getCategoryDef, reloadCategories } = useCategoryManagement(activeContext);

  // Cycle-based navigation state
  const [cycles, setCycles] = useState<CycleInfo[]>([]);
  const [cycleIndex, setCycleIndex] = useState(0); // 0 = most recent
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(incomingState.initialCategory ?? '');

  // Date filter
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);

  // Sort
  type SortKey = 'date' | 'amount';
  type SortDir = 'asc' | 'desc';
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
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

  // Current cycle being viewed (null = all expenses)
  const currentCycle = cycles.length > 0 ? cycles[cycleIndex] : null;

  // Load cycles on mount
  useEffect(() => {
    const loadCycles = async () => {
      try {
        const data = await Api.listCycles();
        setCycles(Array.isArray(data) ? data : []);
      } catch {
        // If listing fails, we still show all expenses
        setCycles([]);
      }
    };
    loadCycles();
  }, []);

  // Load expenses when cycle changes
  useEffect(() => {
    loadExpenses();
  }, [currentCycle?.id, cycles.length]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cmdRef.current && !cmdRef.current.contains(e.target as Node)) {
        setCmdOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      setError('');
      let data;
      if (currentCycle?.start_date) {
        data = await Api.getExpenses({
          start_date: currentCycle.start_date,
          end_date: currentCycle.end_date ?? undefined,
        });
      } else {
        data = await Api.getExpenses();
      }
      setExpenses(Array.isArray(data) ? data : []);
    } catch {
      console.error('Failed to load expenses');
      setError('Error al cargar movimientos');
    } finally {
      setLoading(false);
    }
  };

  const navigateCycle = (dir: -1 | 1) => {
    setCycleIndex(prev => Math.max(0, Math.min(cycles.length - 1, prev + dir)));
  };

  const getCycleLabel = () => {
    if (!currentCycle) return 'Todos los gastos';
    if (cycleIndex === 0 && currentCycle.status === 'active') return 'Ciclo actual';
    if (!currentCycle.start_date) return 'Ciclo';
    const d = new Date(currentCycle.start_date + 'T12:00:00');
    return `Ciclo del ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  };

  const filteredExpenses = useMemo(() => {
    let result = expenses.filter(e => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term || e.description.toLowerCase().includes(term) ||
        e.category.toLowerCase().includes(term) ||
        e.amount.toFixed(2).includes(searchTerm) ||
        String(e.amount).includes(searchTerm);
      const matchesContext = activeContext === 'shared' ? e.type === 'shared' : e.type === 'personal';
      const matchesCategory = selectedCategory === '' || e.category === selectedCategory;
      const matchesDateFrom = !dateFrom || e.date >= dateFrom;
      const matchesDateTo = !dateTo || e.date <= dateTo;
      return matchesSearch && matchesContext && matchesCategory && matchesDateFrom && matchesDateTo;
    });

    // Sort
    result.sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'amount') return (a.amount - b.amount) * mul;
      return a.date.localeCompare(b.date) * mul;
    });

    return result;
  }, [expenses, searchTerm, activeContext, selectedCategory, dateFrom, dateTo, sortKey, sortDir]);

  const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const average = filteredExpenses.length > 0 ? total / filteredExpenses.length : 0;

  const hasDateFilter = dateFrom || dateTo;
  const clearDateFilter = () => { setDateFrom(''); setDateTo(''); setShowDateFilter(false); };
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'amount' ? 'desc' : 'desc'); }
  };

  const filteredCategories = useMemo(() => {
    return categories.filter((item) =>
      item.name.toLowerCase().includes(categorySearch.toLowerCase()) || categorySearch === ''
    );
  }, [categories, categorySearch]);

  useEffect(() => {
    if (!selectedCategory) return;
    if (!categories.some((item) => item.name === selectedCategory)) {
      setSelectedCategory('');
    }
  }, [categories, selectedCategory]);

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setEditDescription(expense.description);
    setEditAmount(String(expense.amount));
    setEditCategory(expense.category);
    setEditDate(expense.date);
    setEditType(expense.type);
    setEditError('');
    setCategorySearch('');
    setCmdOpen(false);
  };

  useEffect(() => {
    if (!editingExpense) return;
    if (categories.length === 0) {
      setEditCategory('');
      return;
    }

    setEditCategory((current) => {
      const existsInCurrentContext = categories.some((item) => item.name === current);
      return existsInCurrentContext ? current : categories[0].name;
    });
  }, [categories, editType, editingExpense]);

  const closeEditModal = () => {
    if (savingEdit) return;
    setEditingExpense(null);
    setEditError('');
    setCategorySearch('');
    setCmdOpen(false);
  };

  const handleDeleteExpense = async () => {
    if (!editingExpense) return;
    if (!confirm('¿Eliminar este gasto? Esta acción no se puede deshacer.')) return;
    try {
      setSavingEdit(true);
      await Api.deleteExpense(editingExpense.id);
      showToast('Gasto eliminado');
      closeEditModal();
      loadExpenses();
    } catch (err) {
      console.error('Failed to delete expense:', err);
      setEditError('Error al eliminar el gasto');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDuplicateExpense = async () => {
    if (!editingExpense) return;
    try {
      setSavingEdit(true);
      await Api.createExpense({
        description: editDescription.trim(),
        amount: parseFloat(editAmount),
        category: editCategory.trim(),
        category_id: categories.find(c => c.name === editCategory.trim())?.id,
        date: editDate,
        type: editType,
      });
      showToast('Gasto duplicado');
      closeEditModal();
      loadExpenses();
    } catch (err) {
      console.error('Failed to duplicate expense:', err);
      setEditError('Error al duplicar el gasto');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    if (parseFloat(editAmount) <= 0) return setEditError('Ingresa un monto válido');
    if (!editDescription.trim()) return setEditError('Ingresa una descripción');
    if (!editCategory.trim()) return setEditError('Selecciona una categoría');
    if (!editDate) return setEditError('Selecciona una fecha');

    try {
      setSavingEdit(true);
      setEditError('');
      await Api.updateExpense(editingExpense.id, {
        description: editDescription.trim(),
        amount: parseFloat(editAmount),
        category: editCategory.trim(),
        date: editDate,
        type: editType,
        status: editingExpense.status ?? 'paid',
      });
      showToast('Gasto actualizado ✔');
      closeEditModal();
      await Promise.all([loadExpenses(), reloadCategories()]);
    } catch (err) {
      console.error('Failed to update expense:', err);
      setEditError('Error al actualizar el gasto');
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) {
    return (
      <div className="u-flex-gap-16">
        <div className="skeleton skeleton--header" />
        <div className="skeleton skeleton--filter" />
        <div className="skeleton skeleton--row" />
        <div className="skeleton skeleton--row" />
        <div className="skeleton skeleton--row" />
      </div>
    );
  }

  // Group by date only when sorted by date
  const grouped: Record<string, Expense[]> = {};
  if (sortKey === 'date') {
    filteredExpenses.forEach(e => {
      if (!grouped[e.date]) grouped[e.date] = [];
      grouped[e.date].push(e);
    });
  }

  const sortedDates = Object.keys(grouped).sort((a, b) =>
    sortDir === 'desc' ? b.localeCompare(a) : a.localeCompare(b)
  );

  const formatDayLabel = (dateStr: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
    const d = new Date(dateStr + 'T12:00:00');
    const dayNum = d.getDate();
    const monthName = MONTHS[d.getMonth()];
    if (dateStr === today) return `Hoy — ${dayNum} ${monthName}`;
    if (dateStr === yesterday) return `Ayer — ${dayNum} ${monthName}`;
    return `${dayNum} ${monthName}`;
  };

  const getCatColor = (category: string) => {
    const key = category.toLowerCase();
    return CAT_COLORS[key] ?? { bg: 'var(--bl)', stroke: '#60A5FA' };
  };

  const renderExpenseRow = (expense: Expense) => {
    const catDef = getCategoryDef(expense.category);
    const catColor = getCatColor(expense.category);
    const payer = payerDisplayName(expense.paid_by);
    const badgeClass = PAYER_BADGE[expense.paid_by] ?? 'badge badge-b';
    return (
      <div className="h-item" key={expense.id}>
        <div className="icon-c" style={{ background: catColor.bg }}>
          <span style={{ fontSize: '16px' }}>{catDef?.emoji ?? '📂'}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 500 }}>{expense.description}</div>
          <div style={{ fontSize: '12px', color: 'var(--tm)' }}>
            {expense.category} {' · '}
            <span className={badgeClass} style={{ fontSize: '10px', padding: '1px 6px' }}>{payer}</span>
            {sortKey === 'amount' && (
              <span style={{ marginLeft: '6px' }}>{expense.date}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minWidth: 0, padding: '8px 10px', borderRadius: '12px', marginRight: 8, color: 'var(--tm)' }}
          onClick={() => openEditModal(expense)}
          aria-label={`Editar ${expense.description}`}
          title="Editar gasto"
        >
          <EditIcon />
        </button>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--red)' }}>
          {'−€'}{expense.amount.toFixed(2)}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="topbar an d1">
        <div>
          <h1>Historial</h1>
          <p>Todos tus movimientos</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }} className="an d2 month-controls">
        <ContextTabs active={activeContext} onChange={setActiveContext} />
        <MonthNavigator
          label={getCycleLabel()}
          onPrev={() => navigateCycle(1)}
          onNext={() => navigateCycle(-1)}
        />
      </div>

      {/* Search + action buttons row */}
      <div className="an d2" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input
          className="search-input"
          style={{ flex: 1, marginBottom: 0 }}
          placeholder="Buscar por nombre, categoría o monto..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        <button
          type="button"
          className={`history-tool-btn${showDateFilter || hasDateFilter ? ' history-tool-btn--active' : ''}`}
          onClick={() => setShowDateFilter(v => !v)}
          title="Filtrar por fecha"
        >
          <Calendar size={16} />
          {hasDateFilter && <span className="history-tool-dot" />}
        </button>
      </div>

      {/* Date range filter — slides in */}
      {showDateFilter && (
        <div className="an d2 history-date-filter">
          <div className="history-date-row">
            <div className="history-date-field">
              <label>Desde</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="history-date-field">
              <label>Hasta</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            {hasDateFilter && (
              <button type="button" className="history-tool-btn" onClick={clearDateFilter} title="Limpiar filtro" style={{ alignSelf: 'flex-end', marginBottom: '2px' }}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sort controls */}
      <div className="an d2" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button
          type="button"
          className={`history-sort-btn${sortKey === 'date' ? ' history-sort-btn--active' : ''}`}
          onClick={() => toggleSort('date')}
        >
          <ArrowUpDown size={13} />
          Fecha {sortKey === 'date' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
        </button>
        <button
          type="button"
          className={`history-sort-btn${sortKey === 'amount' ? ' history-sort-btn--active' : ''}`}
          onClick={() => toggleSort('amount')}
        >
          <ArrowUpDown size={13} />
          Monto {sortKey === 'amount' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
        </button>
      </div>

      {/* Category chips */}
      <div className="an d2 history-filter-row">
        {selectedCategory && (
          <button type="button" className="history-filter-chip history-filter-chip--active" onClick={() => setSelectedCategory('')}>
            Categoría: {selectedCategory} ×
          </button>
        )}
        {categories.map((item) => (
          <button
            key={item.id ?? item.name}
            type="button"
            className={selectedCategory === item.name ? 'history-filter-chip history-filter-chip--active' : 'history-filter-chip'}
            onClick={() => setSelectedCategory((current) => current === item.name ? '' : item.name)}
          >
            {item.emoji ?? '📂'} {item.name}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }} className="an d3 balance-row-3">
        <div className="card" style={{ textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{filteredExpenses.length}</div>
          <div className="stat-label">Gastos</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{'€'}{total.toFixed(2)}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{'€'}{average.toFixed(2)}</div>
          <div className="stat-label">Media</div>
        </div>
      </div>

      {error ? (
        <div className="history__error-card">
          <div className="error-view__msg">{error}</div>
          <button onClick={loadExpenses} className="btn btn-primary">
            Reintentar
          </button>
        </div>
      ) : filteredExpenses.length === 0 ? (
        <div className="empty-view">
          <div className="empty-view__emoji">{searchTerm ? '🔍' : '📭'}</div>
          <div className="empty-view__text">
            {searchTerm || selectedCategory ? 'No se encontraron resultados con los filtros actuales' : 'No hay gastos registrados'}
          </div>
        </div>
      ) : (
        <div className="card an d4">
          {sortKey === 'date' ? (
            /* Grouped by date */
            sortedDates.map((date, idx) => (
              <div key={date} style={{ marginBottom: idx < sortedDates.length - 1 ? '20px' : undefined }}>
                <div className="day-label">{formatDayLabel(date)}</div>
                {grouped[date].map(expense => renderExpenseRow(expense))}
              </div>
            ))
          ) : (
            /* Flat list sorted by amount */
            filteredExpenses.map(expense => renderExpenseRow(expense))
          )}
        </div>
      )}

      {editingExpense && (
        <div className="modal-overlay open" onClick={closeEditModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: 'calc(100% - 24px)' }}>
            <h3>Editar gasto</h3>
            <p>Corrige categoría, monto, nombre, fecha o tipo sin crear un movimiento nuevo.</p>

            <form onSubmit={handleUpdateExpense}>
              <div className="form-row" style={{ marginBottom: 16 }}>
                <label>Descripción</label>
                <input
                  className="form-input"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="En que gastaste?"
                />
              </div>

              <div className="form-row" style={{ marginBottom: 16 }}>
                <label>Monto</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--tm)' }}>€</span>
                  <input
                    className="form-input"
                    style={{ paddingLeft: 32 }}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="cmd-palette" ref={cmdRef} style={{ marginBottom: 16 }}>
                <div className="label">Categoría</div>
                <div className="cmd-input-wrap">
                  <TagIcon />
                  {editCategory && (() => {
                    const catDef = getCategoryDef(editCategory);
                    return (
                      <span className="cmd-selected">
                        <div className="cmd-icon" style={{ background: catDef?.iconBg ?? 'var(--gl)', width: 20, height: 20 }}>
                          <span style={{ fontSize: 12 }}>{catDef?.emoji ?? '📂'}</span>
                        </div>
                        {editCategory}
                        <span
                          className="cmd-x"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditCategory('');
                          }}
                        >
                          &times;
                        </span>
                      </span>
                    );
                  })()}
                  <input
                    className="cmd-input"
                    placeholder="Buscar categoría..."
                    value={categorySearch}
                    onFocus={() => setCmdOpen(true)}
                    onChange={(e) => {
                      setCategorySearch(e.target.value);
                      setCmdOpen(true);
                    }}
                  />
                </div>
                <div className={`cmd-dropdown ${cmdOpen ? 'open' : ''}`}>
                  <div className="cmd-list">
                    {filteredCategories.map((item) => (
                      <div
                        key={item.id ?? item.name}
                        className={`cmd-option ${editCategory === item.name ? 'selected' : ''}`}
                        onClick={() => {
                          setEditCategory(item.name);
                          setCategorySearch('');
                          setCmdOpen(false);
                        }}
                      >
                        <div className="cmd-icon" style={{ background: item.iconBg ?? 'var(--gl)' }}>
                          <span style={{ fontSize: 14 }}>{item.emoji ?? '📂'}</span>
                        </div>
                        {item.name}
                      </div>
                    ))}
                  </div>
                  {categorySearch.trim() && !categories.some((item) => item.name.toLowerCase() === categorySearch.trim().toLowerCase()) && (
                    <div
                      className="cmd-create"
                      onClick={() => {
                        const nextCategory = categorySearch.trim();
                        setEditCategory(nextCategory);
                        setCategorySearch('');
                        setCmdOpen(false);
                        showToast(`Usaremos "${nextCategory}" en este gasto.`);
                      }}
                    >
                      <PlusIcon /> Usar &ldquo;{categorySearch.trim()}&rdquo;
                    </div>
                  )}
                </div>
              </div>

              <div className="form-row" style={{ marginBottom: 16 }}>
                <label>Fecha</label>
                <input
                  className="form-input"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <div className="label">Tipo de gasto</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div
                    className="type-sel"
                    onClick={() => setEditType('shared')}
                    style={editType === 'shared'
                      ? { border: '2px solid var(--green)', background: 'var(--gl)', color: 'var(--green)' }
                      : { border: '1px solid var(--glass-border)', background: 'var(--surface)', color: 'var(--ts)' }}
                  >
                    Compartido
                  </div>
                  <div
                    className="type-sel"
                    onClick={() => setEditType('personal')}
                    style={editType === 'personal'
                      ? { border: '2px solid var(--green)', background: 'var(--gl)', color: 'var(--green)' }
                      : { border: '1px solid var(--glass-border)', background: 'var(--surface)', color: 'var(--ts)' }}
                  >
                    Personal
                  </div>
                </div>
              </div>

              {editError && <div className="add-expense__error-msg">{editError}</div>}

              <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={handleDeleteExpense}
                    disabled={savingEdit}
                    style={{ opacity: 0.8 }}
                  >
                    Eliminar
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleDuplicateExpense}
                    disabled={savingEdit}
                    title="Crear una copia de este gasto"
                  >
                    Duplicar
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn btn-outline" onClick={closeEditModal} disabled={savingEdit}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingEdit}>
                    {savingEdit ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
