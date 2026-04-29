import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell } from 'lucide-react';
import { useAuth } from '../auth';
import { Api } from '../api';
import { MoreHorizontal } from 'lucide-react';
import { TransactionRow } from '../components/TransactionRow';
import { ThemeToggle } from '../components/ThemeToggle';
import { format } from 'date-fns';
import { INDICATOR_COLORS } from '../types';
import { getPersonalBalanceCardModel, VisibleExpense } from './privacy';
import { useCountUp } from '../hooks/useCountUp';
import { NotificationCenter } from '../components/NotificationCenter';
import { useCategoryManagement } from '../hooks/useCategoryManagement';
import { useContextSelector } from '../hooks/useContextSelector';
import { useCategoryModal } from '../hooks/useCategoryModal';
import { ContextTabs } from '../components/ContextTabs';
import { CategoryModal } from '../components/CategoryModal';
import { RecurringSection } from '../components/RecurringSection';
import { formatMoney, formatMoneyExact } from '../lib/money';
import { ErrorView } from '../components/ErrorView';
import { useAsyncEffect, useResource } from '../hooks/useResource';
import { CACHE_KEYS, cacheBus } from '../lib/cacheBus';
import type { CycleDetail } from '../api-types/cycles';

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface DashboardData {
  budget: {
    total: number;
    rent: number;
    savings: number;
    personal: number;
    availableShared: number;
  };
  spending: {
    totalSpent: number;
    totalSharedSpent: number;
    remainingShared: number;
  };
  personal: {
    owner: string;
    spent: number;
    budget: number;
  };
  categoryBreakdown: Array<{
    category: string;
    total: number;
    budget: number;
    count: number;
  }>;
  personalCategoryBreakdown: Array<{
    category: string;
    total: number;
    budget: number;
    count: number;
  }>;
  recentTransactions: VisibleExpense[];
}

const toNum = (v: unknown, fallback = 0) =>
  Number.isFinite(Number(v)) ? Number(v) : fallback;

const compareByNewest = (a: VisibleExpense, b: VisibleExpense) =>
  new Date(b.created_at ?? `${b.date}T12:00:00`).getTime() - new Date(a.created_at ?? `${a.date}T12:00:00`).getTime();

const getRecentExpenseWindow = (expenses: VisibleExpense[], maxItems = 5, maxDays = 3) => {
  const sorted = [...expenses].sort(compareByNewest);
  if (sorted.length === 0) return [];

  const newestTs = new Date(sorted[0].created_at ?? `${sorted[0].date}T12:00:00`).getTime();
  const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;

  return sorted
    .filter((expense) => newestTs - new Date(expense.created_at ?? `${expense.date}T12:00:00`).getTime() <= maxAgeMs)
    .slice(0, maxItems);
};

const formatCycleLabel = (cycle: CycleDetail | null) => {
  if (!cycle?.start_date) return 'Ciclo actual';
  const d = new Date(cycle.start_date + 'T12:00:00');
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `Desde ${d.getDate()} ${months[d.getMonth()]}`;
};

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
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
    const data = await Api.getNotifications();
    return data.filter((n: Notification) => !n.is_read).length;
  }, []);
  const { data: unreadCountData } = useResource<number>(loadUnreadCountFn, {
    fallbackMessage: 'Error al cargar notificaciones',
    invalidationKey: CACHE_KEYS.notifications,
  });
  const unreadCount = unreadCountData ?? 0;
  const { categories, getCategoryDef } = useCategoryManagement(activeContext);
  const catModal = useCategoryModal();

  // Events state
  const [events, setEvents] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [isEvent, setIsEvent] = useState(false);
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  const [eventGoalId, setEventGoalId] = useState<number | null>(null);
  const [editingEvent, setEditingEvent] = useState<any>(null);

  const currentMonth = format(new Date(), 'yyyy-MM');

  // useCountUp hooks must be called unconditionally (before any early returns)
  const availableSharedRaw = toNum(data?.budget?.availableShared);
  const totalSharedSpentRaw = toNum(data?.spending?.totalSharedSpent);
  const personalBudgetRaw = toNum(data?.personal?.budget);
  const personalSpentRaw = toNum(data?.personal?.spent);
  const recentTxRaw = Array.isArray(expenses) ? expenses : [];
  const normalizedUserKey = (user?.username || '').toLowerCase().includes('maria') || (user?.username || '').toLowerCase().includes('mara') ? 'maria' : 'samuel';
  const personalRecentTxRaw = recentTxRaw.filter((tx) => tx.type === 'personal' && ((user?.id && tx.paid_by_user_id != null) ? tx.paid_by_user_id === user.id : tx.paid_by === normalizedUserKey));
  const sharedMonthTransactions = recentTxRaw.filter((tx) => tx.type === 'shared');
  const personalTxCountRaw = Array.isArray(data?.personalCategoryBreakdown)
    ? data.personalCategoryBreakdown.reduce((sum, item) => sum + toNum(item.count), 0)
    : personalRecentTxRaw.length;
  const metricBudgetTarget = activeContext === 'shared' ? availableSharedRaw : personalBudgetRaw;
  const metricSpentTarget = activeContext === 'shared' ? totalSharedSpentRaw : personalSpentRaw;
  const metricAvgTarget = activeContext === 'shared'
    ? (sharedMonthTransactions.length > 0 ? Math.round(sharedMonthTransactions.reduce((sum: number, t: VisibleExpense) => sum + toNum(t.amount), 0) / sharedMonthTransactions.length) : 0)
    : (personalTxCountRaw > 0 ? Math.round(personalSpentRaw / personalTxCountRaw) : 0);
  const animBudget = useCountUp(metricBudgetTarget);
  const animSpent = useCountUp(metricSpentTarget);
  const animAvg = useCountUp(metricAvgTarget);

  const loadDashboardDataFn = useCallback(async () => {
    if (!cycleLoaded) return; // wait for the cycle prerequisite before fetching
    let summary, nextExpenses;

    if (activeCycle?.start_date) {
      // Cycle-based: use date range
      const range = { start_date: activeCycle.start_date, end_date: activeCycle.end_date ?? undefined };
      [summary, nextExpenses] = await Promise.all([
        Api.getSummary({ ...range, cycle_id: activeCycle.id }),
        Api.getExpenses({ ...range, cycle_id: activeCycle.id }),
      ]);
    } else {
      // No active cycle: show all expenses (budget lives in categories, not months)
      [summary, nextExpenses] = await Promise.all([
        Api.getSummary(),
        Api.getExpenses(),
      ]);
    }

    setData(summary);
    setExpenses(Array.isArray(nextExpenses) ? nextExpenses : []);

    // Load events and goals in parallel
    const [eventsData, goalsData] = await Promise.all([
      Api.getEvents(activeContext as 'shared' | 'personal'),
      Api.getGoals(),
    ]);
    setEvents(Array.isArray(eventsData) ? eventsData : []);
    setGoals(Array.isArray(goalsData) ? goalsData : []);
  }, [cycleLoaded, activeCycle?.id, activeCycle?.start_date, activeCycle?.end_date, currentMonth, activeContext]);

  const { loading: dataLoading, error, run: loadDashboardData } =
    useAsyncEffect(loadDashboardDataFn, {
      fallbackMessage: 'Error al cargar los datos',
      invalidationKeys: [
        CACHE_KEYS.expenses,
        CACHE_KEYS.summary,
        CACHE_KEYS.categories,
        CACHE_KEYS.events,
        CACHE_KEYS.goals,
        CACHE_KEYS.budget,
      ],
    });

  // Page is loading until both the cycle prerequisite resolves and the data fetch completes.
  const loading = !cycleLoaded || dataLoading;

  if (loading) {
    return (
      <>
        <div className="dashboard__header">
          <div>
            <div className="skeleton skeleton--subtitle" />
            <div className="skeleton skeleton--title" />
          </div>
        </div>
        <div className="dashboard__balances">
          <div className="skeleton skeleton--card-sm" />
          <div className="skeleton skeleton--card-sm" />
        </div>
        <div className="dashboard__bottom">
          <div className="skeleton skeleton--card-lg" />
          <div className="skeleton skeleton--card-lg" />
        </div>
      </>
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

  const availableShared = toNum(data?.budget?.availableShared);
  const totalSharedSpent = toNum(data?.spending?.totalSharedSpent);
  const remainingShared = toNum(data?.spending?.remainingShared);
  const sharedProgress = availableShared > 0
    ? Math.round((totalSharedSpent / availableShared) * 100)
    : 0;

  const personalCard = getPersonalBalanceCardModel(data);

  const userName = user?.username ? user.username.charAt(0).toUpperCase() + user.username.slice(1) : 'Usuario';

  // Group recent transactions by date for the date pill display
  const groupedTransactions: { date: string; items: VisibleExpense[] }[] = [];
  const dateMap = new Map<string, VisibleExpense[]>();
  recentTransactions.slice(0, 10).forEach(tx => {
    if (!dateMap.has(tx.date)) dateMap.set(tx.date, []);
    dateMap.get(tx.date)!.push(tx);
  });
  const sortedDates = Array.from(dateMap.keys()).sort((a, b) => b.localeCompare(a));
  sortedDates.forEach(date => {
    groupedTransactions.push({ date, items: dateMap.get(date)! });
  });

  const formatDatePill = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
    if (dateStr === todayStr) return 'Hoy';
    if (dateStr === yesterdayStr) return 'Ayer';
    const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    return `${days[d.getDay()]} ${d.getDate()}`;
  };

  const cycleLabel = formatCycleLabel(activeCycle);

  return (
    <>
      {/* Header */}
      <div className="dashboard__header an d1">
          <div className="nido-name">
            <div className="couple-ring">🏠</div>
            <div>
              <h1>El Nido</h1>
              <p style={{ fontSize: '13px', color: 'var(--ts)' }}>{cycleLabel}</p>
            </div>
          </div>
          <div className="dashboard__actions">
            <div className="dashboard__search">
              <Search size={16} color="var(--color-text-tertiary)" />
              <span className="dashboard__search-text">Buscar...</span>
            </div>
            <ThemeToggle />
            <button className="dashboard__notification-btn" onClick={() => setShowNotifications(true)} style={{ position: 'relative' }}>
              <Bell size={18} color="var(--color-text-secondary)" />
              {unreadCount > 0 && (
                <span className="dashboard__notification-badge">{unreadCount}</span>
              )}
            </button>
          </div>
        </div>

        {/* Context Tabs */}
        <ContextTabs active={activeContext} onChange={setActiveContext} className="an d2" />

        {/* Insight Strip */}
        <div className="dashboard__insight-strip an d3">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            {activeContext === 'shared'
              ? (availableShared > 0 && totalSharedSpent > 0
                  ? <>Llevan <strong>{formatMoney(totalSharedSpent)}</strong> gastados de {formatMoney(availableShared)} compartidos</>
                  : <>Sin gastos compartidos en este ciclo</>)
              : (toNum(data?.personal?.budget) > 0
                  ? <>Llevas <strong>{formatMoney(toNum(data?.personal?.spent))}</strong> gastados de tu presupuesto personal</>
                  : <>Sin gastos personales en este ciclo</>)}
          </span>
        </div>

        {/* Metric Cards */}
        <div className="dashboard__metric-cards an d3">
          <div className="card metric-card" style={{ '--metric-glow': 'rgba(96,165,250,.15)' } as React.CSSProperties}>
            <div className="accent-bar" style={{ background: '#60A5FA', boxShadow: '0 0 8px #60A5FA' }} />
            <div className="label">{activeContext === 'shared' ? 'Presupuesto compartido' : 'Presupuesto personal'}</div>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>
              {formatMoney(animBudget)}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ts)', marginTop: '8px' }}>
              {(() => {
                const budget = activeContext === 'shared' ? availableShared : toNum(data?.personal?.budget);
                const spent = activeContext === 'shared' ? totalSharedSpent : toNum(data?.personal?.spent);
                const remaining = budget - spent;
                const pct = budget > 0 ? Math.round((remaining / budget) * 100) : 0;
                return (
                  <>
                    <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                      {formatMoney(spent)} gastados
                    </span>
                    {' '}· <span style={{ color: remaining >= 0 ? 'var(--ts)' : 'var(--red)', fontWeight: 500 }}>
                      {formatMoney(Math.abs(remaining))} {remaining >= 0 ? 'disponible' : 'excedido'}
                    </span>
                    {' '}({pct}%)
                  </>
                );
              })()}
            </div>
          </div>
          <div className="card metric-card" style={{ '--metric-glow': 'rgba(52,211,153,.15)' } as React.CSSProperties}>
            <div className="accent-bar" style={{ background: '#34D399', boxShadow: '0 0 8px #34D399' }} />
            <div className="label">Gastado este ciclo</div>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>
              {formatMoney(animSpent)}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ts)', marginTop: '8px' }}>
              {activeContext === 'shared' ? sharedMonthTransactions.length : personalTxCountRaw} gastos este ciclo
            </div>
          </div>
          <div className="card metric-card" style={{ '--metric-glow': 'rgba(167,139,250,.15)' } as React.CSSProperties}>
            <div className="accent-bar" style={{ background: '#A78BFA', boxShadow: '0 0 8px #A78BFA' }} />
            <div className="label">Ticket medio</div>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>
              {formatMoney(animAvg)}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ts)', marginTop: '8px' }}>
              {activeContext === 'shared' ? sharedMonthTransactions.length : personalTxCountRaw} gastos registrados
            </div>
          </div>
        </div>

        {/* Bottom split */}
        <div className="dashboard__bottom">
          {/* Budget section */}
          <div className="card an d4">
            <div className="sh">
              <div className="st">{activeContext === 'shared' ? 'Presupuesto compartido' : 'Presupuesto personal'}</div>
            </div>
            {events.filter(ev => {
              const endDate = new Date(ev.end_date);
              const now = new Date();
              return endDate >= new Date(now.getTime() - 7 * 86400000);
            }).map(ev => {
              const isActive = new Date(ev.end_date) >= new Date();
              const daysLeft = isActive ? Math.ceil((new Date(ev.end_date).getTime() - Date.now()) / 86400000) : 0;
              const spent = ev.total_spent || 0;
              const pct = ev.budget_amount > 0 ? Math.round((spent / ev.budget_amount) * 100) : 0;

              return (
                <div
                  key={`event-${ev.id}`}
                  className={`budget-item event-budget-item${!isActive ? ' event-budget-item--finished' : ''}`}
                  onClick={() => navigate(`/events/${ev.id}`)}
                >
                  <div className="event-badge">Evento</div>
                  <div className="budget-item__row">
                    <span className="budget-item__name">{ev.emoji} {ev.name}</span>
                    <span className="budget-item__meta">
                      {isActive ? `${daysLeft} días restantes` : 'Finalizado'}
                    </span>
                  </div>
                  <div className="budget-item__bar">
                    <div className="budget-item__bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: 'var(--green)' }} />
                  </div>
                  <div className="budget-item__amounts">
                    <span>{formatMoney(spent)}</span>
                    <span style={{ color: 'var(--ts)' }}>/ {formatMoney(ev.budget_amount)}</span>
                    <button className="budget-edit" type="button" onClick={(e) => {
                      e.stopPropagation();
                      setEditingEvent(ev);
                      setIsEvent(true);
                      setEventStartDate(ev.start_date);
                      setEventEndDate(ev.end_date);
                      setEventGoalId(ev.goal_id ?? null);
                      catModal.openEdit({ id: ev.id, name: ev.name, emoji: ev.emoji || '✈️', color: ev.color || '#34D399', budget_amount: ev.budget_amount || 0 });
                    }}>
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  </div>
                </div>
              );
            })}
            {categoryBreakdown.length === 0 ? (
              <div className="empty-view">Sin datos de categorias</div>
            ) : (
              categoryBreakdown.filter(cat => toNum(cat?.budget) > 0 || toNum(cat?.total) > 0).map(cat => {
                const catDef = getCategoryDef(cat.category);
                const spent = toNum(cat.total);
                const budget = toNum(cat.budget);
                const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
                const isOver = budget > 0 && spent > budget;
                const isWarning = budget > 0 && pct >= 80 && !isOver;
                const isNoBudget = budget === 0;
                // Status color: green < 80%, orange 80-100%, red > 100%
                const statusColor = isOver ? 'var(--red)' : isWarning ? 'var(--orange)' : 'var(--green)';
                const barColor = isOver ? 'var(--red)' : isWarning ? 'var(--orange)' : (catDef?.color ?? '#60A5FA');
                const color = catDef?.color ?? '#60A5FA';
                const iconBg = isOver ? 'var(--rl)' : color + '1A';
                const emoji = catDef?.emoji;
                return (
                  <div
                    key={cat.category}
                    className={`budget-item${isOver ? ' budget-item--over' : ''}`}
                    style={{ background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
                    onClick={() => navigate('/history', { state: { initialContext: activeContext, initialCategory: cat.category } })}
                  >
                    <div className="icon-c" style={{ background: iconBg }}>
                      {emoji
                        ? <span style={{ fontSize: 18 }}>{emoji}</span>
                        : <MoreHorizontal size={18} color={color} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{cat.category}</span>
                        {budget > 0 && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                            padding: '1px 6px', borderRadius: 999,
                            background: isOver ? 'var(--rl)' : isWarning ? 'var(--ol)' : 'var(--gl)',
                            color: statusColor,
                          }}>
                            {isOver ? `-${pct - 100}%` : `${pct}%`}
                          </span>
                        )}
                        {isNoBudget && spent > 0 && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
                            background: 'var(--surface2)', color: 'var(--tm)',
                          }}>
                            sin límite
                          </span>
                        )}
                      </div>
                      <div className="budget-bar-wrap">
                        <div className="budget-bar" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', textAlign: 'right', minWidth: 90, flexShrink: 0 }}>
                      <span>{formatMoney(spent)}</span>
                      {budget > 0 && <small style={{ fontWeight: 400, color: 'var(--tm)' }}>/{formatMoney(budget)}</small>}
                    </div>
                    <button className="budget-edit" type="button" onClick={(e) => { e.stopPropagation(); const def = getCategoryDef(cat.category); if (def) catModal.openEdit(def); }}>
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
            <div className="add-cat-row" onClick={() => {
              setIsEvent(false); setEventStartDate(''); setEventEndDate(''); setEventGoalId(null); setEditingEvent(null);
              catModal.openAdd();
            }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M12 4v16m-8-8h16"/></svg>
              {' '}Añadir categoria
            </div>
          </div>

          <RecurringSection userId={user?.id ?? 0} />

          {/* Recent Transactions section */}
          <div className="card dashboard__section an d5">
            <div className="dashboard__section-header">
              <span className="dashboard__section-title">Últimos gastos</span>
              <button className="dashboard__section-link" onClick={() => navigate('/history')}>
                Ver todos →
              </button>
            </div>
            <div className="dashboard__transactions">
              {recentTransactions.length === 0 ? (
                <div className="empty-view">
                  No hay gastos registrados
                </div>
              ) : (
                groupedTransactions.map(({ date, items }) => {
                  const filteredItems = items.filter(tx => {
                    if (activeContext === 'shared') return tx.type === 'shared';
                    return tx.type === 'personal';
                  });
                  if (filteredItems.length === 0) return null;
                  return (
                    <React.Fragment key={date}>
                      <div className="dashboard__date-pill">{formatDatePill(date)}</div>
                      {filteredItems.map(tx => (
                        <TransactionRow
                          key={tx.id}
                          emoji={getCategoryDef(tx.category)?.emoji ?? '🦋'}
                          name={tx.description}
                          payer={tx.paid_by}
                          amount={`-${formatMoneyExact(toNum(tx.amount))}`}
                          date={tx.date}
                          indicatorColor={INDICATOR_COLORS[tx.paid_by] ?? INDICATOR_COLORS['shared']}
                          isPositive={false}
                          onClick={() => navigate('/history', { state: { initialContext: tx.type === 'shared' ? 'shared' : 'personal', initialCategory: tx.category } })}
                        />
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {showNotifications && (
          <NotificationCenter
            onClose={() => setShowNotifications(false)}
          />
        )}

        {/* Category modal */}
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
                if (editingEvent) {
                  await Api.updateEvent(editingEvent.id, eventData);
                } else {
                  await Api.createEvent(eventData);
                }
                cacheBus.invalidate(CACHE_KEYS.events);
              } catch (err) {
                console.error('Failed to save event:', err);
                return;
              }
              setIsEvent(false); setEventStartDate(''); setEventEndDate('');
              setEventGoalId(null); setEditingEvent(null);
              catModal.close();
              return;
            }
            catModal.save({
              context: activeContext,
              categories,
            });
          }}
          onDelete={async () => {
            if (editingEvent) {
              if (!confirm('Los gastos asociados se mantendrán pero ya no estarán vinculados al evento. ¿Eliminar evento?')) return;
              await Api.deleteEvent(editingEvent.id);
              cacheBus.invalidate(CACHE_KEYS.events);
              setEditingEvent(null);
              setIsEvent(false);
              catModal.close();
            } else {
              catModal.remove({
                categories,
              });
            }
          }}
          totalBudget={activeContext === 'shared' ? availableShared : personalBudgetRaw}
          allocatedBudget={
            categoryBreakdown
              .filter(cat => cat.category !== catModal.originalName)
              .reduce((sum, cat) => sum + toNum(cat.budget), 0)
          }
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
    </>
  );
};
