import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">🦋 nido</div>
      </div>
      <nav className="sidebar-nav">
        <Link to="/" className={`sidebar-item ${isActive('/') ? 'active' : ''}`}>
          <div className="sidebar-icon">🏠</div>
          <div className="sidebar-label">Inicio</div>
        </Link>

        <Link to="/history" className={`sidebar-item ${isActive('/history') ? 'active' : ''}`}>
          <div className="sidebar-icon">📋</div>
          <div className="sidebar-label">Historial</div>
        </Link>

        <Link to="/add" className={`sidebar-item ${isActive('/add') ? 'active' : ''}`}>
          <div className="sidebar-icon">➕</div>
          <div className="sidebar-label">Registrar</div>
        </Link>

        <Link to="/settings" className={`sidebar-item ${isActive('/settings') ? 'active' : ''}`}>
          <div className="sidebar-icon">⚙️</div>
          <div className="sidebar-label">Configuración</div>
        </Link>
      </nav>
      <div className="sidebar-footer">
        <div className="text-xs text-muted">v1.0 · Warm Nest</div>
      </div>
    </aside>
  );
};