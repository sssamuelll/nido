import React from 'react';
import { CategoryIcon } from './CategoryIcon';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Expense {
  id: number;
  description: string;
  amount: number;
  category: string;
  date: string;
  paid_by: string;
  type: string;
  status: string;
  created_at: string;
}

interface ExpenseCardProps {
  expense: Expense;
  onClick?: () => void;
  onDelete?: () => void;
}

export const ExpenseCard: React.FC<ExpenseCardProps> = ({ 
  expense, 
  onClick,
  onDelete 
}) => {
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, 'dd MMM', { locale: es });
    } catch {
      return dateString;
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && confirm('¿Eliminar este gasto?')) {
      onDelete();
    }
  };

  return (
    <div className="expense-item" onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
        <CategoryIcon category={expense.category} className="text-xl" />
        <div className="expense-info">
          <div className="expense-description">{expense.description}</div>
          <div className="expense-meta">
            <span>{formatDate(expense.date)}</span>
            <span>{expense.paid_by === 'samuel' ? '👨‍💻 Samuel' : '👩‍🎨 María'}</span>
            <span className={expense.type === 'shared' ? 'text-accent' : 'text-secondary'}>
              {expense.type === 'shared' ? 'Compartido' : 'Personal'}
            </span>
          </div>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div className="expense-amount">€{expense.amount.toFixed(2)}</div>
        {onDelete && (
          <button
            onClick={handleDelete}
            className="btn-ghost"
            style={{ 
              padding: '0.25rem', 
              minHeight: '32px',
              width: '32px',
              fontSize: '1rem'
            }}
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
};