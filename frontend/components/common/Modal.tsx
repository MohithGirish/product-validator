import React, { useEffect } from 'react';
import { XIcon } from '../icons/XIcon';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Optional icon shown in the navy header (e.g. a small glyph). */
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** Footer content (action buttons). Rendered in a slate footer bar. */
  footer?: React.ReactNode;
  maxWidthClass?: string;
}

/**
 * Shared modal shell — blur backdrop, slide-up entrance, navy header, sticky
 * footer. Centralizes the app's premium modal look so every dialog matches.
 */
const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  maxWidthClass = 'max-w-lg',
}) => {
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto bg-slate-900/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`relative w-full ${maxWidthClass} my-auto max-h-[calc(100dvh-2rem)] flex flex-col bg-white rounded-2xl shadow-card-lg ring-1 ring-slate-900/5 overflow-hidden animate-slide-up`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Navy header */}
        <div className="relative px-6 py-5 text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #15294E 0%, #1B3361 100%)' }}>
          <div className="flex items-start gap-3">
            {icon && (
              <div className="h-9 w-9 rounded-lg bg-white/12 flex items-center justify-center flex-shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight leading-tight">{title}</h2>
              {subtitle && <p className="mt-0.5 text-sm text-slate-300">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 h-8 w-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
