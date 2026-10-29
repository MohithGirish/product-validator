# Factory Product Code Validator

A factory QC tool (built for ITC Limited) for validating product barcodes and printed batch code blocks using OCR. Upload or capture a product label image — the app identifies the product by barcode, then verifies the **entire** printed code block (batch number format, MRP, production/expiry dates, and shelf life) against the product database.

Live deployment: Render (`product-validator-7i2l.onrender.com`).

## Features

- **Two-step OCR validation** — barcode scan → batch code validation
- **Full-code verification** — checks batch-code format, MRP/price, production & expiry dates, shelf life, and a per-line comparison of the printed info block (not just the format line)
- **Cloud OCR / Local OCR** — uses Google Gemini OCR by default; automatically falls back to local OCR (PaddleOCR → Tesseract) when Gemini is unreachable
- **Role-based access** — Admin sees all users' history and can manage products and users; Staff sees only their own records. Enforced by the server, not just hidden in the UI
- **Secure sign-in** — passwords stored as scrypt hashes; a session token keeps you signed in across reloads for 7 days
- **User management** — admins add/remove sign-in accounts; enforced password policy and account-protection invariants (see below)
- **Validation history** — audit log stored on the server, so every device sees the same records; thumbnails in the list and the full-size photo on tap; admin can clear all history
- **Image analysis** — the Analyze tab runs free-form OCR on any label image
- **Product database** — CRUD with batch format editor and auto-inference from label images
- **CSV export** — the product list and the full validation log
- **Mobile-first responsive UI** — bottom tab navigation, card layouts that replace wide tables on phones, a full-screen portrait camera, safe-area (notch / gesture-bar) handling, and dialogs that always stay reachable
- **Light / Dark / System theme** — a three-option appearance picker (in the top-right ⋮ menu) with a "graphite navy" dark palette; follows the device theme when set to System, and remembers your choice

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS (CDN) |
| Backend | Node.js, Express |
| Database | libSQL — [Turso](https://turso.tech) (cloud) in production; local SQLite file as fallback (`@libsql/client`) |
| Primary OCR | Google Gemini API (`gemini-3.8-flash`) |
| Fallback OCR | PaddleOCR (Python) → Tesseract.js |
| Barcode decoding | ZXing (`@zxing/library`) |
| Image processing | Sharp |

## Project Structure

Every source file starts with a short comment describing what it does.

```
factory-product-code-validator/
├── backend/
│   ├── server.js               # Express API (port 3001): auth, users, products, OCR routing; serves the built frontend in production
│   ├── db.js                   # libSQL/Turso schema, seeding; products, users, sessions, history
│   ├── geminiOcr.js            # Cloud OCR (Gemini)
│   ├── localOcr.js             # Offline OCR: PaddleOCR / Tesseract + ZXing barcode decoding
│   ├── seedProducts.js         # Products seeded into an empty database
│   ├── eng.traineddata         # Tesseract English language data
│   ├── data/app.db             # Local SQLite fallback DB (created on demand, not committed)
│   ├── test/api.test.js        # API tests (npm test)
│   └── scripts/
│       ├── paddle_ocr_runner.py # PaddleOCR bridge (JSON over stdin/stdout)
│       ├── printDbPath.js      # npm run db:path
│       └── resetDb.js          # npm run db:reset
├── frontend/
│   ├── index.html              # App shell: Tailwind config, fonts, dark-mode remap
│   ├── App.tsx                 # Providers + page switching (no router)
│   ├── components/
│   │   ├── ValidatorPage.tsx   # Main two-step validator
│   │   ├── ResultModal.tsx     # Per-check validation result
│   │   ├── DatabasePage.tsx    # Product CRUD + ProductFormModal
│   │   ├── HistoryPage.tsx     # Validation audit log
│   │   ├── AdminPage.tsx       # User management + administrator log
│   │   ├── LoginPage.tsx, Header.tsx, ThemeMenu.tsx, CameraModal.tsx
│   │   ├── AnalysisPage.tsx    # Free-form image analysis (Analyze tab)
│   │   ├── common/             # Modal, ConfirmDialog, Portal, Toast, Spinner
│   │   └── icons/              # Inline SVG icons
│   ├── context/                # AuthContext (sign-in, session restore, history), ThemeContext
│   ├── hooks/                  # useAuth, useBodyScrollLock, useLocalStorage
│   ├── services/
│   │   ├── apiClient.ts        # fetch with the session token; signs out on 401
│   │   ├── databaseService.ts  # Users, products and history via the API
│   │   └── imageExtractionService.ts # Calls the OCR endpoints
│   ├── utils/
│   │   ├── validateProduct.ts  # Full-code validation logic
│   │   ├── exportUtils.ts      # CSV download
│   │   └── imageUtils.ts       # Shrinks photos for history (thumbnail + full size)
│   ├── constants.ts            # Offline seed data for localStorage
│   └── types.ts
├── package.json                # Workspace scripts (dev, build, start)
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

The backend reads `.env.local` from the repo root. Edit it:

```env
# Get a free key at https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_key_here

# Persistence (optional locally, REQUIRED in production — see Persistence below).
# Leave blank for local dev to use the bundled SQLite file.
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
```

If `GEMINI_API_KEY` is blank, the app uses local OCR only — no extra config needed.

If the `TURSO_*` vars are blank, the app stores data in a local SQLite file (`backend/data/app.db`) — fine for development.

#### All settings

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | — | Enables cloud OCR. Blank = local OCR only |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini model. If Google retires the model, every OCR request fails with `404 Not Found` — change it here (and on your host) |
| `GEMINI_TIMEOUT_MS` | `30000` | Gemini request timeout; a timeout triggers the local-OCR fallback |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | — | Turso database. Blank = local SQLite file |
| `OCR_ENGINE` | `paddle` | Local OCR engine: `paddle` (PaddleOCR → Tesseract) or `tesseract` |
| `PADDLE_PYTHON_EXECUTABLE` | auto (`.venv`, then `python`) | Python used to run PaddleOCR |
| `PADDLE_OCR_LANG` | `en` | PaddleOCR language |
| `PADDLE_TIMEOUT_MS` | `25000` | PaddleOCR timeout |
| `PORT` | `3001` | Backend port |

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

## Persistence & Deployment

Products, users, sign-in sessions and validation history all live in a libSQL database on the server. History stores a small thumbnail of each photo for the list and a 1280px copy for the full-size viewer, so each record is a few hundred KB at most.

**Offline:** if a scan result can't reach the server, it is kept on the device (with a notice) and uploaded automatically after the next successful save or sign-in.

**Upgrading from a version that kept history in the browser:** history saved on a device by older versions is uploaded automatically the next time someone signs in on that device. Staff upload their own records; an admin uploads every record on the device, each keeping its original author. Uploaded records are then removed from the device, and records that fail to upload stay for the next sign-in.

The server database is selected purely by environment variables:

| Mode | When | Where data lives |
|---|---|---|
| **Turso (cloud)** | `TURSO_DATABASE_URL` is set | Turso — persists across restarts, redeploys, and machines |
| **Local SQLite** | `TURSO_*` not set | `backend/data/app.db` — a file on the local disk |

**Production must use Turso.** Hosts like Render have an *ephemeral* disk, so the local file is wiped on every deploy/restart. The local file is kept as a deliberate, **redundant fallback** (see the banner comment in `backend/db.js`): if Turso is ever unreachable, clear the `TURSO_*` vars and the app reverts to the local file with no code changes.

### Set up Turso

1. Create a free database at [app.turso.tech](https://app.turso.tech).
2. Copy the database **URL** (`libsql://…`) and **create an auth token**.
3. Set both as environment variables — locally in `.env.local`, and on your host (e.g. **Render → Environment**):

   ```env
   TURSO_DATABASE_URL=libsql://your-db-name.turso.io
   TURSO_AUTH_TOKEN=eyJ...your-token...
   ```

   > Paste the **raw** values — no surrounding quotes and no `token` label prefix. A quoted token makes Turso reject every request with `HTTP 400`.

On first boot against an empty database the app auto-creates the tables and seeds the default products and users; an already-populated database is left untouched.

### Deploy on Render

One web service runs the backend and serves the built frontend from the same origin. The root `package.json` scripts are set up for this:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Start command | `npm run start` |
| Environment | `GEMINI_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (optionally `GEMINI_MODEL`) |

With auto-deploy on (Render's default), every push to `main` deploys. A value set in Render's Environment overrides the code default, so if you set `GEMINI_MODEL` there, keep it current.

## Default Credentials

Seeded into the `users` table on first run (against an empty database):

| Username | Password | Role | Notes |
|---|---|---|---|
| `Admin` | `Admin@123` | Admin — full access, all users' history, product & user management | **Permanent** — cannot be deleted |
| `User1` | `User1@123` | Staff — own history only | |
| `User2` | `User2@123` | Staff — own history only | |
| `User3` | `User3@123` | Staff — own history only | |
| `User4` | `User4@123` | Staff — own history only | |

> These are starting credentials for setup. Change the staff passwords before real use (remove and re-create via the Admin → User Management screen). Passwords are stored as scrypt hashes and never sent back to the client. Databases created before hashing existed are converted automatically at startup; the same passwords keep working.

## Sign-in & Access Control

- Signing in returns a **session token**. The browser keeps it in `localStorage` and sends it as `Authorization: Bearer <token>`, so a page reload keeps you signed in. Sessions last **7 days**; signing out, or an admin removing your account, ends them at once.
- Every `/api` route except `/api/auth/login` and `/api/health` requires a valid token (`401` otherwise).
- **Admin-only** (`403` for staff): listing, adding and removing users; adding, editing and deleting products; clearing history.
- **Staff** can read products, run OCR, save validation results and see their own history (including full-size photos of their own records only).
- The database stores only a SHA-256 hash of each token, so a copy of the database can't be used to sign in.

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
| **Barcode** | The scanned barcode (already used to find the product), shown for the record | Informational only |
| **Batch Code Format** | The batch number matches the product's `batchNumberFormat` pattern | Yes |
| **MRP / Price** | The printed price matches the product's stored MRP (when applicable) | Yes |
| **Production / Expiry Dates** | Both dates are present and expiry is after production | Yes |
| **Shelf Life** | `expiry − production` matches the stored shelf life (within tolerance) | Yes |
| **Info Block Lines** | Per-line, OCR-tolerant comparison of the printed block against the reference | Informational only |

The result modal shows each check with its **expected vs. found** values. Informational checks never fail an otherwise-valid product on their own.

## OCR Mode

The mode badge in the top-right corner of the Validator page shows which engine answered the last scan:

- **Cloud OCR** (navy) — Gemini
- **Local OCR** (amber) — PaddleOCR / Tesseract

The backend falls back to local OCR only when Gemini can't be reached (network error, DNS failure, timeout). Any other Gemini error — a bad key, quota, or a retired model — is shown to the user as `OCR error: …` so it gets noticed and fixed.

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
| `GET` | `/api/health` | Server status and whether Gemini is configured |
| `POST` | `/api/auth/login` | Sign in; returns `{ user, token }` (never the password) |
| `GET` | `/api/auth/me` | The user for the current token |
| `POST` | `/api/auth/logout` | End the current session |
| `GET` | `/api/users` | List users (admins first, then staff) — admin |
| `POST` | `/api/users` | Create a user (enforces the password policy) — admin |
| `DELETE` | `/api/users/:id` | Remove a user (blocked for the protected admin / last admin / last staff) — admin |
| `GET` | `/api/products` | List all products |
| `GET` | `/api/products/barcode/:barcode` | Find products by barcode |
| `POST` | `/api/products` | Create product — admin |
| `PUT` | `/api/products/:id` | Update product — admin |
| `DELETE` | `/api/products/:id` | Delete product — admin |
| `GET` | `/api/history` | Validation history, newest first (staff: own records; admin: all) |
| `POST` | `/api/history` | Save a validation record (same id twice = saved once) |
| `GET` | `/api/history/:id/images/:which` | Full-size `barcode` or `batch` photo of a record |
| `DELETE` | `/api/history` | Clear all history — admin |
| `POST` | `/api/extract-product` | Extract barcode + product name from image |
| `POST` | `/api/extract-batch` | Extract batch code, dates and price from image |
| `POST` | `/api/extract-batch-format` | Infer batch format from a label image |
| `POST` | `/api/analyze-image` | Free-form OCR analysis of an image |

All routes except login and health need `Authorization: Bearer <token>`. The OCR endpoints take a multipart `image` field (max **4 MB**), are rate-limited to 20 requests/minute per IP, and return an `engine` field (`gemini` or `local`).

## Tests

```bash
cd backend && npm test
```

Starts the real server against a temporary SQLite file for each test and checks sign-in, sessions, password hashing (including converting old plain-text passwords), access control, history, and the existing product and account rules. No external service is called.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start backend + frontend together |
| `npm run dev:backend` | Backend only (port 3001) |
| `npm run dev:frontend` | Frontend only (port 3002) |
| `npm run build` | Production frontend build |
| `npm run start` | Production backend start (serves the built frontend) |
| `cd backend && npm run db:path` | Print the path of the local SQLite file |
| `cd backend && npm run db:reset` | Delete the **local** SQLite file (`backend/data/app.db`) so it's recreated + reseeded on next start. Does **not** affect a Turso database — reset that from the Turso dashboard. |
| `cd backend && npm run ocr:paddle:check` | Verify PaddleOCR installation |
| `cd backend && npm test` | Run the API tests |

No linter or formatter is configured yet, and the frontend has no automated tests.
