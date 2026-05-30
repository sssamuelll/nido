import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Login } from './views/Login';
import { Setup } from './views/Setup';
import { Invite } from './views/Invite';
import { PinPage } from './views/PinPage';
import { BottomNav } from './components/BottomNav';
import { Sidebar } from './components/Sidebar';
import { MeshBackground } from './components/MeshBackground';
import { ConnectionBanner } from './components/ConnectionBanner';
import { LoadingScreen } from './components/LoadingScreen';
import { NidoShell } from './components/nido/NidoShell';
import { Dashboard } from './views/Dashboard';
import { History } from './views/History';
import { Settings } from './views/Settings';
import { AddExpense } from './views/AddExpense';
import { Analytics } from './views/Analytics';
import { Goals } from './views/Goals';
import { EventDetail } from './views/EventDetail';
import './styles/global.css';
import './styles/nido.css';

/* The toast host: showToast() writes into #global-toast / #global-toast-msg,
   so this markup must be present in every layout branch. */
const GlobalToast: React.FC = () => (
  <div className="toast" id="global-toast">
    <div className="toast-icon">
      <svg className="toast-icon__svg toast-icon__svg--success" width="16" height="16" fill="none" stroke="#34D399" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
      <svg className="toast-icon__svg toast-icon__svg--error" width="16" height="16" fill="none" stroke="#F87171" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      <svg className="toast-icon__svg toast-icon__svg--info" width="16" height="16" fill="none" stroke="#60A5FA" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></svg>
    </div>
    <span id="global-toast-msg"></span>
  </div>
);

const AppRoutes: React.FC = () => {
  const { isAuthenticated, isLocked, isLoading } = useAuth();
  const location = useLocation();
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

  const isAddView = location.pathname === '/add';

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

  return (
    <>
    <MeshBackground />
    <div className="app-layout">
      <Sidebar />
      <div className="content-area" key={location.pathname}>
        <Routes>
          <Route path="/" element={<Dashboard key={refreshKey} />} />
          <Route path="/personal" element={<Navigate to="/" replace />} />
          <Route path="/history" element={<History key={refreshKey} />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/add" element={<AddExpense />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {!isAddView && <BottomNav />}
    </div>
    <div id="confetti-container" className="confetti-container" />
    <GlobalToast />
    </>
  );
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
