import React from 'react';
import { type Goal } from '../types';
import { formatMoney } from '../lib/money';

interface GoalCardProps extends Goal {
  onContribute?: () => void;
  onEdit?: () => void;
}

const THEME_COLORS = {
  shared: '#60A5FA',
  personal: '#34D399',
};

export const GoalCard: React.FC<GoalCardProps> = ({
  name,
  icon,
  current,
  target,
  start_date,
  deadline,
  owner_type,
  onContribute,
  onEdit,
}) => {
  const barColor = THEME_COLORS[owner_type] || '#60A5FA';
  const pct = target > 0 ? Math.round((current / target) * 100) : 0;

  return (
    <div className="goal-card">
      <div className="goal-card__header">
        <div className="goal-card__title-row">
          <span className="goal-card__emoji">{icon}</span>
          <span className="goal-card__name-inline">{name}</span>
        </div>
        <div className="goal-card__header-meta">
          <span className="goal-card__pct" style={{ color: barColor }}>
            {pct}%
          </span>
          {onEdit && (
            <button className="goal-card__edit" onClick={onEdit}>···</button>
          )}
        </div>
      </div>

      <div className="goal-card__amounts">
        {formatMoney(current)} / {formatMoney(target)}
      </div>

      <div className="goal-card__track">
        <div
          className="goal-card__track-fill"
          style={{
            '--progress-width': `${Math.min(pct, 100)}%`,
            '--theme-base': barColor,
            background: barColor,
            color: barColor,
          } as React.CSSProperties}
        />
      </div>

      <div className="goal-card__deadline">
        {start_date && deadline
          ? `${start_date} → ${deadline}`
          : start_date
            ? `Desde: ${start_date}`
            : deadline
              ? `Hasta: ${deadline}`
              : 'Sin fecha límite'}
      </div>

      {onContribute && (
        <button
          className="goal-card__contribute-btn btn btn-primary btn-sm"
          onClick={onContribute}
        >
          + Contribuir
        </button>
      )}
    </div>
  );
};
