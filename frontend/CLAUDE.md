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

No API key is required for local OCR mode.

## Architecture

This is a React 19 + TypeScript SPA built with Vite. Image extraction and product persistence are handled by the Node backend in `../backend`.

### Core Data Flow

The validation workflow is a two-step local OCR pipeline:
1. **Step 1 – Barcode scan**: User uploads/captures a product image → `imageExtractionService.extractProductInfoFromImage()` returns `{barcode, productName}` → `databaseService.findProductsByBarcode()` looks up the product.
2. **Step 2 – Batch code scan**: User uploads/captures the batch info image → `imageExtractionService.extractBatchCodeFromImage()` returns `{batchCode, productionDate, expiryDate, price, batchInfoText}` → `ValidatorPage` calls `validateFullCode()` in [utils/validateProduct.ts](utils/validateProduct.ts), which verifies the **entire** printed code block against the master record: batch-code format, MRP/price, shelf-life (expiry − production vs. stored `shelfLife`), date presence/order, and a per-line generalized (#/@) comparison of the info block. Each sub-check returns a pass/fail with expected-vs-found values, surfaced in `ResultModal`.

### Batch Number Format Convention

Products store a `batchNumberFormat` string using two placeholder characters:
- `#` → matches any digit (0–9)
- `@` → matches any uppercase letter (A–Z)
- All other characters are literal (e.g., `:`, space)

Example: `"##:## ##@##"` matches `"16:47 01B11"`. This format string is used to build a regex for local validation.

### Database / Persistence Layer (`services/databaseService.ts`)

The `databaseService` object is the sole interface for data access. It supports two backends, selected by `GOOGLE_APPS_SCRIPT_URL`:
- **Empty string (default)**: LocalStorage mode — data lives in `localStorage` under keys `db_users`, `db_products`, `db_history`.
- **URL set**: Google Sheets mode — GET/POST requests to the Apps Script webhook.

On first load, `initializeDatabase()` seeds localStorage from `MOCK_USERS` and `MASTER_PRODUCT_DATABASE` in [constants.ts](constants.ts) using merge logic (won't overwrite existing local records).

### Auth & Role Model (`context/AuthContext.tsx`)

`AuthProvider` wraps the entire app. The `useAuth()` hook provides `{user, login, logout, history, addHistoryRecord}`. Roles are `'admin'` or `'staff'`:
- **admin**: sees all users' history, can add/edit/delete products, can access `AdminPage`.
- **staff**: sees only their own history records.

Default credentials are in [constants.ts](constants.ts) (e.g., `admin`/`admin`).

### Page Routing

There is no router library. `App.tsx` manages a `currentPage` state (enum `Page`) and conditionally renders page components. Navigation is handled by `Header`. The `AdminPage` is only rendered when `user.role === 'admin'`.

### Key Components

- [ValidatorPage.tsx](components/ValidatorPage.tsx) — the primary feature; owns the multi-step validation state machine (`'barcode' | 'market_select' | 'batch'`).
- [DatabasePage.tsx](components/DatabasePage.tsx) — product CRUD UI; exports `ProductFormModal` (also used by `ValidatorPage` when admin scans an unknown barcode).
- [AdminPage.tsx](components/AdminPage.tsx) — user management, admin-only.
- [HistoryPage.tsx](components/HistoryPage.tsx) — view/export validation records.
- [AnalysisPage.tsx](components/AnalysisPage.tsx) — local OCR text extraction and detected-field summary.
- [CameraModal.tsx](components/CameraModal.tsx) — wraps the browser camera API for in-app capture.

### Local Extraction Service (`services/imageExtractionService.ts`)

All image routes call the local backend over `/api`, which performs OCR and barcode decoding on the server. Images are uploaded as multipart form data and returned as structured JSON or readable OCR summaries.
