import React from 'react';

interface TransactionRowProps {
  emoji: string;
  name: string;
  payer: string;
  amount: string;
  date: string;
  indicatorColor?: string;
  isPositive?: boolean;
  onDelete?: () => void;
  payerColor?: string;
}

export const TransactionRow: React.FC<TransactionRowProps> = ({
  emoji,
  name,
  payer,
  amount,
  date,
  indicatorColor = '#8bdc6b',
  isPositive = false,
  onDelete,
  payerColor,
}) => {
  return (
    <div
      className="transaction-row"
      style={{ '--indicator-color': indicatorColor } as React.CSSProperties}
    >
      <div className="transaction-row__indicator" />
      <span className="transaction-row__emoji">{emoji}</span>
      <div className="transaction-row__info">
        <span className="transaction-row__name">{name}</span>
        <span className="transaction-row__payer">{payer}</span>
      </div>
      <div className="transaction-row__right">
        <span className={`transaction-row__amount ${isPositive ? 'transaction-row__amount--positive' : ''}`}>
          {amount}
        </span>
        {payer && <span className="transaction-row__payer-badge" style={{ background: payerColor ? `${payerColor}15` : undefined, color: payerColor }}>{payer}</span>}
        <span className="transaction-row__date">{date}</span>
      </div>
      {onDelete && (
        <button className="transaction-row__delete" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
          ×
        </button>
      )}
    </div>
  );
};
