
import React from 'react';
import { ValidationRecord } from '../types';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { XIcon } from './icons/XIcon';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import Portal from './common/Portal';

interface ResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: Omit<ValidationRecord, 'id' | 'timestamp' | 'userId'> | null;
}

const ResultModal: React.FC<ResultModalProps> = ({ isOpen, onClose, result }) => {
  useBodyScrollLock(isOpen);

  if (!isOpen || !result) return null;

  const isValid = result.isValid;

  // Prefer the rich per-check results (full-code verification) when available.
  const checks = result.checks ?? [];
  const hasChecks = checks.length > 0;

  const details: { label: string; value: string; matched: boolean }[] = [
    { label: 'Product Name', value: result.productName || 'N/A', matched: Boolean(result.detailMatches?.productName) },
    { label: 'Expected Batch Format', value: result.expectedBatchFormat || 'N/A', matched: Boolean(result.detailMatches?.expectedBatchFormat) },
    { label: 'Batch Number', value: result.extractedBatch || 'N/A', matched: Boolean(result.detailMatches?.extractedBatch) },
    { label: 'Barcode', value: result.extractedBarcode || 'N/A', matched: Boolean(result.detailMatches?.extractedBarcode) },
    { label: 'Prod. Date', value: result.extractedProductionDate || 'N/A', matched: Boolean(result.detailMatches?.extractedProductionDate) },
    { label: 'Expiry Date', value: result.extractedExpiryDate || 'N/A', matched: Boolean(result.detailMatches?.extractedExpiryDate) },
    { label: 'Price (MRP)', value: result.extractedPrice || 'N/A', matched: Boolean(result.detailMatches?.extractedPrice) },
  ];

  return (
    <Portal>
    <div
      className="fixed inset-0 bg-black/60 flex justify-center items-center z-[60] p-4 overflow-y-auto animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={isValid ? 'Validation Successful' : 'Validation Failed'}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md my-auto" onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 h-7 w-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          aria-label="Close"
        >
          <XIcon className="h-4 w-4" />
        </button>

        {/* Status banner */}
        <div className={`px-6 pt-7 pb-5 text-center border-b ${isValid ? 'border-green-100' : 'border-red-100'}`}>
          <div className={`h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-3 ${isValid ? 'bg-green-50' : 'bg-red-50'}`}>
            {isValid ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <h2 className={`text-xl font-bold ${isValid ? 'text-green-800' : 'text-red-800'}`}>
            {isValid ? 'Validation Passed' : 'Validation Failed'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isValid
              ? 'All product details match the master database.'
              : 'The product details could not be verified.'}
          </p>

          {!isValid && result.failureReason && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-left">
              <p className="text-xs font-bold text-red-700 mb-0.5">Reason</p>
              <p className="text-sm text-red-700">{result.failureReason}</p>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="px-6 py-4 max-h-[44vh] overflow-y-auto">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Validation Details</p>

          {hasChecks ? (
            <ul className="space-y-2.5">
              {checks.map(({ key, label, passed, expected, actual, severity }) => (
                <li key={key} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      {severity === 'info' ? (
                        <span className="h-4 w-4 flex-shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                      ) : passed ? (
                        <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-green-500" />
                      ) : (
                        <XCircleIcon className="h-4 w-4 flex-shrink-0 text-red-500" />
                      )}
                      {label}
                    </span>
                    {severity === 'info' ? (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        Info
                      </span>
                    ) : (
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {passed ? 'Pass' : 'Fail'}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-slate-400 font-medium mb-0.5">Expected</p>
                      <p className="font-mono text-slate-700 break-words">{expected || '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium mb-0.5">Found</p>
                      <p className={`font-mono break-words ${passed || severity === 'info' ? 'text-slate-700' : 'text-red-600'}`}>{actual || '—'}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <dl className="space-y-2">
              {details.map(({ label, value, matched }) => (
                <div key={label} className="flex justify-between items-start gap-3 py-1 border-b border-slate-50 last:border-0">
                  <dt className="text-sm text-slate-500 font-medium flex-shrink-0">{label}</dt>
                  <dd className="flex items-center gap-2 text-sm font-semibold text-slate-800 text-right font-mono truncate">
                    {matched ? (
                      <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-green-500" />
                    ) : (
                      <XCircleIcon className="h-4 w-4 flex-shrink-0 text-red-500" />
                    )}
                    <span className={matched ? 'text-slate-800' : 'text-slate-500'}>{value}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
};

export default ResultModal;
