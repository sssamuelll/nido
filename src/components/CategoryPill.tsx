import React from 'react';

interface CategoryPillProps {
  emoji: string;
  name: string;
  active?: boolean;
  onClick?: () => void;
}

export const CategoryPill: React.FC<CategoryPillProps> = ({
  emoji,
  name,
  active = false,
  onClick,
}) => {
  return (
    <button
      className={`category-pill ${active ? 'category-pill--active' : ''}`}
      onClick={onClick}
    >
      <span className="category-pill__emoji">{emoji}</span>
      <span className="category-pill__name">{name}</span>
    </button>
  );
};
