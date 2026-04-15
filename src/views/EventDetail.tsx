import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Api } from '../api';
import { ChevronLeft } from 'lucide-react';

interface EventCategory {
  name: string; emoji: string; color: string; amount: number; pct: number;
}

interface EventExpense {
  id: number; description: string; amount: number; category: string; date: string; paid_by: string;
}

const EventDonut: React.FC<{ categories: EventCategory[] }> = ({ categories }) => {
  const total = categories.reduce((s, c) => s + c.amount, 0);
  if (total === 0) return null;
  const size = 200, cx = size / 2, cy = size / 2, r = 70;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="ev-donut-section">
      <svg viewBox={`0 0 ${size} ${size}`} className="ev-donut-svg">
        {categories.map((cat, i) => {
          const pct = cat.amount / total;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const currentOffset = offset;
          offset += dash;
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={cat.color} strokeWidth="24"
              strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-currentOffset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
          );
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text)" fontSize="20" fontWeight="700">
          €{total.toLocaleString('es-ES')}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--ts)" fontSize="11">gastado</text>
      </svg>
      <div className="ev-donut-legend">
        {categories.map((cat, i) => (
          <div key={i} className="ev-donut-legend__item">
            <span className="ev-donut-legend__emoji">{cat.emoji}</span>
            <span className="ev-donut-legend__name">{cat.name}:</span>
            <span className="ev-donut-legend__amount">€{cat.amount.toLocaleString('es-ES')}</span>
            <span className="ev-donut-legend__pct">({cat.pct}%)</span>
            <div className="ev-donut-legend__bar" style={{ '--bar-color': cat.color } as React.CSSProperties} />
          </div>
        ))}
      </div>
    </div>
  );
};

export const EventDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const detail = await Api.getEventDetail(Number(id));
        setData(detail);
      } catch (err) { console.error('Error loading event:', err); }
      finally { setLoading(false); }
    };
    void load();
  }, [id]);

  if (loading) return <div className="loading-screen"><div className="loading-screen__logo"><span>N</span></div><div className="loading-screen__text">Cargando...</div></div>;
  if (!data) return <div className="error-view"><div className="error-view__msg">Evento no encontrado</div></div>;

  const { event, kpis, categories, expenses } = data;
  // The API may return categories as "categories" or "categoryBreakdown" — handle both
  const cats: EventCategory[] = categories || data.categoryBreakdown || [];
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
          <div className="ev-kpi__value">€{kpis.budget.toLocaleString('es-ES')}</div>
          <div className="ev-kpi__bar"><div className="ev-kpi__bar-fill ev-kpi__bar-fill--neutral" style={{ width: `${pctUsed}%` }} /></div>
          <div className="ev-kpi__sub">{pctUsed}%</div>
        </div>
        <div className="card ev-kpi">
          <div className="ev-kpi__label">Gastado</div>
          <div className="ev-kpi__value" style={{ color: 'var(--green)' }}>€{kpis.spent.toLocaleString('es-ES')}</div>
          <div className="ev-kpi__bar"><div className="ev-kpi__bar-fill ev-kpi__bar-fill--green" style={{ width: `${pctUsed}%` }} /></div>
        </div>
        <div className="card ev-kpi">
          <div className="ev-kpi__label">Restante</div>
          <div className="ev-kpi__value" style={{ color: kpis.remaining < 0 ? 'var(--red)' : 'var(--orange)' }}>€{Math.abs(kpis.remaining).toLocaleString('es-ES')}</div>
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
                  <div className="ev-expense-row__amount">−€{exp.amount.toFixed(2)}</div>
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
