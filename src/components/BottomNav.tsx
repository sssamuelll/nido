import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { House, ChartNoAxesColumn, Plus, Target, Clock } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (path: string) => location.pathname === path;
  const context = new URLSearchParams(location.search).get('context');

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        <button
          className={`bottom-nav__item ${isActive('/') && context !== 'personal' ? 'bottom-nav__item--active' : ''}`}
          onClick={() => navigate('/')}
          data-context="shared"
        >
          <House size={22} />
          <span className="bottom-nav__item-label">Inicio</span>
        </button>

        <button
          className={`bottom-nav__item ${isActive('/analytics') ? 'bottom-nav__item--active' : ''}`}
          onClick={() => navigate('/analytics')}
        >
          <ChartNoAxesColumn size={22} />
          <span className="bottom-nav__item-label">Analíticas</span>
        </button>

        <button className="bottom-nav__fab" onClick={() => navigate('/add')}>
          <Plus size={24} />
        </button>

        <button
          className={`bottom-nav__item ${isActive('/history') ? 'bottom-nav__item--active' : ''}`}
          onClick={() => navigate('/history')}
        >
          <Clock size={22} />
          <span className="bottom-nav__item-label">Historial</span>
        </button>

        <button
          className={`bottom-nav__item ${isActive('/goals') ? 'bottom-nav__item--active' : ''}`}
          onClick={() => navigate('/goals')}
        >
          <Target size={22} />
          <span className="bottom-nav__item-label">Objetivos</span>
        </button>
      </div>
    </nav>
  );
};
