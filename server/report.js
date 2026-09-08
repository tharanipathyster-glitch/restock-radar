// Restock Radar — daily Excel report
//
// Mirrors the layout of the spec's Output.xlsx: a main sheet with one row
// per product (Item / Stocked / Cost / Restock Time / Last Restock Date /
// Current Stock / % Stock at Store / Restock Threshold / Alert), plus a
// Detail sheet with each product's Last 5 Days and 30-day weekday-average
// sales. Generated fresh on request; also cached once per calendar day
// under server/reports/ so there's a same-day snapshot to look back at.

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const db = require("./db");
const { buildProductDetail } = require("./analytics");

const REPORTS_DIR = path.join(__dirname, "reports");
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR);

function buildWorkbook(today) {
  const products = db.allProducts().map((p) => buildProductDetail(p, today));

  const mainRows = products.map((p) => ({
    Item: p.name,
    Unit: p.unit,
    Stocked: p.stocked,
    "Cost/Unit": p.unitCost,
    "Restock Time (days)": p.restockLeadDays,
    "Last Restock Date": p.lastRestockDate,
    "Current Stock": p.currentStock,
    "% Stock at Store": Math.round(p.pctStock) / 100,
    "Restock Threshold": p.thresholdPct,
    Alert: p.alertLabel,
  }));

  const detailRows = [];
  products.forEach((p) => {
    detailRows.push({ Item: p.name, Field: "Last 5 Days — dates", ...datesRow(p.last5Days.days) });
    detailRows.push({
      Item: p.name,
      Field: p.last5Days.hasAnySales ? "Last 5 Days — Quantity Sold" : "Last 5 Days — Quantity Sold (No Data yet)",
      ...qtyRow(p.last5Days.days),
    });
    detailRows.push({ Item: p.name, Field: "30-Day Weekday Avg Sold", ...weekdayRow(p.weekdayAverages) });
    detailRows.push({}); // spacer
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mainRows), "Products");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Detail");
  return wb;
}

function datesRow(days) {
  const row = {};
  days.forEach((d, i) => (row[`Day ${i + 1}`] = d.date));
  return row;
}
function qtyRow(days) {
  const row = {};
  days.forEach((d, i) => (row[`Day ${i + 1}`] = d.quantitySold));
  return row;
}
function weekdayRow(weekdayAverages) {
  const row = {};
  weekdayAverages.forEach((w) => (row[w.day] = w.avgSold));
  return row;
}

// Builds (and caches once per day) the report, returning a Buffer.
function getDailyReportBuffer(today) {
  const dateKey = today.toISOString().slice(0, 10);
  const cachedPath = path.join(REPORTS_DIR, `restock-report-${dateKey}.xlsx`);
  if (!fs.existsSync(cachedPath)) {
    const wb = buildWorkbook(today);
    XLSX.writeFile(wb, cachedPath);
  }
  return fs.readFileSync(cachedPath);
}

// Always-fresh version (ignores the daily cache) — used by the "Download
// report" button so it reflects sales/uploads recorded moments ago.
function getFreshReportBuffer(today) {
  const wb = buildWorkbook(today);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

module.exports = { buildWorkbook, getDailyReportBuffer, getFreshReportBuffer };
