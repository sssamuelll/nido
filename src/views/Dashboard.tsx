import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Api } from '../api';
import { BudgetBar } from '../components/BudgetBar';
import { PersonalCard } from '../components/PersonalCard';
import { ExpenseCard } from '../components/ExpenseCard';
import { DonutChart, DonutLegend, getColorForCategory } from '../components/DonutChart';
import { SpendingTrend } from '../components/SpendingTrend';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { format } from 'date-fns';

interface DashboardData {
  budget: {
    total: number;
    rent: number;
    savings: number;
    personalSamuel: number;
    personalMaria: number;
    availableShared: number;
  };
  spending: {
    totalSpent: number;
    totalSharedSpent: number;
    remainingShared: number;
  };
  personal: {
    samuel: { spent: number; budget: number };
    maria: { spent: number; budget: number };
  };
  categoryBreakdown: Array<{
    category: string;
    total: number;
    count: number;
  }>;
  recentTransactions: any[];
}

const CATEGORY_ICONS: Record<string, string> = {
  'Restaurant': '🍽️',
  'Gastos': '🛒',
  'Servicios': '💡',
  'Ocio': '🎉',
  'Inversión': '📈',
  'Otros': '📦',
};

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [data, setData] = useState<DashboardData | null>(null);
  const [dailyData, setDailyData] = useState<{ day: number; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCard, setActiveCard] = useState(0);
  const accountsRef = useRef<HTMLDivElement>(null);

  const handleAccountScroll = useCallback(() => {
    const el = accountsRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / (el.scrollWidth / 2));
    setActiveCard(idx);
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [currentMonth]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError('');
      const [summary, expenses] = await Promise.all([
        Api.getSummary(currentMonth),
        Api.getExpenses(currentMonth),
      ]);
      setData(summary);

      const [year, month] = currentMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const daily: { day: number; amount: number }[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dayStr = `${currentMonth}-${String(d).padStart(2, '0')}`;
        const total = expenses
          .filter((e: any) => e.date === dayStr && e.type === 'shared')
          .reduce((sum: number, e: any) => sum + e.amount, 0);
        daily.push({ day: d, amount: total });
      }
      setDailyData(daily);
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
      <div className="page-container">
        <div className="main-content">
          <div className="skeleton-loader">
            <div className="skeleton-block skeleton-header" />
            <div className="skeleton-block skeleton-card" />
            <div className="skeleton-block skeleton-card-sm" />
            <div className="skeleton-block skeleton-card" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-container">
        <div className="main-content">
          <div className="text-center mt-4">
            <div className="text-error">{error || 'Error al cargar'}</div>
            <button onClick={loadDashboardData} className="btn btn-secondary mt-2">Reintentar</button>
          </div>
        </div>
      </div>
    );
  }

  const donutSegments = data.categoryBreakdown
    .filter(c => c.total > 0)
    .map(c => ({
      label: c.category,
      value: c.total,
      color: getColorForCategory(c.category),
      icon: CATEGORY_ICONS[c.category] || '📦',
    }));

  const totalCategorySpent = donutSegments.reduce((s, seg) => s + seg.value, 0);
  const remaining = data.spending.remainingShared;
  const pctUsed = data.budget.availableShared > 0
    ? Math.round((data.spending.totalSharedSpent / data.budget.availableShared) * 100)
    : 0;

  const personalKey = user?.username === 'maria' ? 'maria' : 'samuel';
  const personalSpent = data.personal[personalKey].spent;
  const personalBudget = data.personal[personalKey].budget;
  const savingsAmount = data.budget.savings;
  const totalTransactions = data.recentTransactions.length;
  const totalDailySpent = dailyData.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="page-container dashboard fade-in">
      <div className="main-content">
        {/* Header */}
        <div className="dash-header">
          <ProfileAvatar />
          <button className="dash-register-btn" onClick={() => navigate('/add', { state: { type: 'shared' } })}>
            Registrar gasto
          </button>
        </div>

        {/* Balance */}
        <div className="dash-balance">
          <div className="dash-balance-label">Saldo total</div>
          <div className="dash-balance-row">
            <div className="dash-balance-amount">
              {remaining.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
            </div>
            <button className="dash-chart-btn" onClick={() => {
              const el = document.querySelector('.donut-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}>
              <svg viewBox="0 0 24 24">
                <path d="M18 20V10M12 20V4M6 20v-6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Account Cards — horizontal scroll */}
        <div className="dash-accounts" ref={accountsRef} onScroll={handleAccountScroll}>
          {/* Shared account */}
          <div className="dash-account-card dash-account-green">
            <div className="dash-account-header">
              <div className="dash-account-wave" />
            </div>
            <div className="dash-account-body">
              <div className="dash-account-title-row">
                <div className="dash-account-name">Cuenta compartida</div>
                <span className="dash-account-arrow">›</span>
              </div>
              <div className="dash-account-amount">
                {data.spending.remainingShared.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
              </div>
              <div className="dash-account-details">
                <div className="dash-account-line">
                  <span>Presupuesto</span>
                  <span>{data.budget.availableShared.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR</span>
                </div>
                <div className="dash-account-line">
                  <span>Gastado</span>
                  <span>{data.spending.totalSharedSpent.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR</span>
                </div>
              </div>
              <button className="dash-account-data-btn">🏦 Datos de cuenta</button>
            </div>
          </div>

          {/* Personal account */}
          <div className="dash-account-card dash-account-orange">
            <div className="dash-account-header dash-account-header-orange">
              <div className="dash-account-wave" />
            </div>
            <div className="dash-account-body">
              <div className="dash-account-title-row">
                <div className="dash-account-name">Cuenta personal</div>
                <span className="dash-account-arrow">›</span>
              </div>
              <div className="dash-account-amount">
                {(personalBudget - personalSpent).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
              </div>
              <div className="dash-account-details">
                <div className="dash-account-line">
                  <span>Presupuesto</span>
                  <span>{personalBudget.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR</span>
                </div>
                <div className="dash-account-line">
                  <span>Gastado</span>
                  <span>{personalSpent.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR</span>
                </div>
              </div>
              <button className="dash-account-data-btn">🏦 Datos de cuenta</button>
            </div>
          </div>
        </div>
        {/* Dots indicator */}
        <div className="dash-accounts-dots">
          <span className={`dash-dot ${activeCard === 0 ? 'active' : ''}`} />
          <span className={`dash-dot ${activeCard === 1 ? 'active' : ''}`} />
        </div>

        {/* Daily Spending Chart */}
        {dailyData.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Tendencia diaria</h2>
            </div>
            <div className="dash-trend-summary">
              €{totalDailySpent.toFixed(0)} gastados en {totalTransactions} transacciones
            </div>
            <SpendingTrend data={dailyData} />
          </div>
        )}

        {/* Category Breakdown */}
        {donutSegments.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Por categoría</h2>
            </div>
            <div className="donut-section">
              <DonutChart
                segments={donutSegments}
                centerValue={`€${Math.round(totalCategorySpent)}`}
                centerLabel="total"
              />
              <DonutLegend segments={donutSegments} total={totalCategorySpent} />
            </div>
          </div>
        )}

        {/* Recent Transactions */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Últimos gastos</h2>
            <a href="/history" className="btn-ghost text-sm">Ver todos →</a>
          </div>
          <div className="expense-list">
            {data.recentTransactions.length === 0 ? (
              <div className="text-center text-secondary py-4">
                No hay gastos registrados
              </div>
            ) : (
              data.recentTransactions.map((expense) => (
                <ExpenseCard key={expense.id} expense={expense} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
