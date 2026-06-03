import React from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' uses red emphasis for destructive actions. */
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Styled confirmation dialog — replaces the native window.confirm() so
 * destructive actions stay on-brand and premium.
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-card-lg ring-1 ring-slate-900/5 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-3.5">
            <div className={`h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0 ring-4 ${
              isDanger ? 'bg-red-50 ring-red-50/60' : 'bg-brand-50 ring-brand-50/60'
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isDanger ? 'text-red-500' : 'text-brand-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="min-w-0 pt-0.5">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h2>
              <div className="mt-1 text-sm text-slate-500 leading-relaxed">{message}</div>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              onClick={onCancel}
              className="bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm px-4 py-2.5 rounded-lg border border-slate-200 transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={`press text-white font-semibold text-sm px-4 py-2.5 rounded-lg shadow-sm ${
                isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
