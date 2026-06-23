
import React from 'react';
import { ValidationRecord, ValidationCheck } from '../types';
import { XIcon } from './icons/XIcon';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import Portal from './common/Portal';

interface ResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: Omit<ValidationRecord, 'id' | 'timestamp' | 'userId'> | null;
}

/** Does scanned glyph `ch` satisfy format slot `fmt` (# digit, @ letter, else literal)?
 *  Mirrors buildFormatRegex — case-insensitive, like the regex's `i` flag. */
const matchesSlot = (fmt: string, ch: string | undefined): boolean => {
  if (ch === undefined) return false;
  if (fmt === '#') return /[0-9]/.test(ch);
  if (fmt === '@') return /[a-zA-Z]/.test(ch);
  return fmt.toLowerCase() === ch.toLowerCase();
};

/** Printable cell: spaces hold width, missing chars show a faint dot. */
const show = (ch: string | undefined): string =>
  ch === undefined ? '·' : ch === ' ' ? ' ' : ch;

/** The signature: a character-aligned comparison of the master #/@ format
 *  against the scanned code, each glyph marked pass/fail. */
const BatchDiff: React.FC<{ format: string; actual: string }> = ({ format, actual }) => {
  const n = Math.max(format.length, actual.length);
  const cells = Array.from({ length: n }, (_, i) => ({ f: format[i], a: actual[i] }));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-3">
        <span className="eyebrow !text-slate-400 w-[4.5rem] flex-shrink-0">Reference</span>
        <div className="code-diff text-base">
          {cells.map(({ f }, i) => (
            <span key={i} className={`glyph ${f === '#' || f === '@' ? 'glyph-ph' : 'text-slate-700'}`}>{show(f)}</span>
          ))}
        </div>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="eyebrow !text-slate-400 w-[4.5rem] flex-shrink-0">Scanned</span>
        <div className="code-diff text-base">
          {cells.map(({ f, a }, i) => (
            <span key={i} className={`glyph ${f !== undefined && matchesSlot(f, a) ? 'glyph-ok' : 'glyph-bad'}`}>{show(a)}</span>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-slate-400 pl-[5.25rem] pt-0.5">
        <span className="font-mono text-slate-500">#</span> any digit&nbsp;&nbsp;·&nbsp;&nbsp;
        <span className="font-mono text-slate-500">@</span> any letter
      </p>
    </div>
  );
};

const Verdict: React.FC<{ check: ValidationCheck }> = ({ check }) => {
  const info = check.severity === 'info';
  const cls = info
    ? 'bg-slate-100 text-slate-500'
    : check.passed
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-red-50 text-red-700';
  return (
    <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${cls}`}>
      {info ? 'Info' : check.passed ? 'Pass' : 'Fail'}
    </span>
  );
};

const CheckRow: React.FC<{ check: ValidationCheck }> = ({ check }) => {
  const info = check.severity === 'info';
  return (
    <li className="border border-slate-100 rounded-lg p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow !text-slate-600">{check.label}</span>
        <Verdict check={check} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="eyebrow !text-slate-400 mb-0.5">Expected</p>
          <p className="font-mono text-slate-700 break-words">{check.expected || '—'}</p>
        </div>
        <div>
          <p className="eyebrow !text-slate-400 mb-0.5">Found</p>
          <p className={`font-mono break-words ${check.passed || info ? 'text-slate-700' : 'text-red-600 font-semibold'}`}>
            {check.actual || '—'}
          </p>
        </div>
      </div>
    </li>
  );
};

const ResultModal: React.FC<ResultModalProps> = ({ isOpen, onClose, result }) => {
  useBodyScrollLock(isOpen);

  if (!isOpen || !result) return null;

  const isValid = result.isValid;
  const checks = result.checks ?? [];
  const batchCheck = checks.find(c => c.key === 'batchCode');
  const ledger = checks.filter(c => c.key !== 'batchCode'); // batch shown as the diff above
  const showDiff = Boolean(batchCheck && result.expectedBatchFormat && result.extractedBatch);
  const method = result.validationMethod === 'manual' ? 'Manual Entry' : 'OCR Scan';
  const inspectedAt = new Date().toLocaleString();

  return (
    <Portal>
    <div
      className="fixed inset-0 bg-black/60 flex justify-center items-center z-[60] p-4 overflow-y-auto animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={isValid ? 'Inspection passed' : 'Inspection failed'}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md my-auto" onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 h-7 w-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition z-10"
          aria-label="Close"
        >
          <XIcon className="h-4 w-4" />
        </button>

        {/* ── Certificate header ─────────────────────────────── */}
        <div className="px-6 pt-7 pb-5 border-b border-slate-100">
          <p className="eyebrow !text-slate-400">Inspection Result</p>
          <div className="mt-3 flex items-center gap-4">
            <span className={`stamp flex-shrink-0 ${isValid ? 'stamp-pass' : 'stamp-fail'}`}>
              {isValid ? 'Passed' : 'Failed'}
            </span>
            <div className="min-w-0">
              {result.productName && (
                <h2 className="text-base font-bold text-slate-900 leading-snug truncate">{result.productName}</h2>
              )}
              <p className="text-[11px] font-mono text-slate-500 mt-1">
                {method} · <span className="capitalize">{result.marketType ?? '—'}</span> market
              </p>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">{inspectedAt}</p>
            </div>
          </div>

          {!isValid && result.failureReason && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-left">
              <p className="eyebrow !text-red-700 mb-0.5">Reason</p>
              <p className="text-sm text-red-700">{result.failureReason}</p>
            </div>
          )}
        </div>

        {/* ── Body: code comparison + inspection ledger ──────── */}
        <div className="px-6 py-4 max-h-[44vh] overflow-y-auto space-y-4">
          {showDiff && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="eyebrow !text-slate-400">Code Comparison</p>
                {batchCheck && <Verdict check={batchCheck} />}
              </div>
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60">
                <BatchDiff format={result.expectedBatchFormat!} actual={result.extractedBatch} />
              </div>
            </div>
          )}

          {ledger.length > 0 && (
            <div>
              <p className="eyebrow !text-slate-400 mb-2">Inspection Checks</p>
              <ul className="space-y-2.5">
                {ledger.map(c => <CheckRow key={c.key} check={c} />)}
              </ul>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-2">
          <button
            onClick={onClose}
            className="press w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition"
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
