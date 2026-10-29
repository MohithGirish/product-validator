# Backend

Express API for the validator: sign-in, user management, product CRUD and OCR. In production it also serves the built frontend. Setup, configuration and the full API list are in the [root README](../README.md).

## Run

- Install deps: `npm install`
- Dev mode (restarts on change): `npm run dev`
- Start mode: `npm start`
- Show the local DB path: `npm run db:path`
- Reset the local DB (reseeds on next start): `npm run db:reset`
- Check PaddleOCR: `npm run ocr:paddle:check`
- Run the API tests: `npm test` (each test starts the server on a temporary SQLite file)

Settings are read from `../.env.local` (see `../.env.example`).

## Files

| File | What it does |
|---|---|
| `server.js` | Routes, session checks (`requireAuth`, admin-only routes) and history endpoints. Sends each OCR request to Gemini, falling back to local OCR only when Gemini is unreachable |
| `db.js` | libSQL client (Turso when `TURSO_DATABASE_URL` is set, else `data/app.db`), schema, seeding, products, users (scrypt-hashed passwords), sessions, validation history |
| `test/api.test.js` | End-to-end API tests (`npm test`) |
| `geminiOcr.js` | Cloud OCR with Gemini (`GEMINI_API_KEY`, `GEMINI_MODEL`, default `gemini-3.8-flash`) |
| `localOcr.js` | Offline OCR: PaddleOCR → Tesseract.js for text, ZXing for barcodes, plus parsing of batch codes, dates and prices |
| `seedProducts.js` | Products inserted into an empty database |
| `scripts/paddle_ocr_runner.py` | PaddleOCR bridge called by `localOcr.js` (JSON over stdin/stdout) |
| `eng.traineddata` | Tesseract English language data |

## Local OCR settings

Used only when Gemini isn't configured or can't be reached.

- `OCR_ENGINE=paddle` (default, PaddleOCR → Tesseract) or `tesseract`
- `PADDLE_PYTHON_EXECUTABLE` — Python to use (default: `../.venv`, then `python`)
- `PADDLE_OCR_LANG=en`
- `PADDLE_TIMEOUT_MS=25000`

One-time PaddleOCR setup (inside the repo's `.venv`): `pip install paddleocr paddlepaddle`.
