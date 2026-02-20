import React, { useState, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, LoginPage } from './auth';
import { BottomNav } from './components/BottomNav';
import { AddExpenseSheet } from './components/AddExpenseSheet';
import { Dashboard } from './views/Dashboard';
import { History } from './views/History';
import { Settings } from './views/Settings';
import './styles/global.css';

const AppRoutes: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleExpenseSaved = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

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

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Dashboard key={refreshKey} />} />
        <Route path="/history" element={<History key={refreshKey} />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/add" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav onAddClick={() => setShowAddSheet(true)} />
      <AddExpenseSheet
        isOpen={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        onSaved={handleExpenseSaved}
      />
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
