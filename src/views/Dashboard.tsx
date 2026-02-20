import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth';
import { Api } from '../api';
import { BudgetBar } from '../components/BudgetBar';
import { PersonalCard } from '../components/PersonalCard';
import { ExpenseCard } from '../components/ExpenseCard';
import { DonutChart, DonutLegend, getColorForCategory } from '../components/DonutChart';
import { SpendingTrend } from '../components/SpendingTrend';
import { AnimatedNumber } from '../components/AnimatedNumber';
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
  const [currentMonth, setCurrentMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [data, setData] = useState<DashboardData | null>(null);
  const [dailyData, setDailyData] = useState<{ day: number; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const personalSpent = data.personal[user?.username === 'maria' ? 'maria' : 'samuel'].spent;
  const savingsAmount = data.budget.savings;
  const totalTransactions = data.recentTransactions.length;
  const totalDailySpent = dailyData.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="page-container fade-in">
      <div className="main-content">
        {/* Header */}
        <div className="dash-header">
          <div className="dash-header-left">
            <div className="dash-header-avatar">🏠</div>
            <span className="dash-header-title">Nido</span>
          </div>
          <div className="dash-month-nav">
            <button className="month-nav-btn" onClick={() => navigateMonth(-1)}>‹</button>
            <span className="dash-month-label">{formatMonthName(currentMonth)}</span>
            <button className="month-nav-btn" onClick={() => navigateMonth(1)}>›</button>
          </div>
        </div>

        {/* Hero Card */}
        <div className="dash-hero">
          <div className="dash-hero-avatars">
            <span className="dash-hero-avatar">👨‍💻</span>
            <span className="dash-hero-avatar">👩‍🎨</span>
          </div>
          <div className="dash-hero-amount">
            <AnimatedNumber value={remaining} />
          </div>
          <div className="dash-hero-subtitle">
            de <AnimatedNumber value={data.budget.availableShared} /> presupuesto · {pctUsed}% usado
          </div>
          <div className="dash-hero-bar">
            <div
              className="dash-hero-bar-fill"
              style={{ width: `${Math.min(pctUsed, 100)}%` }}
            />
          </div>
          {remaining < 0 && (
            <div className="dash-hero-warning">⚠️ Presupuesto excedido</div>
          )}
        </div>

        {/* Stat Cards Row */}
        <div className="dash-stats-row">
          <div className="dash-stat-card">
            <div className="dash-stat-icon">🤝</div>
            <div className="dash-stat-amount">€{data.spending.totalSharedSpent.toFixed(0)}</div>
            <div className="dash-stat-label">Compartido</div>
          </div>
          <div className="dash-stat-card">
            <div className="dash-stat-icon">👤</div>
            <div className="dash-stat-amount">€{personalSpent.toFixed(0)}</div>
            <div className="dash-stat-label">Personal</div>
          </div>
          <div className="dash-stat-card">
            <div className="dash-stat-icon">🐷</div>
            <div className="dash-stat-amount">€{savingsAmount.toFixed(0)}</div>
            <div className="dash-stat-label">Ahorro</div>
          </div>
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
