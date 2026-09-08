// Restock Radar — first-run seeding
//
// Seeds the 12 products transcribed from Testing File.xlsx, plus 30 days of
// synthetic daily sales per product (weekday-patterned, randomized) so the
// "Last 5 Days" / weekday-average analytics have real numbers to show from
// first launch. Only runs once — if the database already has products,
// this is a no-op. Ongoing changes come from recorded sales and uploaded
// inventory bills, not from re-running this file.

const db = require("./db");

const TODAY = new Date("2026-09-08"); // fixed "today" so the demo is reproducible

const SEED_PRODUCTS = [
  { name: "Tomatoes", quantity: 100, totalCost: 117, restockWeeks: 1, avgDaily: 3.2 },
  { name: "Onions", quantity: 120, totalCost: 239, restockWeeks: 2, avgDaily: 2.4 },
  { name: "Chillis", quantity: 140, totalCost: 229, restockWeeks: 3, avgDaily: 1.8 },
  { name: "Toor Dhal", quantity: 500, totalCost: 180, restockWeeks: 4, avgDaily: 6.5 },
  { name: "Sona Masuri Rice", quantity: 1000, totalCost: 235, restockWeeks: 5, avgDaily: 8.0 },
  { name: "Ghee", quantity: 50, totalCost: 296, restockWeeks: 6, avgDaily: 0.9 },
  { name: "Mustard Oil", quantity: 50, totalCost: 164, restockWeeks: 7, avgDaily: 0.8 },
  { name: "Parle G Biscuits", quantity: 10, totalCost: 163, restockWeeks: 8, avgDaily: 0.3 },
  { name: "Amul Paneer", quantity: 141, totalCost: 216, restockWeeks: 9, avgDaily: 2.6 },
  { name: "Bitter Gourd", quantity: 253, totalCost: 222, restockWeeks: 10, avgDaily: 1.7 },
  { name: "Capsicum", quantity: 271, totalCost: 194, restockWeeks: 11, avgDaily: 2.0 },
  { name: "Chilli Powder", quantity: 219, totalCost: 191, restockWeeks: 12, avgDaily: 1.1 },
];

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d;
}

const WEEKDAY_BOOST = [1.3, 0.9, 0.9, 0.95, 1.0, 1.2, 1.4]; // Sun..Sat multipliers (weekend busier)

function seedIfEmpty() {
  if (!db.isEmpty()) return false;

  const rand = seededRandom(7);

  SEED_PRODUCTS.forEach((p, idx) => {
    const id = `R${String(idx + 1).padStart(3, "0")}`;
    const unitCost = Math.round((p.totalCost / p.quantity) * 100) / 100;

    // 30 days of synthetic daily sales, ending yesterday (today has no sales yet).
    let totalSoldLast30 = 0;
    const dailyRows = [];
    for (let daysBack = 30; daysBack >= 1; daysBack--) {
      const d = daysAgo(daysBack);
      const boost = WEEKDAY_BOOST[d.getDay()];
      const noise = 0.6 + rand() * 0.8;
      const qty = Math.round(p.avgDaily * boost * noise * 10) / 10;
      if (qty > 0) dailyRows.push({ date: dateStr(d), qty });
      totalSoldLast30 += qty;
    }

    const stocked = p.quantity;
    const currentStock = Math.max(0, Math.round((stocked - totalSoldLast30 * 0.15) * 10) / 10); // light depletion, not all products near threshold

    db.insertProduct({
      id,
      name: p.name,
      unit: "lb",
      stocked,
      currentStock,
      unitCost,
      restockLeadDays: p.restockWeeks * 7,
      thresholdPct: 0.5,
      lastRestockDate: dateStr(TODAY),
    });

    // Historical rows only — currentStock above already accounts for them,
    // so these use insertSaleRow (no stock side-effect) rather than recordSale.
    dailyRows.forEach((row) => {
      db.insertSaleRow(id, row.date, row.qty, "seed", null);
    });
  });

  return true;
}

module.exports = { seedIfEmpty, TODAY };
