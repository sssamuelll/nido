import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, LoginPage } from './auth';
import { BottomNav } from './components/BottomNav';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './views/Dashboard';
import { History } from './views/History';
import { Settings } from './views/Settings';
import { AddExpense } from './views/AddExpense';
import './styles/global.css';

const AppRoutes: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const [refreshKey, setRefreshKey] = useState(0);

  // Refresh dashboard when navigating back from /add
  const prevPath = React.useRef(location.pathname);
  React.useEffect(() => {
    if (prevPath.current === '/add' && location.pathname === '/') {
      setRefreshKey(k => k + 1);
    }
    prevPath.current = location.pathname;
  }, [location.pathname]);

  if (isLoading) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="text-center">
            <h1 className="login-title">🏠 Nido</h1>
            <div>Cargando...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
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
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
};

export default App;
