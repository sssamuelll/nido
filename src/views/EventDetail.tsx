import React, { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Api } from '../api';
import { formatMoney, formatMoneyExact } from '../lib/money';
import { formatDayLabelWithWeekday } from '../lib/dates';
import { ErrorView } from '../components/ErrorView';
import { useResource } from '../hooks/useResource';
import { useIsMobile } from '../hooks/useMediaQuery';
import { CACHE_KEYS } from '../lib/cacheBus';
import { NidoShell } from '../components/nido/NidoShell';
import { Card, Eyebrow, Pill, Bar, CatIcon, Txn, Who, Icon } from '../components/nido';

interface EventCategoryRow { category: string; total: number; emoji: string | null; color: string | null }
interface EventExpense { id: number; description: string; amount: number; category: string; date: string; paid_by: string }

const FALLBACK_COLOR = 'var(--clay)';
const toNum = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/* paper donut, same shape as Analytics' */
const EventDonut: React.FC<{ categories: EventCategoryRow[]; total: number }> = ({ categories, total }) => {
  if (total <= 0) return null;
  const size = 180, cx = size / 2, cy = size / 2, r = (size / 2) - 20;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--inset)" strokeWidth={20} />
      {categories.map((cat, i) => {
        const frac = Math.max(0, toNum(cat.total) / total);
        const dash = frac * c;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={cat.color ?? FALLBACK_COLOR} strokeWidth={20}
            strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-(acc / total) * c} transform={`rotate(-90 ${cx} ${cy})`} />
        );
        acc += toNum(cat.total);
        return el;
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" className="serif" style={{ fontSize: 26, fill: 'var(--ink)' }}>{formatMoney(total)}</text>
      <text x={cx} y={cy + 18} textAnchor="middle" style={{ fontSize: 11.5, fill: 'var(--ink-3)' }}>gastado</text>
    </svg>
  );
};

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export const EventDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const eventId = Number(id);

  const loadDetail = useCallback(() => Api.getEventDetail(eventId), [eventId]);
  const { data, loading, error, reload } = useResource(loadDetail, {
    fallbackMessage: 'Error al cargar el evento',
    invalidationKey: CACHE_KEYS.events,
  });

  const back = (
    <button type="button" aria-label="Volver" onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)', background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
      <Icon.back /> Volver
    </button>
  );

  const screen = (inner: React.ReactNode) => {
    const body = <div style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>{back}{inner}</div>;
    if (isMobile) return <div className="nido grain" style={{ minHeight: '100vh' }}><div style={{ padding: '16px 20px 40px' }}>{body}</div></div>;
    return <NidoShell>{body}</NidoShell>;
  };

  if (loading) return screen(<div className="card" style={{ height: 260, opacity: 0.5 }} />);
  if (error || !data) return screen(<ErrorView message={error || 'Evento no encontrado'} onRetry={reload} />);

  const { event, categories, expenses } = data as {
    event: { id: number; name: string; emoji: string; budget_amount: number; total_spent: number; start_date: string; end_date: string };
    categories: EventCategoryRow[];
    expenses: EventExpense[];
  };

  const spent = toNum(event.total_spent);
  const budget = toNum(event.budget_amount);
  const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const over = budget > 0 && spent > budget;
  const remaining = Math.max(0, budget - spent);
  const catTotal = categories.reduce((s, c) => s + toNum(c.total), 0);

  return screen(
    <>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <CatIcon tone="plum" size={52} radius={16}><span style={{ fontSize: 26 }}>{event.emoji || '📅'}</span></CatIcon>
        <div style={{ minWidth: 0 }}>
          <h1 className="serif" style={{ fontSize: isMobile ? 26 : 34, lineHeight: 1 }}>{event.name}</h1>
          <div className="psub" style={{ marginTop: 3 }}>{formatDayLabelWithWeekday(event.start_date)} — {formatDayLabelWithWeekday(event.end_date)}</div>
        </div>
      </div>

      {/* budget hero */}
      <Card pad style={{ marginBottom: 18, background: over ? 'linear-gradient(140deg, var(--surface) 55%, var(--honey-tint))' : 'linear-gradient(140deg, var(--surface) 60%, var(--pine-tint))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <Eyebrow>Presupuesto del evento</Eyebrow>
          {budget <= 0 ? <Pill tone="mute">sin tope</Pill> : over ? <Pill tone="over">excedido</Pill> : <Pill tone="ok">{Math.max(0, 100 - pct)}% disponible</Pill>}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: isMobile ? 40 : 48, fontWeight: 700, lineHeight: 0.9, letterSpacing: '-.02em' }}>{formatMoney(spent)}</span>
          {budget > 0 ? <span style={{ color: 'var(--ink-2)', marginBottom: 6 }}>de {formatMoney(budget)}</span> : null}
        </div>
        <Bar pct={budget > 0 ? Math.min(100, pct) : 0} over={over} fill="pine" height={9} />
        <div style={{ fontSize: 13, marginTop: 10, color: 'var(--ink-2)' }}>
          {over
            ? <>Se ha pasado <b style={{ color: 'var(--honey)' }}>{formatMoney(spent - budget)}</b> del tope</>
            : budget > 0
              ? <>Quedan <b style={{ color: 'var(--pine-2)' }}>{formatMoney(remaining)}</b></>
              : <>Sin presupuesto fijado para este evento</>}
        </div>
      </Card>

      {/* by category */}
      {categories.length > 0 && catTotal > 0 ? (
        <Card pad style={{ marginBottom: 18 }}>
          <h3 className="serif" style={{ fontSize: 20, marginBottom: 6 }}>Por categoría</h3>
          <div style={{ display: 'grid', placeItems: 'center', marginBottom: 6 }}>
            <EventDonut categories={categories} total={catTotal} />
          </div>
          {categories.map((cat, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: cat.color ?? FALLBACK_COLOR, flex: '0 0 auto' }} />
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{cat.emoji ? `${cat.emoji} ` : ''}{cat.category}</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-3)', minWidth: 34, textAlign: 'right' }}>{Math.round((toNum(cat.total) / catTotal) * 100)}%</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, minWidth: 56, textAlign: 'right' }}>{formatMoney(toNum(cat.total))}</span>
            </div>
          ))}
        </Card>
      ) : null}

      {/* expenses */}
      <Card pad>
        <h3 className="serif" style={{ fontSize: 20, marginBottom: 6 }}>Gastos del evento</h3>
        {expenses.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>Aún no hay gastos en este evento.</div>
        ) : (
          expenses.map((exp) => {
            const who = exp.paid_by === 'maria' ? 'María' : exp.paid_by === 'samuel' ? 'Samuel' : cap(exp.paid_by || '—');
            const mine = exp.paid_by === 'samuel';
            return (
              <Txn key={exp.id}>
                <div className="meta">
                  <div className="name">{exp.description}</div>
                  <div className="sub">{exp.category}</div>
                </div>
                <Who mine={mine}>{who}</Who>
                <div className="amt amt-neg" style={{ minWidth: 78, textAlign: 'right' }}>−{formatMoneyExact(toNum(exp.amount))}</div>
              </Txn>
            );
          })
        )}
      </Card>
    </>
  );
};
