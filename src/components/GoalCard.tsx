import React from 'react';
import { OWNER_THEMES, type Goal } from '../types';

interface GoalCardProps extends Goal {
  onContribute?: () => void;
  onEdit?: () => void;
}

export const GoalCard: React.FC<GoalCardProps> = ({
  name,
  emoji,
  icon,
  iconBg,
  themeColor,
  current,
  target,
  deadline,
  owner,
  onContribute,
  onEdit,
}) => {
  const theme = OWNER_THEMES[owner];
  const pct = target > 0 ? Math.round((current / target) * 100) : 0;
  const barColor = themeColor || theme.base;

  return (
    <div className="goal-card">
      <div className="goal-card__header">
        <div className="goal-card__title-row">
          {icon ? (
            <div className="icon-c" style={{ background: iconBg || theme.glow }}>
              {icon}
            </div>
          ) : (
            <span className="goal-card__emoji">{emoji}</span>
          )}
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
        €{current.toLocaleString('es-ES')} / €{target.toLocaleString('es-ES')}
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

      <div className="goal-card__deadline">Proyección: {deadline}</div>

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
