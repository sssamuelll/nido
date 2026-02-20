import React from 'react';

interface BudgetBarProps {
  title: string;
  spent: number;
  budget: number;
  showRemaining?: boolean;
  className?: string;
}

export const BudgetBar: React.FC<BudgetBarProps> = ({ 
  title, 
  spent, 
  budget, 
  showRemaining = true,
  className = '' 
}) => {
  const percentage = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const remaining = budget - spent;
  const isOverBudget = spent > budget;

  const getProgressClass = () => {
    if (isOverBudget) return 'danger';
    if (percentage > 80) return 'warning';
    return 'success';
  };

  return (
    <div className={`progress-container ${className}`}>
      <div className="progress-header">
        <span className="font-medium">{title}</span>
        <div className="text-right">
          <div className="font-semibold">€{spent.toFixed(2)} / €{budget.toFixed(2)}</div>
          {showRemaining && (
            <div className={`text-sm ${remaining >= 0 ? 'text-success' : 'text-error'}`}>
              {remaining >= 0 ? `€${remaining.toFixed(2)} restante` : `€${Math.abs(remaining).toFixed(2)} excedido`}
            </div>
          )}
        </div>
      </div>
      <div className="progress-bar">
        <div 
          className={`progress-fill ${getProgressClass()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};