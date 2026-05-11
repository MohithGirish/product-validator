
import React from 'react';
import { ValidationRecord } from '../types';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { XIcon } from './icons/XIcon';

interface ResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: Omit<ValidationRecord, 'id' | 'timestamp' | 'userId'> | null;
}

const ResultModal: React.FC<ResultModalProps> = ({ isOpen, onClose, result }) => {
  if (!isOpen || !result) return null;

  const isValid = result.isValid;

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
    <div
      className="fixed inset-0 bg-black/60 flex justify-center items-center z-50 p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={isValid ? 'Validation Successful' : 'Validation Failed'}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
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
        <div className="px-6 py-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Validation Details</p>
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
  );
};

export default ResultModal;
