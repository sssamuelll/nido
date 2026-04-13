import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Api } from '../api';
import { useContextSelector } from '../hooks/useContextSelector';
import { ContextTabs } from '../components/ContextTabs';
import { CheckCircle, AlertTriangle, Lightbulb, TrendingDown, TrendingUp } from 'lucide-react';

/* ── constants ──────────────────────────────────────────── */

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

/* ── types ──────────────────────────────────────────────── */

interface MonthlyData { month: string; total: number }
interface KpisData {
  totalSpent: number;
  netSavings: number;
  avgTicket: number;
  totalExpenses: number;
  vsPrevPeriod: number;
}
interface CategoryData { name: string; amount: number; pct: number; color: string }
interface InsightData { type: 'positive' | 'warning' | 'tip'; message: string }
interface AnalyticsData {
  monthly: MonthlyData[];
  kpis: KpisData;
  categories: CategoryData[];
  insights: InsightData[];
}

/* ── helpers ────────────────────────────────────────────── */

const fmtMonth = (m: string) => MONTH_LABELS[m.split('-')[1]] || m.split('-')[1];

const fmtCurrency = (n: number) =>
  `€${n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtCurrencyDecimal = (n: number) =>
  `€${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Catmull-Rom to cubic bezier SVG path */
function pointsToSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

  let d = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];

    const tension = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}

/** Nice axis values */
function niceScale(max: number, ticks: number): number[] {
  if (max <= 0) return [0];
  const rough = max / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / mag;
  let nice: number;
  if (residual <= 1.5) nice = 1 * mag;
  else if (residual <= 3) nice = 2 * mag;
  else if (residual <= 7) nice = 5 * mag;
  else nice = 10 * mag;

  const result: number[] = [];
  for (let v = 0; v <= max + nice * 0.1; v += nice) {
    result.push(Math.round(v));
  }
  return result;
}

const INSIGHT_ICON: Record<string, React.FC<{ size?: number }>> = {
  positive: CheckCircle,
  warning: AlertTriangle,
  tip: Lightbulb,
};

const INSIGHT_COLORS: Record<string, { border: string; bg: string; icon: string }> = {
  positive: { border: 'var(--green)', bg: 'var(--gl)', icon: 'var(--green)' },
  warning: { border: 'var(--orange)', bg: 'var(--ol)', icon: 'var(--orange)' },
  tip: { border: 'var(--blue)', bg: 'var(--bl)', icon: 'var(--blue)' },
};

/* ── SVG Chart component ────────────────────────────────── */

const CHART_PADDING = { top: 24, right: 16, bottom: 36, left: 52 };

interface AreaChartProps {
  data: MonthlyData[];
  animated: boolean;
}

const AreaChart: React.FC<AreaChartProps> = ({ data, animated }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; month: string; amount: number } | null>(null);
  const [pathLength, setPathLength] = useState(0);
  const pathRef = useRef<SVGPathElement>(null);

  const viewW = 640;
  const viewH = 280;
  const chartW = viewW - CHART_PADDING.left - CHART_PADDING.right;
  const chartH = viewH - CHART_PADDING.top - CHART_PADDING.bottom;

  const maxVal = useMemo(() => Math.max(...data.map(d => d.total), 1), [data]);
  const yTicks = useMemo(() => niceScale(maxVal, 4), [maxVal]);
  const scaleMax = yTicks[yTicks.length - 1] || maxVal;

  const points = useMemo(() =>
    data.map((m, i) => ({
      x: CHART_PADDING.left + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW),
      y: CHART_PADDING.top + chartH - (m.total / scaleMax) * chartH,
    })),
    [data, chartW, chartH, scaleMax],
  );

  const linePath = useMemo(() => pointsToSmoothPath(points), [points]);
  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const lastPt = points[points.length - 1];
    const firstPt = points[0];
    const bottomY = CHART_PADDING.top + chartH;
    return `${linePath} L ${lastPt.x} ${bottomY} L ${firstPt.x} ${bottomY} Z`;
  }, [linePath, points, chartH]);

  useEffect(() => {
    if (pathRef.current) {
      setPathLength(pathRef.current.getTotalLength());
    }
  }, [linePath]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || data.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * viewW;

    let closest = 0;
    let minDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - mouseX);
      if (dist < minDist) { minDist = dist; closest = i; }
    });

    if (minDist < chartW / data.length) {
      setTooltip({
        x: points[closest].x,
        y: points[closest].y,
        month: data[closest].month,
        amount: data[closest].total,
      });
    } else {
      setTooltip(null);
    }
  };

  return (
    <div className="a7-chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewW} ${viewH}`}
        className="a7-chart-svg"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--green)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {yTicks.map(val => {
          const y = CHART_PADDING.top + chartH - (val / scaleMax) * chartH;
          return (
            <g key={val}>
              <line
                x1={CHART_PADDING.left}
                y1={y}
                x2={viewW - CHART_PADDING.right}
                y2={y}
                className="a7-grid-line"
              />
              <text
                x={CHART_PADDING.left - 8}
                y={y + 4}
                className="a7-y-label"
              >
                {val >= 1000 ? `€${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k` : `€${val}`}
              </text>
            </g>
          );
        })}

        {/* X-axis month labels */}
        {data.map((m, i) => {
          const x = CHART_PADDING.left + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
          return (
            <text
              key={m.month}
              x={x}
              y={viewH - 6}
              className="a7-x-label"
            >
              {fmtMonth(m.month)}
            </text>
          );
        })}

        {/* Area fill */}
        {points.length > 0 && (
          <path
            d={areaPath}
            fill="url(#areaGrad)"
            className={`a7-area ${animated ? 'a7-area--visible' : ''}`}
          />
        )}

        {/* Line */}
        {points.length > 0 && (
          <path
            ref={pathRef}
            d={linePath}
            className={`a7-line ${animated ? 'a7-line--drawn' : ''}`}
            style={{
              strokeDasharray: pathLength || 1000,
              strokeDashoffset: animated ? 0 : (pathLength || 1000),
            }}
          />
        )}

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={data[i].month}
            cx={p.x}
            cy={p.y}
            r={4}
            className={`a7-dot ${animated ? 'a7-dot--visible' : ''}`}
            style={{ transitionDelay: `${600 + i * 60}ms` }}
          />
        ))}

        {/* Tooltip crosshair */}
        {tooltip && (
          <>
            <line
              x1={tooltip.x} y1={CHART_PADDING.top}
              x2={tooltip.x} y2={CHART_PADDING.top + chartH}
              className="a7-crosshair"
            />
            <circle cx={tooltip.x} cy={tooltip.y} r={6} className="a7-dot-hover" />
          </>
        )}
      </svg>

      {/* HTML tooltip */}
      {tooltip && (
        <div
          className="a7-tooltip"
          style={{
            left: `${(tooltip.x / viewW) * 100}%`,
            top: `${(tooltip.y / viewH) * 100}%`,
          }}
        >
          <span className="a7-tooltip__month">{fmtMonth(tooltip.month)}</span>
          <span className="a7-tooltip__amount">{fmtCurrency(tooltip.amount)}</span>
        </div>
      )}
    </div>
  );
};

/* ── Category Bars component ────────────────────────────── */

interface CategoryBarsProps {
  categories: CategoryData[];
  animated: boolean;
}

const CategoryBars: React.FC<CategoryBarsProps> = ({ categories, animated }) => {
  const sorted = useMemo(
    () => [...categories].sort((a, b) => b.amount - a.amount).slice(0, 8),
    [categories],
  );
  const maxAmt = useMemo(() => Math.max(...sorted.map(c => c.amount), 1), [sorted]);

  return (
    <div className="a7-catbars">
      {sorted.map((cat, i) => {
        const widthPct = (cat.amount / maxAmt) * 100;
        return (
          <div
            key={cat.name}
            className={`a7-catbar ${animated ? 'a7-catbar--visible' : ''}`}
            style={{ '--catbar-delay': `${i * 50}ms` } as React.CSSProperties}
          >
            <div className="a7-catbar__label">
              <span className="a7-catbar__name">{cat.name}</span>
            </div>
            <div className="a7-catbar__track">
              <div
                className="a7-catbar__fill"
                style={{
                  '--bar-width': `${widthPct}%`,
                  '--bar-color': cat.color,
                } as React.CSSProperties}
              />
            </div>
            <div className="a7-catbar__meta">
              <span className="a7-catbar__amount">{fmtCurrency(cat.amount)}</span>
              <span className="a7-catbar__pct" style={{ color: cat.color }}>{cat.pct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ── Main component ─────────────────────────────────────── */

export const Analytics: React.FC = () => {
  const [activePeriod, setActivePeriod] = useState('6M');
  const { activeContext, setActiveContext } = useContextSelector();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartAnimated, setChartAnimated] = useState(false);

  const months = PERIOD_TO_MONTHS[activePeriod] ?? 6;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setChartAnimated(false);
    try {
      const result = await Api.getAnalytics(months, activeContext);
      setData(result);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setChartAnimated(true));
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar analíticas');
    } finally {
      setLoading(false);
    }
  }, [months, activeContext]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const chartTitle = activeContext === 'shared'
    ? 'Evolución — Gastos compartidos'
    : 'Evolución — Gastos personales';

  /* ── KPI data ── */
  const kpis = useMemo(() => {
    if (!data) return [];
    const { kpis: k } = data;
    return [
      {
        value: fmtCurrency(k.totalSpent),
        label: 'Total gastado',
        delta: k.vsPrevPeriod,
        deltaInvert: true, // lower is better
        valueColor: undefined,
      },
      {
        value: fmtCurrency(k.netSavings),
        label: 'Ahorro neto',
        delta: undefined,
        deltaInvert: false,
        valueColor: k.netSavings >= 0 ? 'var(--green)' : 'var(--red)',
      },
      {
        value: fmtCurrencyDecimal(k.avgTicket),
        label: 'Ticket medio',
        delta: undefined,
        deltaInvert: false,
        valueColor: undefined,
      },
      {
        value: String(k.totalExpenses),
        label: 'Nº de gastos',
        delta: undefined,
        deltaInvert: false,
        valueColor: undefined,
      },
    ];
  }, [data]);

  return (
    <div className="a7">
      {/* ── Header ── */}
      <div className="a7-header an d1">
        <div>
          <h1 className="a7-title">Analítica</h1>
          <p className="a7-subtitle">Análisis detallado de gastos</p>
        </div>
        <div className="a7-pills">
          {PERIODS.map(p => (
            <button
              key={p}
              className={`a7-pill ${activePeriod === p ? 'a7-pill--active' : ''}`}
              onClick={() => setActivePeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Context tabs ── */}
      <ContextTabs
        active={activeContext}
        onChange={setActiveContext}
        className="a7-ctx an d1"
      />

      {/* ── Loading ── */}
      {loading && (
        <div className="a7-kpis an d2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="a7-kpi a7-kpi--skeleton">
              <div className="a7-kpi__value-skel" />
              <div className="a7-kpi__label-skel" />
            </div>
          ))}
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div className="a7-error an d2">
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Data ── */}
      {data && !loading && (
        <>
          {/* KPI cards */}
          <div className="a7-kpis an d2">
            {kpis.map(kpi => (
              <div key={kpi.label} className="a7-kpi">
                <div
                  className="a7-kpi__value"
                  style={kpi.valueColor ? { color: kpi.valueColor } : undefined}
                >
                  {kpi.value}
                </div>
                <div className="a7-kpi__label">{kpi.label}</div>
                {kpi.delta !== undefined && kpi.delta !== 0 && (
                  <div
                    className={`a7-kpi__delta ${
                      (kpi.deltaInvert ? kpi.delta < 0 : kpi.delta > 0) ? 'a7-kpi__delta--good' : 'a7-kpi__delta--bad'
                    }`}
                  >
                    {kpi.delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {Math.abs(Math.round(kpi.delta))}% vs anterior
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Two-column layout: chart + categories */}
          <div className="a7-grid an d3">
            {/* Chart card */}
            <div className="a7-card a7-card--chart">
              <div className="a7-card__head">
                <span className="a7-card__title">{chartTitle}</span>
              </div>
              {data.monthly.length > 0 ? (
                <AreaChart data={data.monthly} animated={chartAnimated} />
              ) : (
                <div className="a7-empty">Sin datos para el periodo seleccionado</div>
              )}
            </div>

            {/* Category breakdown */}
            <div className="a7-card a7-card--cats">
              <div className="a7-card__head">
                <span className="a7-card__title">Por categoría</span>
              </div>
              {data.categories.length > 0 ? (
                <CategoryBars categories={data.categories} animated={chartAnimated} />
              ) : (
                <div className="a7-empty">Sin gastos este periodo</div>
              )}
            </div>
          </div>

          {/* Insights */}
          {data.insights.length > 0 && (
            <div className="a7-insights an d4">
              {data.insights.map((ins, i) => {
                const color = INSIGHT_COLORS[ins.type] || INSIGHT_COLORS.tip;
                const Icon = INSIGHT_ICON[ins.type] || Lightbulb;
                return (
                  <div
                    key={i}
                    className={`a7-insight ${chartAnimated ? 'a7-insight--visible' : ''}`}
                    style={{
                      '--insight-border': color.border,
                      '--insight-bg': color.bg,
                      '--insight-delay': `${i * 50}ms`,
                    } as React.CSSProperties}
                  >
                    <div className="a7-insight__icon" style={{ color: color.icon }}>
                      <Icon size={16} />
                    </div>
                    <p className="a7-insight__msg">{ins.message}</p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
