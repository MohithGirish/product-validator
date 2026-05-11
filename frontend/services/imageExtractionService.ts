const API_BASE = '/api';

async function postImage(endpoint: string, imageFile: File, extra?: Record<string, string>): Promise<Response> {
  const form = new FormData();
  form.append('image', imageFile);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      form.append(key, value);
    }
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, { method: 'POST', body: form });
  } catch {
    throw new Error(
      'Cannot reach the backend server. Make sure you started the app with "npm run dev".'
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Backend error: ${res.status}`);
  }
  return res;
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
): Promise<{ batchCode: string; productionDate: string; expiryDate: string; price: string; engine?: OcrEngine }> => {
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
