import { ProductData, ValidationCheck } from '../types';

/** Build a regex from a batch-number format string (# = digit, @ = uppercase letter, else literal). */
export const buildFormatRegex = (format: string): RegExp | null => {
  if (!format) return null;
  let regexString = '^';
  for (const char of format) {
    switch (char) {
      case '#': regexString += '\\d'; break;
      case '@': regexString += '[A-Z]'; break;
      default: regexString += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  regexString += '$';
  try {
    return new RegExp(regexString, 'i');
  } catch (e) {
    console.error('Invalid regex generated from format:', regexString, e);
    return null;
  }
};

export const validateBatchCodeAgainstFormat = (batchCode: string, format: string): boolean => {
  if (!batchCode || !format) return false;
  const regex = buildFormatRegex(format);
  return regex ? regex.test(batchCode.trim()) : false;
};

/**
 * Normalize a line for OCR-tolerant comparison: collapse internal whitespace,
 * drop punctuation that OCR commonly adds/drops, and lowercase.
 */
const normalizeLine = (value: string): string =>
  value
    .replace(/[.,:;()\[\]{}/\\|*•–—_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Token-overlap (Jaccard) similarity between two normalized lines, 0..1. */
const lineSimilarity = (a: string, b: string): number => {
  const ta = new Set(normalizeLine(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeLine(b).split(' ').filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  ta.forEach(t => { if (tb.has(t)) shared++; });
  return shared / (ta.size + tb.size - shared);
};

// A reference line is considered "present" in the scan if its best token-overlap
// match clears this bar. Tuned to absorb OCR noise (spacing, dropped punctuation,
// minor misreads) while still catching genuinely missing or wrong lines.
const LINE_MATCH_THRESHOLD = 0.5;

const parseUtcDate = (dateStr: string | undefined | null): Date | null => {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
};

const differenceInDaysUtc = (start: Date, end: Date): number =>
  Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

/** Extract the first numeric value from an OCR price string like "Rs.90.00" or "₹440". */
const parsePriceNumber = (price: string | undefined | null): number | null => {
  if (!price) return null;
  const match = String(price).match(/([0-9]+(?:\.[0-9]{1,2})?)/);
  return match ? Number(match[1]) : null;
};

/**
 * Convert a product's expected shelf-life into a tolerance window in days.
 * Months are treated as ~30.44 days; we allow ±2 days for day-based and
 * roughly ±half-a-month for month-based specs to absorb rounding/date drift.
 */
const shelfLifeToDays = (shelfLife: number, unit: 'days' | 'months'): { days: number; tolerance: number } => {
  if (unit === 'months') {
    return { days: Math.round(shelfLife * 30.44), tolerance: Math.max(2, Math.round(shelfLife * 2)) };
  }
  return { days: shelfLife, tolerance: 2 };
};

export interface FullValidationInput {
  product: ProductData;
  batchCode: string;
  barcode: string;
  productionDate: string;
  expiryDate: string;
  price: string;
  scannedInfoText: string;
}

export interface FullValidationResult {
  isValid: boolean;
  failureReason: string;
  checks: ValidationCheck[];
}

/**
 * Verify the ENTIRE printed code block against the product's master record:
 * batch-code format, MRP, shelf-life (expiry − production), date validity,
 * and a per-line generalized comparison of the info block.
 */
export const validateFullCode = (input: FullValidationInput): FullValidationResult => {
  const { product, batchCode, barcode, productionDate, expiryDate, price, scannedInfoText } = input;
  const checks: ValidationCheck[] = [];
  const failures: string[] = [];

  // 1. Barcode (identifies product; already matched to get here, shown for record).
  checks.push({
    key: 'barcode',
    label: 'Barcode',
    passed: Boolean(barcode),
    expected: product.barcode,
    actual: barcode || '—',
    severity: 'info',
  });

  // 2. Batch-code format.
  const batchOk = validateBatchCodeAgainstFormat(batchCode, product.batchNumberFormat);
  checks.push({
    key: 'batchCode',
    label: 'Batch Code Format',
    passed: batchOk,
    expected: product.batchNumberFormat,
    actual: batchCode || '—',
    severity: 'required',
  });
  if (!batchOk) {
    failures.push(
      batchCode
        ? `Batch code "${batchCode}" does not match format "${product.batchNumberFormat}".`
        : 'No batch code could be read from the image.'
    );
  }

  // 3. MRP / price (only when the product declares an MRP).
  if (product.mrpApplicable && product.mrp != null) {
    const actualPrice = parsePriceNumber(price);
    const priceOk = actualPrice != null && Math.abs(actualPrice - product.mrp) < 0.01;
    checks.push({
      key: 'mrp',
      label: 'MRP / Price',
      passed: priceOk,
      expected: `₹${product.mrp.toFixed(2)}`,
      actual: actualPrice != null ? `₹${actualPrice.toFixed(2)}` : (price || '—'),
      severity: 'required',
    });
    if (!priceOk) {
      failures.push(
        actualPrice != null
          ? `Printed MRP ₹${actualPrice.toFixed(2)} does not match expected ₹${product.mrp.toFixed(2)}.`
          : 'MRP could not be read from the image.'
      );
    }
  }

  // 4. Dates present & valid (production before expiry).
  const prod = parseUtcDate(productionDate);
  const exp = parseUtcDate(expiryDate);
  const datesPresent = Boolean(prod && exp);
  const datesOrdered = datesPresent && prod! < exp!;
  checks.push({
    key: 'dates',
    label: 'Production / Expiry Dates',
    passed: datesOrdered,
    expected: 'Both present, expiry after production',
    actual: `${productionDate || '—'} → ${expiryDate || '—'}`,
    severity: 'required',
  });
  if (!datesPresent) {
    failures.push('Production and/or expiry date could not be read from the image.');
  } else if (!datesOrdered) {
    failures.push('Expiry date is not after the production date.');
  }

  // 5. Shelf-life: (expiry − production) should match the product's declared shelf-life.
  if (product.shelfLife != null && product.shelfLifeUnit && datesOrdered) {
    const actualDays = differenceInDaysUtc(prod!, exp!);
    const { days: expectedDays, tolerance } = shelfLifeToDays(product.shelfLife, product.shelfLifeUnit);
    const shelfOk = Math.abs(actualDays - expectedDays) <= tolerance;
    checks.push({
      key: 'shelfLife',
      label: 'Shelf Life',
      passed: shelfOk,
      expected: `${product.shelfLife} ${product.shelfLifeUnit} (~${expectedDays}d)`,
      actual: `${actualDays} days`,
      severity: 'required',
    });
    if (!shelfOk) {
      failures.push(
        `Date gap of ${actualDays} days does not match the expected shelf life of ${product.shelfLife} ${product.shelfLifeUnit}.`
      );
    }
  }

  // 6. Per-line info-block comparison — OCR-tolerant.
  // For each reference line we find its best token-overlap match in the scanned
  // block. A line "matches" if its best score clears LINE_MATCH_THRESHOLD, which
  // absorbs OCR noise (spacing, dropped punctuation, minor misreads) while still
  // catching lines that are genuinely missing or substantively wrong.
  // This is a secondary cross-check: the substantive facts (batch format, MRP,
  // dates, shelf-life) are already verified above, so an OCR-blurred info block
  // alone should not fail an otherwise-valid product — hence severity 'info'.
  if (product.batchInfoText && scannedInfoText) {
    const expectedLines = product.batchInfoText.split('\n').map(l => l.trim()).filter(Boolean);
    const scannedLines = scannedInfoText.split('\n').map(l => l.trim()).filter(Boolean);

    const unmatched: string[] = [];
    for (const ref of expectedLines) {
      const best = scannedLines.reduce((max, scan) => Math.max(max, lineSimilarity(ref, scan)), 0);
      if (best < LINE_MATCH_THRESHOLD) unmatched.push(ref);
    }

    const matchedCount = expectedLines.length - unmatched.length;
    // Pass when most reference lines are recognizable in the scan.
    const lineOk = expectedLines.length > 0 && matchedCount / expectedLines.length >= 0.6;

    checks.push({
      key: 'infoBlock',
      label: 'Info Block Lines',
      passed: lineOk,
      expected: `${expectedLines.length} reference line(s)`,
      actual: unmatched.length === 0
        ? 'All lines recognized'
        : `${matchedCount}/${expectedLines.length} recognized · unmatched: ${unmatched.join(' | ')}`,
      severity: 'info',
    });
  }

  const required = checks.filter(c => c.severity !== 'info');
  const isValid = required.length > 0 && required.every(c => c.passed);

  return {
    isValid,
    failureReason: failures.join(' '),
    checks,
  };
};
