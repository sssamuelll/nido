import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell } from 'lucide-react';
import { useAuth } from '../auth';
import { Api } from '../api';
import { BalanceCard } from '../components/BalanceCard';
import { BudgetCapsule } from '../components/BudgetCapsule';
import { TransactionRow } from '../components/TransactionRow';
import { format } from 'date-fns';
import { CATEGORIES, INDICATOR_COLORS } from '../types';
import { getPersonalBalanceCardModel } from './privacy';

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

  useEffect(() => {
    loadDashboardData();
  }, [currentMonth]);

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
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
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
            <div className="skeleton" style={{ width: 120, height: 16, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: 200, height: 32 }} />
          </div>
        </div>
        <div className="dashboard__balances">
          <div className="skeleton" style={{ flex: 1, height: 180 }} />
          <div className="skeleton" style={{ flex: 1, height: 180 }} />
          <div className="skeleton" style={{ flex: 1, height: 180 }} />
        </div>
        <div className="dashboard__bottom">
          <div className="skeleton" style={{ flex: 1, height: 300 }} />
          <div className="skeleton" style={{ flex: 1, height: 300 }} />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <div style={{ color: 'var(--color-danger)', marginBottom: 16, fontSize: 16 }}>
          {error || 'Error al cargar'}
        </div>
        <button
          onClick={loadDashboardData}
          className="btn btn--samuel"
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

  const userName = user?.username === 'maria' ? 'María' : 'Samuel';
  const greeting = `Hola, ${userName} 👋`;

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
      <div className="dashboard__header">
          <div>
            <div className="dashboard__greeting">{greeting}</div>
            <div className="dashboard__title">
              {formatMonthName(currentMonth)}
            </div>
          </div>
          <div className="dashboard__actions">
            <div className="dashboard__search">
              <Search size={16} color="var(--color-text-tertiary)" />
              <span className="dashboard__search-text">Buscar...</span>
            </div>
            <button className="dashboard__notification-btn">
              <Bell size={18} color="var(--color-text-secondary)" />
            </button>
          </div>
        </div>

        {/* Balance Cards */}
        <div className="dashboard__balances">
          <BalanceCard
            owner="shared"
            name="Compartido"
            avatar="🏠"
            balance={remainingShared}
            monthChange={-totalSharedSpent}
            progress={sharedProgress}
            sparkline={[availableShared * 0.3, availableShared * 0.5, availableShared * 0.4, availableShared * 0.6, availableShared * 0.7, totalSharedSpent]}
            onClick={() => navigate('/')}
            ariaLabel="Abrir dashboard compartido"
          />
          <BalanceCard
            owner={personalCard.owner}
            name={personalCard.name}
            avatar={personalCard.avatar}
            balance={personalCard.balance}
            monthChange={personalCard.monthChange}
            progress={personalCard.progress}
            sparkline={personalCard.sparkline}
            onClick={() => navigate('/personal')}
            ariaLabel="Abrir detalle personal"
          />
        </div>

        {/* Bottom split */}
        <div className="dashboard__bottom">
          {/* Budget Capsules section */}
          <div className="dashboard__section">
            <div className="dashboard__section-header">
              <span className="dashboard__section-title">Presupuesto por categoría</span>
              <button className="dashboard__section-link" onClick={() => navigate('/settings')}>
                Editar →
              </button>
            </div>
            {categoryBreakdown.length === 0 ? (
              <div style={{ color: 'var(--color-text-tertiary)', fontSize: 14, padding: '20px 0' }}>
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
                    />
                  );
                })
            )}
          </div>

          {/* Recent Transactions section */}
          <div className="dashboard__section">
            <div className="dashboard__section-header">
              <span className="dashboard__section-title">Últimos gastos</span>
              <button className="dashboard__section-link" onClick={() => navigate('/history')}>
                Ver todos →
              </button>
            </div>
            <div className="dashboard__transactions">
              {recentTransactions.length === 0 ? (
                <div style={{ color: 'var(--color-text-tertiary)', fontSize: 14, padding: '20px 0' }}>
                  No hay gastos registrados
                </div>
              ) : (
                groupedTransactions.map(({ date, items }) => (
                  <React.Fragment key={date}>
                    <div className="dashboard__date-pill">{formatDatePill(date)}</div>
                    {items.map(tx => (
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
                ))
              )}
            </div>
          </div>
        </div>
    </>
  );
};
