import React, { useState } from 'react';
import { CATEGORIES, OWNER_THEMES } from '../types';

const MOCK_CHART_DATA = {
  samuel: [2100, 1800, 2400, 1950, 2200, 2450],
  maria: [1600, 1900, 1700, 2100, 1800, 1890],
  shared: [3200, 2900, 3500, 3100, 3400, 3200],
};
const MOCK_MONTHS = ['Oct', 'Nov', 'Dic', 'Ene', 'Feb', 'Mar'];

const PERIODS = ['3M', '6M', '1A', 'Todo'];

const MOCK_STATS = [
  { label: 'Total gastado', value: '€6.340', delta: '+8% vs mes anterior', up: false },
  { label: 'Ahorro neto', value: '€1.460', delta: '+12% este mes', up: true },
];

const MOCK_CATEGORIES = [
  { emoji: '🍽️', name: 'Restaurant', amount: 1240, pct: 35, color: CATEGORIES.find(c => c.id === 'Restaurant')?.color ?? '#ff8c6b' },
  { emoji: '🛒', name: 'Gastos', amount: 890, pct: 25, color: CATEGORIES.find(c => c.id === 'Gastos')?.color ?? '#7cb5e8' },
  { emoji: '💡', name: 'Servicios', amount: 620, pct: 18, color: CATEGORIES.find(c => c.id === 'Servicios')?.color ?? '#c4a0e8' },
  { emoji: '🎉', name: 'Ocio', amount: 430, pct: 12, color: CATEGORIES.find(c => c.id === 'Ocio')?.color ?? '#e87ca0' },
  { emoji: '📈', name: 'Inversión', amount: 360, pct: 10, color: CATEGORIES.find(c => c.id === 'Inversión')?.color ?? '#a6c79c' },
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

  // Filter chart data by context
  const filteredChartData = {
    [activeContext]: MOCK_CHART_DATA[activeContext]
  };

  const paths = buildAreaChartPaths(filteredChartData, SVG_W, SVG_H, PAD);

  return (
    <div className="u-flex-gap-24">
      {/* Header */}
      <div className="analytics__header">
        <div>
          <div className="analytics__subtitle">Finanzas</div>
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
          Compartido
        </button>
        <button
          className={`analytics__context-tab ${activeContext === 'personal' ? 'analytics__context-tab--active' : ''}`}
          onClick={() => setActiveContext('personal')}
        >
          Personal
        </button>
      </div>

      {/* Content */}
      <div className="analytics__content">
        <div className="analytics__chart-card">
          <div className="settings__header-main">
            <div className="analytics__chart-title">Evolución mensual</div>
            <div className="analytics__legend">
              <div className="analytics__legend-item">
                <div
                  className="analytics__legend-dot"
                  style={{ '--theme-base': OWNER_THEMES[activeContext].base } as React.CSSProperties}
                />
                <span className="analytics__legend-label">
                  {activeContext === 'samuel' ? 'Samuel' : activeContext === 'maria' ? 'María' : 'Compartido'}
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

              {activeContext === 'samuel' && (
                <>
                  <path d={paths.samuel.areaPath} fill="url(#gradSamuel)" />
                  <path
                    d={paths.samuel.linePath}
                    fill="none"
                    stroke={OWNER_THEMES.samuel.base}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}
              {activeContext === 'maria' && (
                <>
                  <path d={paths.maria.areaPath} fill="url(#gradMaria)" />
                  <path
                    d={paths.maria.linePath}
                    fill="none"
                    stroke={OWNER_THEMES.maria.base}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}
              {activeContext === 'shared' && (
                <>
                  <path d={paths.shared.areaPath} fill="url(#gradShared)" />
                  <path
                    d={paths.shared.linePath}
                    fill="none"
                    stroke={OWNER_THEMES.shared.base}
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
        </div>

        <div className="analytics__right-panel">
          <div className="analytics__stats">
            <div className="analytics__stat-card">
              <span className="analytics__stat-label">Período actual</span>
              <span className="analytics__stat-value">{activePeriod}</span>
              <span className="analytics__stat-delta" style={{ '--theme-base': 'var(--color-samuel)' } as React.CSSProperties}>
                Contexto: {activeContext === 'shared' ? 'Compartido' : activeContext === 'samuel' ? 'Samuel' : 'María'}
              </span>
            </div>
            <div className="analytics__stat-card">
              <span className="analytics__stat-label">Análisis</span>
              <span className="analytics__stat-value">€2.450</span>
              <span className="analytics__stat-delta" style={{ '--theme-base': 'var(--color-maria)' } as React.CSSProperties}>
                ↓ 5% vs período anterior
              </span>
            </div>
          </div>

          <div className="analytics__categories-card">
            <div className="analytics__cat-title">Por categoría</div>
            {MOCK_CATEGORIES.map(cat => (
              <div key={cat.name} className="analytics__cat-item">
                <div className="analytics__cat-row">
                  <div className="analytics__cat-name">
                    <span>{cat.emoji}</span>
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
    </div>
  );
};
