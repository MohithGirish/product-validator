
import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ValidationRecord } from '../types';
import { KeyboardIcon } from './icons/KeyboardIcon';
import { databaseService } from '../services/databaseService';
import { XIcon } from './icons/XIcon';

const ConfirmClearModal: React.FC<{ onConfirm: () => void; onCancel: () => void }> = ({ onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50 p-4 animate-fade-in" onClick={onCancel}>
    <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
          <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Clear All History?</h2>
          <p className="text-sm text-slate-500 mt-0.5">This will permanently delete all validation records for every user. This cannot be undone.</p>
        </div>
      </div>
      <div className="flex gap-3 mt-5">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition"
        >
          Yes, Clear All
        </button>
      </div>
    </div>
  </div>
);

const ImageModal: React.FC<{ isOpen: boolean; onClose: () => void; imageUrl: string | null }> = ({ isOpen, onClose, imageUrl }) => {
  if (!isOpen || !imageUrl) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white/90 flex items-center justify-center text-slate-700 hover:bg-white transition z-10 shadow"
          aria-label="Close image"
        >
          <XIcon className="h-4 w-4" />
        </button>
        <img src={imageUrl} alt="Full size preview" className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl" />
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{ isValid: boolean }> = ({ isValid }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide border ${
    isValid
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-red-50 text-red-700 border-red-200'
  }`}>
    <span className={`h-1.5 w-1.5 rounded-full ${isValid ? 'bg-emerald-500' : 'bg-red-500'}`} />
    {isValid ? 'Valid' : 'Invalid'}
  </span>
);

const HistoryCard: React.FC<{ record: ValidationRecord; username?: string }> = ({ record, username }) => {
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);
  const hasImages = record.validationMethod === 'ocr' && (record.barcodeImageUrl || record.batchImageUrl);

  return (
    <>
      <ImageModal isOpen={!!imageModalUrl} onClose={() => setImageModalUrl(null)} imageUrl={imageModalUrl} />

      <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col sm:flex-row hover:shadow-md transition-shadow duration-200 border-l-4 ${
        record.isValid ? 'border-l-emerald-500' : 'border-l-red-400'
      }`}>
        {/* Thumbnail column */}
        <div className="sm:w-28 min-h-[96px] flex-shrink-0 bg-slate-50 border-b sm:border-b-0 sm:border-r border-slate-100 flex flex-row sm:flex-col">
          {hasImages ? (
            <>
              {record.barcodeImageUrl && (
                <button
                  onClick={() => setImageModalUrl(record.barcodeImageUrl!)}
                  className="relative flex-1 overflow-hidden group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="View barcode image"
                >
                  <img src={record.barcodeImageUrl} className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" alt="Barcode scan" />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors duration-200" />
                  <span className="absolute bottom-1 left-1 text-[9px] font-bold text-white bg-black/60 px-1 py-0.5 rounded">Barcode</span>
                </button>
              )}
              {record.batchImageUrl && (
                <button
                  onClick={() => setImageModalUrl(record.batchImageUrl!)}
                  className="relative flex-1 overflow-hidden group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="View batch code image"
                >
                  <img src={record.batchImageUrl} className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" alt="Batch scan" />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors duration-200" />
                  <span className="absolute bottom-1 left-1 text-[9px] font-bold text-white bg-black/60 px-1 py-0.5 rounded">Batch</span>
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center w-full h-full p-5 min-h-[72px]">
              <KeyboardIcon className="h-8 w-8 text-slate-300" />
            </div>
          )}
        </div>

        {/* Details column */}
        <div className="p-4 flex-1 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-start justify-between gap-2 mb-2">
              <StatusBadge isValid={record.isValid} />
              <time className="text-xs text-slate-400 whitespace-nowrap">{new Date(record.timestamp).toLocaleString()}</time>
            </div>
            {record.productName && (
              <h3 className="text-sm font-bold text-slate-900 leading-snug mb-2.5">{record.productName}</h3>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              {[
                { label: 'Batch No.', value: record.extractedBatch },
                { label: 'Barcode',   value: record.extractedBarcode },
                record.extractedProductionDate ? { label: 'Prod. Date', value: record.extractedProductionDate } : null,
                record.extractedExpiryDate      ? { label: 'Exp. Date',  value: record.extractedExpiryDate }      : null,
                record.extractedPrice           ? { label: 'Price',      value: record.extractedPrice }           : null,
              ].filter(Boolean).map(d => d && (
                <div key={d.label} className="flex flex-col">
                  <dt className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{d.label}</dt>
                  <dd className="text-xs font-mono text-slate-700 truncate">{d.value || 'N/A'}</dd>
                </div>
              ))}
            </dl>
          </div>

          {username && (
            <div className="pt-2.5 border-t border-slate-100 text-right">
              <p className="text-xs text-slate-400">By <span className="font-semibold text-slate-600">{username}</span></p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

const HistoryPage: React.FC = () => {
  const { history, user, clearHistory } = useAuth();
  const [users, setUsers] = useState<Map<string, string>>(new Map());
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    databaseService.getUsers()
      .then(data => setUsers(new Map(data.map(u => [u.id, u.username]))))
      .catch(err => console.error('Failed to fetch users:', err));
  }, [user]);

  const handleClearHistory = async () => {
    await clearHistory();
    setShowClearConfirm(false);
  };

  return (
    <>
    {showClearConfirm && (
      <ConfirmClearModal
        onConfirm={handleClearHistory}
        onCancel={() => setShowClearConfirm(false)}
      />
    )}
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-6 py-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {user?.role === 'admin' ? 'Global Validation History' : 'My Validation History'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {user?.role === 'admin'
              ? 'All validation attempts across all users.'
              : 'Your past validation attempts.'}
          </p>
        </div>
        {user?.role === 'admin' && history.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear All
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-6 py-16 text-center">
          <div className="h-14 w-14 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <svg className="h-7 w-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-800">No history yet</h3>
          <p className="text-sm text-slate-400 mt-1">Validate a product to see it appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {history.map(record => (
            <HistoryCard
              key={record.id}
              record={record}
              username={user?.role === 'admin' ? (users.get(record.userId) || 'Unknown') : undefined}
            />
          ))}
        </div>
      )}
    </div>
    </>
  );
};

export default HistoryPage;
