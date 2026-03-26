import React, { useEffect, useId, useState } from 'react';
import { Bell, Search, ChevronLeft } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Api } from '../api';
import { TransactionRow } from '../components/TransactionRow';
import { useAuth } from '../auth';
import { CATEGORIES, OWNER_THEMES } from '../types';
import { buildPersonalDetailModel, type VisibleBudgetFormData, type VisibleExpense } from './privacy';

interface DashboardSummary {
  budget?: {
    personal?: number;
  };
  personal?: {
    owner?: 'samuel' | 'maria';
    budget?: number;
  };
}

const toCurrency = (value: number) =>
  `€${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const buildLinePath = (values: number[], width: number, height: number, padding: number) => {
  const maxVal = Math.max(...values, 1);
  const xStep = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  const yRange = height - padding * 2;
  const toY = (value: number) => padding + yRange - (value / maxVal) * yRange;

  const points = values.map((value, index) => ({
    x: padding + index * xStep,
    y: toY(value),
  }));

  if (points.length === 0) return { linePath: '', areaPath: '' };

  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const cpX = (points[index - 1].x + points[index].x) / 2;
    linePath += ` C ${cpX} ${points[index - 1].y}, ${cpX} ${points[index].y}, ${points[index].x} ${points[index].y}`;
  }

  return {
    linePath,
    areaPath: `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`,
  };
};

export const PersonalDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const chartGradientId = useId();
  const [currentMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [budget, setBudget] = useState<VisibleBudgetFormData | null>(null);
  const [expenses, setExpenses] = useState<VisibleExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadPersonalDashboard = async () => {
      try {
        setLoading(true);
        setError('');
        const [nextSummary, nextBudget, nextExpenses] = await Promise.all([
          Api.getSummary(currentMonth),
          Api.getBudget(currentMonth),
          Api.getExpenses(currentMonth),
        ]);
        setSummary(nextSummary);
        setBudget(nextBudget);
        setExpenses(Array.isArray(nextExpenses) ? nextExpenses : []);
      } catch (_error) {
        setError('Error al cargar tu detalle personal');
      } finally {
        setLoading(false);
      }
    };

    void loadPersonalDashboard();
  }, [currentMonth]);

  if (loading) {
    return (
      <div className="personal-dashboard">
        <div className="personal-dashboard__header">
          <div>
            <div className="skeleton skeleton--subtitle" />
            <div className="skeleton skeleton--title" />
          </div>
        </div>
        <div className="personal-dashboard__grid">
          <div className="skeleton skeleton--card-lg" />
          <div className="skeleton skeleton--card-lg" />
          <div className="skeleton skeleton--card-lg" />
        </div>
      </div>
    );
  }

  if (error || !user || !summary || !budget) {
    return (
      <div className="error-view">
        <div className="error-view__msg">
          {error || 'No se pudo cargar tu detalle personal'}
        </div>
        <button
          onClick={() => navigate('/')}
          className="btn btn--samuel btn--dynamic"
          style={{ '--btn-gradient': 'linear-gradient(180deg, #8bdc6b, #6bc98b)', '--btn-glow': 'rgba(139,220,107,0.25)' } as React.CSSProperties}
        >
          Volver al dashboard
        </button>
      </div>
    );
  }

  // Define detail AFTER we are sure budget and summary exist
  const detail = buildPersonalDetailModel({
    summary,
    budget,
    expenses,
    username: user.username,
  });

  const ownerTheme = OWNER_THEMES[detail.owner];
  const chartSeries = detail.chart.map((point) => point.total);
  const chartPaths = buildLinePath(chartSeries, 520, 220, 24);

  const normalizedUsername = user?.username?.toLowerCase().trim() || '';
  const displayName = normalizedUsername === 'maria' ? 'María' : normalizedUsername === 'samuel' ? 'Samuel' : (user?.username ? user.username.charAt(0).toUpperCase() + user.username.slice(1) : 'Usuario');

  return (
    <div className="personal-dashboard">
      <div className="personal-dashboard__header">
        <div className="dashboard__actions">
          <div className="dashboard__search">
            <Search size={16} color="var(--color-text-tertiary)" />
            <span className="dashboard__search-text">Solo tus movimientos</span>
          </div>
          <button className="dashboard__notification-btn">
            <Bell size={18} color="var(--color-text-secondary)" />
          </button>
        </div>
      </div>

      <div className="personal-dashboard__hero">
        <div className="personal-dashboard__hero-copy">
          <span className="personal-dashboard__eyebrow">{displayName}</span>
          <div className="personal-dashboard__hero-title">{toCurrency(detail.remaining)}</div>
          <div className="personal-dashboard__hero-subtitle">
            {toCurrency(detail.personalSpent)} de {toCurrency(detail.personalBudget)} usados este mes
          </div>
        </div>
        <div className="personal-dashboard__hero-stats">
          <div className="personal-dashboard__metric">
            <span className="personal-dashboard__metric-label">Progreso</span>
            <span className="personal-dashboard__metric-value">{detail.progress}%</span>
          </div>
          <div className="personal-dashboard__metric">
            <span className="personal-dashboard__metric-label">Ticket medio</span>
            <span className="personal-dashboard__metric-value">{toCurrency(detail.averageExpense)}</span>
          </div>
          <div className="personal-dashboard__metric">
            <span className="personal-dashboard__metric-label">Top categoría</span>
            <span className="personal-dashboard__metric-value">{detail.topCategory}</span>
          </div>
        </div>
      </div>

      <div className="personal-dashboard__grid">
        <section className="personal-dashboard__card">
          <div className="personal-dashboard__section-header">
            <div>
              <div className="personal-dashboard__section-kicker">Presupuesto</div>
              <div className="personal-dashboard__section-title">Tu presupuesto por categoría</div>
            </div>
          </div>

          <div className="personal-dashboard__category-list">
            {detail.categories.length === 0 ? (
              <div className="personal-dashboard__empty">Todavía no hay gastos personales este mes.</div>
            ) : (
              detail.categories.map((category) => {
                const categoryDef = CATEGORIES.find((item) => item.id === category.category);

                return (
                  <div key={category.category} className="personal-dashboard__category-item">
                    <div className="personal-dashboard__category-row">
                      <div className="personal-dashboard__category-name">
                        <span>{categoryDef?.emoji ?? '🦋'}</span>
                        <span>{category.category}</span>
                      </div>
                      <div className="personal-dashboard__category-meta">
                        <span>{toCurrency(category.total)}</span>
                        <span>{category.monthShare}% del gasto</span>
                      </div>
                    </div>
                    <div className="personal-dashboard__category-track">
                      <div
                        className="personal-dashboard__category-fill"
                        style={{
                          '--progress-width': `${category.budgetShare}%`,
                          '--theme-base': categoryDef?.color ?? ownerTheme.base,
                        } as React.CSSProperties}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="personal-dashboard__card">
          <div className="personal-dashboard__section-header">
            <div>
              <div className="personal-dashboard__section-kicker">Últimos gastos</div>
              <div className="personal-dashboard__section-title">Solo tus movimientos privados</div>
            </div>
          </div>

          <div className="personal-dashboard__transactions">
            {detail.recentExpenses.length === 0 ? (
              <div className="personal-dashboard__empty">No hay gastos personales registrados este mes.</div>
            ) : (
              detail.recentExpenses.map((expense) => {
                const categoryDef = CATEGORIES.find((item) => item.id === expense.category);
                return (
                  <TransactionRow
                    key={expense.id}
                    emoji={categoryDef?.emoji ?? '🦋'}
                    name={expense.description}
                    payer="Privado"
                    amount={`-€${expense.amount.toFixed(2)}`}
                    date={expense.date}
                    indicatorColor={ownerTheme.base}
                    isPositive={false}
                  />
                );
              })
            )}
          </div>
        </section>

        <section className="personal-dashboard__card personal-dashboard__card--wide">
          <div className="personal-dashboard__section-header">
            <div>
              <div className="personal-dashboard__section-kicker">Analítica</div>
              <div className="personal-dashboard__section-title">Resumen de gasto personal</div>
            </div>
            <div className="personal-dashboard__inline-stats">
              <span>{detail.recentExpenses.length} movimientos recientes</span>
              <span>{detail.categories.length} categorías activas</span>
            </div>
          </div>

          <div className="personal-dashboard__chart">
            <svg viewBox="0 0 520 220" width="100%" height="100%" preserveAspectRatio="none">
              <defs>
                <linearGradient id={chartGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ownerTheme.base} stopOpacity="0.32" />
                  <stop offset="100%" stopColor={ownerTheme.base} stopOpacity="0.04" />
                </linearGradient>
              </defs>
              <path d={chartPaths.areaPath} fill={`url(#${chartGradientId})`} />
              <path
                d={chartPaths.linePath}
                fill="none"
                stroke={ownerTheme.base}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="personal-dashboard__chart-labels">
              {detail.chart.map((point) => (
                <div key={point.label} className="personal-dashboard__chart-label">
                  <span>{point.label}</span>
                  <strong>{toCurrency(point.total)}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
