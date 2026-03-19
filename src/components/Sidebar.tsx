import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NavItem } from './NavItem';

const NAV_ITEMS = [
  { icon: 'house', label: 'Dashboard', path: '/' },
  { icon: 'circle-plus', label: 'Nuevo Gasto', path: '/add' },
  { icon: 'chart-no-axes-column', label: 'Analíticas', path: '/analytics' },
  { icon: 'target', label: 'Objetivos', path: '/goals' },
  { icon: 'clock-arrow-up', label: 'Historial', path: '/history' },
];

const BOTTOM_NAV = [
  { icon: 'settings', label: 'Ajustes', path: '/settings' },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      <div className="sidebar__logo">
        <div className="sidebar__logo-icon"><span>N</span></div>
        <span className="sidebar__logo-text">nido</span>
      </div>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.path}
            icon={item.icon}
            label={item.label}
            active={location.pathname === item.path}
            onClick={() => navigate(item.path)}
          />
        ))}
      </nav>

      <div className="sidebar__spacer" />

      <nav className="sidebar__nav sidebar__nav--bottom">
        {BOTTOM_NAV.map((item) => (
          <NavItem
            key={item.path}
            icon={item.icon}
            label={item.label}
            active={location.pathname === item.path}
            onClick={() => navigate(item.path)}
          />
        ))}
      </nav>
    </aside>
  );
};
