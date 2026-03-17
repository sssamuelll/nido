import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NavItem } from './NavItem';
import { useAuth } from '../auth';

const NAV_ITEMS = [
  { icon: 'house', label: 'Dashboard', path: '/' },
  { icon: 'lock', label: 'Personal', path: '/personal' },
  { icon: 'circle-plus', label: 'Añadir Gasto', path: '/add' },
  { icon: 'chart-no-axes-column', label: 'Analíticas', path: '/analytics' },
  { icon: 'target', label: 'Objetivos', path: '/goals' },
];

const SECONDARY_NAV = [
  { icon: 'clock-arrow-up', label: 'Historial', path: '/history' },
  { icon: 'settings', label: 'Configuración', path: '/settings' },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

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

      <nav className="sidebar__nav">
        {SECONDARY_NAV.map((item) => (
          <NavItem
            key={item.path}
            icon={item.icon}
            label={item.label}
            active={location.pathname === item.path}
            onClick={() => navigate(item.path)}
          />
        ))}
      </nav>

      <div className="sidebar__profile">
        <div className="sidebar__profile-avatar">
          <span>{user?.username?.slice(0, 2).toUpperCase() || 'NI'}</span>
        </div>
        <div className="sidebar__profile-info">
          <span className="sidebar__profile-name">
            {user?.username === 'samuel' ? 'Samuel' : user?.username === 'maria' ? 'María' : user?.username || 'Usuario'}
          </span>
          <span className="sidebar__profile-sub">Pareja</span>
        </div>
      </div>
    </aside>
  );
};
