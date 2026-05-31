import React, { useState, useCallback, useMemo } from 'react';
import { Api } from '../api';
import { useContextSelector } from '../hooks/useContextSelector';
import { useResource } from '../hooks/useResource';
import { useIsMobile } from '../hooks/useMediaQuery';
import { CACHE_KEYS } from '../lib/cacheBus';
import { ErrorView } from '../components/ErrorView';
import { formatCycleLabel, formatCycleRange } from '../lib/dates';
import { formatMoney } from '../lib/money';
import type { CycleSummary } from '../api-types/cycles';
import { Card, Eyebrow, Bar, CatIcon, Seg, Icon, CONTEXT_SEG_OPTIONS } from '../components/nido';

interface Kpis { totalSpent: number; netSavings: number; avgTicket: number; totalExpenses: number; vsPrevPeriod: number }
interface CatRow { name: string; amount: number; pct: number; color: string; emoji: string; budget: number }
interface Insight { type: 'positive' | 'warning' | 'tip'; message: string }

const num = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/* ── donut (own SVG, paper-themed; the prototype ships this, not a chart lib) ── */
const Donut: React.FC<{ slices: Array<{ pct: number; color: string }>; centerValue: string; centerLabel: string; size?: number }> = ({ slices, centerValue, centerLabel, size = 180 }) => {
  const r = (size / 2) - 20;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--inset)" strokeWidth={20} />
      {slices.map((s, i) => {
        // Clamp the SAME value used for both dash length and the running offset,
        // so a dirty pct (negative, or slices summing past 100) can't make a
        // slice's drawn arc and the next slice's start position disagree.
        const clampedPct = Math.max(0, Math.min(100, s.pct));
        const dash = (clampedPct / 100) * c;
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={20}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-(acc / 100) * c}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
        acc += clampedPct;
        return el;
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" className="serif" style={{ fontSize: 28, fill: 'var(--ink)' }}>{centerValue}</text>
      <text x={cx} y={cy + 18} textAnchor="middle" style={{ fontSize: 11.5, fill: 'var(--ink-3)' }}>{centerLabel}</text>
    </svg>
  );
};

/* ── cumulative-spend area (own SVG, clay stroke) ── */
const AreaChart: React.FC<{ values: number[]; height?: number }> = ({ values, height = 200 }) => {
  if (values.length < 2) {
    return <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Aún no hay suficiente recorrido para una curva.</div>;
  }
  const W = 620;
  const H = height;
  const pad = 10;
  const max = Math.max(...values, 1);
  const dx = (W - pad * 2) / (values.length - 1);
  const xy = values.map((p, i) => [pad + i * dx, H - pad - (p / max) * (H - pad * 2)] as const);
  const line = xy.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1]).join(' ');
  const area = `${line} L${xy[xy.length - 1][0]} ${H - pad} L${xy[0][0]} ${H - pad} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="nido-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--clay)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--clay)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#nido-area)" />
      <path d={line} fill="none" stroke="var(--clay)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const INSIGHT_TONE: Record<Insight['type'], { bg: string; border: string; ink: string; accent: string; Icon: React.FC }> = {
  positive: { bg: 'var(--pine-tint)', border: '#bcd0bf', ink: 'var(--pine-2)', accent: 'var(--pine)', Icon: Icon.check },
  warning: { bg: 'var(--honey-tint)', border: '#e6d3a0', ink: '#7a5512', accent: 'var(--honey)', Icon: Icon.info },
  tip: { bg: 'var(--clay-tint)', border: '#e6c6b8', ink: 'var(--clay-2)', accent: 'var(--clay)', Icon: Icon.spark },
};

export const Analytics: React.FC = () => {
  const { activeContext, setActiveContext } = useContextSelector();
  const isMobile = useIsMobile();
  const [showAllCats, setShowAllCats] = useState(false);

  const loadCyclesFn = useCallback(async () => {
    const data = await Api.listCycles();
    return Array.isArray(data) ? data : [];
  }, []);
  const { data: cyclesData } = useResource<CycleSummary[]>(loadCyclesFn, { invalidationKey: CACHE_KEYS.cycles });
  const cycles = cyclesData ?? [];
  const [cycleIndex, setCycleIndex] = useState(0);
  const currentCycle = cycles.length > 0 ? cycles[Math.min(cycleIndex, cycles.length - 1)] : null;

  const loadAnalyticsFn = useCallback(async () => {
    const params: { context: string; start_date?: string; end_date?: string } = { context: activeContext };
    if (currentCycle?.start_date) {
      params.start_date = currentCycle.start_date;
      if (currentCycle.end_date) params.end_date = currentCycle.end_date;
    }
    return Api.getAnalytics(params);
  }, [activeContext, currentCycle?.id, currentCycle?.start_date, currentCycle?.end_date]);
  const { data: analyticsRaw, loading, error, reload } = useResource(loadAnalyticsFn, {
    fallbackMessage: 'Error al cargar analíticas',
    invalidationKeys: [CACHE_KEYS.expenses, CACHE_KEYS.budget, CACHE_KEYS.categories],
  });
  const analytics = analyticsRaw as any;

  const kpis: Kpis = useMemo(() => {
    const k = analytics?.kpis ?? {};
    return {
      totalSpent: num(k.totalSpent),
      netSavings: num(k.netSavings),
      avgTicket: num(k.avgTicket),
      totalExpenses: num(k.totalExpenses),
      vsPrevPeriod: num(k.vsPrevPeriod),
    };
  }, [analytics]);

  const categories: CatRow[] = useMemo(() => {
    const list = Array.isArray(analytics?.categories) ? analytics.categories : [];
    return list
      .map((c: any) => ({
        name: c.name ?? c.category ?? 'Otros',
        amount: num(c.amount ?? c.total),
        pct: num(c.pct),
        color: c.color ?? 'var(--clay)',
        emoji: c.emoji ?? '📂',
        budget: num(c.budget),
      }))
      .sort((a: CatRow, b: CatRow) => b.amount - a.amount);
  }, [analytics]);

  const insights: Insight[] = useMemo(() => {
    const list = Array.isArray(analytics?.insights) ? analytics.insights : [];
    return list.map((i: any) => ({ type: (i.type ?? 'tip') as Insight['type'], message: i.message ?? String(i) }));
  }, [analytics]);

  // The backend returns per-day totals (`daily`); the mockup's chart is the
  // running total ("Gasto acumulado"), so accumulate real daily spend.
  const chartValues: number[] = useMemo(() => {
    const series = Array.isArray(analytics?.daily) ? analytics.daily : [];
    let acc = 0;
    return series.map((p: any) => { acc += num(p.total ?? p.value); return acc; });
  }, [analytics]);

  // derived calm-overspend metric (real): sum of per-category overspend
  const overspend = useMemo(() => {
    let sum = 0; let count = 0;
    for (const c of categories) {
      if (c.budget > 0 && c.amount > c.budget) { sum += c.amount - c.budget; count += 1; }
    }
    return { sum, count };
  }, [categories]);

  const hasData = !loading && !error && kpis.totalExpenses > 0;

  const cycleLabel = currentCycle?.start_date
    ? (cycleIndex === 0 && currentCycle.status === 'active' ? 'Ciclo actual' : formatCycleLabel(currentCycle.start_date))
    : 'Ciclo actual';
  const cycleRange = currentCycle?.start_date
    ? formatCycleRange(currentCycle.start_date, currentCycle.end_date ?? new Date().toISOString().slice(0, 10))
    : '';

  const cycleNav = (
    <div className="seg" style={{ padding: 4, ...(isMobile ? { width: '100%' } : null) }}>
      <button type="button" onClick={() => setCycleIndex((i) => Math.min(cycles.length - 1, i + 1))} disabled={cycleIndex >= cycles.length - 1} style={{ padding: '8px 12px', opacity: cycleIndex >= cycles.length - 1 ? 0.35 : 1 }} aria-label="Ciclo anterior"><Icon.back /></button>
      <button type="button" className="on" style={{ flex: isMobile ? 1 : undefined, justifyContent: 'center', gap: 8 }}>
        <Icon.cal /><span>{cycleLabel}</span>{!isMobile && cycleRange ? <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>· {cycleRange}</span> : null}
      </button>
      <button type="button" onClick={() => setCycleIndex((i) => Math.max(0, i - 1))} disabled={cycleIndex <= 0} style={{ padding: '8px 12px', opacity: cycleIndex <= 0 ? 0.35 : 1 }} aria-label="Ciclo siguiente"><Icon.fwd /></button>
    </div>
  );

  const header = (
    <div style={{ marginBottom: isMobile ? 14 : 20 }}>
      <h1 className={isMobile ? 'serif' : 'ptitle'} style={isMobile ? { fontSize: 26, lineHeight: 1 } : undefined}>Analítica</h1>
      <div className="psub" style={isMobile ? { fontSize: 12, marginTop: 2 } : undefined}>Cómo se mueve el dinero del nido</div>
    </div>
  );

  const navRow = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: isMobile ? 12 : 18, flexWrap: 'wrap' }}>
      {cycleNav}
      <Seg value={activeContext} options={CONTEXT_SEG_OPTIONS} onChange={setActiveContext} full={isMobile} />
    </div>
  );

  if (loading) {
    return (
      <>
        {header}{navRow}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="card" style={{ height: 92, opacity: 0.5 - i * 0.08 }} />)}
        </div>
        <div className="card" style={{ height: 320, opacity: 0.4 }} />
      </>
    );
  }

  if (error) {
    return (<>{header}{navRow}<ErrorView message={error} onRetry={reload} /></>);
  }

  if (!hasData) {
    return (
      <>
        {header}{navRow}
        <Card pad style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 15, color: 'var(--ink-2)', fontWeight: 600, marginBottom: 4 }}>Aún no hay datos para este ciclo</div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>Cuando registréis gastos, aquí veréis en qué se va el dinero.</div>
        </Card>
      </>
    );
  }

  const kpiCards = [
    { label: 'Total gastado', value: formatMoney(kpis.totalSpent), sub: kpis.vsPrevPeriod === 0 ? 'igual que el anterior' : `${kpis.vsPrevPeriod > 0 ? '+' : ''}${kpis.vsPrevPeriod}% vs anterior`, color: 'var(--ink)' },
    overspend.sum > 0
      ? { label: 'Sobre presupuesto', value: formatMoney(overspend.sum), sub: `en ${overspend.count} ${overspend.count === 1 ? 'categoría' : 'categorías'}`, color: 'var(--honey)' }
      : { label: 'Ahorro neto', value: formatMoney(Math.max(0, kpis.netSavings)), sub: 'disponible', color: 'var(--pine-2)' },
    { label: 'Ticket medio', value: formatMoney(kpis.avgTicket), sub: 'por gasto', color: 'var(--ink)' },
    { label: 'Nº de gastos', value: String(kpis.totalExpenses), sub: 'este ciclo', color: 'var(--ink)' },
  ];

  const insightStrip = insights.length > 0 ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {insights.map((ins, i) => {
        const tone = INSIGHT_TONE[ins.type] ?? INSIGHT_TONE.tip;
        const TIcon = tone.Icon;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '13px 15px', borderRadius: 14, background: tone.bg, border: `1px solid ${tone.border}` }}>
            <span style={{ color: tone.accent, flex: '0 0 auto', marginTop: 1, display: 'flex' }}><TIcon /></span>
            <div style={{ fontSize: 13, color: tone.ink, lineHeight: 1.4 }}>{ins.message}</div>
          </div>
        );
      })}
    </div>
  ) : null;

  const kpiGrid = (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
      {kpiCards.map((kpi, i) => (
        <Card key={i} style={{ padding: '15px 16px' }}>
          <Eyebrow style={{ fontSize: 10.5 }}>{kpi.label}</Eyebrow>
          <div style={{ fontSize: isMobile ? 24 : 26, fontWeight: 700, marginTop: 5, color: kpi.color }}>{kpi.value}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>{kpi.sub}</div>
        </Card>
      ))}
    </div>
  );

  const donutCard = (
    <Card pad style={{ padding: '18px 20px' }}>
      <h3 className="serif" style={{ fontSize: 20, marginBottom: 6 }}>Por categoría</h3>
      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 6 }}>
        <Donut
          slices={categories.map((c) => ({ pct: c.pct, color: c.color }))}
          centerValue={formatMoney(kpis.totalSpent)}
          centerLabel={cycleIndex === 0 ? 'este ciclo' : cycleLabel.toLowerCase()}
        />
      </div>
      <div>
        {categories.slice(0, showAllCats ? undefined : 5).map((c, i) => (
          <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, flex: '0 0 auto' }} />
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{c.name}</span>
            <span style={{ fontSize: 12.5, color: 'var(--ink-3)', minWidth: 34, textAlign: 'right' }}>{c.pct}%</span>
            <span style={{ fontSize: 13.5, fontWeight: 700, minWidth: 56, textAlign: 'right' }}>{formatMoney(c.amount)}</span>
          </div>
        ))}
        {categories.length > 5 ? (
          <button type="button" onClick={() => setShowAllCats((v) => !v)} style={{ marginTop: 10, background: 'none', border: 0, color: 'var(--clay)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>
            {showAllCats ? 'Ver menos' : `Ver todas (${categories.length})`}
          </button>
        ) : null}
      </div>
    </Card>
  );

  const whereCard = (
    <Card pad style={{ padding: '18px 20px' }}>
      <h3 className="serif" style={{ fontSize: 20, marginBottom: 14 }}>Dónde se va el dinero</h3>
      {categories.slice(0, 6).map((c) => {
        const widthPct = categories[0]?.amount > 0 ? (c.amount / categories[0].amount) * 100 : 0;
        return (
          <div key={c.name} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
              <CatIcon color={c.color} bg={`${c.color}1A`} size={24} radius={7}><span style={{ fontSize: 13 }}>{c.emoji}</span></CatIcon>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{c.name}</span>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{formatMoney(c.amount)}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)', minWidth: 34, textAlign: 'right' }}>{c.pct}%</span>
            </div>
            <Bar pct={widthPct} color={c.color} thin />
          </div>
        );
      })}
    </Card>
  );

  const trendCard = (
    <Card pad style={{ padding: '18px 20px' }}>
      <h3 className="serif" style={{ fontSize: 20, marginBottom: 2 }}>Gasto acumulado</h3>
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 12 }}>
        {cycleRange ? `${cycleRange} · ` : ''}<b style={{ color: 'var(--pine-2)' }}>{formatMoney(kpis.totalSpent)}</b>
      </div>
      <AreaChart values={chartValues} />
    </Card>
  );

  return (
    <>
      {header}
      {navRow}
      {insightStrip}
      {kpiGrid}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {donutCard}
          {whereCard}
          {trendCard}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20, alignItems: 'start' }}>
            {donutCard}
            {whereCard}
          </div>
          {trendCard}
        </>
      )}
    </>
  );
};
