import React, { useState, useEffect } from 'react';
import { CATEGORIES } from '../types';

const MOCK_MONTHS = ['Oct', 'Nov', 'Dic', 'Ene', 'Feb', 'Mar'];
const MOCK_BAR_HEIGHTS = [65, 82, 70, 90, 75, 55];

const PERIODS = ['3M', '6M', '1A', 'Todo'];

const MOCK_KPI = [
  { value: '€3.540', label: 'Total gastado', delta: '↓ 8% vs anterior', deltaColor: 'var(--red)' },
  { value: '€1.460', label: 'Ahorro neto', delta: '↑ 12% este mes', deltaColor: 'var(--green)' },
  { value: '€28,50', label: 'Ticket medio', delta: null, deltaColor: null },
  { value: '42', label: 'Gastos totales', delta: null, deltaColor: null },
];

const MOCK_CATEGORIES = [
  { name: 'Restaurant', amount: 1240, pct: 35, color: CATEGORIES.find(c => c.id === 'Restaurant')?.color ?? '#F87171' },
  { name: 'Supermercado', amount: 890, pct: 25, color: CATEGORIES.find(c => c.id === 'Supermercado')?.color ?? '#60A5FA' },
  { name: 'Servicios', amount: 620, pct: 18, color: CATEGORIES.find(c => c.id === 'Servicios')?.color ?? '#FBBF24' },
  { name: 'Ocio', amount: 430, pct: 12, color: CATEGORIES.find(c => c.id === 'Ocio')?.color ?? '#A78BFA' },
  { name: 'Inversión', amount: 360, pct: 10, color: CATEGORIES.find(c => c.id === 'Inversión')?.color ?? '#34D399' },
];

export const Analytics: React.FC = () => {
  const [activePeriod, setActivePeriod] = useState('6M');
  const [activeContext, setActiveContext] = useState<'shared' | 'personal'>('shared');
  const [barsAnimated, setBarsAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setBarsAnimated(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const chartTitle = activeContext === 'shared'
    ? 'Evolución — Gastos compartidos'
    : 'Evolución — Gastos personales';

  return (
    <div className="u-flex-gap-24">
      {/* Header */}
      <div className="analytics__header">
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
      <div className="analytics__context-tabs">
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

      {/* KPI Row */}
      <div className="stats-row an d2" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '24px' }}>
        {MOCK_KPI.map(kpi => (
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
      <div className="analytics-grid">
        <div className="analytics__chart-card">
          <div className="sh">
            <div className="st">{chartTitle}</div>
          </div>

          <div className="chart-big">
            {MOCK_BAR_HEIGHTS.map((h, i) => (
              <div
                key={MOCK_MONTHS[i]}
                className="c-bar"
                style={{
                  height: barsAnimated ? `${h}%` : '0%',
                  background: 'linear-gradient(180deg, var(--blue), rgba(96,165,250,.2))',
                }}
              />
            ))}
          </div>

          <div className="chart-labels">
            {MOCK_MONTHS.map(m => (
              <span key={m}>{m}</span>
            ))}
          </div>

          {/* Insight Cards */}
          <div className="insight-cards">
            <div className="insight-c" style={{ background: 'rgba(52,211,153,.06)', color: 'var(--green)', borderColor: 'rgba(52,211,153,.15)' }}>
              <strong>Tendencia positiva:</strong> Gastaron 12% menos. El recorte principal fue en Restaurant.
            </div>
            <div className="insight-c" style={{ background: 'rgba(96,165,250,.06)', color: 'var(--blue)', borderColor: 'rgba(96,165,250,.15)' }}>
              <strong>Proyección:</strong> Si mantienen este ritmo, cerrarán el trimestre con €420 de ahorro extra.
            </div>
          </div>
        </div>

        <div className="analytics__categories-card">
          <div className="analytics__cat-title">Por categoría</div>
          {MOCK_CATEGORIES.map(cat => (
            <div key={cat.name} className="analytics__cat-item">
              <div className="analytics__cat-row">
                <div className="analytics__cat-name">
                  <div className="cat-dot" style={{ background: cat.color, boxShadow: `0 0 6px ${cat.color}` }} />
                  <span>{cat.name}</span>
                </div>
                <div className="u-flex-center">
                  <span className="analytics__cat-amount">€{cat.amount.toLocaleString('es-ES')}</span>
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
          ))}
        </div>
      </div>
    </div>
  );
};
