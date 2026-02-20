import React from 'react';

interface DayData {
  day: number;
  amount: number;
}

interface SpendingTrendProps {
  data: DayData[];
  height?: number;
}

export const SpendingTrend: React.FC<SpendingTrendProps> = ({ data, height = 80 }) => {
  if (!data.length) return null;

  const maxAmount = Math.max(...data.map(d => d.amount), 1);
  const barWidth = Math.max(4, Math.min(12, (280 / data.length) - 2));
  const totalWidth = data.length * (barWidth + 2);

  return (
    <div className="spending-trend">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${totalWidth} ${height}`}
        preserveAspectRatio="none"
      >
        {data.map((day, i) => {
          const barHeight = (day.amount / maxAmount) * (height - 16);
          const x = i * (barWidth + 2);
          const y = height - barHeight - 8;
          const isToday = day.day === new Date().getDate();

          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 2)}
                rx={barWidth / 2}
                fill={isToday ? '#ff8c6b' : day.amount > 0 ? 'rgba(255, 140, 107, 0.3)' : 'rgba(255,255,255,0.03)'}
                className="trend-bar"
                style={{ animationDelay: `${i * 20}ms` }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
