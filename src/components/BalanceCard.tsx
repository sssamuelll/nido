import React from 'react';
import { OWNER_THEMES, type BalanceData } from '../types';

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
  sparkline,
  className = '',
  onClick,
  ariaLabel,
}) => {
  const theme = OWNER_THEMES[owner];
  const maxBar = Math.max(...sparkline, 1);
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
        €{balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
      </div>

      <div className="balance-card__change">
        {monthChange >= 0 ? '↑ +' : '↓ '}€{Math.abs(monthChange).toLocaleString('es-ES')} este mes
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

      <div className="balance-card__sparkline">
        {sparkline.map((v, i) => {
          const isLast = i === sparkline.length - 1;
          const isSecondLast = i === sparkline.length - 2;
          return (
            <div
              key={i}
              className={`balance-card__spark-bar ${isLast ? 'balance-card__spark-bar--current' : isSecondLast ? 'balance-card__spark-bar--prev' : ''}`}
              style={{ '--bar-height': `${(v / maxBar) * 100}%` } as React.CSSProperties}
            />
          );
        })}
      </div>
    </TagName>
  );
};
