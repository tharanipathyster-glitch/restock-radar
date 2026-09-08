// Generates the retail product catalog from the store's own test data
// (../../Testing File.xlsx — Item / Quantity in Lbs / Cost / Restock Time).
// This stands in for a one-time import from a real billing/POS system's
// product export. Ongoing stock changes come from recorded sales, not from
// re-running this script — see server.js's /api/retail/sales and
// /api/retail/upload-bill.

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "seed-data");
const TODAY = new Date("2026-09-08"); // fixed "today" so the demo is reproducible

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

// Transcribed directly from Testing File.xlsx. "Quantity in Lbs" is each
// item's initial stock level (also doubles as the 100% baseline that the
// 50%-remaining restock trigger is measured against). "Cost" is the total
// cost of that initial quantity, not a per-unit price. "Restock Time" is
// how long a reorder takes to arrive once triggered.
const RETAIL_PRODUCTS = [
  { name: "Tomatoes", quantity: 100, totalCost: 117, restockWeeks: 1 },
  { name: "Onions", quantity: 120, totalCost: 239, restockWeeks: 2 },
  { name: "Chillis", quantity: 140, totalCost: 229, restockWeeks: 3 },
  { name: "Toor Dhal", quantity: 500, totalCost: 180, restockWeeks: 4 },
  { name: "Sona Masuri Rice", quantity: 1000, totalCost: 235, restockWeeks: 5 },
  { name: "Ghee", quantity: 50, totalCost: 296, restockWeeks: 6 },
  { name: "Mustard Oil", quantity: 50, totalCost: 164, restockWeeks: 7 },
  { name: "Parle G Biscuits", quantity: 10, totalCost: 163, restockWeeks: 8 },
  { name: "Amul Paneer", quantity: 141, totalCost: 216, restockWeeks: 9 },
  { name: "Bitter Gourd", quantity: 253, totalCost: 222, restockWeeks: 10 },
  { name: "Capsicum", quantity: 271, totalCost: 194, restockWeeks: 11 },
  { name: "Chilli Powder", quantity: 219, totalCost: 191, restockWeeks: 12 },
];

function buildRetail() {
  const products = RETAIL_PRODUCTS.map((p, idx) => {
    const id = `R${String(idx + 1).padStart(3, "0")}`;
    const unitCost = Math.round((p.totalCost / p.quantity) * 100) / 100;
    return {
      id,
      sku: `SKU-${10000 + idx}`,
      name: p.name,
      unit: "lb",
      initialStock: p.quantity,
      currentStock: p.quantity,
      unitCost,
      totalCost: p.totalCost,
      restockLeadDays: p.restockWeeks * 7,
      lastRestockedDate: dateStr(TODAY),
    };
  });

  fs.writeFileSync(path.join(OUT, "retail-products.json"), JSON.stringify(products, null, 2));
  console.log(`Retail: ${products.length} products seeded from Testing File.xlsx.`);
}

buildRetail();
console.log("Seed data generation complete. TODAY =", dateStr(TODAY));
