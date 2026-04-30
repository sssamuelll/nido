import React from 'react';
import { OWNER_THEMES, type BalanceData } from '../types';
import { formatMoneyExact } from '../lib/money';

interface BalanceCardProps extends BalanceData {
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
  owner,
  name,
  avatar,
  balance,
  monthChange,
  progress,
  className = '',
  onClick,
  ariaLabel,
}) => {
  const theme = OWNER_THEMES[owner];
  const TagName = onClick ? 'button' : 'div';

  return (
    <TagName
      className={`balance-card balance-card--${owner} ${onClick ? 'balance-card--interactive' : ''} ${className}`}
      onClick={onClick}
      aria-label={ariaLabel}
      type={onClick ? 'button' : undefined}
      style={{
        '--card-gradient': theme.gradientDiag,
        '--card-glow': theme.glow,
        '--card-dot': theme.dot,
      } as React.CSSProperties}
    >
      <div className="balance-card__header">
        <div className="balance-card__owner">
          <div
            className="balance-card__dot"
            style={{ 
              '--theme-dot': theme.dot,
              '--theme-dot-glow': `${theme.dot}80`
            } as React.CSSProperties}
          />
          <span className="balance-card__name">{name}</span>
        </div>
        <span className="balance-card__avatar">{avatar}</span>
      </div>

      <div className="balance-card__amount">
        {formatMoneyExact(balance)}
      </div>

      <div className="balance-card__change">
        {monthChange >= 0 ? '↑ +' : '↓ '}{formatMoneyExact(Math.abs(monthChange))} este ciclo
      </div>

      <div className="balance-card__progress">
        <div className="balance-card__progress-track">
          <div
            className="balance-card__progress-fill"
            style={{ '--progress-width': `${Math.min(progress, 100)}%` } as React.CSSProperties}
          />
        </div>
        <span className="balance-card__progress-label">{progress}%</span>
      </div>

      <div className="balance-card__accent" style={{ background: theme.base, boxShadow: `0 0 8px ${theme.glow}` }} />
    </TagName>
  );
};
