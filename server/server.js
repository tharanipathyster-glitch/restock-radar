// Restock Radar — backend
//
// Retail-only inventory tracker. Product catalog + initial stock levels
// come from the store's own billing-system export (server/seed-data/
// retail-products.json, transcribed from Testing File.xlsx). From there,
// stock only changes when a sale is recorded — either typed in manually
// (POST /api/retail/sales) or uploaded as a bill matching the shape of
// server/seed-data/mock-billing-export.json (POST /api/retail/upload-bill).
// Once a product's stock drops below 50% of its initial level, it's flagged
// "critical" with a tentative restock date based on that product's own
// restock lead time — see analytics.js.
//
// State lives in memory and resets on restart; see README for why that's
// an intentional simplification for this prototype, not an oversight.

const express = require("express");
const cors = require("cors");
const path = require("path");
const { buildProductDetail, computeStockStatus } = require("./analytics");

const SEED_PRODUCTS = require("./seed-data/retail-products.json");
const MOCK_BILL = require("./seed-data/mock-billing-export.json");

const TODAY = new Date("2026-09-08"); // fixed "today" so the demo is reproducible

// Mutable in-memory copy of the seed data — this is what actually changes
// as sales get recorded, leaving the seed-data JSON files untouched.
const products = SEED_PRODUCTS.map((p) => ({ ...p }));
const transactions = []; // { id, date, source: "manual"|"bill", billId?, items: [{productId, name, quantitySold}] }

function findProduct(idOrName) {
  const needle = String(idOrName).trim().toLowerCase();
  return products.find((p) => p.id.toLowerCase() === needle || p.name.toLowerCase() === needle);
}

function applySale(items, source, billId) {
  const applied = [];
  const unmatched = [];
  items.forEach((entry) => {
    const product = findProduct(entry.id || entry.item);
    const qty = Number(entry.quantitySold);
    if (!product || !Number.isFinite(qty) || qty <= 0) {
      unmatched.push(entry);
      return;
    }
    product.currentStock = Math.max(0, Math.round((product.currentStock - qty) * 100) / 100);
    applied.push({ productId: product.id, name: product.name, quantitySold: qty });
  });
  if (applied.length) {
    transactions.unshift({
      id: `TXN-${Date.now()}`,
      date: TODAY.toISOString().slice(0, 10),
      source,
      billId: billId || null,
      items: applied,
    });
  }
  return { applied, unmatched };
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../www")));

app.get("/api/retail/products", (req, res) => {
  res.json(products.map((p) => buildProductDetail(p, TODAY)));
});

app.get("/api/retail/products/:id", (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(buildProductDetail(product, TODAY));
});

app.get("/api/retail/alerts", (req, res) => {
  const alerts = products
    .map((p) => buildProductDetail(p, TODAY))
    .filter((p) => p.alertLevel !== "ok")
    .sort((a, b) => {
      if (a.alertLevel !== b.alertLevel) return a.alertLevel === "critical" ? -1 : 1;
      return a.pctRemaining - b.pctRemaining;
    });
  res.json(alerts);
});

// Sample of what a real billing-system export looks like — used both to
// demonstrate the shape and as a ready-made file to test the upload feature
// with (GET this, save it, then upload it back via /api/retail/upload-bill).
app.get("/api/retail/mock-bill", (req, res) => res.json(MOCK_BILL));

app.get("/api/retail/transactions", (req, res) => res.json(transactions.slice(0, 50)));

// Manual entry: { items: [{ id, quantitySold }] }
app.post("/api/retail/sales", (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: "No items provided" });
  const { applied, unmatched } = applySale(items, "manual");
  res.json({ applied, unmatched, products: products.map((p) => buildProductDetail(p, TODAY)) });
});

// Bill upload: same shape as mock-billing-export.json — { billId, date, items: [{ item, quantitySold }] }
app.post("/api/retail/upload-bill", (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: "Bill has no items" });
  const { applied, unmatched } = applySale(items, "bill", req.body.billId);
  res.json({ applied, unmatched, products: products.map((p) => buildProductDetail(p, TODAY)) });
});

// Convenience for demoing repeatedly — puts every product back to its
// initial stock level from Testing File.xlsx.
app.post("/api/retail/reset", (req, res) => {
  products.forEach((p, i) => {
    p.currentStock = SEED_PRODUCTS[i].currentStock;
  });
  transactions.length = 0;
  res.json({ ok: true, products: products.map((p) => buildProductDetail(p, TODAY)) });
});

app.get("/healthz", (req, res) =>
  res.json({
    ok: true,
    today: TODAY.toISOString().slice(0, 10),
    posIntegrationsConfigured: false,
    retailProducts: products.length,
  })
);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Restock Radar backend listening on :${PORT}`);
  console.log("POS integrations configured: false (running on seed data — see pos-connectors/)");
});
