import React, { useState, useEffect } from 'react';
import { Api } from '../api';
import { TransactionRow } from '../components/TransactionRow';
import { format } from 'date-fns';
import { CATEGORIES, INDICATOR_COLORS } from '../types';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

export const History: React.FC = () => {
  const [currentMonth, setCurrentMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadExpenses();
  }, [currentMonth]);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await Api.getExpenses(currentMonth);
      setExpenses(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Error al cargar movimientos');
    } finally {
      setLoading(false);
    }
  };

  const navigateMonth = (dir: -1 | 1) => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setCurrentMonth(format(d, 'yyyy-MM'));
  };

  const formatMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${months[parseInt(month) - 1]} ${year}`;
  };

  const filteredExpenses = expenses.filter(e => 
    e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const average = filteredExpenses.length > 0 ? total / filteredExpenses.length : 0;

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

  const grouped: Record<string, any[]> = {};
  filteredExpenses.forEach(e => {
    if (!grouped[e.date]) grouped[e.date] = [];
    grouped[e.date].push(e);
  });

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="u-flex-gap-16">
      <div className="history__header">
        <div>
          <div className="settings__subtitle">Movimientos</div>
          <div className="u-flex-center">
            <button onClick={() => navigateMonth(-1)} className="btn btn--sm">
              <ChevronLeft size={18} />
            </button>
            <span className="settings__month-label u-w-90">
              {formatMonthName(currentMonth)}
            </span>
            <button onClick={() => navigateMonth(1)} className="btn btn--sm">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="dashboard__search">
          <Search size={16} color="var(--color-text-tertiary)" />
          <input 
            type="text" 
            placeholder="Buscar..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="dashboard__search-input"
          />
        </div>
      </div>

      <div className="u-flex-gap-12">
        <div className="history__stat-card">
          <span className="history__stat-label">Gastos</span>
          <span className="history__stat-value">{filteredExpenses.length}</span>
        </div>
        <div className="history__stat-card">
          <span className="history__stat-label">Total</span>
          <span className="history__stat-value">€{total.toFixed(2)}</span>
        </div>
        <div className="history__stat-card">
          <span className="history__stat-label">Media</span>
          <span className="history__stat-value">€{average.toFixed(0)}</span>
        </div>
      </div>

      <div className="history__divider" />

      {error ? (
        <div className="history__error-card">
          <div className="error-view__msg">{error}</div>
          <button
            onClick={loadExpenses}
            className="btn btn--samuel btn--dynamic"
            style={{ '--btn-gradient': 'linear-gradient(180deg, #8bdc6b, #6bc98b)', '--btn-glow': 'rgba(139,220,107,0.25)' } as React.CSSProperties}
          >
            Reintentar
          </button>
        </div>
      ) : filteredExpenses.length === 0 ? (
        <div className="empty-view">
          <div className="empty-view__emoji">{searchTerm ? '🔍' : '📭'}</div>
          <div className="empty-view__text">
            {searchTerm ? 'No se encontraron resultados para tu búsqueda' : 'No hay gastos registrados en este mes'}
          </div>
        </div>
      ) : (
        <div className="history__list">
          {sortedDates.map(date => (
            <div key={date}>
              <div className="history__date-group">
                {format(new Date(date + 'T12:00:00'), 'EEEE, d MMM')}
                <span className="u-float-right history__meta-text">
                  €{grouped[date].reduce((s, e) => s + e.amount, 0).toFixed(2)}
                </span>
              </div>
              {grouped[date].map(expense => {
                const catDef = CATEGORIES.find(c => c.id === expense.category);
                return (
                  <TransactionRow
                    key={expense.id}
                    emoji={catDef?.emoji ?? '🦋'}
                    name={expense.description}
                    payer={expense.paid_by}
                    amount={`-€${expense.amount.toFixed(2)}`}
                    date={expense.date}
                    indicatorColor={INDICATOR_COLORS[expense.paid_by] ?? INDICATOR_COLORS['shared']}
                    isPositive={false}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
