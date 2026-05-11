# Backend

## Run

- Install deps: `npm install`
- Dev mode: `npm run dev`
- Start mode: `npm start`
- Show DB path: `npm run db:path`
- Reset DB (reseed on next start): `npm run db:reset`

## Environment

No API key is required. Image extraction runs locally with OCR and barcode decoding.

### OCR Engine

Backend OCR now uses PaddleOCR as the primary engine, with automatic fallback to
Tesseract if PaddleOCR is unavailable.

One-time Python setup (inside your existing `.venv`):

- `pip install paddleocr paddlepaddle`

Optional environment variables in `.env.local`:

- `OCR_ENGINE=paddle` (default), or `tesseract` to force legacy OCR
- `PADDLE_PYTHON_EXECUTABLE=python` (set full path if needed)
- `PADDLE_OCR_LANG=en`
- `PADDLE_TIMEOUT_MS=25000`

## Product Database

- Engine: SQLite
- File: `backend/data/app.db`
- Seed source: `backend/seedProducts.js`

## API

### Health
- `GET /api/health`

### Products
- `GET /api/products`
- `GET /api/products/barcode/:barcode`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`

### Local OCR Extraction
- `POST /api/extract-product`
- `POST /api/extract-batch`
- `POST /api/extract-batch-format`
- `POST /api/analyze-image`
