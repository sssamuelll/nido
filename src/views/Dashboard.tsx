import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell } from 'lucide-react';
import { useAuth } from '../auth';
import { Api } from '../api';
import { Utensils, ShoppingCart, Zap, Smile, TrendingUp, MoreHorizontal } from 'lucide-react';
import { TransactionRow } from '../components/TransactionRow';
import { ThemeToggle } from '../components/ThemeToggle';
import { format } from 'date-fns';
import { CATEGORIES, INDICATOR_COLORS } from '../types';
import { getPersonalBalanceCardModel, VisibleExpense } from './privacy';
import { useCountUp } from '../hooks/useCountUp';
import { NotificationCenter } from '../components/NotificationCenter';

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
  recentTransactions: VisibleExpense[];
}

const toNum = (v: unknown, fallback = 0) =>
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
  const [showCatModal, setShowCatModal] = useState(false);
  const [catModalMode, setCatModalMode] = useState<'add' | 'edit'>('add');
  const [catModalName, setCatModalName] = useState('');
  const [catModalBudget, setCatModalBudget] = useState('');

  // useCountUp hooks must be called unconditionally (before any early returns)
  const availableSharedRaw = toNum(data?.budget?.availableShared);
  const totalSharedSpentRaw = toNum(data?.spending?.totalSharedSpent);
  const personalBudgetRaw = toNum(data?.personal?.budget);
  const personalSpentRaw = toNum(data?.personal?.spent);
  const recentTxRaw = Array.isArray(data?.recentTransactions) ? data.recentTransactions : [];
  const metricBudgetTarget = activeContext === 'shared' ? availableSharedRaw : personalBudgetRaw;
  const metricSpentTarget = activeContext === 'shared' ? totalSharedSpentRaw : personalSpentRaw;
  const metricAvgTarget = recentTxRaw.length > 0 ? Math.round(recentTxRaw.reduce((sum: number, t: VisibleExpense) => sum + toNum(t.amount), 0) / recentTxRaw.length) : 0;
  const animBudget = useCountUp(metricBudgetTarget);
  const animSpent = useCountUp(metricSpentTarget);
  const animAvg = useCountUp(metricAvgTarget);

  useEffect(() => {
    loadDashboardData();
  }, [currentMonth]);

  useEffect(() => {
    Api.getNotifications()
      .then((data: Notification[]) => setUnreadCount(data.filter((n: Notification) => !n.is_read).length))
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
    } catch {
      setError('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const openEditCatModal = (categoryName: string, budget: number) => {
    setCatModalMode('edit');
    setCatModalName(categoryName);
    setCatModalBudget(String(budget));
    setShowCatModal(true);
  };

  const openNewCatModal = () => {
    setCatModalMode('add');
    setCatModalName('');
    setCatModalBudget('');
    setShowCatModal(true);
  };

  const handleSaveCatModal = async () => {
    const name = catModalName.trim();
    const amount = parseFloat(catModalBudget);
    if (!name || !amount || amount <= 0) return;
    const cats: Record<string, number> = {};
    categoryBreakdown.forEach(cat => { cats[cat.category] = toNum(cat.budget); });
    cats[name] = amount;
    try {
      await Api.updateBudget({ month: currentMonth, categories: cats });
      setShowCatModal(false);
      loadDashboardData();
    } catch { /* */ }
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
          {/* Budget section — 1:1 design reference */}
          <div className="card an d4">
            <div className="sh">
              <div className="st">{activeContext === 'shared' ? 'Presupuesto compartido' : 'Presupuesto personal'}</div>
            </div>
            {categoryBreakdown.length === 0 ? (
              <div className="empty-view">Sin datos de categorías</div>
            ) : (
              categoryBreakdown.filter(cat => toNum(cat?.budget) > 0).map(cat => {
                const catDef = CATEGORIES.find(c => c.id === cat.category);
                const spent = toNum(cat.total);
                const budget = toNum(cat.budget);
                const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
                const color = catDef?.color ?? '#60A5FA';
                const iconBg = color + '1A';
                const ICON_MAP: Record<string, React.FC<{ size?: number; color?: string }>> = {
                  Restaurant: Utensils, Supermercado: ShoppingCart, Servicios: Zap,
                  Ocio: Smile, 'Inversión': TrendingUp, Otros: MoreHorizontal,
                };
                const IconComp = ICON_MAP[cat.category] ?? MoreHorizontal;
                return (
                  <div key={cat.category} className="budget-item">
                    <div className="icon-c" style={{ background: iconBg }}>
                      <IconComp size={18} color={color} />
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
                    <button className="budget-edit" onClick={() => openEditCatModal(cat.category, budget)}>
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
            <div className="add-cat-row" onClick={openNewCatModal}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M12 4v16m-8-8h16"/></svg>
              {' '}Añadir categoría
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
              Api.getNotifications()
                .then((data: Notification[]) => setUnreadCount(data.filter((n: Notification) => !n.is_read).length))
                .catch(() => {});
            }}
          />
        )}

        {/* Category modal — 1:1 design reference */}
        {showCatModal && (
          <div className="modal-overlay open" onClick={() => setShowCatModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h3>{catModalMode === 'edit' ? 'Editar categoría' : 'Nueva categoría'}</h3>
              <p>{catModalMode === 'edit' ? 'Ajusta el límite de presupuesto' : 'Crea una categoría para organizar tus gastos'}</p>

              {catModalMode === 'add' && (
                <div className="form-row">
                  <label>Nombre</label>
                  <select className="form-input" value={catModalName} onChange={e => setCatModalName(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {CATEGORIES
                      .filter(c => !categoryBreakdown.some(cb => cb.category === c.id))
                      .map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                  </select>
                </div>
              )}

              {catModalMode === 'edit' && (
                <div className="form-row">
                  <label>Categoría</label>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{catModalName}</span>
                </div>
              )}

              <div className="form-row">
                <label>Límite</label>
                <span style={{ color: 'var(--tm)' }}>€</span>
                <input
                  className="form-input"
                  type="number"
                  placeholder="200"
                  value={catModalBudget}
                  onChange={e => setCatModalBudget(e.target.value)}
                  style={{ width: 100, textAlign: 'right' }}
                  autoFocus
                />
              </div>

              {activeContext === 'shared' && (
                <div className="approval-note">
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  En compartido, este cambio necesita aprobación de {normalizedUser === 'maria' ? 'Samuel' : 'María'}.
                </div>
              )}

              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setShowCatModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleSaveCatModal}>Guardar</button>
              </div>
            </div>
          </div>
        )}
    </>
  );
};
