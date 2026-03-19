import React from 'react';
import * as LucideIcons from 'lucide-react';

interface NavItemProps {
  icon: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

const getIcon = (name: string): React.FC<{ size?: number; color?: string }> | null => {
  const pascal = name
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
  return (LucideIcons as any)[pascal] || null;
};

export const NavItem: React.FC<NavItemProps> = ({ icon, label, active = false, onClick }) => {
  const IconComponent = getIcon(icon);

  return (
    <button
      className={`nav-item ${active ? 'nav-item--active' : ''}`}
      onClick={onClick}
    >
      {IconComponent && <IconComponent size={22} />}
      <span className="nav-item__label">{label}</span>
    </button>
  );
};
