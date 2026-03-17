import React from 'react';
import { OWNER_THEMES, type Goal } from '../types';

interface GoalCardProps extends Goal {
  onContribute?: () => void;
  onEdit?: () => void;
}

export const GoalCard: React.FC<GoalCardProps> = ({
  name,
  emoji,
  current,
  target,
  deadline,
  owner,
  onContribute,
  onEdit,
}) => {
  const theme = OWNER_THEMES[owner];
  const pct = target > 0 ? Math.round((current / target) * 100) : 0;

  return (
    <div className="goal-card">
      <div className="goal-card__header">
        <span className="goal-card__emoji">{emoji}</span>
        <div className="goal-card__header-meta">
          <span className="goal-card__pct" style={{ '--theme-base': theme.base } as React.CSSProperties}>{pct}%</span>
          {onEdit && (
            <button className="goal-card__edit" onClick={onEdit}>···</button>
          )}
        </div>
      </div>

      <div className="goal-card__name">{name}</div>

      <div className="goal-card__amounts">
        €{current.toLocaleString('es-ES')} / €{target.toLocaleString('es-ES')}
      </div>

      <div className="goal-card__track">
        <div
          className="goal-card__track-fill"
          style={{
            '--progress-width': `${Math.min(pct, 100)}%`,
            '--theme-base': theme.base,
          } as React.CSSProperties}
        />
      </div>

      <div className="goal-card__deadline">Proyección: {deadline}</div>

      {onContribute && (
        <button
          className="goal-card__contribute-btn btn--dynamic"
          onClick={onContribute}
          style={{
            '--btn-gradient': theme.gradient,
            '--btn-glow': theme.glow,
          } as React.CSSProperties}
        >
          + Contribuir
        </button>
      )}
    </div>
  );
};
