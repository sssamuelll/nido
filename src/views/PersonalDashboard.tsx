import React, { useCallback, useId, useState } from 'react';
import { Bell, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Api } from '../api';
import { TransactionRow } from '../components/TransactionRow';
import { useAuth } from '../auth';
import { OWNER_THEMES } from '../types';
import { buildPersonalDetailModel, type VisibleExpense } from './privacy';
import { useCategoryManagement } from '../hooks/useCategoryManagement';
import { useAsyncEffect } from '../hooks/useResource';
import { formatMoney, formatMoneyExact } from '../lib/money';

interface DashboardSummary {
  budget?: {
    personal?: number;
  };
  personal?: {
    owner?: string;
    budget?: number;
  };
}

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
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [expenses, setExpenses] = useState<VisibleExpense[]>([]);
  const { getCategoryDef } = useCategoryManagement('personal');

  const loadPersonalDashboard = useCallback(async () => {
    const cycle = await Api.getCurrentCycle().catch(() => null);
    let nextSummary, nextExpenses;
    if (cycle?.start_date) {
      const range = { start_date: cycle.start_date, end_date: cycle.end_date ?? undefined };
      [nextSummary, nextExpenses] = await Promise.all([
        Api.getSummary({ ...range, cycle_id: cycle.id }),
        Api.getExpenses(range),
      ]);
    } else {
      [nextSummary, nextExpenses] = await Promise.all([
        Api.getSummary(),
        Api.getExpenses(),
      ]);
    }
    setSummary(nextSummary);
    setExpenses(Array.isArray(nextExpenses) ? nextExpenses : []);
  }, []);

  const { loading, error } = useAsyncEffect(loadPersonalDashboard, {
    fallbackMessage: 'Error al cargar tu detalle personal',
  });

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

  if (error || !user || !summary) {
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

  // Define detail AFTER we are sure summary exists
  // Budget info now comes from the summary response (via household_budget)
  const detail = buildPersonalDetailModel({
    summary,
    expenses,
    username: user.username,
    userId: user.id,
  });

  const ownerTheme = OWNER_THEMES[detail.owner];
  const chartSeries = detail.chart.map((point) => point.total);
  const chartPaths = buildLinePath(chartSeries, 520, 220, 24);

  const displayName = user?.username ? user.username.charAt(0).toUpperCase() + user.username.slice(1) : 'Usuario';

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
          <div className="personal-dashboard__hero-title">{formatMoney(detail.remaining)}</div>
          <div className="personal-dashboard__hero-subtitle">
            {formatMoney(detail.personalSpent)} de {formatMoney(detail.personalBudget)} usados este ciclo
          </div>
        </div>
        <div className="personal-dashboard__hero-stats">
          <div className="personal-dashboard__metric">
            <span className="personal-dashboard__metric-label">Progreso</span>
            <span className="personal-dashboard__metric-value">{detail.progress}%</span>
          </div>
          <div className="personal-dashboard__metric">
            <span className="personal-dashboard__metric-label">Ticket medio</span>
            <span className="personal-dashboard__metric-value">{formatMoney(detail.averageExpense)}</span>
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
              <div className="personal-dashboard__empty">Todavía no hay gastos personales este ciclo.</div>
            ) : (
              detail.categories.map((category) => {
                const categoryDef = getCategoryDef(category.category);

                return (
                  <div key={category.category} className="personal-dashboard__category-item">
                    <div className="personal-dashboard__category-row">
                      <div className="personal-dashboard__category-name">
                        <span>{categoryDef?.emoji ?? '🦋'}</span>
                        <span>{category.category}</span>
                      </div>
                      <div className="personal-dashboard__category-meta">
                        <span>{formatMoney(category.total)}</span>
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
              <div className="personal-dashboard__empty">No hay gastos personales registrados este ciclo.</div>
            ) : (
              detail.recentExpenses.map((expense) => {
                const categoryDef = getCategoryDef(expense.category);
                return (
                  <TransactionRow
                    key={expense.id}
                    emoji={categoryDef?.emoji ?? '🦋'}
                    name={expense.description}
                    payer="Privado"
                    amount={`-${formatMoneyExact(expense.amount)}`}
                    date={expense.date}
                    indicatorColor={ownerTheme.base}
                    isPositive={false}
                    onClick={() => navigate('/history', { state: { initialContext: 'personal', initialCategory: expense.category } })}
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
                  <strong>{formatMoney(point.total)}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
