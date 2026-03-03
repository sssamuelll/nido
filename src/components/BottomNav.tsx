import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export const BottomNav: React.FC = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="bottom-nav liquid-glass">
      <div className="nav-container">
        <Link to="/" className={`nav-item ${isActive('/') ? 'active' : ''}`}>
          <div className="nav-icon">🏠</div>
          <div className="nav-label">Inicio</div>
        </Link>

        <Link to="/history" className={`nav-item ${isActive('/history') ? 'active' : ''}`}>
          <div className="nav-icon">📋</div>
          <div className="nav-label">Historial</div>
        </Link>

        <Link to="/settings" className={`nav-item ${isActive('/settings') ? 'active' : ''}`}>
          <div className="nav-icon">⚙️</div>
          <div className="nav-label">Config</div>
        </Link>
      </div>
    </nav>
  );
};
