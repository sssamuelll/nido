import React from 'react';
import { Pencil, Utensils, ShoppingCart, Zap, Smile, TrendingUp, MoreHorizontal } from 'lucide-react';

const CATEGORY_ICON_MAP: Record<string, React.FC<{ size?: number; color?: string }>> = {
  Restaurant: Utensils,
  Supermercado: ShoppingCart,
  Servicios: Zap,
  Ocio: Smile,
  'Inversión': TrendingUp,
  Otros: MoreHorizontal,
};

interface BudgetCapsuleProps {
  emoji: string;
  categoryName: string;
  current: number;
  max: number;
  gradientColors?: [string, string];
  onEdit?: () => void;
}

export const BudgetCapsule: React.FC<BudgetCapsuleProps> = ({
  emoji,
  categoryName,
  current,
  max,
  gradientColors = ['#8bdc6b', '#6bc98b'],
  onEdit,
}) => {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  const isWarning = pct > 90;

  const IconComponent = CATEGORY_ICON_MAP[categoryName] ?? MoreHorizontal;
  const iconColor = gradientColors[0];
  const iconBg = iconColor + '1A'; // 10% opacity hex suffix

  return (
    <div className={`budget-capsule ${isWarning ? 'budget-capsule--warning' : ''}`}>
      <div className="icon-c" style={{ background: iconBg }}>
        <IconComponent size={18} color={iconColor} />
      </div>
      <div className="budget-capsule__info">
        <div className="budget-capsule__top-row">
          <span className="budget-capsule__name">{categoryName}</span>
          <span className="budget-capsule__amounts">
            &euro;{current.toLocaleString('de-DE')} / &euro;{max.toLocaleString('de-DE')}
          </span>
          <span className={`budget-capsule__pct ${isWarning ? 'budget-capsule__pct--warning' : ''}`}>
            {pct}%
          </span>
        </div>
        <div className="budget-capsule__track">
          <div
            className={`budget-capsule__fill ${isWarning ? 'budget-capsule__fill--warning' : ''}`}
            style={{
              '--progress-width': `${Math.min(pct, 100)}%`,
              '--gradient-start': isWarning ? '#e87c7c' : gradientColors[0],
              '--gradient-end': isWarning ? '#F08080' : gradientColors[1],
              background: isWarning ? undefined : gradientColors[0],
              boxShadow: isWarning ? undefined : `0 0 8px ${gradientColors[0]}`,
            } as React.CSSProperties}
          />
        </div>
      </div>
      {onEdit && <button className="budget-capsule__edit" onClick={onEdit}><Pencil size={14} /></button>}
    </div>
  );
};
