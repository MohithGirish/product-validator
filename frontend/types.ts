export interface User {
  id: string;
  username: string;
  password?: string;
  role: 'admin' | 'staff';
  isProtected?: boolean;
}

export interface ProductData {
  id: string;
  barcode: string;
  productName: string;
  batchNumberFormat: string;
  marketType: 'general' | 'modern';
  mrpApplicable: boolean;
  mrp: number | null;
  shelfLife: number | null;
  shelfLifeUnit: 'days' | 'months' | null;
  batchInfoText?: string;
}

export interface ValidationRecord {
  id: string;
  userId: string;
  barcodeImageUrl?: string; // Optional for manual entries
  batchImageUrl?: string; // Optional for manual entries
  extractedBatch: string;
  extractedBarcode: string;
  isValid: boolean;
  failureReason?: string; // Reason for validation failure
  timestamp: string;
  productName?: string;
  expectedBatchFormat?: string;
  validationMethod: 'ocr' | 'manual';
  extractedProductionDate?: string;
  extractedExpiryDate?: string;
  extractedPrice?: string;
  marketType?: 'general' | 'modern';
  detailMatches?: Partial<Record<'productName' | 'expectedBatchFormat' | 'extractedBatch' | 'extractedBarcode' | 'extractedProductionDate' | 'extractedExpiryDate' | 'extractedPrice', boolean>>;
  // Full-code verification: each check has a pass/fail and a human-readable detail line.
  checks?: ValidationCheck[];
}

export interface ValidationCheck {
  key: string;
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
  // 'info' checks are shown but do not affect the overall pass/fail verdict.
  severity?: 'required' | 'info';
}

export enum ValidationStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum Page {
    VALIDATOR = 'validator',
    DATABASE = 'database',
    HISTORY = 'history',
    ADMIN = 'admin',
}