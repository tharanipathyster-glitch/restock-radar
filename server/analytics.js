// Restock Radar — analytics engine
//
// Per-product restock threshold (user-editable, saved in the database) is
// the trigger: alert = "Restock Needed" once currentStock / stocked falls
// below that product's own thresholdPct, else "Stock Available" — mirrors
// the Output.xlsx spec's IF(%Stock < Threshold, "Restock Needed", "Stock
// Available") formula exactly. Day-wise sales figures (Last 5 Days,
// weekday averages) are read straight from the sales table.

const db = require("./db");

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function computeStockStatus(product) {
  const pctStock = product.stocked > 0 ? product.currentStock / product.stocked : 0;
  const needsRestock = pctStock < product.thresholdPct;
  return {
    pctStock: Math.round(pctStock * 1000) / 10, // e.g. 41.3 (%)
    alertLevel: needsRestock ? "critical" : "ok",
    alertLabel: needsRestock ? "Restock Needed" : "Stock Available",
  };
}

// The 5 most recent calendar dates (today going backward) + quantity sold
// on each for this product. "No Data yet" (via hasAnySales=false) if the
// product has never had a sale recorded.
function last5Days(productId, today) {
  const sales = db.recentSalesForProduct(productId, 2000);
  const hasAnySales = sales.length > 0;
  const byDate = new Map();
  sales.forEach((s) => byDate.set(s.date, (byDate.get(s.date) || 0) + s.quantitySold));

  const days = [];
  for (let i = 4; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = dateStr(d);
    days.push({ date: iso, quantitySold: Math.round((byDate.get(iso) || 0) * 10) / 10 });
  }
  return { hasAnySales, days };
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Average quantity sold per weekday (Mon..Sun ordering to match the spec),
// over the trailing 30 days from today.
function weekdayAverages(productId, today) {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 30);
  const sales = db.recentSalesForProduct(productId, 5000).filter((s) => s.date >= dateStr(cutoff));

  const totals = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  sales.forEach((s) => {
    const wd = new Date(s.date + "T00:00:00").getDay();
    totals[wd] += s.quantitySold;
    counts[wd] += 1;
  });

  // Reorder Sun..Sat -> Mon..Sun to match the spreadsheet's column order.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((wd) => ({
    day: WEEKDAY_NAMES[wd],
    avgSold: counts[wd] > 0 ? Math.round((totals[wd] / counts[wd]) * 10) / 10 : 0,
  }));
}

function buildProductSummary(product) {
  return { ...product, ...computeStockStatus(product) };
}

function buildProductDetail(product, today) {
  return {
    ...product,
    ...computeStockStatus(product),
    last5Days: last5Days(product.id, today),
    weekdayAverages: weekdayAverages(product.id, today),
  };
}

module.exports = {
  addDays,
  dateStr,
  computeStockStatus,
  last5Days,
  weekdayAverages,
  buildProductSummary,
  buildProductDetail,
};
