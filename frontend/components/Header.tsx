import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { Page } from '../types';
import { LogoutIcon } from './icons/LogoutIcon';
import { ValidatorIcon } from './icons/ValidatorIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import { DatabaseIcon } from './icons/DatabaseIcon';
import { AdminIcon } from './icons/AdminIcon';

interface HeaderProps {
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
}

const Header: React.FC<HeaderProps> = ({ currentPage, setCurrentPage }) => {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  const navItems = [
    { page: Page.VALIDATOR, label: 'Validator', Icon: ValidatorIcon },
    { page: Page.DATABASE,  label: 'Database',  Icon: DatabaseIcon },
    { page: Page.HISTORY,   label: 'History',   Icon: HistoryIcon },
    ...(isAdmin ? [{ page: Page.ADMIN, label: 'Admin', Icon: AdminIcon }] : []),
  ];

  return (
    <>
      {/* ── Desktop / Tablet Header ───────────────────────── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <span className="text-base font-bold text-slate-900 hidden sm:block">Validator</span>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
              {navItems.map(({ page, label, Icon }) => {
                const isActive = currentPage === page;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                  >
                    <Icon />
                    <span>{label}</span>
                    {isActive && (
                      <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-blue-600" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* User info + logout */}
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-slate-800 leading-tight">{user?.username}</p>
                <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
              </div>
              <button
                onClick={logout}
                className="h-8 w-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Sign out"
              >
                <LogoutIcon />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Mobile Bottom Nav ────────────────────────────────
           Fixed at bottom; safe-area-aware; max 5 items.    */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Mobile navigation"
      >
        <div className="flex">
          {navItems.map(({ page, label, Icon }) => {
            const isActive = currentPage === page;
            return (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors ${
                  isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <span className={`p-1 rounded-lg transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                  <Icon />
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Spacer so mobile content isn't hidden behind bottom nav */}
      <div className="md:hidden h-16" aria-hidden="true" />
    </>
  );
};

export default Header;
