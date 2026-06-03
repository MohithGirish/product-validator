# Factory Product Code Validator

A factory QC tool (built for ITC Limited) for validating product barcodes and printed batch code blocks using OCR. Upload or capture a product label image — the app identifies the product by barcode, then verifies the **entire** printed code block (batch number format, MRP, production/expiry dates, and shelf life) against the product database.

> 📖 **End-user instructions:** see [USER_GUIDE.md](USER_GUIDE.md) for a complete, step-by-step guide.

## Features

- **Two-step OCR validation** — barcode scan → batch code validation
- **Full-code verification** — checks batch-code format, MRP/price, production & expiry dates, shelf life, and a per-line comparison of the printed info block (not just the format line)
- **Cloud OCR / Local OCR** — uses Google Gemini OCR by default; automatically falls back to local OCR (PaddleOCR → Tesseract) on network failure
- **Role-based access** — Admin sees all users' history and can manage products and users; Staff sees only their own records
- **User management** — admins add/remove sign-in accounts; enforced password policy and account-protection invariants (see below)
- **Validation history** — full audit log with thumbnails of scanned images; admin can clear all history
- **Product database** — CRUD with batch format editor and auto-inference from label images
- **CSV export** — admin can export the full validation log
- **Mobile-first responsive UI** — bottom tab navigation, card layouts that replace wide tables on phones, a full-screen portrait camera, safe-area (notch / gesture-bar) handling, and dialogs that always stay reachable
- **Light / Dark / System theme** — a three-option appearance picker (in the top-right ⋮ menu) with a premium "graphite navy" dark palette; follows the device theme when set to System, and remembers your choice

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
│   ├── server.js               # Express API server (port 3001): auth, users, products, OCR
│   ├── db.js                   # SQLite schema + CRUD for products and users
│   ├── geminiOcr.js            # Cloud (Gemini) OCR functions
│   ├── localOcr.js             # PaddleOCR / Tesseract fallback
│   ├── seedProducts.js         # Initial product seed data
│   └── scripts/
│       └── paddle_ocr_runner.py
├── frontend/
│   ├── components/
│   │   ├── ValidatorPage.tsx   # Main two-step validator
│   │   ├── HistoryPage.tsx     # Validation audit log
│   │   ├── DatabasePage.tsx    # Product CRUD
│   │   ├── AdminPage.tsx       # Admin dashboard + user management
│   │   └── common/             # Reusable Modal, ConfirmDialog, Toast, Spinner
│   ├── context/AuthContext.tsx
│   ├── services/
│   │   ├── databaseService.ts
│   │   └── imageExtractionService.ts
│   ├── utils/validateProduct.ts # Full-code validation logic
│   └── types.ts
├── USER_GUIDE.md               # End-user guide
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

Open [http://localhost:3002](http://localhost:3002). The dev server proxies `/api` to the backend on port 3001.

## Default Credentials

Seeded into the SQLite `users` table on first run:

| Username | Password | Role | Notes |
|---|---|---|---|
| `Admin` | `Admin@123` | Admin — full access, all users' history, product & user management | **Permanent** — cannot be deleted |
| `User1` | `User1@123` | Staff — own history only | |
| `User2` | `User2@123` | Staff — own history only | |
| `User3` | `User3@123` | Staff — own history only | |
| `User4` | `User4@123` | Staff — own history only | |

> These are starting credentials for setup. Change the staff passwords before real use (remove and re-create via the Admin → User Management screen). Passwords are stored in the local SQLite DB and are never sent back to the client.

## User Management & Account Rules

Admins manage accounts on the **Admin** screen. The following rules are enforced on the backend (the source of truth) and reflected in the UI:

- **Password policy** — at least **6 characters**, with **at least one letter** and **at least one special character** (e.g. `@ & * !`). A live checklist in the Add-User dialog turns green as each rule is met.
- **The original `Admin` account can never be deleted.** Protection is enforced at the database level (an `is_protected` flag + a SQLite `BEFORE DELETE` trigger), and is self-healed on every startup.
- **At least one administrator** must always remain.
- **At least one staff user** must always remain.
- Admins are always listed first, then staff; within each group users are sorted naturally by username.

## Batch Number Format Convention

Products store a `batchNumberFormat` string using placeholder characters:

| Character | Matches |
|---|---|
| `#` | Any digit (0–9) |
| `@` | Any uppercase letter (A–Z) |
| anything else | Literal character |

**Example:** format `##:## ##@##` matches batch code `16:47 01B11`.

This format string is used to build a validation regex and also guides the local OCR correction engine to fix common character misreads (e.g. `O→0`, `l→1`, `S→5`).

## What Gets Validated

On the second step, the app verifies the **entire** printed code block against the product's master record (see `frontend/utils/validateProduct.ts`):

| Check | Verifies | Affects verdict |
|---|---|---|
| **Batch Code Format** | The batch number matches the product's `batchNumberFormat` pattern | Yes |
| **MRP / Price** | The printed price matches the product's stored MRP (when applicable) | Yes |
| **Production / Expiry Dates** | Both dates are present and expiry is after production | Yes |
| **Shelf Life** | `expiry − production` matches the stored shelf life (within tolerance) | Yes |
| **Info Block Lines** | Per-line, OCR-tolerant comparison of the printed block against the reference | Informational only |

The result modal shows each check with its **expected vs. found** values. "Info Block Lines" is a diagnostic and does not by itself fail an otherwise-valid product.

## OCR Mode

The mode badge in the top-right corner of the Validator page shows which engine is active:

- **Cloud OCR** (navy) — the cloud OCR service (Gemini) is reachable and being used
- **Local OCR** (amber) — network unavailable; using PaddleOCR / Tesseract

## Theme & Appearance

The app supports three appearance modes, selectable from the **⋮ menu** in the top-right corner (next to the user avatar), which also houses **Sign out**:

| Mode | Behavior |
|---|---|
| **Light** | Always light |
| **Dark** | Always dark — a "graphite navy" palette (a black/gray blend, never pure black) |
| **System** | Follows the device's OS theme and updates live when it changes |

The choice is saved to `localStorage` and applied before first paint (no light-mode flash on reload). Implementation notes for contributors:

- Dark mode is `class`-based (`<html class="dark">`), toggled by `frontend/context/ThemeContext.tsx`.
- Rather than annotate every element, the dark palette is applied via a **global token remap** in `frontend/index.html`: the hardcoded `white` / `slate-*` (and their opacity variants used by the header/nav) are retargeted to dark surface/text tokens under `html.dark`. Brand navy elements (login panel, modal headers) are intentionally preserved.

## Mobile Support

The UI is designed mobile-first and is the primary deployment target:

- **Bottom tab navigation** on phones (Validator / Database / History / Admin); the top header is reserved for branding and the ⋮ menu.
- **Card layouts** replace wide data tables on small screens (Database, Admin log, History) — no horizontal scrolling, tap-friendly actions.
- **Full-screen portrait camera** for capture, with the shutter clear of the gesture bar.
- **Safe-area aware** — content and fixed bars respect the notch, rounded corners, and home-indicator (`env(safe-area-inset-*)`).
- **Dialogs render in a portal** to `document.body` so full-screen modals are never clipped by an animated/transformed ancestor, and background scroll is locked while a dialog is open.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Server status and Gemini availability |
| `POST` | `/api/auth/login` | Authenticate; returns the user (never the password) |
| `GET` | `/api/users` | List users (admins first, then staff) |
| `POST` | `/api/users` | Create a user (enforces the password policy) |
| `DELETE` | `/api/users/:id` | Remove a user (blocked for the protected admin / last admin / last staff) |
| `GET` | `/api/products` | List all products |
| `GET` | `/api/products/barcode/:barcode` | Find products by barcode |
| `POST` | `/api/products` | Create product |
| `PUT` | `/api/products/:id` | Update product |
| `DELETE` | `/api/products/:id` | Delete product |
| `POST` | `/api/extract-product` | Extract barcode + product name from image |
| `POST` | `/api/extract-batch` | Extract and validate batch code from image |
| `POST` | `/api/extract-batch-format` | Infer batch format from a label image |
| `POST` | `/api/analyze-image` | Free-form OCR analysis of an image |

> The OCR endpoints are rate-limited to 20 requests/minute per IP.

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
