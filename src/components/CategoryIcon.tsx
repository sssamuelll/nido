import React from 'react';

export const CATEGORIES = [
  { id: 'Restaurant', name: 'Restaurant', icon: '🍽️' },
  { id: 'Gastos', name: 'Gastos', icon: '🛒' },
  { id: 'Servicios', name: 'Servicios', icon: '💡' },
  { id: 'Ocio', name: 'Ocio', icon: '🎉' },
  { id: 'Inversión', name: 'Inversión', icon: '📈' },
  { id: 'Otros', name: 'Otros', icon: '📦' },
];

interface CategoryIconProps {
  category: string;
  className?: string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ category, className = '' }) => {
  const categoryData = CATEGORIES.find(cat => cat.id === category);
  
  if (!categoryData) {
    return <span className={className}>📦</span>;
  }

  return <span className={className}>{categoryData.icon}</span>;
};

interface CategorySelectorProps {
  selectedCategory: string;
  onSelect: (category: string) => void;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({ 
  selectedCategory, 
  onSelect 
}) => {
  return (
    <div className="category-grid">
      {CATEGORIES.map((category) => (
        <button
          key={category.id}
          type="button"
          className={`category-item ${selectedCategory === category.id ? 'active' : ''}`}
          onClick={() => onSelect(category.id)}
        >
          <div className="category-icon">{category.icon}</div>
          <div className="category-name">{category.name}</div>
        </button>
      ))}
    </div>
  );
};