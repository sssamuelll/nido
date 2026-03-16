import React from 'react';

interface BudgetCapsuleProps {
  emoji: string;
  categoryName: string;
  current: number;
  max: number;
  gradientColors?: [string, string];
}

export const BudgetCapsule: React.FC<BudgetCapsuleProps> = ({
  emoji,
  categoryName,
  current,
  max,
  gradientColors = ['#8bdc6b', '#6bc98b'],
}) => {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  const isWarning = pct > 90;

  return (
    <div className={`budget-capsule ${isWarning ? 'budget-capsule--warning' : ''}`}>
      <span className="budget-capsule__emoji">{emoji}</span>
      <div className="budget-capsule__info">
        <div className="budget-capsule__top-row">
          <span className="budget-capsule__name">{categoryName}</span>
          <span className="budget-capsule__amounts">
            €{current.toLocaleString('de-DE')} / €{max.toLocaleString('de-DE')}
          </span>
          <span className={`budget-capsule__pct ${isWarning ? 'budget-capsule__pct--warning' : ''}`}>
            {pct}%
          </span>
        </div>
        <div className="budget-capsule__track">
          <div
            className={`budget-capsule__fill ${isWarning ? 'budget-capsule__fill--warning' : ''}`}
            style={{
              width: `${Math.min(pct, 100)}%`,
              '--capsule-gradient': isWarning
                ? 'linear-gradient(90deg, #e87c7c, #F08080)'
                : `linear-gradient(90deg, ${gradientColors[0]}, ${gradientColors[1]})`,
            } as React.CSSProperties}
          />
        </div>
      </div>
    </div>
  );
};
