# Factory Product Code Validator

A factory QC tool for validating product barcodes and batch codes using OCR. Upload or capture a product label image — the app identifies the product by barcode, then validates the batch code format, production/expiry dates, and MRP against the product database.

## Features

- **Two-step OCR validation** — barcode scan → batch code validation
- **Gemini Mode / Local Mode** — uses Google Gemini OCR by default; automatically falls back to local OCR (PaddleOCR → Tesseract) on network failure
- **Role-based access** — Admin sees all users' history and can manage products; Staff sees only their own records
- **Validation history** — full audit log with thumbnails of scanned images; admin can clear all history
- **Product database** — CRUD with batch format editor and auto-inference from label images
- **CSV export** — admin can export the full validation log

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| Database | SQLite (`sqlite3`) |
| Primary OCR | Google Gemini API (`gemini-2.5-flash`) |
| Fallback OCR | PaddleOCR (Python) → Tesseract.js |
| Barcode decoding | ZXing (`@zxing/library`) |
| Image processing | Sharp |

## Project Structure

```
factory-product-code-validator/
├── backend/
│   ├── server.js               # Express API server (port 3001)
│   ├── db.js                   # SQLite schema and CRUD
│   ├── geminiOcr.js            # Gemini OCR functions
│   ├── localOcr.js             # PaddleOCR / Tesseract fallback
│   ├── seedProducts.js         # Initial product seed data
│   └── scripts/
│       └── paddle_ocr_runner.py
├── frontend/
│   ├── components/
│   │   ├── ValidatorPage.tsx   # Main two-step validator
│   │   ├── HistoryPage.tsx     # Validation audit log
│   │   ├── DatabasePage.tsx    # Product CRUD
│   │   └── AdminPage.tsx       # Admin dashboard
│   ├── context/AuthContext.tsx
│   ├── services/
│   │   ├── databaseService.ts
│   │   └── imageExtractionService.ts
│   └── types.ts
├── .env.example
└── .env.local                  # Your local config (not committed)
```

## Setup

### Prerequisites

- Node.js 18+
- Python 3.8+ (optional — for PaddleOCR; Tesseract is the automatic fallback)

### 1. Install dependencies

```bash
# From the repo root
npm run install:all
```

Or manually:

```bash
cd frontend && npm install
cd ../backend && npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Get a free key at https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_key_here
```

If `GEMINI_API_KEY` is blank or the network is unreachable, the app automatically switches to local OCR — no extra config needed.

### 3. (Optional) Set up PaddleOCR

PaddleOCR gives better local accuracy than Tesseract alone. Skip this if you're always online.

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install paddlepaddle paddleocr

# Verify it works
cd backend && npm run ocr:paddle:check
```

If PaddleOCR is not installed, the app falls back to Tesseract automatically.

### 4. Run

```bash
# Start both frontend + backend together (from repo root)
npm run dev

# Or start separately:
npm run dev:backend    # backend on port 3001
npm run dev:frontend   # frontend on port 3002
```

Open [http://localhost:3002](http://localhost:3002).

## Default Credentials

| Username | Password | Role |
|---|---|---|
| `admin` | `admin` | Admin — full access, all users' history, product management |
| `qcmanager` | `qcmanager` | Staff — own history only, read-only product view |

## Batch Number Format Convention

Products store a `batchNumberFormat` string using placeholder characters:

| Character | Matches |
|---|---|
| `#` | Any digit (0–9) |
| `@` | Any uppercase letter (A–Z) |
| anything else | Literal character |

**Example:** format `##:## ##@##` matches batch code `16:47 01B11`.

This format string is used to build a validation regex and also guides the local OCR correction engine to fix common character misreads (e.g. `O→0`, `l→1`, `S→5`).

## OCR Mode

The mode badge in the top-right corner of the Validator page shows which engine is active:

- **Gemini Mode** (blue) — Gemini API is reachable and being used
- **Local Mode** (amber) — network unavailable; using PaddleOCR / Tesseract

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Server status and Gemini availability |
| `GET` | `/api/products` | List all products |
| `GET` | `/api/products/barcode/:barcode` | Find products by barcode |
| `POST` | `/api/products` | Create product |
| `PUT` | `/api/products/:id` | Update product |
| `DELETE` | `/api/products/:id` | Delete product |
| `POST` | `/api/extract-product` | Extract barcode + product name from image |
| `POST` | `/api/extract-batch` | Extract and validate batch code from image |
| `POST` | `/api/extract-batch-format` | Infer batch format from a label image |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start backend + frontend together |
| `npm run dev:backend` | Backend only (port 3001) |
| `npm run dev:frontend` | Frontend only (port 3002) |
| `npm run build` | Production frontend build |
| `npm run start` | Production backend start |
| `cd backend && npm run db:reset` | Reset the SQLite database |
| `cd backend && npm run ocr:paddle:check` | Verify PaddleOCR installation |
