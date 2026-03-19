import React from 'react';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export const NavItem: React.FC<NavItemProps> = ({ icon, label, active = false, onClick }) => {
  return (
    <button
      className={`nav-item ${active ? 'nav-item--active' : ''}`}
      onClick={onClick}
    >
      {icon}
      <span className="nav-item__label">{label}</span>
    </button>
  );
};
