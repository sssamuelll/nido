import React from 'react';

interface Segment {
  label: string;
  value: number;
  color: string;
  icon?: string;
}

interface DonutChartProps {
  segments: Segment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Restaurant': '#ff8c6b',
  'Gastos': '#7cb5e8',
  'Servicios': '#c4a0e8',
  'Ocio': '#e87ca0',
  'Inversión': '#a6c79c',
  'Otros': '#a89e94',
};

export const getColorForCategory = (cat: string) => CATEGORY_COLORS[cat] || '#6b7280';

export const DonutChart: React.FC<DonutChartProps> = ({
  segments,
  size = 160,
  strokeWidth = 20,
  centerLabel,
  centerValue,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <div className="donut-chart" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={strokeWidth}
          />
        </svg>
      </div>
    );
  }

  let accumulatedOffset = 0;

  return (
    <div className="donut-chart" style={{ width: size, height: size, position: 'relative' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={strokeWidth}
        />
        {/* Segments */}
        {segments.filter(s => s.value > 0).map((segment, i) => {
          const pct = segment.value / total;
          const dashLength = pct * circumference;
          const gap = circumference - dashLength;
          const offset = accumulatedOffset;
          accumulatedOffset += dashLength;

          return (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength - 2} ${gap + 2}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              className="donut-segment"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          );
        })}
      </svg>
      {/* Center text */}
      {(centerLabel || centerValue) && (
        <div className="donut-center">
          {centerValue && <div className="donut-center-value">{centerValue}</div>}
          {centerLabel && <div className="donut-center-label">{centerLabel}</div>}
        </div>
      )}
    </div>
  );
};

interface DonutLegendProps {
  segments: Segment[];
  total: number;
}

export const DonutLegend: React.FC<DonutLegendProps> = ({ segments, total }) => {
  return (
    <div className="donut-legend">
      {segments.filter(s => s.value > 0).map((segment, i) => (
        <div key={i} className="donut-legend-item">
          <div className="donut-legend-dot" style={{ background: segment.color }} />
          <span className="donut-legend-label">{segment.icon} {segment.label}</span>
          <span className="donut-legend-value">€{segment.value.toFixed(0)}</span>
          <span className="donut-legend-pct">{total > 0 ? Math.round((segment.value / total) * 100) : 0}%</span>
        </div>
      ))}
    </div>
  );
};
