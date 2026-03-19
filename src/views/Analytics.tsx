import React, { useState, useEffect, useCallback } from 'react';
import { Api } from '../api';

const PERIODS = ['3M', '6M', '1A', 'Todo'] as const;
const PERIOD_TO_MONTHS: Record<string, number> = {
  '3M': 3,
  '6M': 6,
  '1A': 12,
  'Todo': 0,
};

const MONTH_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
};

const INSIGHT_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  positive: {
    bg: 'rgba(52,211,153,.06)',
    color: 'var(--green)',
    border: 'rgba(52,211,153,.15)',
  },
  warning: {
    bg: 'rgba(248,113,113,.06)',
    color: 'var(--red)',
    border: 'rgba(248,113,113,.15)',
  },
  tip: {
    bg: 'rgba(96,165,250,.06)',
    color: 'var(--blue)',
    border: 'rgba(96,165,250,.15)',
  },
};

interface MonthlyData {
  month: string;
  total: number;
}

interface KpisData {
  totalSpent: number;
  netSavings: number;
  avgTicket: number;
  totalExpenses: number;
  vsPrevPeriod: number;
}

interface CategoryData {
  name: string;
  amount: number;
  pct: number;
  color: string;
}

interface InsightData {
  type: 'positive' | 'warning' | 'tip';
  message: string;
}

interface AnalyticsData {
  monthly: MonthlyData[];
  kpis: KpisData;
  categories: CategoryData[];
  insights: InsightData[];
}

const formatMonthLabel = (month: string): string => {
  const parts = month.split('-');
  return MONTH_LABELS[parts[1]] || parts[1];
};

const formatCurrency = (amount: number): string => {
  return `€${amount.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export const Analytics: React.FC = () => {
  const [activePeriod, setActivePeriod] = useState('6M');
  const [activeContext, setActiveContext] = useState<'shared' | 'personal'>('shared');
  const [barsAnimated, setBarsAnimated] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const months = PERIOD_TO_MONTHS[activePeriod] ?? 6;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBarsAnimated(false);
    try {
      const result = await Api.getAnalytics(months, activeContext);
      setData(result);
      setTimeout(() => setBarsAnimated(true), 50);
    } catch (err: any) {
      setError(err.message || 'Error al cargar analíticas');
    } finally {
      setLoading(false);
    }
  }, [months, activeContext]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const chartTitle = activeContext === 'shared'
    ? 'Evolución — Gastos compartidos'
    : 'Evolución — Gastos personales';

  // Compute bar heights relative to max
  const maxMonthly = data?.monthly.reduce((max, m) => Math.max(max, m.total), 0) || 1;

  // Build KPI cards from data
  const kpiCards = data ? [
    {
      value: formatCurrency(data.kpis.totalSpent),
      label: 'Total gastado',
      delta: data.kpis.vsPrevPeriod !== 0
        ? `${data.kpis.vsPrevPeriod > 0 ? '\u2191' : '\u2193'} ${Math.abs(Math.round(data.kpis.vsPrevPeriod))}% vs anterior`
        : null,
      deltaColor: data.kpis.vsPrevPeriod > 0 ? 'var(--red)' : 'var(--green)',
    },
    {
      value: formatCurrency(data.kpis.netSavings),
      label: 'Ahorro neto',
      delta: null,
      deltaColor: data.kpis.netSavings >= 0 ? 'var(--green)' : 'var(--red)',
    },
    {
      value: `€${data.kpis.avgTicket.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      label: 'Ticket medio',
      delta: null,
      deltaColor: null,
    },
    {
      value: String(data.kpis.totalExpenses),
      label: 'Gastos totales',
      delta: null,
      deltaColor: null,
    },
  ] : [];

  return (
    <div className="u-flex-gap-24">
      {/* Header */}
      <div className="analytics__header an d1">
        <div>
          <div className="analytics__subtitle">Análisis detallado de gastos</div>
          <div className="analytics__title">Analítica</div>
        </div>
        <div className="analytics__period-pills">
          {PERIODS.map(p => (
            <button
              key={p}
              className={`analytics__period-btn ${activePeriod === p ? 'analytics__period-btn--active' : ''}`}
              onClick={() => setActivePeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Context Tabs */}
      <div className="analytics__context-tabs an d1">
        <button
          className={`analytics__context-tab ${activeContext === 'shared' ? 'analytics__context-tab--active' : ''}`}
          onClick={() => setActiveContext('shared')}
        >
          <div className="dot sh-d" />
          Compartido
        </button>
        <button
          className={`analytics__context-tab ${activeContext === 'personal' ? 'analytics__context-tab--active' : ''}`}
          onClick={() => setActiveContext('personal')}
        >
          <div className="dot ps-d" />
          Personal
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="stats-row kpi-row-4 an d2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card" style={{ textAlign: 'center', padding: '20px', opacity: 0.5 }}>
              <div className="stat-value" style={{ visibility: 'hidden' }}>---</div>
              <div className="stat-label" style={{ marginTop: '4px' }}>Cargando...</div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: '24px', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {/* Data loaded */}
      {data && !loading && (
        <>
          {/* KPI Row */}
          <div className="stats-row kpi-row-4 an d2">
            {kpiCards.map(kpi => (
              <div key={kpi.label} className="card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-value">{kpi.value}</div>
                <div className="stat-label" style={{ marginTop: '4px' }}>{kpi.label}</div>
                {kpi.delta && (
                  <div style={{ fontSize: '12px', color: kpi.deltaColor ?? undefined, fontWeight: 600, marginTop: '4px' }}>{kpi.delta}</div>
                )}
              </div>
            ))}
          </div>

          {/* Content */}
          <div className="analytics-grid an d3">
            <div className="analytics__chart-card">
              <div className="sh">
                <div className="st">{chartTitle}</div>
              </div>

              {data.monthly.length > 0 ? (
                <>
                  <div className="chart-big">
                    {data.monthly.map((m, i) => {
                      const heightPct = maxMonthly > 0 ? (m.total / maxMonthly) * 100 : 0;
                      return (
                        <div
                          key={m.month}
                          className="c-bar"
                          style={{
                            height: barsAnimated ? `${heightPct}%` : '0%',
                            background: 'linear-gradient(180deg, var(--blue), rgba(96,165,250,.2))',
                            transitionDelay: `${i * 150}ms`,
                          }}
                        />
                      );
                    })}
                  </div>

                  <div className="chart-labels">
                    {data.monthly.map(m => (
                      <span key={m.month}>{formatMonthLabel(m.month)}</span>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                  Sin datos para el periodo seleccionado
                </div>
              )}

              {/* Insight Cards */}
              {data.insights.length > 0 && (
                <div className="insight-cards">
                  {data.insights.map((insight, i) => {
                    const style = INSIGHT_STYLES[insight.type] || INSIGHT_STYLES.tip;
                    return (
                      <div
                        key={i}
                        className="insight-c"
                        style={{
                          background: style.bg,
                          color: style.color,
                          borderColor: style.border,
                        }}
                      >
                        {insight.message}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="analytics__categories-card">
              <div className="analytics__cat-title">Por categoría</div>
              {data.categories.length > 0 ? (
                data.categories.map(cat => (
                  <div key={cat.name} className="analytics__cat-item">
                    <div className="analytics__cat-row">
                      <div className="analytics__cat-name">
                        <div className="cat-dot" style={{ background: cat.color, boxShadow: `0 0 6px ${cat.color}` }} />
                        <span>{cat.name}</span>
                      </div>
                      <div className="u-flex-center">
                        <span className="analytics__cat-amount">{formatCurrency(cat.amount)}</span>
                        <span className="analytics__cat-pct" style={{ '--theme-base': cat.color } as React.CSSProperties}>
                          {cat.pct}%
                        </span>
                      </div>
                    </div>
                    <div className="analytics__cat-track">
                      <div
                        className="analytics__cat-fill"
                        style={{
                          '--progress-width': `${cat.pct}%`,
                          '--theme-base': cat.color,
                        } as React.CSSProperties}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0', opacity: 0.5 }}>
                  Sin gastos este mes
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
