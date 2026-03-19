import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NavItem } from './NavItem';

/* Exact SVG icons from the design reference (Heroicons outline style) */
const IconDashboard = <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} width={22} height={22}><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" /></svg>;
const IconAdd = <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} width={22} height={22}><circle cx="12" cy="12" r="10" /><path d="M12 8v8m-4-4h8" /></svg>;
const IconAnalytics = <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} width={22} height={22}><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m6 0h2m-2 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
const IconGoals = <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} width={22} height={22}><path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>;
const IconHistory = <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} width={22} height={22}><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const IconSettings = <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} width={22} height={22}><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></svg>;

const NAV_ITEMS = [
  { icon: IconDashboard, label: 'Dashboard', path: '/' },
  { icon: IconAdd, label: 'Nuevo Gasto', path: '/add' },
  { icon: IconAnalytics, label: 'Analíticas', path: '/analytics' },
  { icon: IconGoals, label: 'Objetivos', path: '/goals' },
  { icon: IconHistory, label: 'Historial', path: '/history' },
];

const BOTTOM_NAV = [
  { icon: IconSettings, label: 'Ajustes', path: '/settings' },
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
