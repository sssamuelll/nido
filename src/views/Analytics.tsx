import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createChart, ColorType, AreaData, Time } from 'lightweight-charts';
import { Api } from '../api';
import { useContextSelector } from '../hooks/useContextSelector';
import { ContextTabs } from '../components/ContextTabs';
import { CheckCircle, AlertTriangle, Lightbulb, TrendingDown, TrendingUp, X } from 'lucide-react';

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
interface CategoryData { name: string; amount: number; pct: number; color: string; emoji: string; budget: number }
interface InsightData { type: 'positive' | 'warning' | 'tip'; message: string }
interface HouseholdBudgetData {
  total_amount: number;
  allocated: number;
  unallocated: number;
}
interface DailyData { date: string; total: number }
interface AnalyticsData {
  monthly: MonthlyData[];
  daily: DailyData[];
  kpis: KpisData;
  categories: CategoryData[];
  insights: InsightData[];
  householdBudget: HouseholdBudgetData;
}

/* ── helpers ────────────────────────────────────────────── */

const fmtMonth = (m: string) => MONTH_LABELS[m.split('-')[1]] || m.split('-')[1];

const fmtCurrency = (n: number) =>
  `€${n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtCurrencyDecimal = (n: number) =>
  `€${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

/* ── TradingView Lightweight Chart component ───────────── */

interface AreaChartProps {
  data: Array<{ date: string; total: number }>;
}

const AreaChart: React.FC<AreaChartProps> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    // Create chart
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.3)',
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      width: containerRef.current.clientWidth,
      height: 300,
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        tickMarkFormatter: (time: unknown) => {
          const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
          if (typeof time === 'string') {
            const [,m] = time.split('-');
            return months[parseInt(m) - 1] || time;
          }
          return '';
        },
      },
      localization: {
        locale: 'es-ES',
        priceFormatter: (price: number) => `€${Math.round(price).toLocaleString('es-ES')}`,
      },
      crosshair: {
        vertLine: {
          color: 'rgba(52,211,153,0.3)',
          width: 1,
          style: 3,
          labelBackgroundColor: 'rgba(52,211,153,0.9)',
        },
        horzLine: {
          color: 'rgba(52,211,153,0.3)',
          width: 1,
          style: 3,
          labelBackgroundColor: 'rgba(52,211,153,0.9)',
        },
      },
      handleScale: false,
      handleScroll: false,
    });

    // Add area series
    const areaSeries = chart.addAreaSeries({
      lineColor: '#34D399',
      lineWidth: 2,
      topColor: 'rgba(52,211,153,0.35)',
      bottomColor: 'rgba(52,211,153,0)',
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 6,
      crosshairMarkerBackgroundColor: '#34D399',
      crosshairMarkerBorderColor: '#34D399',
      lastValueVisible: true,
      priceLineVisible: true,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `€${Math.round(price).toLocaleString('es-ES')}`,
      },
    });

    // Transform data: date is already YYYY-MM-DD
    const chartData: AreaData<Time>[] = data.map(d => ({
      time: d.date as Time,
      value: d.total,
    }));

    areaSeries.setData(chartData);
    chart.timeScale().fitContent();

    chartRef.current = chart;

    // Resize observer
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data]);

  return <div ref={containerRef} className="a7-tv-chart" />;
};

/* ── Category Bars component ────────────────────────────── */

interface CategoryBarsProps {
  categories: CategoryData[];
  animated: boolean;
  hoveredIdx: number | null;
  onHover: (idx: number | null) => void;
  onClick: (idx: number | null) => void;
}

const CategoryBars: React.FC<CategoryBarsProps> = ({ categories, animated, hoveredIdx, onHover, onClick }) => {
  const sorted = useMemo(
    () => [...categories].filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 8),
    [categories],
  );
  const maxAmt = useMemo(() => Math.max(...sorted.map(c => c.amount), 1), [sorted]);

  return (
    <div className="a7-catbars">
      {sorted.map((cat, i) => {
        const widthPct = (cat.amount / maxAmt) * 100;
        const isActive = hoveredIdx === i;
        const isDimmed = hoveredIdx !== null && !isActive;
        return (
          <div
            key={cat.name}
            className={`a7-catbar ${animated ? 'a7-catbar--visible' : ''} ${isActive ? 'a7-catbar--active' : ''} ${isDimmed ? 'a7-catbar--dimmed' : ''}`}
            style={{ '--catbar-delay': `${i * 50}ms` } as React.CSSProperties}
            onMouseEnter={() => onHover(i)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onClick(i)}
          >
            <div className="a7-catbar__label">
              <span className="a7-catbar__emoji">{cat.emoji}</span>
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
              <span className="a7-catbar__pct" style={{ '--catbar-pct-color': cat.color } as React.CSSProperties}>{cat.pct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ── Spending Donut component ──────────────────────────── */

interface SpendingDonutProps {
  categories: Array<{ name: string; emoji: string; amount: number; color: string; pct: number }>;
  animated: boolean;
  hoveredIdx: number | null;
  onHover: (idx: number | null) => void;
  onClick: (idx: number | null) => void;
}

const MAX_DONUT_SLICES = 6;
const RING_R = 70;
const RING_STROKE = 24;
const RING_C = 2 * Math.PI * RING_R;
const BADGE_R = RING_R + RING_STROKE / 2 + 24;
const VIEW_SIZE = 280; // larger to fit badges
const CENTER = VIEW_SIZE / 2;

function collapseSlices(cats: SpendingDonutProps['categories']): SpendingDonutProps['categories'] {
  const filtered = cats.filter(c => c.amount > 0);
  if (filtered.length <= MAX_DONUT_SLICES) return filtered;
  const sorted = [...filtered].sort((a, b) => b.amount - a.amount);
  const keep = sorted.slice(0, MAX_DONUT_SLICES - 1);
  const rest = sorted.slice(MAX_DONUT_SLICES - 1);
  const restTotal = rest.reduce((s, r) => s + r.amount, 0);
  const total = filtered.reduce((s, r) => s + r.amount, 0);
  keep.push({
    name: 'Otros', emoji: '📦', color: '#a89e94',
    amount: restTotal, pct: total > 0 ? Math.round((restTotal / total) * 100) : 0,
  });
  return keep;
}

const SpendingDonut: React.FC<SpendingDonutProps> = ({ categories, animated, hoveredIdx, onHover, onClick }) => {
  const slices = useMemo(() => collapseSlices(categories), [categories]);
  const totalSpent = slices.reduce((s, c) => s + c.amount, 0);
  const safeTotal = Math.max(totalSpent, 1);

  // Build arcs — spending per category as % of total spent
  const arcs = useMemo(() => {
    const result: Array<{ offset: number; length: number; color: string; idx: number }> = [];
    let cum = 0;
    slices.forEach((s, i) => {
      const len = (s.amount / safeTotal) * RING_C;
      result.push({ offset: cum, length: len, color: s.color, idx: i });
      cum += len;
    });
    return result;
  }, [slices, safeTotal]);

  // Spread badges to avoid overlap on small segments
  const badgePositions = useMemo(() => {
    const MIN_ANGLE_GAP = 0.45; // ~26 degrees minimum between badges
    const rawAngles = arcs.map(arc => ((arc.offset + arc.length / 2) / RING_C) * 2 * Math.PI - Math.PI / 2);
    const adjusted = [...rawAngles];
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < adjusted.length; i++) {
        const gap = adjusted[i] - adjusted[i - 1];
        if (gap < MIN_ANGLE_GAP) {
          const shift = (MIN_ANGLE_GAP - gap) / 2;
          adjusted[i - 1] -= shift;
          adjusted[i] += shift;
        }
      }
    }
    return adjusted.map(angle => ({
      x: CENTER + Math.cos(angle) * BADGE_R,
      y: CENTER + Math.sin(angle) * BADGE_R,
    }));
  }, [arcs]);

  if (totalSpent === 0) return null;

  return (
    <div className="a7-donut-wrap">
      <div className="a7-donut-svg-wrap">
        <svg viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} className="a7-donut-svg" onMouseLeave={() => onHover(null)} onClick={(e) => { if ((e.target as SVGElement).tagName === 'svg') onClick(null); }}>
          {/* Spending ring */}
          {arcs.map((arc, i) => {
            const isHovered = arc.idx === hoveredIdx;
            return (
              <circle
                key={`a-${i}`}
                cx={CENTER} cy={CENTER} r={RING_R}
                fill="none" stroke={arc.color} strokeWidth={RING_STROKE}
                strokeDasharray={`${arc.length} ${RING_C - arc.length}`}
                strokeDashoffset={animated ? -(arc.offset - RING_C / 4) : RING_C}
                strokeLinecap="butt"
                className={`a7-donut-arc${hoveredIdx !== null && !isHovered ? ' a7-donut-arc--dimmed' : ''}`}
                style={{ '--arc-delay': `${i * 60}ms` } as React.CSSProperties}
                onMouseEnter={() => onHover(arc.idx)}
                onTouchStart={() => onHover(arc.idx)}
              />
            );
          })}

          {/* Touch targets */}
          {arcs.map((arc, i) => (
            <circle
              key={`t-${i}`}
              cx={CENTER} cy={CENTER} r={RING_R}
              fill="none" stroke="transparent"
              strokeWidth={Math.max(RING_STROKE + 20, 44)}
              strokeDasharray={`${arc.length} ${RING_C - arc.length}`}
              strokeDashoffset={-(arc.offset - RING_C / 4)} strokeLinecap="butt"
              className="a7-donut-touch"
              onMouseEnter={() => onHover(arc.idx)}
              onTouchStart={() => onHover(arc.idx)}
              onClick={() => onClick(arc.idx)}
            />
          ))}

          {/* Emoji badges — spread to avoid overlap */}
          {arcs.map((arc, i) => {
            const s = slices[arc.idx];
            const pos = badgePositions[i];
            const pct = Math.round((s.amount / safeTotal) * 100);
            const isHovered = arc.idx === hoveredIdx;
            return (
              <foreignObject key={`fb-${i}`} x={pos.x - 22} y={pos.y - 22} width={44} height={44} className="a7-donut-fo">
                <div
                  className={`a7-donut-badge${isHovered ? ' a7-donut-badge--active' : ''}`}
                  style={{ '--badge-color': s.color } as React.CSSProperties}
                  onMouseEnter={() => onHover(arc.idx)}
                  onClick={() => onClick(arc.idx)}
                >
                  <span className="a7-donut-badge__emoji">{s.emoji}</span>
                  <span className="a7-donut-badge__pct">{pct}%</span>
                </div>
              </foreignObject>
            );
          })}

          {/* Center total */}
          <text x={CENTER} y={CENTER - 4} textAnchor="middle" dominantBaseline="auto"
            className="a7-donut-center-value">
            {fmtCurrency(totalSpent)}
          </text>
          <text x={CENTER} y={CENTER + 14} textAnchor="middle" dominantBaseline="auto"
            className="a7-donut-center-label">
            gastado
          </text>
        </svg>
      </div>
    </div>
  );
};

/* ── Category section — donut + bars with shared hover ─── */

const CategoryDonutSection: React.FC<{ categories: CategoryData[]; animated: boolean }> = ({ categories, animated }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [lockedIdx, setLockedIdx] = useState<number | null>(null);

  const activeIdx = lockedIdx ?? hoveredIdx;

  const handleHover = useCallback((idx: number | null) => {
    if (lockedIdx === null) setHoveredIdx(idx);
  }, [lockedIdx]);

  const handleClick = useCallback((idx: number | null) => {
    setLockedIdx(prev => prev === idx ? null : idx);
    setHoveredIdx(null);
  }, []);

  return (
    <>
      <SpendingDonut categories={categories} animated={animated} hoveredIdx={activeIdx} onHover={handleHover} onClick={handleClick} />
      <CategoryBars categories={categories} animated={animated} hoveredIdx={activeIdx} onHover={handleHover} onClick={handleClick} />
    </>
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
  const [insightDismissed, setInsightDismissed] = useState(false);

  const months = PERIOD_TO_MONTHS[activePeriod] ?? 6;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setChartAnimated(false);
    setInsightDismissed(false);
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
    ? 'Gasto acumulado — Compartido'
    : 'Gasto acumulado — Personal';

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

  /* Pick the single most relevant insight */
  const topInsight = useMemo(() => {
    if (!data?.insights.length) return null;
    return data.insights.find(i => i.type === 'warning')
      || data.insights.find(i => i.type === 'tip')
      || data.insights[0];
  }, [data?.insights]);

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

      {/* ── Insight banner ── */}
      {topInsight && !insightDismissed && !loading && (
        <div
          className="a7-insight-banner an d2"
          style={{
            '--insight-border': INSIGHT_COLORS[topInsight.type]?.border ?? 'var(--blue)',
            '--insight-bg': INSIGHT_COLORS[topInsight.type]?.bg ?? 'var(--bl)',
            '--insight-icon-color': INSIGHT_COLORS[topInsight.type]?.icon ?? 'var(--blue)',
          } as React.CSSProperties}
        >
          <div className="a7-insight-banner__icon">
            {React.createElement(INSIGHT_ICON[topInsight.type] || Lightbulb, { size: 16 })}
          </div>
          <p className="a7-insight-banner__msg">{topInsight.message}</p>
          <button
            className="a7-insight-banner__close"
            onClick={() => setInsightDismissed(true)}
            aria-label="Cerrar"
          >
            <X size={14} />
          </button>
        </div>
      )}

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
                  style={kpi.valueColor ? { '--kpi-color': kpi.valueColor } as React.CSSProperties : undefined}
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

          {/* Category breakdown — donut + bars */}
          <div className="a7-card a7-card--mb an d3">
            <div className="a7-card__head">
              <span className="a7-card__title">Por categoría</span>
            </div>
            {data.categories.length > 0 ? (
              <CategoryDonutSection categories={data.categories} animated={chartAnimated} />
            ) : (
              <div className="a7-empty">Sin gastos este periodo</div>
            )}
          </div>

          {/* Area chart */}
          <div className="a7-grid an d3">
            <div className="a7-card a7-card--chart">
              <div className="a7-card__head">
                <span className="a7-card__title">{chartTitle}</span>
              </div>
              {data.daily.length > 0 ? (
                <AreaChart data={data.daily} />
              ) : (
                <div className="a7-empty">Sin datos para el periodo seleccionado</div>
              )}
            </div>

            {/* Category bars fallback when no budget */}
            {data.householdBudget.total_amount <= 0 && (
              <div className="a7-card a7-card--cats">
                <div className="a7-card__head">
                  <span className="a7-card__title">Por categoría</span>
                </div>
                {data.categories.length > 0 ? (
                  <CategoryDonutSection categories={data.categories} animated={chartAnimated} />
                ) : (
                  <div className="a7-empty">Sin gastos este periodo</div>
                )}
              </div>
            )}
          </div>

        </>
      )}
    </div>
  );
};
