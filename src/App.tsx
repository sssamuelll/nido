import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Login } from './views/Login';
import { AuthCallback } from './views/AuthCallback';
import { PinPage } from './views/PinPage';
import { BottomNav } from './components/BottomNav';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './views/Dashboard';
import { History } from './views/History';
import { Settings } from './views/Settings';
import { AddExpense } from './views/AddExpense';
import { Analytics } from './views/Analytics';
import { Goals } from './views/Goals';
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
    return (
      <div className="loading-screen">
        <div className="loading-screen__logo"><span>N</span></div>
        <div className="loading-screen__text">Cargando...</div>
      </div>
    );
  }

  if (location.pathname === '/auth/confirm' || location.pathname === '/auth/callback') {
    return <AuthCallback />;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  if (isLocked) {
    return <PinPage />;
  }

  const isAddView = location.pathname === '/add';

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="content-area">
        <Routes>
          <Route path="/" element={<Dashboard key={refreshKey} />} />
          <Route path="/history" element={<History key={refreshKey} />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/add" element={<AddExpense />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {!isAddView && <BottomNav />}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/auth/confirm" element={<AuthCallback />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="*" element={<AppRoutes />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
