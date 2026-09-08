// Restock Radar — analytics engine
//
// Simplified, threshold-based model: each product's "initial stock" (from
// the store's billing-system export / Testing File.xlsx) is the 100%
// baseline. Recorded sales (manual entry or an uploaded bill) decrement
// currentStock. Once currentStock falls below 50% of initialStock, the
// product needs restocking now — the tentative restock date is today plus
// that product's own restock lead time (also from the billing export).

const CRITICAL_THRESHOLD = 0.5; // below 50% of initial stock => restock now
const WATCH_THRESHOLD = 0.7; // below 70% => early warning

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Given a product's current vs. initial stock, work out how depleted it is
// and, if it has crossed the restock line, when a reorder placed today
// would arrive (using that product's own restock lead time).
function computeStockStatus(product, today) {
  const pctRemaining = product.initialStock > 0 ? (product.currentStock / product.initialStock) * 100 : 0;
  const ratio = product.initialStock > 0 ? product.currentStock / product.initialStock : 0;

  let alertLevel = "ok";
  if (ratio < CRITICAL_THRESHOLD) alertLevel = "critical";
  else if (ratio < WATCH_THRESHOLD) alertLevel = "watch";

  const needsRestockNow = alertLevel === "critical";
  const tentativeRestockDate = needsRestockNow ? addDays(today, product.restockLeadDays) : null;

  return {
    pctRemaining: Math.round(pctRemaining * 10) / 10,
    alertLevel,
    needsRestockNow,
    tentativeRestockDate,
  };
}

function buildProductDetail(product, today) {
  return { ...product, ...computeStockStatus(product, today) };
}

module.exports = {
  CRITICAL_THRESHOLD,
  WATCH_THRESHOLD,
  addDays,
  computeStockStatus,
  buildProductDetail,
};
