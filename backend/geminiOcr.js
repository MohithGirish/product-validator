const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 15000);

function isAvailable() {
  return Boolean(GEMINI_API_KEY);
}

function bufferToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType: mimeType || 'image/jpeg',
    },
  };
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Gemini request timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

async function callGemini(buffer, mimeType, prompt) {
  if (!isAvailable()) throw new Error('Gemini API key not configured.');

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const imagePart = bufferToGenerativePart(buffer, mimeType);

  const result = await withTimeout(
    model.generateContent([prompt, imagePart]),
    GEMINI_TIMEOUT_MS
  );

  const text = result.response.text();
  if (!text || !text.trim()) throw new Error('Gemini returned empty response.');
  return text.trim();
}

function parseJsonBlock(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
  if (match) {
    try { return JSON.parse(match[1].trim()); } catch { /* fall through */ }
  }
  try { return JSON.parse(text); } catch { /* fall through */ }
  return null;
}

async function extractProductInfo(buffer, mimeType) {
  const prompt = `You are a factory QC assistant. Examine this product image and extract:
1. The barcode number (digits only, no spaces)
2. The product name printed on the label

Respond ONLY with valid JSON in this exact format:
{"barcode": "1234567890123", "productName": "Product Name Here"}

If a field cannot be found, use an empty string "".
Do not include any explanation, markdown, or extra text — just the JSON object.`;

  const text = await callGemini(buffer, mimeType, prompt);
  const parsed = parseJsonBlock(text);
  if (!parsed) throw new Error('Could not parse Gemini product info response.');
  return {
    barcode: String(parsed.barcode || '').replace(/\D/g, ''),
    productName: String(parsed.productName || ''),
  };
}

async function extractBatchInfo(buffer, mimeType, batchFormat) {
  const formatHint = batchFormat
    ? `The expected batch code format uses "#" for digits and "@" for uppercase letters. Format: "${batchFormat}".`
    : '';

  const prompt = `You are a factory QC assistant. Examine this product batch label image and extract:
1. The batch code (alphanumeric code that identifies this production batch)
2. The production/manufacturing/packed date (ISO format YYYY-MM-DD)
3. The expiry/best-before/use-by date (ISO format YYYY-MM-DD)
4. The MRP/price (include currency symbol, e.g. "Rs.90" or "₹440")

${formatHint}

Respond ONLY with valid JSON in this exact format:
{"batchCode": "16:47 01B11", "productionDate": "2025-09-27", "expiryDate": "2026-03-25", "price": "Rs.90"}

If a field cannot be found, use an empty string "".
Do not include any explanation, markdown, or extra text — just the JSON object.`;

  const text = await callGemini(buffer, mimeType, prompt);
  const parsed = parseJsonBlock(text);
  if (!parsed) throw new Error('Could not parse Gemini batch info response.');
  return {
    batchCode: String(parsed.batchCode || ''),
    productionDate: String(parsed.productionDate || ''),
    expiryDate: String(parsed.expiryDate || ''),
    price: String(parsed.price || ''),
  };
}

async function extractBatchFormat(buffer, mimeType) {
  const prompt = `You are a factory QC assistant. Examine this product batch label image and extract:
1. All visible batch-related text (batch code, dates, MRP)
2. The batch code itself
3. The batch code format using "#" for each digit and "@" for each uppercase letter (other chars literal)
4. The MRP/price as a number only (no currency)
5. Production date (ISO format YYYY-MM-DD or null)
6. Expiry date (ISO format YYYY-MM-DD or null)

Respond ONLY with valid JSON in this exact format:
{"batchInfoText": "Batch No.: 16:47 01B11\nPKD.: 27/09/25\nUse By.: 25/03/26\nMRP Rs. 90.00", "batchCode": "16:47 01B11", "batchFormat": "##:## ##@##", "mrp": 90, "productionDate": "2025-09-27", "expiryDate": "2026-03-25"}

If a field cannot be found, use null for numbers/dates and "" for strings.
Do not include any explanation, markdown, or extra text — just the JSON object.`;

  const text = await callGemini(buffer, mimeType, prompt);
  const parsed = parseJsonBlock(text);
  if (!parsed) throw new Error('Could not parse Gemini batch format response.');
  return {
    batchInfoText: String(parsed.batchInfoText || ''),
    batchFormat: String(parsed.batchFormat || ''),
    mrp: parsed.mrp === null || parsed.mrp === undefined ? null : Number(parsed.mrp),
    productionDate: parsed.productionDate || null,
    expiryDate: parsed.expiryDate || null,
  };
}

async function analyzeImage(buffer, mimeType, userPrompt) {
  const prompt = `You are a factory QC assistant analyzing a product label image.
Extract and report the following:
- All visible text (OCR result)
- Barcode number (digits only)
- Product name
- Batch code
- Batch format (using # for digits, @ for letters)
- Production/packed date
- Expiry/best-before date
- MRP/price

Format your response clearly with labeled sections.
${userPrompt ? `\nAdditional note from user: ${userPrompt}` : ''}`;

  return await callGemini(buffer, mimeType, prompt);
}

module.exports = {
  isAvailable,
  extractProductInfo,
  extractBatchInfo,
  extractBatchFormat,
  analyzeImage,
};
