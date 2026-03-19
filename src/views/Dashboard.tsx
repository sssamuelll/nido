import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell } from 'lucide-react';
import { useAuth } from '../auth';
import { Api } from '../api';
import { BudgetCapsule } from '../components/BudgetCapsule';
import { TransactionRow } from '../components/TransactionRow';
import { ThemeToggle } from '../components/ThemeToggle';
import { format } from 'date-fns';
import { CATEGORIES, INDICATOR_COLORS } from '../types';
import { getPersonalBalanceCardModel } from './privacy';
import { useCountUp } from '../hooks/useCountUp';
import { NotificationCenter } from '../components/NotificationCenter';

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
  recentTransactions: any[];
}

const toNum = (v: any, fallback = 0) =>
  Number.isFinite(Number(v)) ? Number(v) : fallback;

const getCategoryEmoji = (categoryId: string): string => {
  const cat = CATEGORIES.find(c => c.id === categoryId);
  return cat ? cat.emoji : '🦋';
};

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeContext, setActiveContext] = useState<'shared' | 'personal'>('shared');
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // useCountUp hooks must be called unconditionally (before any early returns)
  const availableSharedRaw = toNum(data?.budget?.availableShared);
  const totalSharedSpentRaw = toNum(data?.spending?.totalSharedSpent);
  const personalBudgetRaw = toNum(data?.personal?.budget);
  const personalSpentRaw = toNum(data?.personal?.spent);
  const recentTxRaw = Array.isArray(data?.recentTransactions) ? data.recentTransactions : [];
  const metricBudgetTarget = activeContext === 'shared' ? availableSharedRaw : personalBudgetRaw;
  const metricSpentTarget = activeContext === 'shared' ? totalSharedSpentRaw : personalSpentRaw;
  const metricAvgTarget = recentTxRaw.length > 0 ? Math.round(recentTxRaw.reduce((sum: number, t: any) => sum + toNum(t.amount), 0) / recentTxRaw.length) : 0;
  const animBudget = useCountUp(metricBudgetTarget);
  const animSpent = useCountUp(metricSpentTarget);
  const animAvg = useCountUp(metricAvgTarget);

  useEffect(() => {
    loadDashboardData();
  }, [currentMonth]);

  useEffect(() => {
    Api.getNotifications()
      .then((data: any[]) => setUnreadCount(data.filter((n: any) => !n.is_read).length))
      .catch(() => {});
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError('');
      const [summary] = await Promise.all([
        Api.getSummary(currentMonth),
        Api.getExpenses(currentMonth),
      ]);
      setData(summary);
    } catch (err: any) {
      setError('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const formatMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${months[parseInt(month) - 1]} ${year}`;
  };

  const navigateMonth = (dir: -1 | 1) => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setCurrentMonth(format(d, 'yyyy-MM'));
  };

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

  const categoryBreakdown = Array.isArray(data.categoryBreakdown) ? data.categoryBreakdown : [];
  const recentTransactions = Array.isArray(data?.recentTransactions) ? data.recentTransactions : [];

  const availableShared = toNum(data?.budget?.availableShared);
  const totalSharedSpent = toNum(data?.spending?.totalSharedSpent);
  const remainingShared = toNum(data?.spending?.remainingShared);
  const sharedProgress = availableShared > 0
    ? Math.round((totalSharedSpent / availableShared) * 100)
    : 0;

  const personalCard = getPersonalBalanceCardModel(data);

  const normalizedUser = user?.username?.toLowerCase().trim() || '';
  const userName = normalizedUser === 'maria' ? 'María' : normalizedUser === 'samuel' ? 'Samuel' : (user?.username ? user.username.charAt(0).toUpperCase() + user.username.slice(1) : 'Usuario');

  // Group recent transactions by date for the date pill display
  const groupedTransactions: { date: string; items: any[] }[] = [];
  const dateMap = new Map<string, any[]>();
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
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `${days[d.getDay()]} ${d.getDate()}`;
  };

  return (
    <>
      {/* Header */}
      <div className="dashboard__header an d1">
          <div className="nido-name">
            <div className="couple-ring">🏠</div>
            <div>
              <h1>El Nido</h1>
              <p style={{ fontSize: '13px', color: 'var(--ts)' }}>Samuel &amp; María — {formatMonthName(currentMonth)}</p>
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
        <div className="dashboard__context-tabs an d2">
          <button
            className={`dashboard__context-tab ${activeContext === 'shared' ? 'dashboard__context-tab--active' : ''}`}
            onClick={() => setActiveContext('shared')}
          >
            <div className="dot sh-d" />
            Compartido
          </button>
          <button
            className={`dashboard__context-tab ${activeContext === 'personal' ? 'dashboard__context-tab--active' : ''}`}
            onClick={() => setActiveContext('personal')}
          >
            <div className="dot ps-d" />
            Personal
          </button>
        </div>

        {/* Insight Strip */}
        <div className="dashboard__insight-strip an d3">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            {activeContext === 'shared'
              ? <>Este mes llevan <strong>12% menos</strong> en gastos compartidos vs. febrero</>
              : <>Tu gasto personal está un <strong>5% por debajo</strong> de tu presupuesto</>}
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
            <div className="label">Gastado este mes</div>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>
              €{animSpent.toLocaleString('es-ES')}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ts)', marginTop: '8px' }}>
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>↓ 12%</span> vs mes anterior
            </div>
          </div>
          <div className="card metric-card" style={{ '--metric-glow': 'rgba(167,139,250,.15)' } as React.CSSProperties}>
            <div className="accent-bar" style={{ background: '#A78BFA', boxShadow: '0 0 8px #A78BFA' }} />
            <div className="label">Ticket medio</div>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>
              €{animAvg.toLocaleString('es-ES')}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ts)', marginTop: '8px' }}>
              {recentTransactions.length} gastos registrados
            </div>
          </div>
        </div>

        {/* Bottom split */}
        <div className="dashboard__bottom">
          {/* Budget Capsules section */}
          <div className="card dashboard__section an d4">
            <div className="dashboard__section-header">
              <span className="dashboard__section-title">{activeContext === 'shared' ? 'Presupuesto compartido' : 'Presupuesto personal'}</span>
            </div>
            {categoryBreakdown.length === 0 ? (
              <div className="empty-view">
                Sin datos de categorías
              </div>
            ) : (
              categoryBreakdown
                .filter(cat => toNum(cat?.budget) > 0)
                .map(cat => {
                  const catDef = CATEGORIES.find(c => c.id === cat.category);
                  return (
                    <BudgetCapsule
                      key={cat.category}
                      emoji={catDef?.emoji ?? '🦋'}
                      categoryName={cat.category}
                      current={toNum(cat.total)}
                      max={toNum(cat.budget)}
                      gradientColors={[catDef?.color ?? '#8bdc6b', catDef?.color ?? '#6bc98b']}
                      onEdit={() => {}}
                    />
                  );
                })
            )}
            <div className="add-cat-row" onClick={() => { /* future */ }}>
              + Añadir categoría
            </div>
          </div>

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
                          emoji={getCategoryEmoji(tx.category)}
                          name={tx.description}
                          payer={tx.paid_by}
                          amount={`-€${toNum(tx.amount).toFixed(2)}`}
                          date={tx.date}
                          indicatorColor={INDICATOR_COLORS[tx.paid_by] ?? INDICATOR_COLORS['shared']}
                          isPositive={false}
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
              // Refresh unread count when closing
              Api.getNotifications()
                .then((data: any[]) => setUnreadCount(data.filter((n: any) => !n.is_read).length))
                .catch(() => {});
            }}
          />
        )}
    </>
  );
};
