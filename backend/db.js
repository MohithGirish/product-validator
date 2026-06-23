// ─────────────────────────────────────────────────────────────────────────────
// DATA LAYER — products + users.
//
// Primary store: Turso (cloud libSQL) when TURSO_DATABASE_URL is set. This is the
// source of truth in production and persists across restarts/redeploys.
//
// REDUNDANT FALLBACK: the local SQLite file (backend/data/app.db) below.
//   • Kept on purpose as a safety net — if Turso is ever down/unreachable or you
//     want to run fully offline, unset TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN)
//     and the app reverts to this local file with no code changes.
//   • libSQL speaks SQLite, so the exact same queries serve both backends.
//   • Note: the switch is by env var, not automatic — if TURSO_* is set but the
//     server is failing, init errors out rather than silently using the file.
//     To fail over, clear the Turso env vars and restart.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const seedProducts = require('./seedProducts');

const DATA_DIR = path.resolve(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

// Connection. libSQL speaks SQLite, so the same client serves both:
//   • production  → Turso (set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN). Render's
//                   own disk is ephemeral, so prod MUST set these to persist.
//   • local dev   → a plain SQLite file (no env needed).
const TURSO_URL = process.env.TURSO_DATABASE_URL;
if (!TURSO_URL && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const db = createClient(
  TURSO_URL
    ? { url: TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: `file:${DB_PATH.replace(/\\/g, '/')}` }
);

// Thin wrappers preserving the original (sql, params) → {lastID,changes} / row /
// rows shape, so the rest of this file is unchanged. libSQL is async-only.
async function run(sql, params = []) {
  const r = await db.execute({ sql, args: params });
  return { lastID: r.lastInsertRowid, changes: Number(r.rowsAffected) };
}

async function get(sql, params = []) {
  const r = await db.execute({ sql, args: params });
  return r.rows[0] || null;
}

async function all(sql, params = []) {
  const r = await db.execute({ sql, args: params });
  return r.rows;
}

function mapRowToProduct(row) {
  if (!row) return null;

  return {
    id: row.id,
    barcode: row.barcode,
    productName: row.product_name,
    batchNumberFormat: row.batch_number_format,
    marketType: row.market_type,
    mrpApplicable: Boolean(row.mrp_applicable),
    mrp: row.mrp,
    shelfLife: row.shelf_life,
    shelfLifeUnit: row.shelf_life_unit,
    batchInfoText: row.batch_info_text || ''
  };
}

async function initializeDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      barcode TEXT NOT NULL,
      product_name TEXT NOT NULL,
      batch_number_format TEXT NOT NULL,
      market_type TEXT NOT NULL CHECK (market_type IN ('general', 'modern')),
      mrp_applicable INTEGER NOT NULL DEFAULT 0,
      mrp REAL,
      shelf_life INTEGER,
      shelf_life_unit TEXT CHECK (shelf_life_unit IN ('days', 'months')),
      batch_info_text TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)');

  const countResult = await get('SELECT COUNT(*) AS count FROM products');
  if (countResult && countResult.count === 0) {
    // ponytail: sequential inserts, no explicit txn — seeding runs once on an
    // empty DB, and libSQL remote doesn't share a txn across execute() calls.
    for (const product of seedProducts) {
      await createProduct(product);
    }
  }

  // ── Users table ────────────────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
      is_protected INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migration: add is_protected to user tables created before this column existed.
  const userCols = await all('PRAGMA table_info(users)');
  if (!userCols.some(c => c.name === 'is_protected')) {
    await run('ALTER TABLE users ADD COLUMN is_protected INTEGER NOT NULL DEFAULT 0');
  }

  // Database-level guard: block deletion of any protected user at the engine
  // itself, so even a direct `DELETE FROM users` cannot remove the original admin.
  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_protect_user_delete
    BEFORE DELETE ON users
    WHEN OLD.is_protected = 1
    BEGIN
      SELECT RAISE(ABORT, 'protected user cannot be deleted');
    END
  `);

  const userCount = await get('SELECT COUNT(*) AS count FROM users');
  if (userCount && userCount.count === 0) {
    for (const user of SEED_USERS) {
      await run(
        'INSERT INTO users (id, username, password, role, is_protected) VALUES (?, ?, ?, ?, ?)',
        [user.id, user.username, user.password, user.role, user.isProtected ? 1 : 0]
      );
    }
  }

  await ensureProtectedAdmin();
}

// Self-heal the permanent administrator. Protection is now a durable property
// (the is_protected flag), re-asserted on every startup — not a hardcoded id.
// This closes the "recreated with a new id" gap: even if the protected row were
// somehow removed, it is restored here, and exactly one protected admin is kept.
async function ensureProtectedAdmin() {
  const protectedAdmin = await get("SELECT id FROM users WHERE is_protected = 1 AND role = 'admin' LIMIT 1");
  if (protectedAdmin) return;

  // No protected admin present — adopt the seed admin if it exists, else recreate it.
  const seed = SEED_USERS.find(u => u.isProtected) || SEED_USERS[0];
  const existing = await get('SELECT id FROM users WHERE id = ? OR username = ?', [seed.id, seed.username]);
  if (existing) {
    await run('UPDATE users SET is_protected = 1, role = ? WHERE id = ?', ['admin', existing.id]);
  } else {
    await run(
      'INSERT INTO users (id, username, password, role, is_protected) VALUES (?, ?, ?, ?, 1)',
      [seed.id, seed.username, seed.password, 'admin']
    );
  }
}

// Initial accounts seeded on first run. Passwords follow the <Name>@123 scheme.
// The first admin is flagged isProtected — it is permanent and cannot be deleted.
const SEED_USERS = [
  { id: 'user-000', username: 'Admin', password: 'Admin@123', role: 'admin', isProtected: true },
  { id: 'user-001', username: 'User1', password: 'User1@123', role: 'staff' },
  { id: 'user-002', username: 'User2', password: 'User2@123', role: 'staff' },
  { id: 'user-003', username: 'User3', password: 'User3@123', role: 'staff' },
  { id: 'user-004', username: 'User4', password: 'User4@123', role: 'staff' },
];

function mapRowToUser(row, includePassword = false) {
  if (!row) return null;
  const user = { id: row.id, username: row.username, role: row.role, isProtected: Boolean(row.is_protected) };
  if (includePassword) user.password = row.password;
  return user;
}

async function getUsers() {
  const rows = await all('SELECT id, username, role, is_protected, created_at FROM users');
  const users = rows.map(r => mapRowToUser(r));
  // Stable, predictable order independent of when each account was created:
  //   1. protected (original) admin first
  //   2. other admins
  //   3. staff
  // and within each group, natural sort by username (User2 before User10).
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const rank = (u) => (u.isProtected ? 0 : u.role === 'admin' ? 1 : 2);
  return users.sort((a, b) => rank(a) - rank(b) || collator.compare(a.username, b.username));
}

async function findUserByCredentials(username, password) {
  const row = await get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
  return mapRowToUser(row);
}

// Password rule: at least 6 characters, at least one letter (upper or lower),
// and at least one special character. Shared with the frontend message.
const PASSWORD_RULE_MESSAGE =
  'Password must be at least 6 characters and include a letter and a special character (e.g. @ & * !).';

function isPasswordValid(password) {
  return (
    password.length >= 6 &&
    /[A-Za-z]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

async function createUser(rawUser) {
  const username = String(rawUser.username || '').trim();
  const password = String(rawUser.password || '');
  const role = rawUser.role === 'admin' ? 'admin' : 'staff';

  if (!username) throw new Error('Username is required.');
  if (!isPasswordValid(password)) throw new Error(PASSWORD_RULE_MESSAGE);

  const existing = await get('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) throw new Error('A user with that username already exists.');

  const id = `user-${Date.now()}`;
  await run('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)', [id, username, password, role]);
  const row = await get('SELECT id, username, role, created_at FROM users WHERE id = ?', [id]);
  return mapRowToUser(row);
}

// The very first seeded admin's id (kept for reference/back-compat). Protection
// is enforced by the is_protected flag + DB trigger, not by this constant.
const PROTECTED_ADMIN_ID = 'user-000';

async function deleteUser(id) {
  const target = await get('SELECT id, role, is_protected FROM users WHERE id = ?', [id]);
  if (!target) return { ok: false, reason: 'not_found' };

  // 1. Protected accounts (the original admin) can never be deleted.
  if (target.is_protected) {
    return { ok: false, reason: 'protected_admin' };
  }

  // 2. Never remove the last administrator.
  if (target.role === 'admin') {
    const adminCount = await get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
    if (adminCount && adminCount.count <= 1) {
      return { ok: false, reason: 'last_admin' };
    }
  }

  // 3. Never remove the last staff/user — at least one must always remain.
  if (target.role === 'staff') {
    const staffCount = await get("SELECT COUNT(*) AS count FROM users WHERE role = 'staff'");
    if (staffCount && staffCount.count <= 1) {
      return { ok: false, reason: 'last_staff' };
    }
  }

  try {
    const result = await run('DELETE FROM users WHERE id = ?', [id]);
    return { ok: result.changes > 0 };
  } catch (err) {
    // Safety net: the BEFORE DELETE trigger aborts protected-row deletes even if
    // the checks above were somehow bypassed.
    if (/protected user cannot be deleted/.test(err.message)) {
      return { ok: false, reason: 'protected_admin' };
    }
    throw err;
  }
}

function normalizeProductInput(product) {
  return {
    id: String(product.id || '').trim(),
    barcode: String(product.barcode || '').trim(),
    productName: String(product.productName || '').trim(),
    batchNumberFormat: String(product.batchNumberFormat || '').trim(),
    marketType: product.marketType === 'modern' ? 'modern' : 'general',
    mrpApplicable: Boolean(product.mrpApplicable),
    mrp: product.mrp === null || product.mrp === undefined || product.mrp === '' ? null : Number(product.mrp),
    shelfLife: product.shelfLife === null || product.shelfLife === undefined || product.shelfLife === '' ? null : Number(product.shelfLife),
    shelfLifeUnit: product.shelfLifeUnit === 'days' || product.shelfLifeUnit === 'months' ? product.shelfLifeUnit : null,
    batchInfoText: product.batchInfoText ? String(product.batchInfoText) : ''
  };
}

function validateProductInput(product) {
  if (!product.id) return 'Product id is required.';
  if (!product.barcode) return 'Barcode is required.';
  if (!product.productName) return 'Product name is required.';
  if (!product.batchNumberFormat) return 'Batch number format is required.';
  if (product.mrp !== null && Number.isNaN(product.mrp)) return 'MRP must be a valid number.';
  if (product.shelfLife !== null && (!Number.isInteger(product.shelfLife) || product.shelfLife < 0)) {
    return 'Shelf life must be a non-negative integer.';
  }
  return null;
}

async function getProducts() {
  const rows = await all('SELECT * FROM products ORDER BY updated_at DESC');
  return rows.map(mapRowToProduct);
}

async function getProductsByBarcode(barcode) {
  const rows = await all('SELECT * FROM products WHERE barcode = ? ORDER BY updated_at DESC', [barcode]);
  return rows.map(mapRowToProduct);
}

async function createProduct(rawProduct) {
  const product = normalizeProductInput(rawProduct);
  const error = validateProductInput(product);
  if (error) {
    throw new Error(error);
  }

  await run(
    `INSERT INTO products (
      id, barcode, product_name, batch_number_format, market_type,
      mrp_applicable, mrp, shelf_life, shelf_life_unit, batch_info_text, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      product.id,
      product.barcode,
      product.productName,
      product.batchNumberFormat,
      product.marketType,
      product.mrpApplicable ? 1 : 0,
      product.mrp,
      product.shelfLife,
      product.shelfLifeUnit,
      product.batchInfoText
    ]
  );

  const row = await get('SELECT * FROM products WHERE id = ?', [product.id]);
  return mapRowToProduct(row);
}

async function updateProduct(id, rawProduct) {
  const product = normalizeProductInput({ ...rawProduct, id });
  const error = validateProductInput(product);
  if (error) {
    throw new Error(error);
  }

  const existing = await get('SELECT id FROM products WHERE id = ?', [id]);
  if (!existing) {
    return null;
  }

  await run(
    `UPDATE products
     SET barcode = ?,
         product_name = ?,
         batch_number_format = ?,
         market_type = ?,
         mrp_applicable = ?,
         mrp = ?,
         shelf_life = ?,
         shelf_life_unit = ?,
         batch_info_text = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [
      product.barcode,
      product.productName,
      product.batchNumberFormat,
      product.marketType,
      product.mrpApplicable ? 1 : 0,
      product.mrp,
      product.shelfLife,
      product.shelfLifeUnit,
      product.batchInfoText,
      id
    ]
  );

  const row = await get('SELECT * FROM products WHERE id = ?', [id]);
  return mapRowToProduct(row);
}

async function deleteProduct(id) {
  const result = await run('DELETE FROM products WHERE id = ?', [id]);
  return result.changes > 0;
}

module.exports = {
  DB_PATH,
  PROTECTED_ADMIN_ID,
  initializeDatabase,
  getProducts,
  getProductsByBarcode,
  createProduct,
  updateProduct,
  deleteProduct,
  getUsers,
  findUserByCredentials,
  createUser,
  deleteUser
};
