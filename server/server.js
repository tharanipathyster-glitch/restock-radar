// Restock Radar — backend
//
// Retail inventory tracker backed by SQLite (server/db.js). Two distinct
// flows change stock, matching the spec:
//   - "Record a sale" (manual entry or a billing-system bill) decrements
//     currentStock — see /api/retail/sales and /api/retail/upload-bill.
//   - "Upload the latest inventory received" (a restock bill, optionally
//     read by an LLM) bumps stocked/currentStock and resets the last
//     restock date — see /api/retail/upload-inventory and
//     /api/retail/upload-inventory-llm. New products can be created this
//     way, so the catalog is dynamic rather than fixed.
// A product is flagged "Restock Needed" once currentStock/stocked drops
// below that product's own (user-editable, saved) restock threshold.

const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db");
const { seedIfEmpty, TODAY } = require("./seed");
const { buildProductSummary, buildProductDetail, dateStr } = require("./analytics");
const { parseBillWithLLM } = require("./llm-bill-parser");
const {
  getDailyReportBuffer,
  getFreshReportBuffer,
  listCachedReports,
  getCachedReportByDate,
} = require("./report");

seedIfEmpty();

const MOCK_BILL = require("./seed-data/mock-billing-export.json");
const MOCK_INVENTORY = require("./seed-data/mock-inventory-received.json");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // generous limit for base64 bill photos
app.use(express.static(path.join(__dirname, "../www")));

function applySaleItems(items, source, billId) {
  const applied = [];
  const unmatched = [];
  items.forEach((entry) => {
    const product = db.findProduct(entry.id || entry.item);
    const qty = Number(entry.quantitySold ?? entry.quantity);
    if (!product || !Number.isFinite(qty) || qty <= 0) {
      unmatched.push(entry);
      return;
    }
    db.recordSale(product.id, dateStr(TODAY), qty, source, billId);
    applied.push({ productId: product.id, name: product.name, quantitySold: qty });
  });
  return { applied, unmatched };
}

function applyInventoryItems(items) {
  const applied = [];
  const skipped = [];
  items.forEach((entry) => {
    const name = entry.item || entry.name;
    const qty = Number(entry.quantity ?? entry.quantitySold);
    if (!name || !Number.isFinite(qty) || qty <= 0) {
      skipped.push(entry);
      return;
    }
    const result = db.applyInventoryLine(
      {
        name,
        quantity: qty,
        unitCost: entry.unitCost ? Number(entry.unitCost) : null,
        unit: entry.unit ? String(entry.unit).trim() : null,
      },
      dateStr(TODAY)
    );
    applied.push(result);
  });
  return { applied, skipped };
}

// ---------------------------------------------------------------- READS ---

app.get("/api/retail/products", (req, res) => {
  res.json(db.allProducts().map(buildProductSummary));
});

app.get("/api/retail/products/:id", (req, res) => {
  const product = db.findProduct(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(buildProductDetail(product, TODAY));
});

app.get("/api/retail/alerts", (req, res) => {
  const alerts = db
    .allProducts()
    .map(buildProductSummary)
    .filter((p) => p.alertLevel === "critical")
    .sort((a, b) => a.pctStock - b.pctStock);
  res.json(alerts);
});

app.get("/api/retail/transactions", (req, res) => res.json(db.recentTransactions(50)));

app.get("/api/retail/mock-bill", (req, res) => res.json(MOCK_BILL));

app.get("/api/retail/mock-inventory", (req, res) => res.json(MOCK_INVENTORY));

// ------------------------------------------------------------- THRESHOLD --

app.patch("/api/retail/products/:id/threshold", (req, res) => {
  const product = db.findProduct(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  const pct = Number(req.body.thresholdPct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 1) {
    return res.status(400).json({ error: "thresholdPct must be a number between 0 and 1" });
  }
  db.setThreshold(product.id, pct);
  res.json(buildProductDetail(db.findProduct(product.id), TODAY));
});

// -------------------------------------------------------- RECORD A SALE ---

app.post("/api/retail/sales", (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: "No items provided" });
  const { applied, unmatched } = applySaleItems(items, "manual");
  res.json({ applied, unmatched, products: db.allProducts().map(buildProductSummary) });
});

app.post("/api/retail/upload-bill", (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: "Bill has no items" });
  const { applied, unmatched } = applySaleItems(items, "bill", req.body.billId);
  res.json({ applied, unmatched, products: db.allProducts().map(buildProductSummary) });
});

// ---------------------------------------------------- INVENTORY RECEIVED --

// Structured fallback — no LLM/API key required. Body: { items: [{ item, quantity, unitCost? }] }
app.post("/api/retail/upload-inventory", (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: "No items provided" });
  const { applied, skipped } = applyInventoryItems(items);
  res.json({ applied, skipped, products: db.allProducts().map(buildProductSummary) });
});

// LLM-read version. Body: { text } or { imageBase64 } (data URL). Requires OPENAI_API_KEY.
app.post("/api/retail/upload-inventory-llm", async (req, res) => {
  try {
    const items = await parseBillWithLLM({ text: req.body.text, imageBase64: req.body.imageBase64 });
    if (!items.length) return res.status(422).json({ error: "Couldn't find any product lines in that bill." });
    const { applied, skipped } = applyInventoryItems(items);
    res.json({ applied, skipped, rawItems: items, products: db.allProducts().map(buildProductSummary) });
  } catch (err) {
    const status = err.code === "LLM_NOT_CONFIGURED" ? 501 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ------------------------------------------------------------- REPORTS ---

// Newest-first list of archived daily report snapshots.
app.get("/api/retail/reports", (req, res) => res.json(listCachedReports()));

app.get("/api/retail/report.xlsx", (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : null;
  let buffer;
  let filenameDate = dateStr(TODAY);
  if (date) {
    buffer = getCachedReportByDate(date);
    if (!buffer) return res.status(404).json({ error: `No archived report for ${date}` });
    filenameDate = date;
  } else {
    buffer = req.query.fresh === "false" ? getDailyReportBuffer(TODAY) : getFreshReportBuffer(TODAY);
  }
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="restock-report-${filenameDate}.xlsx"`);
  res.send(buffer);
});

// ------------------------------------------------------------------ MISC -

app.post("/api/retail/reset", (req, res) => {
  db.resetAll();
  seedIfEmpty();
  res.json({ ok: true, products: db.allProducts().map(buildProductSummary) });
});

// Friendly path for the mock billing terminal (also served directly as /pos.html).
app.get("/pos", (req, res) => res.redirect("/pos.html"));

app.get("/healthz", (req, res) =>
  res.json({
    ok: true,
    today: dateStr(TODAY),
    llmConfigured: Boolean(process.env.OPENAI_API_KEY),
    retailProducts: db.allProducts().length,
  })
);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Restock Radar backend listening on :${PORT}`);
  console.log(`LLM bill reading configured: ${Boolean(process.env.OPENAI_API_KEY)} (set OPENAI_API_KEY to enable)`);
});
