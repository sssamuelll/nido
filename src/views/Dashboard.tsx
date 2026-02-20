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

      // Compute daily spending (shared only)
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

  return (
    <div className="page-container fade-in">
      <div className="main-content">
        {/* Header */}
        <div className="dashboard-header">
          <div>
            <div className="dashboard-greeting">
              {getGreeting()}, {user?.username === 'samuel' ? 'Samuel' : 'María'}
            </div>
            <div className="dashboard-subtitle">{formatMonthName(currentMonth)}</div>
          </div>
          <div className="month-nav">
            <button className="month-nav-btn" onClick={() => navigateMonth(-1)}>‹</button>
            <button className="month-nav-btn" onClick={() => navigateMonth(1)}>›</button>
          </div>
        </div>

        {/* Hero — Shared budget is the star */}
        <div className="card hero-card">
          <div className="hero-spent-label">Gastos compartidos</div>
          <div className="hero-spent-amount">
            <AnimatedNumber value={data.spending.totalSharedSpent} />
          </div>
          <div className="hero-of-total">
            de <AnimatedNumber value={data.budget.availableShared} /> · {pctUsed}% usado
          </div>
          <BudgetBar
            title=""
            spent={data.spending.totalSharedSpent}
            budget={data.budget.availableShared}
            showRemaining={false}
          />
          <div className="hero-remaining">
            {remaining >= 0 ? (
              <span className="text-success">
                Quedan <AnimatedNumber value={remaining} />
              </span>
            ) : (
              <span className="text-error">
                Excedido en <AnimatedNumber value={Math.abs(remaining)} />
              </span>
            )}
          </div>
        </div>

        {/* Daily Trend */}
        {dailyData.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Tendencia diaria</h2>
            </div>
            <SpendingTrend data={dailyData} />
          </div>
        )}

        {/* Personal Space */}
        <PersonalCard
          currentUser={user?.username || 'samuel'}
          spent={data.personal[user?.username === 'maria' ? 'maria' : 'samuel'].spent}
          budget={data.personal[user?.username === 'maria' ? 'maria' : 'samuel'].budget}
        />

        {/* Category Breakdown — donut */}
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

        {/* Fixed costs — collapsible, low priority */}
        <details className="card budget-details">
          <summary className="card-header" style={{ cursor: 'pointer', marginBottom: 0 }}>
            <h2 className="card-title">Costes fijos</h2>
            <span className="text-sm text-secondary">
              <AnimatedNumber value={data.budget.rent + data.budget.savings} />
            </span>
          </summary>
          <div className="budget-breakdown">
            <div className="budget-line">
              <span>Ingresos mensuales</span>
              <span className="font-semibold">€{data.budget.total.toFixed(2)}</span>
            </div>
            <div className="budget-line">
              <span>Alquiler</span>
              <span>−€{data.budget.rent.toFixed(2)}</span>
            </div>
            <div className="budget-line">
              <span>Ahorros</span>
              <span>−€{data.budget.savings.toFixed(2)}</span>
            </div>
            <div className="budget-line">
              <span>Personal Samuel</span>
              <span>−€{data.budget.personalSamuel.toFixed(2)}</span>
            </div>
            <div className="budget-line">
              <span>Personal María</span>
              <span>−€{data.budget.personalMaria.toFixed(2)}</span>
            </div>
            <div className="budget-line budget-line-highlight">
              <span>→ Compartido</span>
              <span>€{data.budget.availableShared.toFixed(2)}</span>
            </div>
          </div>
        </details>

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

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
