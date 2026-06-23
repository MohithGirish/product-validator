
import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { LoginIcon } from './icons/LoginIcon';
import { EyeIcon, EyeOffIcon } from './icons/EyeIcon';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const success = await login(username, password);
    setIsLoading(false);
    if (success) {
      setError('');
    } else {
      setError('Invalid username or password.');
    }
  };

  return (
    <div className="min-h-dvh bg-[#F4F6FA] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl overflow-hidden max-w-4xl w-full flex flex-col md:flex-row md:min-h-[560px] shadow-card-lg ring-1 ring-slate-900/5">

        {/* Left Side – Branding */}
        <div className="md:w-5/12 relative flex flex-col justify-between p-7 sm:p-10 text-white overflow-hidden">
          <div className="absolute inset-0 z-0" style={{ background: 'linear-gradient(150deg, #0C1830 0%, #15294E 55%, #1B3361 100%)' }} />
          {/* Subtle engineered grid texture — reads as "industrial", not decorative */}
          <div
            className="absolute inset-0 z-0 opacity-[0.06]"
            style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '28px 28px' }}
          />

          <div className="relative z-10">
            <div className="inline-flex items-center px-3 py-2 rounded-xl bg-white shadow-md">
              <img
                src="/itc-logo.png"
                alt="ITC Limited"
                className="h-10 w-auto object-contain"
              />
            </div>
            <h1 className="mt-7 text-3xl font-bold tracking-tight leading-[1.1]">Product<br />Validator</h1>
            <p className="mt-3 text-slate-300 text-sm leading-relaxed max-w-[34ch]">
              Ensuring quality and accuracy for every product that leaves the factory floor.
            </p>
          </div>

          <div className="relative z-10 mt-8 space-y-2.5">
            {[
              'Two-step barcode &amp; batch verification',
              'Full-code checks: format, MRP &amp; shelf life',
              'Complete, auditable validation history',
            ].map((line) => (
              <div key={line} className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-md bg-white/15 flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-slate-200/90 text-xs font-medium" dangerouslySetInnerHTML={{ __html: line }} />
              </div>
            ))}
          </div>
        </div>

        {/* Right Side – Login Form */}
        <div className="md:w-7/12 p-8 md:p-10 bg-white flex flex-col justify-center">
          <div className="w-full max-w-sm mx-auto">
            <div className="mb-6 flex items-center gap-3">
              <img src="/itc-logo.png" alt="ITC Limited" className="h-10 w-auto object-contain" />
              <div className="h-8 w-px bg-slate-200" />
              <span className="eyebrow !text-slate-400">Factory QC</span>
            </div>
            <p className="eyebrow !text-blue-700 mb-1">Secure Access</p>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Sign in</h2>
            <p className="text-sm text-slate-500 mb-7">Welcome back — enter your credentials to continue.</p>

            <form className="space-y-4" onSubmit={handleLogin}>
              <div>
                <label htmlFor="username" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="e.g., admin"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full px-3.5 py-2.5 pr-11 rounded-lg border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 transition"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 p-3 animate-slide-up" role="alert">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-sm text-red-700 font-medium">{error}</p>
                </div>
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="press w-full flex justify-center items-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <LoginIcon className="h-4 w-4" />
                  )}
                  {isLoading ? 'Signing in…' : 'Sign In'}
                </button>
              </div>
            </form>

            <p className="mt-6 pt-5 border-t border-slate-100 text-center text-xs text-slate-400">
              Need access? Contact your QC administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
