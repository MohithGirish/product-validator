# Frontend

React 19 + TypeScript + Vite app for the validator. It talks to the backend in `../backend` over `/api`. Setup and configuration are in the [root README](../README.md).

## Run

1. Install dependencies: `npm install`
2. From the repository root, run frontend + backend together: `npm run dev`

Frontend only (from this folder): `npm run dev` — serves on port 3002 and proxies `/api` to the backend on port 3001.

Production build: `npm run build` (output in `dist/`, served by the backend).

Every source file starts with a short comment describing what it does; `CLAUDE.md` has an architecture overview.
