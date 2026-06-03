import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/common/Toast';
import LoginPage from './components/LoginPage';
import ValidatorPage from './components/ValidatorPage';
import HistoryPage from './components/HistoryPage';
import Header from './components/Header';
import { Page } from './types';
import DatabasePage from './components/DatabasePage';
import AdminPage from './components/AdminPage';

const AppContent: React.FC = () => {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>(Page.VALIDATOR);

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-dvh bg-[#F4F6FA] overflow-x-hidden" style={{ paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}>
      <Header currentPage={currentPage} setCurrentPage={setCurrentPage} />
      {/* key on currentPage so each tab switch replays a subtle entrance — spatial continuity.
          `main-content` (defined in index.html) adds bottom padding on mobile to clear the
          fixed bottom nav + safe-area, so the last element stays reachable; md+ has no nav. */}
      <main
        key={currentPage}
        className="main-content px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 animate-page-in"
      >
        {currentPage === Page.VALIDATOR && <ValidatorPage />}
        {currentPage === Page.DATABASE && <DatabasePage />}
        {currentPage === Page.HISTORY && <HistoryPage />}
        {currentPage === Page.ADMIN && user.role === 'admin' && <AdminPage />}
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
