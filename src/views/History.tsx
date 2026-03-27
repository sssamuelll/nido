import React, { useState, useEffect } from 'react';
import { Api } from '../api';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  if (p === 'samuel') return 'Samuel';
  if (p === 'maria') return 'María';
  return 'Compartido';
};

export const History: React.FC = () => {
  const [currentMonth, setCurrentMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeContext, setActiveContext] = useState<'shared' | 'personal'>('shared');
  const [categories, setCategories] = useState<Array<{ name: string; emoji: string; color: string }>>([]);

  useEffect(() => {
    Api.getCategories().then(setCategories).catch(() => {});
  }, []);

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

  const filteredExpenses = expenses.filter(e => {
    const matchesSearch = e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesContext = activeContext === 'shared' ? e.type === 'shared' : e.type === 'personal';
    return matchesSearch && matchesContext;
  });

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

  const formatDayLabel = (dateStr: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
    const d = new Date(dateStr + 'T12:00:00');
    const dayNum = d.getDate();
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthName = monthNames[d.getMonth()];
    if (dateStr === today) return `Hoy — ${dayNum} ${monthName}`;
    if (dateStr === yesterday) return `Ayer — ${dayNum} ${monthName}`;
    return `${dayNum} ${monthName}`;
  };

  const getCatColor = (category: string) => {
    const key = category.toLowerCase();
    return CAT_COLORS[key] ?? { bg: 'var(--bl)', stroke: '#60A5FA' };
  };

  return (
    <>
      {/* Header — topbar pattern */}
      <div className="topbar an d1">
        <div>
          <h1>Historial</h1>
          <p>Todos tus movimientos</p>
        </div>
      </div>

      {/* Context tabs + Month nav — same row */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }} className="an d2 month-controls">
        <div className="ctx-tabs" style={{ marginBottom: 0 }}>
          <div className={`ctx-tab ${activeContext === 'shared' ? 'active' : ''}`} onClick={() => setActiveContext('shared')}>
            <div className="dot sh-d" />Compartido
          </div>
          <div className={`ctx-tab ${activeContext === 'personal' ? 'active' : ''}`} onClick={() => setActiveContext('personal')}>
            <div className="dot ps-d" />Personal
          </div>
        </div>
        <div className="month-nav">
          <div className="month-btn" onClick={() => navigateMonth(-1)}>
            <ChevronLeft size={16} />
          </div>
          <h2>{formatMonthName(currentMonth)}</h2>
          <div className="month-btn" onClick={() => navigateMonth(1)}>
            <ChevronRight size={16} />
          </div>
        </div>
      </div>

      {/* Search */}
      <input
        className="search-input an d2"
        placeholder="Buscar gastos..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
      />

      {/* Stats row — 3-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }} className="an d3 balance-row-3">
        <div className="card" style={{ textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{filteredExpenses.length}</div>
          <div className="stat-label">Gastos</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{'\u20AC'}{total.toFixed(2)}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{'\u20AC'}{average.toFixed(2)}</div>
          <div className="stat-label">Media</div>
        </div>
      </div>

      {/* Transaction list */}
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
            {searchTerm ? 'No se encontraron resultados para tu búsqueda' : 'No hay gastos registrados en este mes'}
          </div>
        </div>
      ) : (
        <div className="card an d4">
          {sortedDates.map((date, idx) => {
            const colors = getCatColor;
            return (
              <div key={date} style={{ marginBottom: idx < sortedDates.length - 1 ? '20px' : undefined }}>
                <div className="day-label">{formatDayLabel(date)}</div>
                {grouped[date].map(expense => {
                  const catDef = categories.find(c => c.name === expense.category);
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
                          {expense.category} {' \u00B7 '}
                          <span className={badgeClass} style={{ fontSize: '10px', padding: '1px 6px' }}>{payer}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--red)' }}>
                        {'\u2212\u20AC'}{expense.amount.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};
