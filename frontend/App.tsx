// Root component. Wraps everything in the theme, toast and auth providers,
// shows a loading screen while a stored sign-in is checked, LoginPage until
// someone signs in, then switches between the Validator, Database, History,
// Analyze and Admin pages with local state (no router). The Admin page renders
// only for admins.

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/common/Toast';
import LoginPage from './components/LoginPage';
import ValidatorPage from './components/ValidatorPage';
import HistoryPage from './components/HistoryPage';
import Header from './components/Header';
import { Page } from './types';
import DatabasePage from './components/DatabasePage';
import AdminPage from './components/AdminPage';
import AnalysisPage from './components/AnalysisPage';

const AppContent: React.FC = () => {
  const { user, isRestoring } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>(Page.VALIDATOR);

  if (isRestoring) {
    return (
      <div className="min-h-dvh bg-[#F4F6FA] flex items-center justify-center" role="status">
        <p className="text-sm font-medium text-slate-500">Signing you in…</p>
      </div>
    );
  }

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
        {currentPage === Page.ANALYSIS && <AnalysisPage />}
        {currentPage === Page.ADMIN && user.role === 'admin' && <AdminPage />}
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default App;
