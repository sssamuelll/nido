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
import { Dashboard } from './views/Dashboard';
import { History } from './views/History';
import { Settings } from './views/Settings';
import { AddExpense } from './views/AddExpense';
import { Analytics } from './views/Analytics';
import { Goals } from './views/Goals';
import { EventDetail } from './views/EventDetail';
import './styles/global.css';

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
    <div className="toast" id="global-toast">
      <div className="toast-icon">
        <svg width="16" height="16" fill="none" stroke="#34D399" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg>
      </div>
      <span id="global-toast-msg"></span>
    </div>
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
