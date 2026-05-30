import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Api } from '../api';
import { VisibleExpense } from './privacy';
import { useCountUp } from '../hooks/useCountUp';
import { useIsMobile } from '../hooks/useMediaQuery';
import { NotificationCenter } from '../components/NotificationCenter';
import { useCategoryManagement } from '../hooks/useCategoryManagement';
import { useContextSelector } from '../hooks/useContextSelector';
import { useCategoryModal } from '../hooks/useCategoryModal';
import { CategoryModal } from '../components/CategoryModal';
import { RecurringSection } from '../components/RecurringSection';
import { formatMoney, formatMoneyExact } from '../lib/money';
import { formatCycleRange, formatDayLabel, formatDayLabelWithWeekday } from '../lib/dates';
import { ErrorView } from '../components/ErrorView';
import { useAsyncEffect, useResource } from '../hooks/useResource';
import { CACHE_KEYS, cacheBus } from '../lib/cacheBus';
import {
  Card, Eyebrow, Pill, Bar, CatIcon, Seg, IconBtn, Btn, Txn, Who, Icon,
  CONTEXT_SEG_OPTIONS, Portal, type PillTone,
} from '../components/nido';
import type { CycleDetail } from '../api-types/cycles';
import type { Notification } from '../api-types/notifications';
import type { Goal } from '../types';

interface DashboardData {
  budget: { total: number; rent: number; savings: number; personal: number; availableShared: number };
  spending: { totalSpent: number; totalSharedSpent: number; remainingShared: number };
  personal: { owner: string; spent: number; budget: number };
  categoryBreakdown: Array<{ category: string; total: number; budget: number; count: number }>;
  personalCategoryBreakdown: Array<{ category: string; total: number; budget: number; count: number }>;
  recentTransactions: VisibleExpense[];
}

const toNum = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

const compareByNewest = (a: VisibleExpense, b: VisibleExpense) =>
  new Date(b.created_at ?? `${b.date}T12:00:00`).getTime() - new Date(a.created_at ?? `${a.date}T12:00:00`).getTime();

const getRecentExpenseWindow = (expenses: VisibleExpense[], maxItems = 5, maxDays = 3) => {
  const sorted = [...expenses].sort(compareByNewest);
  if (sorted.length === 0) return [];
  const newestTs = new Date(sorted[0].created_at ?? `${sorted[0].date}T12:00:00`).getTime();
  const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;
  return sorted
    .filter((e) => newestTs - new Date(e.created_at ?? `${e.date}T12:00:00`).getTime() <= maxAgeMs)
    .slice(0, maxItems);
};

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/* ── budget category row (shared by desktop + mobile, scales via `compact`) ── */
const CategoryRow: React.FC<{
  name: string;
  emoji?: string;
  color?: string;
  spent: number;
  budget: number;
  count?: number;
  onEdit?: () => void;
  onClick?: () => void;
}> = ({ name, emoji, color, spent, budget, onEdit, onClick }) => {
  const noBudget = budget <= 0;
  const pct = noBudget ? 0 : Math.round((spent / budget) * 100);
  const over = !noBudget && spent > budget;
  const fillW = noBudget ? 40 : Math.min(100, pct);
  let pillTone: PillTone = 'mute';
  let pillText = 'sin tope';
  if (!noBudget) {
    if (over) { pillTone = 'warn'; pillText = `+${formatMoney(spent - budget)}`; }
    else { pillTone = 'ok'; pillText = `queda ${formatMoney(budget - spent)}`; }
  }
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderTop: '1px solid var(--line)', cursor: onClick ? 'pointer' : undefined }}
      onClick={onClick}
    >
      <CatIcon icon={emoji ? undefined : Icon.dots} color={color} bg={color ? `${color}1A` : undefined} tone={color ? undefined : 'ink'}>
        {emoji ? <span style={{ fontSize: 18 }}>{emoji}</span> : undefined}
      </CatIcon>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
          <span style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          <Pill tone={pillTone}>{pillText}</Pill>
        </div>
        <Bar pct={fillW} over={over} fill="pine" thin faded={noBudget} />
      </div>
      <div style={{ textAlign: 'right', minWidth: 92 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{formatMoney(spent)}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{noBudget ? '—' : `de ${formatMoney(budget)}`}</div>
      </div>
      {onEdit ? (
        <button
          type="button"
          aria-label={`Editar ${name}`}
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          style={{ color: 'var(--ink-3)', cursor: 'pointer', background: 'none', border: 0, display: 'flex' }}
        >
          <Icon.edit />
        </button>
      ) : null}
    </div>
  );
};

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const loadCurrentCycleFn = useCallback(() => Api.getCurrentCycle(), []);
  const { data: activeCycle, loading: cycleLoading } = useResource<CycleDetail | null>(loadCurrentCycleFn, {
    fallbackMessage: 'Error al cargar ciclo activo',
    invalidationKey: CACHE_KEYS.cycles,
  });
  const cycleLoaded = !cycleLoading;

  const [data, setData] = useState<DashboardData | null>(null);
  const [expenses, setExpenses] = useState<VisibleExpense[]>([]);
  const { activeContext, setActiveContext } = useContextSelector();
  const [showNotifications, setShowNotifications] = useState(false);

  const loadUnreadCountFn = useCallback(async () => {
    const d = await Api.getNotifications();
    return d.filter((n: Notification) => !n.is_read).length;
  }, []);
  const { data: unreadCountData } = useResource<number>(loadUnreadCountFn, {
    fallbackMessage: 'Error al cargar notificaciones',
    invalidationKey: CACHE_KEYS.notifications,
  });
  const unreadCount = unreadCountData ?? 0;

  const { categories, getCategoryDef } = useCategoryManagement(activeContext);
  const catModal = useCategoryModal();

  const [events, setEvents] = useState<any[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isEvent, setIsEvent] = useState(false);
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  const [eventGoalId, setEventGoalId] = useState<number | null>(null);
  const [editingEvent, setEditingEvent] = useState<any>(null);

  // count-up hooks must run unconditionally (before any early return)
  const availableSharedRaw = toNum(data?.budget?.availableShared);
  const totalSharedSpentRaw = toNum(data?.spending?.totalSharedSpent);
  const personalBudgetRaw = toNum(data?.personal?.budget);
  const personalSpentRaw = toNum(data?.personal?.spent);
  const recentTxRaw = Array.isArray(expenses) ? expenses : [];
  const normalizedUserKey = (user?.username || '').toLowerCase().includes('maria') || (user?.username || '').toLowerCase().includes('mara') ? 'maria' : 'samuel';
  const personalRecentTxRaw = recentTxRaw.filter((tx) => tx.type === 'personal' && ((user?.id && tx.paid_by_user_id != null) ? tx.paid_by_user_id === user.id : tx.paid_by === normalizedUserKey));
  const sharedMonthTransactions = recentTxRaw.filter((tx) => tx.type === 'shared');
  const personalTxCountRaw = Array.isArray(data?.personalCategoryBreakdown)
    ? data!.personalCategoryBreakdown.reduce((sum, item) => sum + toNum(item.count), 0)
    : personalRecentTxRaw.length;

  const metricBudgetTarget = activeContext === 'shared' ? availableSharedRaw : personalBudgetRaw;
  const metricSpentTarget = activeContext === 'shared' ? totalSharedSpentRaw : personalSpentRaw;
  // Lead with what's left (Maria's Trello call); count-up clamps negatives to 0,
  // so on overspend the hero reads €0 and the subtitle carries the calm warning.
  const metricRemainingTarget = Math.max(0, metricBudgetTarget - metricSpentTarget);
  const sharedCount = sharedMonthTransactions.length;
  const metricCount = activeContext === 'shared' ? sharedCount : personalTxCountRaw;
  const metricAvgTarget = activeContext === 'shared'
    ? (sharedCount > 0 ? Math.round(sharedMonthTransactions.reduce((s, t) => s + toNum(t.amount), 0) / sharedCount) : 0)
    : (personalTxCountRaw > 0 ? Math.round(personalSpentRaw / personalTxCountRaw) : 0);

  const animRemaining = useCountUp(metricRemainingTarget);
  const animSpent = useCountUp(metricSpentTarget);
  const animAvg = useCountUp(metricAvgTarget);

  const loadDashboardDataFn = useCallback(async () => {
    if (!cycleLoaded) return;
    let summary, nextExpenses;
    if (activeCycle?.start_date) {
      const range = { start_date: activeCycle.start_date, end_date: activeCycle.end_date ?? undefined };
      [summary, nextExpenses] = await Promise.all([
        Api.getSummary({ ...range, cycle_id: activeCycle.id }),
        Api.getExpenses({ ...range, cycle_id: activeCycle.id }),
      ]);
    } else {
      [summary, nextExpenses] = await Promise.all([Api.getSummary(), Api.getExpenses()]);
    }
    setData(summary);
    setExpenses(Array.isArray(nextExpenses) ? nextExpenses : []);
    const [eventsData, goalsData] = await Promise.all([
      Api.getEvents(activeContext as 'shared' | 'personal'),
      Api.getGoals(),
    ]);
    setEvents(Array.isArray(eventsData) ? eventsData : []);
    setGoals(Array.isArray(goalsData) ? goalsData : []);
  }, [cycleLoaded, activeCycle?.id, activeCycle?.start_date, activeCycle?.end_date, activeContext]);

  const { loading: dataLoading, error, run: loadDashboardData } = useAsyncEffect(loadDashboardDataFn, {
    fallbackMessage: 'Error al cargar los datos',
    invalidationKeys: [CACHE_KEYS.expenses, CACHE_KEYS.summary, CACHE_KEYS.categories, CACHE_KEYS.events, CACHE_KEYS.goals, CACHE_KEYS.budget],
  });

  const loading = !cycleLoaded || dataLoading;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card" style={{ height: 180, opacity: 0.6 }} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.55fr 1fr', gap: 20 }}>
          <div className="card" style={{ height: 320, opacity: 0.5 }} />
          <div className="card" style={{ height: 320, opacity: 0.4 }} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <ErrorView message={error || 'Error al cargar'} onRetry={loadDashboardData} />;
  }

  const sharedCategoryBreakdown = Array.isArray(data.categoryBreakdown) ? data.categoryBreakdown : [];
  const personalCategoryBreakdown = Array.isArray(data.personalCategoryBreakdown) ? data.personalCategoryBreakdown : [];
  const categoryBreakdown = activeContext === 'shared' ? sharedCategoryBreakdown : personalCategoryBreakdown;
  const recentTransactions = activeContext === 'shared'
    ? getRecentExpenseWindow(recentTxRaw.filter((tx) => tx.type === 'shared'), 5, 3)
    : getRecentExpenseWindow(personalRecentTxRaw, 5, 3);

  const budgetTotal = metricBudgetTarget;
  const spentTotal = metricSpentTarget;
  const overspent = spentTotal - budgetTotal;
  const isOver = budgetTotal > 0 && overspent > 0;
  const pctAvail = budgetTotal > 0 ? Math.max(0, Math.round(((budgetTotal - spentTotal) / budgetTotal) * 100)) : 0;
  const pctSpent = budgetTotal > 0 ? Math.min(100, Math.round((spentTotal / budgetTotal) * 100)) : 0;

  // group recent by date
  const dateMap = new Map<string, VisibleExpense[]>();
  recentTransactions.slice(0, 10).forEach((tx) => {
    if (!dateMap.has(tx.date)) dateMap.set(tx.date, []);
    dateMap.get(tx.date)!.push(tx);
  });
  const groupedTransactions = Array.from(dateMap.keys())
    .sort((a, b) => b.localeCompare(a))
    .map((date) => ({ date, items: dateMap.get(date)! }));

  const cycleRangeLabel = activeCycle?.start_date
    ? `Ciclo · ${formatCycleRange(activeCycle.start_date, activeCycle.end_date ?? new Date().toISOString().slice(0, 10))}`
    : 'Todos los gastos';

  // nearest goal for the peek card
  const ctxGoals = goals.filter((g) => g.owner_type === activeContext);
  const datedGoals = ctxGoals.filter((g) => g.deadline).sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
  const nearestGoal = datedGoals[0] ?? ctxGoals[0] ?? null;

  // recent-window events (active or finished within 7 days), like the legacy dashboard
  const recentEvents = events.filter((ev) => {
    const end = new Date(ev.end_date);
    return end >= new Date(Date.now() - 7 * 86400000);
  });

  const overCount = categoryBreakdown.filter((c) => toNum(c.budget) > 0 && toNum(c.total) > toNum(c.budget)).length;

  const openAddCategory = () => {
    setIsEvent(false); setEventStartDate(''); setEventEndDate(''); setEventGoalId(null); setEditingEvent(null);
    catModal.openAdd();
  };

  const expenseWho = (tx: VisibleExpense) => {
    const mine = (user?.id && tx.paid_by_user_id != null) ? tx.paid_by_user_id === user.id : tx.paid_by === normalizedUserKey;
    const label = mine ? 'Tú' : (tx.paid_by === 'maria' ? 'María' : tx.paid_by === 'samuel' ? 'Samuel' : cap(tx.paid_by));
    return { mine, label };
  };

  /* ── shared content blocks ─────────────────────────────────── */

  const heroEyebrow = activeContext === 'shared' ? 'Disponible este ciclo · compartido' : 'Disponible este ciclo · personal';
  const totalWord = activeContext === 'shared' ? 'compartidos' : 'personales';

  const HeroSubtitle = (
    <span style={{ color: 'var(--ink-2)' }}>
      de <b style={{ color: 'var(--ink)' }}>{formatMoney(budgetTotal)}</b> {totalWord}
      {isOver
        ? <> · <b style={{ color: 'var(--berry)' }}>excedido por {formatMoney(overspent)}</b></>
        : <> · <b style={{ color: 'var(--pine-2)' }}>{formatMoney(spentTotal)}</b> gastados</>}
    </span>
  );

  const heroPill = budgetTotal <= 0
    ? <Pill tone="mute">sin presupuesto</Pill>
    : isOver
      ? <Pill tone="over">excedido</Pill>
      : <Pill tone="ok">{pctAvail}% disponible</Pill>;

  const budgetCardInner = (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <h3 className="serif" style={{ fontSize: isMobile ? 19 : 23 }}>
          {activeContext === 'shared' ? 'Presupuesto por categoría' : 'Presupuesto personal'}
        </h3>
        <button type="button" onClick={openAddCategory} style={{ fontSize: 13, color: 'var(--clay)', fontWeight: 600, cursor: 'pointer', background: 'none', border: 0 }}>
          Ajustar topes
        </button>
      </div>
      {overCount > 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 6 }}>
          {overCount} {overCount === 1 ? 'categoría supera su tope' : 'categorías superan su tope'} este ciclo. Quizá conviene recalibrarlas.
        </p>
      ) : null}

      {recentEvents.map((ev) => {
        const spent = toNum(ev.total_spent);
        return (
          <CategoryRow
            key={`event-${ev.id}`}
            name={`${ev.emoji ? ev.emoji + ' ' : ''}${ev.name}`}
            emoji={ev.emoji || '📅'}
            color={ev.color || 'var(--plum)'}
            spent={spent}
            budget={toNum(ev.budget_amount)}
            onClick={() => navigate(`/events/${ev.id}`)}
          />
        );
      })}

      {categoryBreakdown.length === 0 ? (
        <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
          Aún no hay categorías con gasto este ciclo.
        </div>
      ) : (
        categoryBreakdown
          .filter((c) => toNum(c.budget) > 0 || toNum(c.total) > 0)
          .map((c) => {
            const def = getCategoryDef(c.category);
            return (
              <CategoryRow
                key={c.category}
                name={c.category}
                emoji={def?.emoji}
                color={def?.color}
                spent={toNum(c.total)}
                budget={toNum(c.budget)}
                count={toNum(c.count)}
                onEdit={() => { const d = getCategoryDef(c.category); if (d) catModal.openEdit(d); }}
                onClick={() => navigate('/history', { state: { initialContext: activeContext, initialCategory: c.category } })}
              />
            );
          })
      )}

      <button
        type="button"
        onClick={openAddCategory}
        style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--clay)', fontWeight: 600, fontSize: 14, paddingTop: 14, cursor: 'pointer', background: 'none', border: 0 }}
      >
        <Icon.plusS /> Añadir categoría
      </button>
    </>
  );

  const goalPeekCard = nearestGoal ? (
    <Card pad style={{ background: 'linear-gradient(150deg, var(--surface), var(--pine-tint))', cursor: 'pointer' }}>
      <div onClick={() => navigate('/goals')}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 className="serif" style={{ fontSize: isMobile ? 19 : 21 }}>Objetivo más cercano</h3>
          <span style={{ color: 'var(--pine)' }}><Icon.target /></span>
        </div>
        <div style={{ fontWeight: 600, fontSize: 15, marginTop: 6, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span>{nearestGoal.icon}</span>{nearestGoal.name}
        </div>
        {(() => {
          const pct = nearestGoal.target > 0 ? Math.round((nearestGoal.current / nearestGoal.target) * 100) : 0;
          const left = Math.max(0, nearestGoal.target - nearestGoal.current);
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, margin: '6px 0 10px' }}>
                <span style={{ fontSize: 28, fontWeight: 700 }}>{formatMoney(nearestGoal.current)}</span>
                <span style={{ color: 'var(--ink-2)', marginBottom: 4 }}>/ {formatMoney(nearestGoal.target)}</span>
              </div>
              <Bar pct={Math.min(100, pct)} fill="pine" />
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 8 }}>
                Faltan {formatMoney(left)}{nearestGoal.deadline ? ` · cierra el ${formatDayLabel(nearestGoal.deadline)}` : ''}
              </div>
            </>
          );
        })()}
      </div>
    </Card>
  ) : (
    <Card pad style={{ background: 'linear-gradient(150deg, var(--surface), var(--pine-tint))' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 className="serif" style={{ fontSize: isMobile ? 19 : 21 }}>Objetivos</h3>
        <span style={{ color: 'var(--pine)' }}><Icon.target /></span>
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginBottom: 14 }}>Aún no tenéis ninguna meta de ahorro. Empezad por la primera.</p>
      <Btn variant="pine" onClick={() => navigate('/goals')} style={{ width: '100%', justifyContent: 'center' }}>
        <Icon.plusS /> Crear objetivo
      </Btn>
    </Card>
  );

  const recentCard = (
    <Card pad>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <h3 className="serif" style={{ fontSize: isMobile ? 19 : 23 }}>Últimos gastos</h3>
        <button type="button" onClick={() => navigate('/history')} style={{ fontSize: 13, color: 'var(--clay)', fontWeight: 600, cursor: 'pointer', background: 'none', border: 0 }}>
          Ver historial →
        </button>
      </div>
      {recentTransactions.length === 0 ? (
        <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
          Todavía no hay gastos en este ciclo.
        </div>
      ) : (
        groupedTransactions.map(({ date, items }) => (
          <React.Fragment key={date}>
            <div className="day-label">{formatDayLabelWithWeekday(date)}</div>
            {items.map((tx) => {
              const def = getCategoryDef(tx.category);
              const who = expenseWho(tx);
              return (
                <Txn
                  key={tx.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('/history', { state: { initialContext: tx.type === 'shared' ? 'shared' : 'personal', initialCategory: tx.category } })}
                >
                  <CatIcon color={def?.color} bg={def?.color ? `${def.color}1A` : undefined} tone={def?.color ? undefined : 'ink'}>
                    <span style={{ fontSize: 18 }}>{def?.emoji ?? '🦋'}</span>
                  </CatIcon>
                  <div className="meta">
                    <div className="name">{tx.description}</div>
                    <div className="sub">{tx.category}</div>
                  </div>
                  <Who mine={who.mine}>{who.label}</Who>
                  <div className="amt amt-neg" style={{ minWidth: 78, textAlign: 'right' }}>−{formatMoneyExact(toNum(tx.amount))}</div>
                </Txn>
              );
            })}
          </React.Fragment>
        ))
      )}
    </Card>
  );

  /* The household header (brand + search + bell), shared shape, scales by device. */
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 11 : 16, marginBottom: isMobile ? 18 : 24 }}>
      <div
        className="brand-mark"
        style={{ width: isMobile ? 44 : 52, height: isMobile ? 44 : 52, borderRadius: 16, background: 'linear-gradient(150deg, var(--pine), var(--clay))', display: 'grid', placeItems: 'center', color: '#fff', flex: '0 0 auto' }}
      >
        <Icon.heart />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 className="serif" style={{ fontSize: isMobile ? 24 : 34, lineHeight: 1 }}>El Nido</h1>
        <div className="psub" style={{ marginTop: 3, fontSize: isMobile ? 12 : 13.5 }}>María &amp; tú</div>
      </div>
      <IconBtn aria-label="Notificaciones" badge={unreadCount > 0 ? unreadCount : undefined} onClick={() => setShowNotifications(true)} style={isMobile ? { width: 38, height: 38 } : undefined}>
        <Icon.bell />
      </IconBtn>
    </div>
  );

  const contextRow = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: isMobile ? 16 : 22 }}>
      <Seg value={activeContext} options={CONTEXT_SEG_OPTIONS} onChange={setActiveContext} full={isMobile} />
      {!isMobile ? (
        <div className="btn btn-ghost" style={{ gap: 8 }}><Icon.cal /> {cycleRangeLabel}</div>
      ) : null}
    </div>
  );

  const heroDesktop = (
    <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 22 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr' }}>
        <div style={{ padding: '30px 34px', background: 'linear-gradient(135deg, var(--surface) 60%, var(--clay-tint))' }}>
          <Eyebrow>{heroEyebrow}</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, margin: '10px 0 4px' }}>
            <div style={{ fontSize: 74, fontWeight: 700, lineHeight: 0.9, letterSpacing: '-.02em' }}>{formatMoney(animRemaining)}</div>
            <div style={{ marginBottom: 14 }}>{heroPill}</div>
          </div>
          <div style={{ fontSize: 15, marginBottom: 18 }}>{HeroSubtitle}</div>
          <Bar pct={pctSpent} over={isOver} fill="pine" height={9} />
        </div>
        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr' }}>
          <div style={{ padding: '24px 30px', borderLeft: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
            <Eyebrow>Gastado este ciclo</Eyebrow>
            <div style={{ fontSize: 34, fontWeight: 700, marginTop: 6 }}>{formatMoney(animSpent)}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{metricCount} {metricCount === 1 ? 'gasto' : 'gastos'} este ciclo</div>
          </div>
          <div style={{ padding: '24px 30px', borderLeft: '1px solid var(--line)' }}>
            <Eyebrow>Ticket medio</Eyebrow>
            <div style={{ fontSize: 34, fontWeight: 700, marginTop: 6 }}>{formatMoney(animAvg)}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>en {metricCount} {metricCount === 1 ? 'registro' : 'registros'}</div>
          </div>
        </div>
      </div>
    </Card>
  );

  const heroMobile = (
    <>
      <Card style={{ padding: '22px 22px', marginBottom: 14, background: 'linear-gradient(140deg, var(--surface) 55%, var(--clay-tint))' }}>
        <Eyebrow>{heroEyebrow}</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, margin: '8px 0 6px' }}>
          <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 0.85, letterSpacing: '-.02em' }}>{formatMoney(animRemaining)}</div>
          <div style={{ marginBottom: 8 }}>{heroPill}</div>
        </div>
        <div style={{ fontSize: 13.5, marginBottom: 14 }}>{HeroSubtitle}</div>
        <Bar pct={pctSpent} over={isOver} fill="pine" height={8} />
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <Card style={{ padding: '15px 16px' }}>
          <Eyebrow>Gastado</Eyebrow>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{formatMoney(animSpent)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{metricCount} {metricCount === 1 ? 'gasto' : 'gastos'}</div>
        </Card>
        <Card style={{ padding: '15px 16px' }}>
          <Eyebrow>Ticket medio</Eyebrow>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{formatMoney(animAvg)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>por gasto</div>
        </Card>
      </div>
    </>
  );

  const modals = (
    <Portal>
      {showNotifications && <NotificationCenter onClose={() => setShowNotifications(false)} />}
      <CategoryModal
        isOpen={catModal.showModal}
        mode={catModal.mode}
        name={catModal.name}
        onNameChange={catModal.setName}
        emoji={catModal.emoji}
        onEmojiChange={catModal.setEmoji}
        color={catModal.color}
        onColorChange={catModal.setColor}
        colorOptions={catModal.colorOptions}
        budget={catModal.budget}
        onBudgetChange={catModal.setBudget}
        onClose={catModal.close}
        onSave={async () => {
          if (isEvent) {
            const eventData = {
              name: catModal.name, emoji: catModal.emoji,
              budget_amount: parseFloat(catModal.budget) || 0,
              start_date: eventStartDate, end_date: eventEndDate,
              goal_id: eventGoalId, context: activeContext,
            };
            try {
              if (editingEvent) await Api.updateEvent(editingEvent.id, eventData);
              else await Api.createEvent(eventData);
              cacheBus.invalidate(CACHE_KEYS.events);
            } catch (err) { console.error('Failed to save event:', err); return; }
            setIsEvent(false); setEventStartDate(''); setEventEndDate(''); setEventGoalId(null); setEditingEvent(null);
            catModal.close();
            return;
          }
          catModal.save({ context: activeContext, categories });
        }}
        onDelete={async () => {
          if (editingEvent) {
            if (!confirm('Los gastos asociados se mantendrán pero ya no estarán vinculados al evento. ¿Eliminar evento?')) return;
            await Api.deleteEvent(editingEvent.id);
            cacheBus.invalidate(CACHE_KEYS.events);
            setEditingEvent(null); setIsEvent(false); catModal.close();
          } else {
            catModal.remove({ categories });
          }
        }}
        totalBudget={activeContext === 'shared' ? availableSharedRaw : personalBudgetRaw}
        allocatedBudget={categoryBreakdown.filter((c) => c.category !== catModal.originalName).reduce((sum, c) => sum + toNum(c.budget), 0)}
        isEvent={isEvent}
        onIsEventChange={setIsEvent}
        eventStartDate={eventStartDate}
        onEventStartDateChange={setEventStartDate}
        eventEndDate={eventEndDate}
        onEventEndDateChange={setEventEndDate}
        eventGoalId={eventGoalId}
        onEventGoalIdChange={setEventGoalId}
        goals={goals}
      />
    </Portal>
  );

  if (isMobile) {
    return (
      <>
        {header}
        {contextRow}
        {heroMobile}
        <Card pad style={{ marginBottom: 16 }}>{budgetCardInner}</Card>
        <div style={{ marginBottom: 16 }}><RecurringSection userId={user?.id ?? 0} /></div>
        <div style={{ marginBottom: 16 }}>{goalPeekCard}</div>
        {recentCard}
        {modals}
      </>
    );
  }

  return (
    <>
      {header}
      {contextRow}
      {heroDesktop}
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 22, marginBottom: 22, alignItems: 'start' }}>
        <Card pad>{budgetCardInner}</Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <RecurringSection userId={user?.id ?? 0} />
          {goalPeekCard}
        </div>
      </div>
      {recentCard}
      {modals}
    </>
  );
};
