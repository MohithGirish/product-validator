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

  const userInitial = (user?.username?.charAt(0) || '?').toUpperCase();

  return (
    <>
      {/* ── Desktop / Tablet Header ───────────────────────── */}
      <header
        className="bg-white/90 border-b border-slate-200/80 sticky top-0 z-30 backdrop-blur-md shadow-[0_1px_2px_rgba(12,24,48,0.04)]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo — official ITC mark + product wordmark */}
            <div className="flex items-center gap-2.5">
              <img src="/itc-logo.png" alt="ITC Limited" className="h-8 w-auto object-contain flex-shrink-0" />
              <div className="hidden sm:flex items-center gap-2.5">
                <span className="h-5 w-px bg-slate-200" aria-hidden="true" />
                <span className="text-sm font-bold text-slate-900 tracking-tight leading-none">
                  Product Validator
                  <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Factory QC</span>
                </span>
              </div>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1 h-full" aria-label="Main navigation">
              {navItems.map(({ page, label, Icon }) => {
                const isActive = currentPage === page;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative flex items-center gap-1.5 px-3 h-14 text-sm font-medium transition-colors duration-150 ${
                      isActive
                        ? 'text-blue-700'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Icon />
                    <span>{label}</span>
                    {isActive && (
                      <span
                        className="absolute left-2 right-2 bottom-0 h-0.5 rounded-t bg-blue-600"
                        aria-hidden="true"
                      />
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
              <div
                className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm flex-shrink-0 ring-1 ring-blue-200"
                aria-hidden="true"
              >
                {userInitial}
              </div>
              <button
                onClick={logout}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-sm border-t border-slate-200"
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
                className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors ${
                  isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <span className={`p-1 rounded-lg transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                  <Icon />
                </span>
                <span>{label}</span>
                {isActive && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 h-1 w-8 rounded-b-full bg-blue-600"
                    aria-hidden="true"
                  />
                )}
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
