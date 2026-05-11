const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const seedProducts = require('./seedProducts');

const DATA_DIR = path.resolve(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
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
    for (const product of seedProducts) {
      await createProduct(product);
    }
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
  initializeDatabase,
  getProducts,
  getProductsByBarcode,
  createProduct,
  updateProduct,
  deleteProduct
};
