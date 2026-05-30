import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Login } from './views/Login';
import { Setup } from './views/Setup';
import { Invite } from './views/Invite';
import { PinPage } from './views/PinPage';
import { ConnectionBanner } from './components/ConnectionBanner';
import { LoadingScreen } from './components/LoadingScreen';
import { NidoShell } from './components/nido/NidoShell';
import { useIsMobile } from './hooks/useMediaQuery';
import { Dashboard } from './views/Dashboard';
import { History } from './views/History';
import { Settings } from './views/Settings';
import { AddExpense } from './views/AddExpense';
import { Analytics } from './views/Analytics';
import { Goals } from './views/Goals';
import { EventDetail } from './views/EventDetail';
import './styles/nido.css';
import './styles/nido-modals.css';

/* The toast host: showToast() writes into #global-toast / #global-toast-msg,
   so this markup must be present in every layout branch. */
const GlobalToast: React.FC = () => (
  // Wrapped in `.nido nido-portal` so the `.nido .toast` paper rules apply
  // (global.css is gone) without the 100vh min-height injecting a phantom band.
  // The icon SVGs are inert — `.nido .toast-icon { display:none }` hides them;
  // the paper toast reads as a calm text pill with a left accent per variant.
  <div className="nido nido-portal">
    <div className="toast" id="global-toast">
      <span id="global-toast-msg"></span>
    </div>
  </div>
);

const AppRoutes: React.FC = () => {
  const { isAuthenticated, isLocked, isLoading } = useAuth();
  const location = useLocation();
  const isMobileViewport = useIsMobile();
  const [refreshKey, setRefreshKey] = useState(0);

  const prevPath = React.useRef(location.pathname);
  React.useEffect(() => {
    if (prevPath.current === '/add' && location.pathname === '/') {
      setRefreshKey(k => k + 1);
    }
    prevPath.current = location.pathname;
  }, [location.pathname]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (location.pathname === '/setup') {
    return <Setup />;
  }

  if (location.pathname.startsWith('/invite/')) {
    return <Invite />;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  if (isLocked) {
    return <PinPage />;
  }

  // Redesigned routes render the warm paper UI and skip the legacy glass chrome.
  // Un-migrated routes keep Sidebar/BottomNav. This grows one screen per PR
  // until the cutover, when the glass branch below is deleted.
  //
  // Inicio uses the shared NidoShell (rail + tab bar). Nuevo gasto is a stacked
  // screen that brings its own chrome (rail on desktop, no tab bar on mobile),
  // so it renders bare.
  if (location.pathname === '/') {
    return (
      <>
        <NidoShell active="home">
          <Dashboard key={refreshKey} />
        </NidoShell>
        <div id="confetti-container" className="confetti-container" />
        <GlobalToast />
      </>
    );
  }

  if (location.pathname === '/add') {
    return (
      <>
        <AddExpense />
        <div id="confetti-container" className="confetti-container" />
        <GlobalToast />
      </>
    );
  }

  if (location.pathname === '/history') {
    return (
      <>
        <NidoShell active="hist">
          <History key={refreshKey} />
        </NidoShell>
        <div id="confetti-container" className="confetti-container" />
        <GlobalToast />
      </>
    );
  }

  if (location.pathname === '/analytics') {
    return (
      <>
        <NidoShell active="chart">
          <Analytics />
        </NidoShell>
        <div id="confetti-container" className="confetti-container" />
        <GlobalToast />
      </>
    );
  }

  if (location.pathname === '/goals') {
    return (
      <>
        <NidoShell active="goals">
          <Goals />
        </NidoShell>
        <div id="confetti-container" className="confetti-container" />
        <GlobalToast />
      </>
    );
  }

  // Configuración: stacked screen (own back-arrow header). On desktop it still
  // sits inside the rail; on mobile it brings its own chrome and no tab bar.
  if (location.pathname === '/settings') {
    return (
      <>
        {isMobileViewport ? <Settings /> : <NidoShell active="set"><Settings /></NidoShell>}
        <div id="confetti-container" className="confetti-container" />
        <GlobalToast />
      </>
    );
  }

  // Event detail: dynamic route, brings its own chrome (rail on desktop, bare
  // back-arrow screen on mobile), like Nuevo gasto.
  if (location.pathname.startsWith('/events/')) {
    return (
      <>
        <EventDetail />
        <div id="confetti-container" className="confetti-container" />
        <GlobalToast />
      </>
    );
  }

  // Every real route is handled by a redesigned branch above. Anything left
  // (/personal, unknown paths) redirects home. The legacy glass shell
  // (MeshBackground/Sidebar/BottomNav) is gone.
  return <Navigate to="/" replace />;
};

const App: React.FC = () => {
  useEffect(() => {
    const saved = localStorage.getItem('nido-theme');
    if (saved === 'light') {
      document.documentElement.classList.add('light');
    }
  }, []);

  return (
    <AuthProvider>
      <ConnectionBanner />
      <Router>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/invite/:token" element={<Invite />} />
          <Route path="*" element={<AppRoutes />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
