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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="goal-card__pct" style={{ color: theme.base }}>{pct}%</span>
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
          className="goal-card__fill"
          style={{
            width: `${Math.min(pct, 100)}%`,
            background: `linear-gradient(90deg, ${theme.base}, ${theme.light})`,
          }}
        />
      </div>

      <div className="goal-card__deadline">Proyección: {deadline}</div>

      {onContribute && (
        <button
          className="goal-card__contribute-btn"
          onClick={onContribute}
          style={{
            '--goal-gradient': theme.gradient,
            '--goal-glow': theme.glow,
          } as React.CSSProperties}
        >
          + Contribuir
        </button>
      )}
    </div>
  );
};
