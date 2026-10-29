# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install frontend dependencies (from frontend folder)
npm install

# Start frontend-only dev server (http://localhost:3002)
npm run dev

# Start frontend + backend together (from repository root)
# npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

No test suite is configured. There is no linter configured.

## Environment Setup

Settings live in `../.env.local` (see `../.env.example` and the root README). `GEMINI_API_KEY` enables cloud OCR; without it the backend uses local OCR only.

## Architecture

This is a React 19 + TypeScript SPA built with Vite. OCR, products and users are handled by the Node backend in `../backend`. Every source file starts with a header comment describing what it does; keep those up to date when a file's job changes.

### Core Data Flow

The validation workflow is a two-step OCR pipeline (Gemini on the backend, local OCR fallback when Gemini is unreachable):
1. **Step 1 – Barcode scan**: User uploads/captures a product image → `imageExtractionService.extractProductInfoFromImage()` returns `{barcode, productName, engine}` → `databaseService.findProductsByBarcode()` looks up the product.
2. **Step 2 – Batch code scan**: User uploads/captures the batch info image → `imageExtractionService.extractBatchCodeFromImage()` returns `{batchCode, productionDate, expiryDate, price, batchInfoText, engine}` → `ValidatorPage` calls `validateFullCode()` in [utils/validateProduct.ts](utils/validateProduct.ts), which verifies the **entire** printed code block against the master record: batch-code format, MRP/price, shelf-life (expiry − production vs. stored `shelfLife`), date presence/order, and a per-line generalized (#/@) comparison of the info block. Each sub-check returns a pass/fail with expected-vs-found values, surfaced in `ResultModal`.

### Batch Number Format Convention

Products store a `batchNumberFormat` string using two placeholder characters:
- `#` → matches any digit (0–9)
- `@` → matches any uppercase letter (A–Z)
- All other characters are literal (e.g., `:`, space)

Example: `"##:## ##@##"` matches `"16:47 01B11"`. This format string is used to build a regex for local validation.

### Database / Persistence Layer (`services/databaseService.ts`)

The `databaseService` object is the sole interface for data access:
- **Users**: backend only (`/api/users`, `/api/auth/login`).
- **Products**: backend (`/api/products`); if a request fails, falls back to `localStorage` (`db_products`, seeded from `MASTER_PRODUCT_DATABASE` in [constants.ts](constants.ts)).
- **Validation history**: `localStorage` only (`db_history`). It is never sent to the backend, so it is per-browser.

The Google Sheets mode (`GOOGLE_APPS_SCRIPT_URL`) is switched off. `MOCK_USERS` in `constants.ts` is still written to `localStorage` but nothing reads it.

### Auth & Role Model (`context/AuthContext.tsx`)

`AuthProvider` wraps the entire app. The `useAuth()` hook provides `{user, login, logout, history, addHistoryRecord, clearHistory}`. Credentials are checked by the backend; the signed-in user is held in memory only (a reload signs out). Roles are `'admin'` or `'staff'`:
- **admin**: sees all users' history, can add/edit/delete products, can access `AdminPage`.
- **staff**: sees only their own history records.

Default accounts are seeded by `../backend/db.js` (`Admin` / `Admin@123`, `User1`–`User4` / `User1@123`…). The API has no session tokens: role checks happen only in the UI.

### Page Routing

There is no router library. `App.tsx` manages a `currentPage` state (enum `Page`) and conditionally renders page components. Navigation is handled by `Header`. The `AdminPage` is only rendered when `user.role === 'admin'`.

### Key Components

- [ValidatorPage.tsx](components/ValidatorPage.tsx) — the primary feature; owns the multi-step validation state machine (`'barcode' | 'market_select' | 'batch'`).
- [DatabasePage.tsx](components/DatabasePage.tsx) — product CRUD UI; exports `ProductFormModal` (also used by `ValidatorPage` when admin scans an unknown barcode).
- [AdminPage.tsx](components/AdminPage.tsx) — user management and the administrator log, admin-only.
- [HistoryPage.tsx](components/HistoryPage.tsx) — view validation records; admins can clear them.
- [AnalysisPage.tsx](components/AnalysisPage.tsx) — free-form image analysis via `/api/analyze-image`. Not linked from `App.tsx`.
- [CameraModal.tsx](components/CameraModal.tsx) — wraps the browser camera API for in-app capture.

### Image Extraction Service (`services/imageExtractionService.ts`)

All image routes call the backend over `/api`, which runs Gemini OCR (or local OCR + barcode decoding as a fallback). Images are uploaded as multipart form data (max 4 MB) with a 60 s client timeout; responses are JSON and include the `engine` that answered.
