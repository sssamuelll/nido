import React, { useState, useEffect } from 'react';
import { Api } from '../api';
import { CategoryPill } from '../components/CategoryPill';
import { TransactionRow } from '../components/TransactionRow';
import { format } from 'date-fns';
import { CATEGORIES, INDICATOR_COLORS } from '../types';

interface Expense {
  id: number;
  description: string;
  amount: number;
  category: string;
  date: string;
  paid_by: string;
  type: string;
  status: string;
  created_at: string;
}

const ALL_CATEGORY_PILLS = [
  { id: '', emoji: '✨', name: 'Todas' },
  ...CATEGORIES,
];

const getCategoryEmoji = (categoryId: string): string => {
  const cat = CATEGORIES.find(c => c.id === categoryId);
  return cat ? cat.emoji : '🦋';
};

export const History: React.FC = () => {
  const [currentMonth, setCurrentMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ category: '', paid_by: '', type: '' });

  useEffect(() => { loadExpenses(); }, [currentMonth]);
  useEffect(() => { applyFilters(); }, [expenses, filters]);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await Api.getExpenses(currentMonth);
      setExpenses(data);
    } catch (err: any) {
      setError('Error al cargar');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...expenses];
    if (filters.category) filtered = filtered.filter(e => e.category === filters.category);
    if (filters.paid_by) filtered = filtered.filter(e => e.paid_by === filters.paid_by);
    if (filters.type) filtered = filtered.filter(e => e.type === filters.type);
    setFilteredExpenses(filtered);
  };

  const handleDelete = async (id: number) => {
    try {
      await Api.deleteExpense(id);
      setExpenses(expenses.filter(e => e.id !== id));
    } catch {
      alert('Error al eliminar');
    }
  };

  const navigateMonth = (dir: -1 | 1) => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setCurrentMonth(format(d, 'yyyy-MM'));
  };

  const formatMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${months[parseInt(month) - 1]} ${year}`;
  };

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
    if (dateStr === todayStr) return 'Hoy';
    if (dateStr === yesterdayStr) return 'Ayer';
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `${days[d.getDay()]} ${d.getDate()}`;
  };

  const total = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const average = filteredExpenses.length > 0 ? total / filteredExpenses.length : 0;
  const hasFilters = !!(filters.category || filters.paid_by || filters.type);

  // Group by date
  const grouped = filteredExpenses.reduce<Record<string, Expense[]>>((acc, e) => {
    (acc[e.date] = acc[e.date] || []).push(e);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  if (loading) {
    return (
      <div className="app-layout">
        <div className="content-area">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="skeleton" style={{ height: 60 }} />
            <div className="skeleton" style={{ height: 48 }} />
            <div className="skeleton" style={{ height: 56 }} />
            <div className="skeleton" style={{ height: 56 }} />
            <div className="skeleton" style={{ height: 56 }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <div className="content-area">
        {/* Page header */}
        <div className="dashboard__header">
          <div>
            <div className="page-subtitle">Finanzas</div>
            <div className="page-title">Historial</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="dashboard__notification-btn"
              onClick={() => navigateMonth(-1)}
              style={{ fontSize: 18, fontWeight: 600 }}
            >
              ‹
            </button>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-text-secondary)', minWidth: 90, textAlign: 'center' }}>
              {formatMonthName(currentMonth)}
            </span>
            <button
              className="dashboard__notification-btn"
              onClick={() => navigateMonth(1)}
              style={{ fontSize: 18, fontWeight: 600 }}
            >
              ›
            </button>
          </div>
        </div>

        {/* Summary pills */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: '16px 20px', boxShadow: 'var(--shadow-neu)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-text-secondary)' }}>Gastos</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>{filteredExpenses.length}</span>
          </div>
          <div style={{ flex: 1, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: '16px 20px', boxShadow: 'var(--shadow-neu)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-text-secondary)' }}>Total</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>€{total.toFixed(2)}</span>
          </div>
          {filteredExpenses.length > 0 && (
            <div style={{ flex: 1, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: '16px 20px', boxShadow: 'var(--shadow-neu)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-text-secondary)' }}>Media</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>€{average.toFixed(0)}</span>
            </div>
          )}
        </div>

        {/* Category filter pills */}
        <div className="history__filters">
          {ALL_CATEGORY_PILLS.map(cat => (
            <CategoryPill
              key={cat.id}
              emoji={cat.emoji}
              name={cat.name}
              active={filters.category === cat.id}
              onClick={() => setFilters({ ...filters, category: cat.id })}
            />
          ))}
        </div>

        {/* Paid-by and type filters */}
        <div className="history__filters">
          <CategoryPill
            emoji="👥"
            name="Ambos"
            active={filters.paid_by === ''}
            onClick={() => setFilters({ ...filters, paid_by: '' })}
          />
          <CategoryPill
            emoji="👨‍💻"
            name="Samuel"
            active={filters.paid_by === 'samuel'}
            onClick={() => setFilters({ ...filters, paid_by: 'samuel' })}
          />
          <CategoryPill
            emoji="👩‍🎨"
            name="María"
            active={filters.paid_by === 'maria'}
            onClick={() => setFilters({ ...filters, paid_by: 'maria' })}
          />
          <div style={{ width: 1, background: 'var(--color-divider)', margin: '0 4px', alignSelf: 'stretch' }} />
          <CategoryPill
            emoji="🌐"
            name="Todo"
            active={filters.type === ''}
            onClick={() => setFilters({ ...filters, type: '' })}
          />
          <CategoryPill
            emoji="💑"
            name="Compartido"
            active={filters.type === 'shared'}
            onClick={() => setFilters({ ...filters, type: 'shared' })}
          />
          <CategoryPill
            emoji="👤"
            name="Personal"
            active={filters.type === 'personal'}
            onClick={() => setFilters({ ...filters, type: 'personal' })}
          />
        </div>

        {/* Error state */}
        {error && (
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: '20px', boxShadow: 'var(--shadow-neu)', textAlign: 'center' }}>
            <div style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{error}</div>
            <button
              onClick={loadExpenses}
              className="btn btn--samuel btn--sm"
              style={{ '--btn-gradient': 'linear-gradient(180deg, #8bdc6b, #6bc98b)', '--btn-glow': 'rgba(139,220,107,0.25)' } as React.CSSProperties}
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Grouped expenses */}
        {filteredExpenses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-tertiary)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{hasFilters ? '🔍' : '📭'}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 14 }}>
              {hasFilters ? 'Sin resultados para estos filtros' : 'No hay gastos este mes'}
            </div>
          </div>
        ) : (
          <div className="history__list">
            {sortedDates.map(date => (
              <div key={date}>
                <div className="history__date-group">
                  {formatDateLabel(date)}
                  <span style={{ float: 'right', fontWeight: 400, color: 'var(--color-text-tertiary)', letterSpacing: 0, textTransform: 'none', fontSize: 11 }}>
                    €{grouped[date].reduce((s, e) => s + e.amount, 0).toFixed(2)}
                  </span>
                </div>
                {grouped[date].map(expense => (
                  <TransactionRow
                    key={expense.id}
                    emoji={getCategoryEmoji(expense.category)}
                    name={expense.description}
                    payer={expense.paid_by}
                    amount={`-€${expense.amount.toFixed(2)}`}
                    date={expense.category}
                    indicatorColor={INDICATOR_COLORS[expense.paid_by] ?? INDICATOR_COLORS['shared']}
                    isPositive={false}
                    onDelete={() => handleDelete(expense.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
