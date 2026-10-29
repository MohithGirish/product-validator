// Sends an image to one of the backend OCR endpoints (/api/extract-product,
// /extract-batch, /extract-batch-format, /analyze-image) as multipart form data,
// with a 60-second timeout and the session token (see apiClient.ts). Results
// include which engine answered ('gemini' or 'local').
import { ApiError, apiFetch } from './apiClient';

const API_BASE = '/api';
const OCR_TIMEOUT_MS = 60_000;

async function postImage(endpoint: string, imageFile: File, extra?: Record<string, string>): Promise<Response> {
  const form = new FormData();
  form.append('image', imageFile);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      form.append(key, value);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

  try {
    return await apiFetch(`${API_BASE}${endpoint}`, { method: 'POST', body: form, signal: controller.signal });
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    if (err?.name === 'AbortError') {
      throw new Error('OCR request timed out. Please try again.');
    }
    throw new Error(
      'Cannot reach the backend server. Make sure you started the app with "npm run dev".'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export type OcrEngine = 'gemini' | 'local';

export const extractProductInfoFromImage = async (
  imageFile: File
): Promise<{ barcode: string; productName: string; engine?: OcrEngine }> => {
  const res = await postImage('/extract-product', imageFile);
  return res.json();
};

export const extractBatchCodeFromImage = async (
  imageFile: File,
  batchFormat: string
): Promise<{ batchCode: string; productionDate: string; expiryDate: string; price: string; batchInfoText: string; engine?: OcrEngine }> => {
  const res = await postImage('/extract-batch', imageFile, { batchFormat });
  return res.json();
};

export const extractBatchFormatFromImage = async (
  imageFile: File
): Promise<{ batchFormat: string; mrp: number | null; productionDate: string | null; expiryDate: string | null; batchInfoText: string; engine?: OcrEngine }> => {
  const res = await postImage('/extract-batch-format', imageFile);
  return res.json();
};

export const analyzeImage = async (imageFile: File, prompt: string): Promise<{ result: string; engine?: OcrEngine }> => {
  const res = await postImage('/analyze-image', imageFile, { prompt });
  return res.json();
};
