const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

// Suppress noisy Tesseract C++ stderr lines that can't be silenced via the JS logger.
const TESSERACT_NOISE = /Image too small to scale|Line cannot be recognized|Could not initialize tesseract|Estimating resolution|Empty page|Warning.*Tesseract/i;
const _stderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, ...args) => {
  const text = typeof chunk === 'string' ? chunk : chunk.toString();
  if (TESSERACT_NOISE.test(text)) return true;
  return _stderrWrite(chunk, ...args);
};

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const {
  initializeDatabase,
  getProducts,
  getProductsByBarcode,
  createProduct,
  updateProduct,
  deleteProduct,
  getUsers,
  findUserByCredentials,
  createUser,
  deleteUser,
} = require('./db');
const geminiOcr = require('./geminiOcr');
const localOcr = require('./localOcr');

const app = express();
const PORT = process.env.PORT || 3001;

// In production the frontend is served from this same Express process (same origin),
// so CORS headers are only needed for local development.
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
}));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

// Simple in-memory rate limiter for OCR endpoints (max 20 req/min per IP).
const ocrRateLimitMap = new Map();
const OCR_WINDOW_MS = 60_000;
const OCR_MAX_REQUESTS = 20;

function ocrRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress;
  const now = Date.now();
  const entry = ocrRateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > OCR_WINDOW_MS) {
    ocrRateLimitMap.set(ip, { windowStart: now, count: 1 });
    return next();
  }
  if (entry.count >= OCR_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many OCR requests. Please wait a minute.' });
  }
  entry.count++;
  next();
}

// ── OCR routing: Gemini first, local fallback ──────────────────────────────

const NETWORK_ERROR = /timed out|timeout|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|failed to fetch|getaddrinfo|socket hang up/i;

function isNetworkError(err) {
  return NETWORK_ERROR.test(err.message || String(err));
}

// Always try Gemini. Only fall back to local when Gemini is genuinely unreachable
// (network down, DNS failure, timeout). Every other error surfaces to the caller.
async function withGeminiFallback(geminiCall, localCall, label) {
  if (geminiOcr.isAvailable()) {
    try {
      const result = await geminiCall();
      console.log(`[OCR] ${label}: Gemini OK`);
      return { result, engine: 'gemini' };
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      console.warn(`[OCR] ${label}: Gemini unreachable — switching to local OCR`);
    }
  }

  const result = await localCall();
  console.log(`[OCR] ${label}: local OCR OK`);
  return { result, engine: 'local' };
}

// ── Auth endpoint ──────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  try {
    const user = await findUserByCredentials(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    // findUserByCredentials never returns the password field.
    res.json(user);
  } catch (err) {
    console.error('login error:', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── User management (admin) ─────────────────────────────────────────────────
// Note: this app has no session tokens; the frontend only exposes these screens
// to admins. The endpoints are intentionally simple for the factory-LAN context.

app.get('/api/users', async (_req, res) => {
  try {
    res.json(await getUsers());
  } catch (err) {
    console.error('get-users error:', err.message);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const created = await createUser(req.body || {});
    res.status(201).json(created);
  } catch (err) {
    console.error('create-user error:', err.message);
    const status = /required|already exists|at least/.test(err.message) ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to create user.' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const result = await deleteUser(req.params.id);
    if (!result.ok) {
      if (result.reason === 'not_found') return res.status(404).json({ error: 'User not found.' });
      if (result.reason === 'protected_admin') return res.status(400).json({ error: 'The original administrator account cannot be removed.' });
      if (result.reason === 'last_admin') return res.status(400).json({ error: 'Cannot remove the last administrator.' });
      if (result.reason === 'last_staff') return res.status(400).json({ error: 'At least one staff user must remain.' });
      return res.status(400).json({ error: 'Could not remove user.' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('delete-user error:', err.message);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// ── Product endpoints ──────────────────────────────────────────────────────

app.get('/api/products', async (_req, res) => {
  try {
    res.json(await getProducts());
  } catch (err) {
    console.error('get-products error:', err.message);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
});

app.get('/api/products/barcode/:barcode', async (req, res) => {
  try {
    res.json(await getProductsByBarcode(req.params.barcode));
  } catch (err) {
    console.error('get-products-by-barcode error:', err.message);
    res.status(500).json({ error: 'Failed to fetch products by barcode.' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const created = await createProduct(req.body || {});
    res.status(201).json(created);
  } catch (err) {
    console.error('create-product error:', err.message);
    const status = err.message.includes('required') || err.message.includes('valid') ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to create product.' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const updated = await updateProduct(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Product not found.' });
    res.json(updated);
  } catch (err) {
    console.error('update-product error:', err.message);
    const status = err.message.includes('required') || err.message.includes('valid') ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to update product.' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const deleted = await deleteProduct(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Product not found.' });
    res.status(204).send();
  } catch (err) {
    console.error('delete-product error:', err.message);
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, gemini: geminiOcr.isAvailable() ? 'configured' : 'not configured' })
);

// ── OCR endpoints ──────────────────────────────────────────────────────────

app.post('/api/extract-product', ocrRateLimit, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided.' });
  try {
    const { result, engine } = await withGeminiFallback(
      () => geminiOcr.extractProductInfo(req.file.buffer, req.file.mimetype),
      () => localOcr.extractProductInfoFromBuffer(req.file.buffer, req.file.mimetype),
      'extract-product'
    );
    res.json({ barcode: result.barcode || '', productName: result.productName || '', engine });
  } catch (err) {
    console.error('extract-product error:', err.message);
    res.status(500).json({ error: `OCR error: ${err.message}` });
  }
});

app.post('/api/extract-batch', ocrRateLimit, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided.' });
  const batchFormat = req.body.batchFormat || '';
  try {
    const { result, engine } = await withGeminiFallback(
      () => geminiOcr.extractBatchInfo(req.file.buffer, req.file.mimetype, batchFormat),
      () => localOcr.extractBatchExtractionFromBuffer(req.file.buffer, req.file.mimetype, batchFormat),
      'extract-batch'
    );
    res.json({
      batchCode: result.batchCode || '',
      productionDate: result.productionDate || '',
      expiryDate: result.expiryDate || '',
      price: result.price || '',
      batchInfoText: result.batchInfoText || '',
      engine,
    });
  } catch (err) {
    console.error('extract-batch error:', err.message);
    res.status(500).json({ error: `OCR error: ${err.message}` });
  }
});

app.post('/api/extract-batch-format', ocrRateLimit, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided.' });
  try {
    const { result, engine } = await withGeminiFallback(
      () => geminiOcr.extractBatchFormat(req.file.buffer, req.file.mimetype),
      () => localOcr.extractBatchFormatFromBuffer(req.file.buffer, req.file.mimetype),
      'extract-batch-format'
    );
    res.json({
      batchInfoText: result.batchInfoText || '',
      batchFormat: result.batchFormat || '',
      mrp: result.mrp === null || result.mrp === undefined ? null : Number(result.mrp),
      productionDate: result.productionDate || null,
      expiryDate: result.expiryDate || null,
      engine,
    });
  } catch (err) {
    console.error('extract-batch-format error:', err.message);
    res.status(500).json({ error: `OCR error: ${err.message}` });
  }
});

app.post('/api/analyze-image', ocrRateLimit, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided.' });
  const prompt = req.body.prompt || '';
  try {
    const { result, engine } = await withGeminiFallback(
      () => geminiOcr.analyzeImage(req.file.buffer, req.file.mimetype, prompt),
      () => localOcr.analyzeImageFromBuffer(req.file.buffer, req.file.mimetype, prompt),
      'analyze-image'
    );
    res.json({ result, engine });
  } catch (err) {
    console.error('analyze-image error:', err.message);
    res.status(500).json({ error: `OCR error: ${err.message}` });
  }
});

// ── Serve frontend static files ────────────────────────────────────────────

const FRONTEND_DIST = path.join(__dirname, '../frontend/dist');
app.use(express.static(FRONTEND_DIST));
app.get(/^(?!\/api).*$/, (_req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));

// ── Start ──────────────────────────────────────────────────────────────────

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      const geminiStatus = geminiOcr.isAvailable()
        ? 'Gemini OCR (primary) + Local OCR (fallback)'
        : 'Local OCR only (set GEMINI_API_KEY in .env.local to enable Gemini)';
      console.log(`Backend running on http://localhost:${PORT}`);
      console.log(`OCR mode: ${geminiStatus}`);
    });
  })
  .catch((err) => {
    console.error('Database initialization failed:', err.message);
    process.exit(1);
  });
