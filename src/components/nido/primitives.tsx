/* nido/primitives.tsx — reusable building blocks for the warm UI.
   Each maps 1:1 to a class in src/styles/nido.css and passes through
   className/style so screens keep the design's fine-grained inline layout.
   Money is NEVER formatted here — screens pass pre-formatted strings
   (formatMoney / formatMoneyExact) so the céntimos rules in AGENTS.md stay
   centralised in src/lib/money.ts. */
import React from 'react';
import { Cat, type CatName } from './icons';

type DivProps = React.HTMLAttributes<HTMLDivElement>;
type SpanProps = React.HTMLAttributes<HTMLSpanElement>;
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/* ---- surfaces ---- */
export const Card: React.FC<DivProps & { pad?: boolean }> = ({ pad, className, children, ...rest }) => (
  <div className={cx('card', pad && 'card-pad', className)} {...rest}>{children}</div>
);

export const Eyebrow: React.FC<DivProps> = ({ className, children, ...rest }) => (
  <div className={cx('eyebrow', className)} {...rest}>{children}</div>
);

export const DayLabel: React.FC<DivProps> = ({ className, children, ...rest }) => (
  <div className={cx('day-label', className)} {...rest}>{children}</div>
);

/* ---- status pill ---- */
export type PillTone = 'ok' | 'warn' | 'over' | 'mute';
export const Pill: React.FC<SpanProps & { tone?: PillTone }> = ({ tone = 'mute', className, children, ...rest }) => (
  <span className={cx('pill', `pill-${tone}`, className)} {...rest}>{children}</span>
);

/* ---- calm progress bar; overspend is an amber stripe, never red ---- */
export type BarFill = 'pine' | 'honey' | 'clay' | 'berry';
export const Bar: React.FC<{
  pct: number;
  fill?: BarFill;
  over?: boolean;
  thin?: boolean;
  height?: number;
  color?: string;
  faded?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ pct, fill = 'pine', over = false, thin = false, height, color, faded = false, className, style }) => {
  const w = Math.max(0, Math.min(100, pct));
  const fillCls = over ? 'fill-over' : (color ? undefined : `fill-${fill}`);
  return (
    <div className={cx('bar', thin && 'thin', className)} style={{ ...(height ? { height } : null), ...style }}>
      <i className={fillCls} style={{ width: `${w}%`, ...(color && !over ? { background: color } : null), ...(faded ? { opacity: 0.3 } : null) }} />
    </div>
  );
};

/* ---- category icon tile ---- */
export type CatTone = 'clay' | 'pine' | 'honey' | 'plum' | 'berry' | 'ink';
export const CatIcon: React.FC<{
  cat?: CatName;
  icon?: React.FC;
  tone?: CatTone;
  size?: number;
  radius?: number;
  color?: string;
  bg?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Real categories carry an emoji; pass it as children to render in the tile. */
  children?: React.ReactNode;
}> = ({ cat, icon, tone, size, radius, color, bg, className, style, children }) => {
  const I = icon || (cat ? Cat[cat] : null);
  return (
    <div
      className={cx('cat-ico', tone && `ico-${tone}`, className)}
      style={{
        ...(size ? { width: size, height: size } : null),
        ...(radius ? { borderRadius: radius } : null),
        ...(color ? { color } : null),
        ...(bg ? { background: bg } : null),
        ...style,
      }}
    >
      {children != null ? children : I ? <I /> : null}
    </div>
  );
};

/* ---- segmented toggle (compartido / personal and friends) ---- */
export interface SegOption<T extends string> {
  value: T;
  label: React.ReactNode;
  dot?: 'shared' | 'personal';
}
export function Seg<T extends string>({
  value,
  options,
  onChange,
  full = false,
  className,
  style,
}: {
  value: T;
  options: ReadonlyArray<SegOption<T>>;
  onChange?: (value: T) => void;
  full?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cx('seg', className)} style={{ ...(full ? { width: '100%' } : null), ...style }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'on' : undefined}
          onClick={onChange ? () => onChange(o.value) : undefined}
          style={full ? { flex: 1, justifyContent: 'center' } : undefined}
        >
          {o.dot ? <span className={cx('dot', o.dot)} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* The redesign's default context toggle. */
export const CONTEXT_SEG_OPTIONS: ReadonlyArray<SegOption<'shared' | 'personal'>> = [
  { value: 'shared', label: 'Compartido', dot: 'shared' },
  { value: 'personal', label: 'Personal', dot: 'personal' },
];

/* ---- buttons ---- */
export type BtnVariant = 'default' | 'primary' | 'pine' | 'ghost';
export const Btn: React.FC<BtnProps & { variant?: BtnVariant }> = ({ variant = 'default', className, children, type = 'button', ...rest }) => (
  <button type={type} className={cx('btn', variant !== 'default' && `btn-${variant}`, className)} {...rest}>{children}</button>
);

export const IconBtn: React.FC<BtnProps & { badge?: React.ReactNode }> = ({ badge, className, children, type = 'button', ...rest }) => (
  <button type={type} className={cx('icon-btn', className)} {...rest}>
    {children}
    {badge != null ? <span className="badge-dot">{badge}</span> : null}
  </button>
);

/* ---- transaction row pieces ---- */
export const Txn: React.FC<DivProps> = ({ className, children, ...rest }) => (
  <div className={cx('txn', className)} {...rest}>{children}</div>
);

export const Who: React.FC<SpanProps & { mine?: boolean }> = ({ mine, className, children, ...rest }) => (
  <span className={cx('who', mine ? 'you' : 'maria', className)} {...rest}>{children}</span>
);

/* ---- filter chip ---- */
export const FilterChip: React.FC<BtnProps & { on?: boolean; hasIcon?: boolean }> = ({ on, hasIcon, className, children, type = 'button', ...rest }) => (
  <button type={type} className={cx('fchip', hasIcon && 'has-ico', on && 'on', className)} {...rest}>{children}</button>
);

/* ---- small stat card (hero side-cells, mobile stats, analytics 2x2) ---- */
export const StatCard: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueColor?: string;
  card?: boolean;
  className?: string;
  style?: React.CSSProperties;
  valueStyle?: React.CSSProperties;
}> = ({ label, value, sub, valueColor, card = true, className, style, valueStyle }) => {
  const body = (
    <>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 5, ...(valueColor ? { color: valueColor } : null), ...valueStyle }}>{value}</div>
      {sub != null ? <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>{sub}</div> : null}
    </>
  );
  if (!card) return <div className={className} style={style}>{body}</div>;
  return <Card className={className} style={{ padding: '15px 16px', ...style }}>{body}</Card>;
};

/* ---- desktop page header ---- */
export const PageHeader: React.FC<{ title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }> = ({ title, sub, actions }) => (
  <div className="phead">
    <div>
      <h1 className="ptitle">{title}</h1>
      {sub != null ? <div className="psub">{sub}</div> : null}
    </div>
    {actions != null ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{actions}</div> : null}
  </div>
);

/* ---- goal card (shared by desktop + mobile goals) ---- */
export const GoalCard: React.FC<{
  icon: React.FC;
  color: string;
  title: React.ReactNode;
  savedLabel: React.ReactNode;
  targetLabel: React.ReactNode;
  from: React.ReactNode;
  to: React.ReactNode;
  note: React.ReactNode;
  pct: number;
  onContribute?: () => void;
  onMenu?: () => void;
}> = ({ icon: I, color, title, savedLabel, targetLabel, from, to, note, pct, onContribute, onMenu }) => (
  <Card pad>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <CatIcon icon={I} bg={`color-mix(in srgb, ${color} 14%, var(--surface-2))`} color={color} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{from} → {to}</div>
        </div>
      </div>
      <button type="button" onClick={onMenu} aria-label="Opciones del objetivo" style={{ color: 'var(--ink-3)', cursor: 'pointer', background: 'none', border: 0, display: 'flex' }}><IconDots /></button>
    </div>
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 32, fontWeight: 700 }}>{savedLabel}</span>
      <span style={{ color: 'var(--ink-2)', marginBottom: 5 }}>/ {targetLabel}</span>
      <span style={{ marginLeft: 'auto', marginBottom: 5, fontWeight: 700, color }}>{pct}%</span>
    </div>
    <Bar pct={pct} color={color} height={9} />
    <div style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '10px 0 16px' }}>{note}</div>
    <Btn onClick={onContribute} style={{ width: '100%', justifyContent: 'center', borderColor: color, color }}>
      <IconPlusS /> Aportar al bote
    </Btn>
  </Card>
);

/* tiny inline glyphs used by GoalCard so it stays import-light */
const IconDots: React.FC = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></svg>
);
const IconPlusS: React.FC = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
);
