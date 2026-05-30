/* NidoShell — the warm app chrome. Desktop: a sticky 84px rail + scrolling
   main. Mobile: full-width content + a fixed tab bar with a centred add
   button. Renders two distinct trees by breakpoint (the prototype ships two
   artboards), so we don't twist one DOM with CSS. Redesigned routes opt into
   this shell from App.tsx; un-migrated routes keep the legacy chrome. */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './icons';
import { useIsMobile } from '../../hooks/useMediaQuery';

interface NavDef {
  key: string;
  path: string;
  label: string;
  Glyph: React.FC;
}

/* Rail order from the prototype: home · add · analytics · goals · history,
   with settings pinned to the bottom. */
const RAIL: NavDef[] = [
  { key: 'home', path: '/', label: 'Inicio', Glyph: Icon.home },
  { key: 'add', path: '/add', label: 'Nuevo gasto', Glyph: Icon.plus },
  { key: 'chart', path: '/analytics', label: 'Analítica', Glyph: Icon.chart },
  { key: 'goals', path: '/goals', label: 'Objetivos', Glyph: Icon.target },
  { key: 'hist', path: '/history', label: 'Historial', Glyph: Icon.clock },
];
const SETTINGS: NavDef = { key: 'set', path: '/settings', label: 'Configuración', Glyph: Icon.gear };

/* Tab bar order from the prototype: home · analytics · [add] · history · goals. */
const TABS_LEFT: NavDef[] = [
  { key: 'home', path: '/', label: 'Inicio', Glyph: Icon.home },
  { key: 'chart', path: '/analytics', label: 'Analítica', Glyph: Icon.chart },
];
const TABS_RIGHT: NavDef[] = [
  { key: 'hist', path: '/history', label: 'Historial', Glyph: Icon.clock },
  { key: 'goals', path: '/goals', label: 'Objetivos', Glyph: Icon.target },
];

const keyForPath = (pathname: string): string => {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/analytics')) return 'chart';
  if (pathname.startsWith('/goals')) return 'goals';
  if (pathname.startsWith('/history')) return 'hist';
  if (pathname.startsWith('/add')) return 'add';
  if (pathname.startsWith('/settings')) return 'set';
  return '';
};

interface NidoShellProps {
  children: React.ReactNode;
  /** Override the active nav key; defaults to the current route. */
  active?: string;
}

export const NidoShell: React.FC<NidoShellProps> = ({ children, active }) => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const activeKey = active ?? keyForPath(location.pathname);

  if (isMobile) {
    return (
      <div className="nido grain">
        <div className="screen-scroll">{children}</div>
        <nav className="tabbar" aria-label="Navegación principal">
          {TABS_LEFT.map(({ key, path, label, Glyph }) => (
            <button
              key={key}
              type="button"
              className={'tab' + (activeKey === key ? ' on' : '')}
              aria-current={activeKey === key ? 'page' : undefined}
              onClick={() => navigate(path)}
            >
              <Glyph />
              {label}
            </button>
          ))}
          <button type="button" className="tab-add" aria-label="Nuevo gasto" onClick={() => navigate('/add')}>
            <Icon.plusS />
          </button>
          {TABS_RIGHT.map(({ key, path, label, Glyph }) => (
            <button
              key={key}
              type="button"
              className={'tab' + (activeKey === key ? ' on' : '')}
              aria-current={activeKey === key ? 'page' : undefined}
              onClick={() => navigate(path)}
            >
              <Glyph />
              {label}
            </button>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className="nido grain">
      <div className="app">
        <nav className="rail" aria-label="Navegación principal">
          <button
            type="button"
            className="rail-logo"
            aria-label="Inicio"
            onClick={() => navigate('/')}
            style={{ border: 0, cursor: 'pointer' }}
          >
            n
          </button>
          {RAIL.map(({ key, path, label, Glyph }) => (
            <button
              key={key}
              type="button"
              className={'rail-ico' + (activeKey === key ? ' on' : '')}
              aria-label={label}
              aria-current={activeKey === key ? 'page' : undefined}
              onClick={() => navigate(path)}
              style={{ border: 0, background: 'none' }}
            >
              <Glyph />
            </button>
          ))}
          <div className="rail-sp" />
          <button
            type="button"
            className={'rail-ico' + (activeKey === SETTINGS.key ? ' on' : '')}
            aria-label={SETTINGS.label}
            aria-current={activeKey === SETTINGS.key ? 'page' : undefined}
            onClick={() => navigate(SETTINGS.path)}
            style={{ border: 0, background: 'none' }}
          >
            <SETTINGS.Glyph />
          </button>
        </nav>
        <main className="main">{children}</main>
      </div>
    </div>
  );
};
