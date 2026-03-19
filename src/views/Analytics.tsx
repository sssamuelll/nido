import React, { useState } from 'react';
import { CATEGORIES, OWNER_THEMES } from '../types';

const MOCK_CHART_DATA = {
  samuel: [2100, 1800, 2400, 1950, 2200, 2450],
  maria: [1600, 1900, 1700, 2100, 1800, 1890],
  shared: [3200, 2900, 3500, 3100, 3400, 3200],
};
const MOCK_MONTHS = ['Oct', 'Nov', 'Dic', 'Ene', 'Feb', 'Mar'];

const PERIODS = ['3M', '6M', '1A', 'Todo'];

const MOCK_KPI = [
  { value: '\u20AC3.540', label: 'Total gastado', delta: '\u2193 8% vs anterior', deltaColor: 'var(--red)' },
  { value: '\u20AC1.460', label: 'Ahorro neto', delta: '\u2191 12% este mes', deltaColor: 'var(--green)' },
  { value: '\u20AC28,50', label: 'Ticket medio', delta: null, deltaColor: null },
  { value: '42', label: 'Gastos totales', delta: null, deltaColor: null },
];

const MOCK_CATEGORIES = [
  { emoji: '\uD83C\uDF7D\uFE0F', name: 'Restaurant', amount: 1240, pct: 35, color: CATEGORIES.find(c => c.id === 'Restaurant')?.color ?? '#ff8c6b' },
  { emoji: '\uD83D\uDED2', name: 'Supermercado', amount: 890, pct: 25, color: CATEGORIES.find(c => c.id === 'Supermercado')?.color ?? '#7cb5e8' },
  { emoji: '\uD83D\uDCA1', name: 'Servicios', amount: 620, pct: 18, color: CATEGORIES.find(c => c.id === 'Servicios')?.color ?? '#c4a0e8' },
  { emoji: '\uD83C\uDF89', name: 'Ocio', amount: 430, pct: 12, color: CATEGORIES.find(c => c.id === 'Ocio')?.color ?? '#e87ca0' },
  { emoji: '\uD83D\uDCC8', name: 'Inversi\u00F3n', amount: 360, pct: 10, color: CATEGORIES.find(c => c.id === 'Inversi\u00F3n')?.color ?? '#a6c79c' },
];

// Build SVG area chart paths
function buildAreaChartPaths(
  dataMap: Record<string, number[]>,
  width: number,
  height: number,
  padding: number
) {
  const allValues = Object.values(dataMap).flat();
  const maxVal = Math.max(...allValues, 1);
  const minVal = 0;
  const numPoints = MOCK_MONTHS.length;
  const xStep = (width - padding * 2) / (numPoints - 1);
  const yRange = height - padding * 2;

  const toX = (i: number) => padding + i * xStep;
  const toY = (v: number) => padding + yRange - ((v - minVal) / (maxVal - minVal)) * yRange;

  const result: Record<string, { linePath: string; areaPath: string }> = {};

  Object.entries(dataMap).forEach(([owner, values]) => {
    const points = values.map((v, i) => ({ x: toX(i), y: toY(v) }));

    // Smooth line using cubic bezier
    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const cpX = (points[i - 1].x + points[i].x) / 2;
      linePath += ` C ${cpX} ${points[i - 1].y}, ${cpX} ${points[i].y}, ${points[i].x} ${points[i].y}`;
    }

    // Area: same line + close at bottom
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    result[owner] = { linePath, areaPath };
  });

  return result;
}

export const Analytics: React.FC = () => {
  const [activePeriod, setActivePeriod] = useState('6M');
  const [activeContext, setActiveContext] = useState<'shared' | 'personal'>('shared');

  const SVG_W = 500;
  const SVG_H = 220;
  const PAD = 24;

  // Filter chart data by context -- map 'personal' to samuel's data as a proxy
  const chartKey = activeContext === 'personal' ? 'samuel' : activeContext;
  const filteredChartData = {
    [chartKey]: MOCK_CHART_DATA[chartKey]
  };

  const paths = buildAreaChartPaths(filteredChartData, SVG_W, SVG_H, PAD);

  return (
    <div className="u-flex-gap-24">
      {/* Header */}
      <div className="analytics__header">
        <div>
          <div className="analytics__subtitle">Finanzas</div>
          <div className="analytics__title">Anal\u00EDtica</div>
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
          <div className="settings__header-main">
            <div className="analytics__chart-title">Evoluci\u00F3n mensual</div>
            <div className="analytics__legend">
              <div className="analytics__legend-item">
                <div
                  className="analytics__legend-dot"
                  style={{ '--theme-base': OWNER_THEMES[chartKey].base } as React.CSSProperties}
                />
                <span className="analytics__legend-label">
                  {activeContext === 'personal' ? 'Personal' : 'Compartido'}
                </span>
              </div>
            </div>
          </div>

          <div className="analytics__chart-area">
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="analytics__svg"
            >
              <defs>
                <linearGradient id="gradSamuel" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8bdc6b" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#8bdc6b" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="gradMaria" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff8c6b" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#ff8c6b" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="gradShared" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7cb5e8" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#7cb5e8" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {paths[chartKey] && (
                <>
                  <path d={paths[chartKey].areaPath} fill={`url(#grad${chartKey.charAt(0).toUpperCase() + chartKey.slice(1)})`} />
                  <path
                    d={paths[chartKey].linePath}
                    fill="none"
                    stroke={OWNER_THEMES[chartKey].base}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}
            </svg>
          </div>

          <div className="analytics__chart-months">
            {MOCK_MONTHS.map(m => (
              <span key={m} className="analytics__chart-month">{m}</span>
            ))}
          </div>

          {/* Insight Cards */}
          <div className="insight-cards">
            <div className="insight-c" style={{ background: 'rgba(52,211,153,.06)', color: 'var(--green)', borderColor: 'rgba(52,211,153,.15)' }}>
              <strong>Tendencia positiva:</strong> Gastaron 12% menos. El recorte principal fue en Restaurant.
            </div>
            <div className="insight-c" style={{ background: 'rgba(96,165,250,.06)', color: 'var(--blue)', borderColor: 'rgba(96,165,250,.15)' }}>
              <strong>Proyecci\u00F3n:</strong> Si mantienen este ritmo, cerrar\u00E1n el trimestre con \u20AC420 de ahorro extra.
            </div>
          </div>
        </div>

        <div className="analytics__categories-card">
          <div className="analytics__cat-title">Por categor\u00EDa</div>
          {MOCK_CATEGORIES.map(cat => (
            <div key={cat.name} className="analytics__cat-item">
              <div className="analytics__cat-row">
                <div className="analytics__cat-name">
                  <div className="cat-dot" style={{ background: cat.color, boxShadow: `0 0 6px ${cat.color}` }} />
                  <span>{cat.name}</span>
                </div>
                <div className="u-flex-center">
                  <span className="analytics__cat-amount">\u20AC{cat.amount.toLocaleString('es-ES')}</span>
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
