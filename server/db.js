// Restock Radar — persistence layer
//
// Uses Node's built-in `node:sqlite` (stable-enough experimental module,
// ships with Node 22+) instead of a native npm package — zero extra
// dependencies to compile, works the same on Windows/macOS/Linux. Data
// lives in server/data/restock.db, gitignored (see .gitignore) since it's
// runtime state, not source.

const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const DB_PATH = path.join(DATA_DIR, "restock.db");

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    unit TEXT NOT NULL DEFAULT 'lb',
    stocked REAL NOT NULL,
    currentStock REAL NOT NULL,
    unitCost REAL NOT NULL DEFAULT 0,
    restockLeadDays INTEGER NOT NULL DEFAULT 14,
    thresholdPct REAL NOT NULL DEFAULT 0.5,
    lastRestockDate TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    productId TEXT NOT NULL,
    date TEXT NOT NULL,
    quantitySold REAL NOT NULL,
    source TEXT NOT NULL,
    billId TEXT
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

function nextId() {
  const row = db.prepare("SELECT COUNT(*) AS n FROM products").get();
  return `R${String(row.n + 1).padStart(3, "0")}`;
}

function isEmpty() {
  return db.prepare("SELECT COUNT(*) AS n FROM products").get().n === 0;
}

function insertProduct(p) {
  db.prepare(
    `INSERT INTO products (id, name, unit, stocked, currentStock, unitCost, restockLeadDays, thresholdPct, lastRestockDate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(p.id, p.name, p.unit, p.stocked, p.currentStock, p.unitCost, p.restockLeadDays, p.thresholdPct, p.lastRestockDate);
}

function findProductByName(name) {
  return db.prepare("SELECT * FROM products WHERE lower(name) = lower(?)").get(name.trim());
}

function findProduct(idOrName) {
  return (
    db.prepare("SELECT * FROM products WHERE id = ?").get(idOrName) ||
    findProductByName(idOrName)
  );
}

function allProducts() {
  return db.prepare("SELECT * FROM products ORDER BY name").all();
}

function setThreshold(id, thresholdPct) {
  db.prepare("UPDATE products SET thresholdPct = ? WHERE id = ?").run(thresholdPct, id);
}

// Applies a sale: decrements currentStock, logs a sales row (source: "manual" | "bill").
function recordSale(productId, date, quantitySold, source, billId) {
  db.prepare("UPDATE products SET currentStock = MAX(0, currentStock - ?) WHERE id = ?").run(quantitySold, productId);
  insertSaleRow(productId, date, quantitySold, source, billId);
}

// Logs a sales row without touching currentStock — used for seeding
// historical sales history where currentStock is already known/computed.
function insertSaleRow(productId, date, quantitySold, source, billId) {
  db.prepare("INSERT INTO sales (productId, date, quantitySold, source, billId) VALUES (?, ?, ?, ?, ?)").run(
    productId,
    date,
    quantitySold,
    source,
    billId || null
  );
}

// Applies a received-inventory line: bumps stocked + currentStock, resets lastRestockDate.
// Creates the product if it doesn't exist yet (dynamic catalog from LLM-read bills).
function applyInventoryLine({ name, quantity, unitCost, unit, restockLeadDays }, date) {
  let product = findProductByName(name);
  if (!product) {
    const id = nextId();
    insertProduct({
      id,
      name,
      unit: unit || "lb",
      stocked: quantity,
      currentStock: quantity,
      unitCost: unitCost || 0,
      restockLeadDays: restockLeadDays || 14,
      thresholdPct: 0.5,
      lastRestockDate: date,
    });
    return { id, name, created: true };
  }
  db.prepare(
    `UPDATE products SET stocked = ?, currentStock = currentStock + ?, lastRestockDate = ?${unitCost ? ", unitCost = ?" : ""} WHERE id = ?`
  ).run(...(unitCost ? [quantity, quantity, date, unitCost, product.id] : [quantity, quantity, date, product.id]));
  return { id: product.id, name: product.name, created: false };
}

function recentSalesForProduct(productId, limit = 500) {
  return db
    .prepare("SELECT * FROM sales WHERE productId = ? ORDER BY date DESC LIMIT ?")
    .all(productId, limit);
}

function recentTransactions(limit = 50) {
  return db
    .prepare(
      `SELECT sales.*, products.name as productName FROM sales
       JOIN products ON products.id = sales.productId
       ORDER BY sales.id DESC LIMIT ?`
    )
    .all(limit);
}

function resetAll() {
  db.exec("DELETE FROM sales; DELETE FROM products; DELETE FROM meta;");
}

function getMeta(key) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setMeta(key, value) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

module.exports = {
  db,
  isEmpty,
  insertProduct,
  findProduct,
  findProductByName,
  allProducts,
  setThreshold,
  recordSale,
  insertSaleRow,
  applyInventoryLine,
  recentSalesForProduct,
  recentTransactions,
  resetAll,
  getMeta,
  setMeta,
};
