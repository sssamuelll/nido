import React from 'react';
import { BudgetBar } from './BudgetBar';

interface PersonalCardProps {
  currentUser: string;
  spent: number;
  budget: number;
}

export const PersonalCard: React.FC<PersonalCardProps> = ({ currentUser, spent, budget }) => {
  const name = currentUser === 'samuel' ? 'Samuel' : 'María';
  const emoji = currentUser === 'samuel' ? '👨‍💻' : '👩‍🎨';
  const remaining = budget - spent;

  return (
    <div className="personal-card">
      <div className="personal-card-header">
        <div className="personal-card-avatar">{emoji}</div>
        <div>
          <div className="personal-card-title">Tu espacio, {name}</div>
          <div className="personal-card-subtitle">Gastos personales de este mes</div>
        </div>
      </div>

      <div className="personal-card-stats">
        <div className="personal-stat">
          <span className="personal-stat-value">€{spent.toFixed(2)}</span>
          <span className="personal-stat-label">gastado</span>
        </div>
        <div className="personal-stat-divider" />
        <div className="personal-stat">
          <span className={`personal-stat-value ${remaining >= 0 ? 'text-success' : 'text-error'}`}>
            €{Math.abs(remaining).toFixed(2)}
          </span>
          <span className="personal-stat-label">{remaining >= 0 ? 'disponible' : 'excedido'}</span>
        </div>
      </div>

      <BudgetBar title="" spent={spent} budget={budget} showRemaining={false} />
    </div>
  );
};
