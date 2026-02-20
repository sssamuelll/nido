import React, { useState, useEffect } from 'react';
import { Api } from '../api';
import { ExpenseCard } from '../components/ExpenseCard';
import { format } from 'date-fns';

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

const FILTER_CATEGORIES = [
  { id: '', label: 'Todas' },
  { id: 'Restaurant', label: '🍽️' },
  { id: 'Gastos', label: '🛒' },
  { id: 'Servicios', label: '💡' },
  { id: 'Ocio', label: '🎉' },
  { id: 'Inversión', label: '📈' },
  { id: 'Otros', label: '📦' },
];

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
    } catch { alert('Error al eliminar'); }
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

  const total = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const hasFilters = !!(filters.category || filters.paid_by || filters.type);

  // Group by date
  const grouped = filteredExpenses.reduce<Record<string, Expense[]>>((acc, e) => {
    (acc[e.date] = acc[e.date] || []).push(e);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
    if (dateStr === todayStr) return 'Hoy';
    if (dateStr === yesterdayStr) return 'Ayer';
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `${days[d.getDay()]} ${d.getDate()}`;
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="main-content">
          <div className="skeleton-loader">
            <div className="skeleton-block skeleton-header" />
            <div className="skeleton-block skeleton-card-sm" />
            <div className="skeleton-block skeleton-card" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container fade-in">
      <div className="main-content">
        {/* Header */}
        <div className="dashboard-header">
          <div>
            <div className="dashboard-greeting" style={{ fontSize: '1.25rem' }}>Historial</div>
            <div className="dashboard-subtitle">{formatMonthName(currentMonth)}</div>
          </div>
          <div className="month-nav">
            <button className="month-nav-btn" onClick={() => navigateMonth(-1)}>‹</button>
            <button className="month-nav-btn" onClick={() => navigateMonth(1)}>›</button>
          </div>
        </div>

        {/* Summary pills */}
        <div className="history-summary">
          <div className="summary-pill">
            <span className="summary-pill-value">{filteredExpenses.length}</span>
            <span className="summary-pill-label">gastos</span>
          </div>
          <div className="summary-pill summary-pill-accent">
            <span className="summary-pill-value">€{total.toFixed(2)}</span>
            <span className="summary-pill-label">total</span>
          </div>
          {filteredExpenses.length > 0 && (
            <div className="summary-pill">
              <span className="summary-pill-value">€{(total / filteredExpenses.length).toFixed(0)}</span>
              <span className="summary-pill-label">media</span>
            </div>
          )}
        </div>

        {/* Filter chips */}
        <div className="filter-row">
          <div className="filter-chips">
            {FILTER_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                className={`filter-chip ${filters.category === cat.id ? 'active' : ''}`}
                onClick={() => setFilters({ ...filters, category: cat.id })}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="filter-chips">
            <button
              className={`filter-chip ${filters.paid_by === '' ? 'active' : ''}`}
              onClick={() => setFilters({ ...filters, paid_by: '' })}
            >Ambos</button>
            <button
              className={`filter-chip ${filters.paid_by === 'samuel' ? 'active' : ''}`}
              onClick={() => setFilters({ ...filters, paid_by: 'samuel' })}
            >👨‍💻</button>
            <button
              className={`filter-chip ${filters.paid_by === 'maria' ? 'active' : ''}`}
              onClick={() => setFilters({ ...filters, paid_by: 'maria' })}
            >👩‍🎨</button>
            <span className="filter-divider" />
            <button
              className={`filter-chip ${filters.type === '' ? 'active' : ''}`}
              onClick={() => setFilters({ ...filters, type: '' })}
            >Todo</button>
            <button
              className={`filter-chip ${filters.type === 'shared' ? 'active' : ''}`}
              onClick={() => setFilters({ ...filters, type: 'shared' })}
            >💑</button>
            <button
              className={`filter-chip ${filters.type === 'personal' ? 'active' : ''}`}
              onClick={() => setFilters({ ...filters, type: 'personal' })}
            >👤</button>
          </div>
        </div>

        {error && (
          <div className="card text-center">
            <div className="text-error">{error}</div>
            <button onClick={loadExpenses} className="btn btn-secondary mt-2">Reintentar</button>
          </div>
        )}

        {/* Grouped expenses */}
        {filteredExpenses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">{hasFilters ? '🔍' : '📭'}</div>
            <div className="empty-state-text">
              {hasFilters ? 'Sin resultados para estos filtros' : 'No hay gastos este mes'}
            </div>
          </div>
        ) : (
          sortedDates.map(date => (
            <div key={date} className="date-group">
              <div className="date-group-header">
                <span className="date-group-label">{formatDateLabel(date)}</span>
                <span className="date-group-total">
                  €{grouped[date].reduce((s, e) => s + e.amount, 0).toFixed(2)}
                </span>
              </div>
              <div className="expense-list">
                {grouped[date].map(expense => (
                  <ExpenseCard
                    key={expense.id}
                    expense={expense}
                    onDelete={() => handleDelete(expense.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
