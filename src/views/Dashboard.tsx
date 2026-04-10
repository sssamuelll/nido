import React, { useState, useEffect, useCallback } from 'react';
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
    owner: 'samuel' | 'maria';
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

interface ActiveCycle {
  id: number;
  status: 'active' | 'pending';
  start_date: string | null;
  end_date: string | null;
  started_at: string | null;
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

const formatCycleLabel = (cycle: ActiveCycle | null) => {
  if (!cycle?.start_date) return 'Ciclo actual';
  const d = new Date(cycle.start_date + 'T12:00:00');
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `Desde ${d.getDate()} ${months[d.getMonth()]}`;
};

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeCycle, setActiveCycle] = useState<ActiveCycle | null>(null);
  const [cycleLoaded, setCycleLoaded] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [expenses, setExpenses] = useState<VisibleExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { activeContext, setActiveContext } = useContextSelector();
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { categories, getCategoryDef, reloadCategories } = useCategoryManagement(activeContext);
  const catModal = useCategoryModal();

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

  // Load cycle first, then data
  useEffect(() => {
    Api.getCurrentCycle().catch(() => null).then((cycle) => {
      setActiveCycle(cycle);
      setCycleLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (cycleLoaded) loadDashboardData();
  }, [cycleLoaded, activeCycle?.id]);

  useEffect(() => {
    Api.getNotifications()
      .then((data: Notification[]) => setUnreadCount(data.filter((n: Notification) => !n.is_read).length))
      .catch(() => {});
  }, []);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      let summary, nextExpenses;

      if (activeCycle?.start_date) {
        // Cycle-based: use date range
        const range = { start_date: activeCycle.start_date, end_date: activeCycle.end_date ?? undefined };
        [summary, nextExpenses] = await Promise.all([
          Api.getSummary({ ...range, cycle_id: activeCycle.id }),
          Api.getExpenses(range),
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
    } catch {
      setError('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  }, [activeCycle, currentMonth]);

  const handleCycleChanged = useCallback(async () => {
    // Reload cycle state after approval
    try {
      const cycle = await Api.getCurrentCycle();
      setActiveCycle(cycle);
    } catch {
      setActiveCycle(null);
    }
    loadDashboardData();
  }, [loadDashboardData]);

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
    return (
      <div className="error-view">
        <div className="error-view__msg">
          {error || 'Error al cargar'}
        </div>
        <button
          onClick={loadDashboardData}
          className="btn btn--samuel btn--dynamic"
          style={{ '--btn-gradient': 'linear-gradient(180deg, #8bdc6b, #6bc98b)', '--btn-glow': 'rgba(139,220,107,0.25)' } as React.CSSProperties}
        >
          Reintentar
        </button>
      </div>
    );
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

  const normalizedUser = user?.username?.toLowerCase().trim() || '';
  const userName = normalizedUser === 'maria' ? 'Maria' : normalizedUser === 'samuel' ? 'Samuel' : (user?.username ? user.username.charAt(0).toUpperCase() + user.username.slice(1) : 'Usuario');

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
              <p style={{ fontSize: '13px', color: 'var(--ts)' }}>Samuel &amp; Maria &mdash; {cycleLabel}</p>
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
                  ? <>Llevan <strong>€{totalSharedSpent.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</strong> gastados de €{availableShared.toLocaleString('es-ES', { maximumFractionDigits: 0 })} compartidos</>
                  : <>Sin gastos compartidos en este ciclo</>)
              : (toNum(data?.personal?.budget) > 0
                  ? <>Llevas <strong>€{toNum(data?.personal?.spent).toLocaleString('es-ES', { maximumFractionDigits: 0 })}</strong> gastados de tu presupuesto personal</>
                  : <>Sin gastos personales en este ciclo</>)}
          </span>
        </div>

        {/* Metric Cards */}
        <div className="dashboard__metric-cards an d3">
          <div className="card metric-card" style={{ '--metric-glow': 'rgba(96,165,250,.15)' } as React.CSSProperties}>
            <div className="accent-bar" style={{ background: '#60A5FA', boxShadow: '0 0 8px #60A5FA' }} />
            <div className="label">{activeContext === 'shared' ? 'Presupuesto compartido' : 'Presupuesto personal'}</div>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>
              €{animBudget.toLocaleString('es-ES')}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ts)', marginTop: '8px' }}>
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                €{(activeContext === 'shared' ? totalSharedSpent : toNum(data?.personal?.spent)).toLocaleString('es-ES', { maximumFractionDigits: 0 })} gastados
              </span>
              {' '}· {activeContext === 'shared' && availableShared > 0
                ? `${Math.round(((availableShared - totalSharedSpent) / availableShared) * 100)}% disponible`
                : `${Math.round(((toNum(data?.personal?.budget) - toNum(data?.personal?.spent)) / (toNum(data?.personal?.budget) || 1)) * 100)}% disponible`}
            </div>
          </div>
          <div className="card metric-card" style={{ '--metric-glow': 'rgba(52,211,153,.15)' } as React.CSSProperties}>
            <div className="accent-bar" style={{ background: '#34D399', boxShadow: '0 0 8px #34D399' }} />
            <div className="label">Gastado este ciclo</div>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>
              €{animSpent.toLocaleString('es-ES')}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ts)', marginTop: '8px' }}>
              {activeContext === 'shared' ? sharedMonthTransactions.length : personalTxCountRaw} gastos este ciclo
            </div>
          </div>
          <div className="card metric-card" style={{ '--metric-glow': 'rgba(167,139,250,.15)' } as React.CSSProperties}>
            <div className="accent-bar" style={{ background: '#A78BFA', boxShadow: '0 0 8px #A78BFA' }} />
            <div className="label">Ticket medio</div>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>
              €{animAvg.toLocaleString('es-ES')}
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
            {categoryBreakdown.length === 0 ? (
              <div className="empty-view">Sin datos de categorias</div>
            ) : (
              categoryBreakdown.filter(cat => toNum(cat?.budget) > 0).map(cat => {
                const catDef = getCategoryDef(cat.category);
                const spent = toNum(cat.total);
                const budget = toNum(cat.budget);
                const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
                const color = catDef?.color ?? '#60A5FA';
                const iconBg = color + '1A';
                const emoji = catDef?.emoji;
                return (
                  <div
                    key={cat.category}
                    className="budget-item"
                    style={{ width: '100%', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
                    onClick={() => navigate('/history', { state: { initialContext: activeContext, initialCategory: cat.category } })}
                  >
                    <div className="icon-c" style={{ background: iconBg }}>
                      {emoji
                        ? <span style={{ fontSize: 18 }}>{emoji}</span>
                        : <MoreHorizontal size={18} color={color} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{cat.category}</div>
                      <div className="budget-bar-wrap">
                        <div className="budget-bar" style={{ width: `${Math.min(pct, 100)}%`, background: color, color }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      €{spent.toLocaleString('es-ES')} <small style={{ fontWeight: 400, color: 'var(--tm)' }}>/ €{budget.toLocaleString('es-ES')}</small>
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
            <div className="add-cat-row" onClick={catModal.openAdd}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M12 4v16m-8-8h16"/></svg>
              {' '}Añadir categoria
            </div>
          </div>

          <RecurringSection userId={user?.id ?? 0} onCycleApproved={handleCycleChanged} />

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
                          amount={`-€${toNum(tx.amount).toFixed(2)}`}
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
            onClose={() => {
              setShowNotifications(false);
              Api.getNotifications()
                .then((data: Notification[]) => setUnreadCount(data.filter((n: Notification) => !n.is_read).length))
                .catch(() => {});
            }}
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
          onSave={() => catModal.save({
            context: activeContext,
            categories,
            onSuccess: () => { reloadCategories(); loadDashboardData(); },
          })}
          onDelete={() => catModal.remove({
            categories,
            onSuccess: () => { reloadCategories(); loadDashboardData(); },
          })}
        />
    </>
  );
};
