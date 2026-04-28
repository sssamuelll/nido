import React, { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Api } from '../api';
import { ChevronLeft } from 'lucide-react';
import { formatMoney, formatMoneyExact } from '../lib/money';
import { LoadingScreen } from '../components/LoadingScreen';
import { ErrorView } from '../components/ErrorView';
import { useResource } from '../hooks/useResource';
import { CACHE_KEYS } from '../lib/cacheBus';

interface EventCategoryRow {
  category: string;
  total: number;
  emoji: string | null;
  color: string | null;
}

interface EventExpense {
  id: number; description: string; amount: number; category: string; date: string; paid_by: string;
}

const FALLBACK_CATEGORY_COLOR = '#60A5FA';

const EventDonut: React.FC<{ categories: EventCategoryRow[] }> = ({ categories }) => {
  const total = categories.reduce((s, c) => s + (c.total ?? 0), 0);
  if (total === 0) return null;
  const size = 200, cx = size / 2, cy = size / 2, r = 70;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="ev-donut-section">
      <svg viewBox={`0 0 ${size} ${size}`} className="ev-donut-svg">
        {categories.map((cat, i) => {
          const amount = cat.total ?? 0;
          const pct = amount / total;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const currentOffset = offset;
          offset += dash;
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={cat.color ?? FALLBACK_CATEGORY_COLOR} strokeWidth="24"
              strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-currentOffset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
          );
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text)" fontSize="20" fontWeight="700">
          {formatMoney(total)}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--ts)" fontSize="11">gastado</text>
      </svg>
      <div className="ev-donut-legend">
        {categories.map((cat, i) => {
          const amount = cat.total ?? 0;
          const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
          return (
            <div key={i} className="ev-donut-legend__item">
              <span className="ev-donut-legend__emoji">{cat.emoji ?? '📂'}</span>
              <span className="ev-donut-legend__name">{cat.category}:</span>
              <span className="ev-donut-legend__amount">{formatMoney(amount)}</span>
              <span className="ev-donut-legend__pct">({pct}%)</span>
              <div className="ev-donut-legend__bar" style={{ '--bar-color': cat.color ?? FALLBACK_CATEGORY_COLOR } as React.CSSProperties} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const EventDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const loadEvent = useCallback(() => Api.getEventDetail(Number(id)), [id]);
  const { data, loading } = useResource<any>(loadEvent, {
    invalidationKeys: [CACHE_KEYS.events, CACHE_KEYS.expenses],
  });

  if (loading) return <LoadingScreen />;
  if (!data) return <ErrorView message="Evento no encontrado" />;

  const { event, kpis, categories, expenses } = data;
  // The API may return categories as "categories" or "categoryBreakdown" — handle both
  const cats: EventCategoryRow[] = categories || data.categoryBreakdown || [];
  const exps: EventExpense[] = expenses || [];
  const pctUsed = kpis.budget > 0 ? Math.round((kpis.spent / kpis.budget) * 100) : 0;

  const grouped: Record<string, EventExpense[]> = {};
  for (const exp of exps) { if (!grouped[exp.date]) grouped[exp.date] = []; grouped[exp.date].push(exp); }
  const dateGroups = Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    const days = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
    return `${days[d.getDay()]} ${d.getDate()}`;
  };

  return (
    <>
      <div className="topbar">
        <button className="ev-back" onClick={() => navigate('/')}>
          <ChevronLeft size={18} /> Volver al dashboard
        </button>
      </div>
      <h1 className="ev-title">{event.emoji} {event.name}</h1>
      <div className="ev-kpis">
        <div className="card ev-kpi">
          <div className="ev-kpi__label">Presupuesto Total</div>
          <div className="ev-kpi__value">{formatMoney(kpis.budget)}</div>
          <div className="ev-kpi__bar"><div className="ev-kpi__bar-fill ev-kpi__bar-fill--neutral" style={{ width: `${pctUsed}%` }} /></div>
          <div className="ev-kpi__sub">{pctUsed}%</div>
        </div>
        <div className="card ev-kpi">
          <div className="ev-kpi__label">Gastado</div>
          <div className="ev-kpi__value" style={{ color: 'var(--green)' }}>{formatMoney(kpis.spent)}</div>
          <div className="ev-kpi__bar"><div className="ev-kpi__bar-fill ev-kpi__bar-fill--green" style={{ width: `${pctUsed}%` }} /></div>
        </div>
        <div className="card ev-kpi">
          <div className="ev-kpi__label">Restante</div>
          <div className="ev-kpi__value" style={{ color: kpis.remaining < 0 ? 'var(--red)' : 'var(--orange)' }}>{formatMoney(Math.abs(kpis.remaining))}</div>
          <div className="ev-kpi__bar"><div className="ev-kpi__bar-fill ev-kpi__bar-fill--orange" style={{ width: `${Math.max(0, 100 - pctUsed)}%` }} /></div>
        </div>
      </div>
      {cats.length > 0 && <div className="card ev-breakdown"><EventDonut categories={cats} /></div>}
      <div className="card ev-transactions">
        <h3>Transacciones del evento</h3>
        {dateGroups.length === 0 && <div className="empty-view"><div className="empty-view__text">No hay gastos registrados en este evento</div></div>}
        {dateGroups.map(([date, exps]) => (
          <div key={date}>
            <div className="ev-date-label">{formatDateLabel(date)}</div>
            {exps.map(exp => (
              <div key={exp.id} className="ev-expense-row">
                <div className="ev-expense-row__left">
                  <div className="ev-expense-row__desc">{exp.description}</div>
                  <div className="ev-expense-row__cat">{exp.category}</div>
                </div>
                <div className="ev-expense-row__right">
                  <div className="ev-expense-row__amount">−{formatMoneyExact(exp.amount)}</div>
                  <div className="ev-expense-row__who">{exp.paid_by}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
};
