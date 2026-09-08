// Square POS connector — PLACEHOLDER, does not call Square today.
//
// What the real integration would need:
//  1. OAuth: Square Connect OAuth flow, scopes ITEMS_READ + INVENTORY_READ
//     (INVENTORY_READ requires the merchant to be on Square's paid Plus or
//     Premium plan tier — confirmed against Square's own support docs during
//     research. On the free tier there is no inventory endpoint to call at
//     all, only order/sales history.)
//  2. Sales history: GET /v2/orders/search (Orders API), paginated, filtered
//     by location + date range, then aggregate line items by catalog item ID
//     to get daily units sold — the same shape generate-seed-data.js produces.
//  3. Stock levels (paid tiers only): GET /v2/inventory/counts/batch-retrieve
//     for catalog item IDs, returns current on-hand quantity directly — no
//     par-level math needed if the merchant already maintains it in Square.
//  4. Field mapping: Square's catalog item IDs won't match this app's product
//     IDs 1:1 out of the box — a merchant onboarding step would map each
//     Square catalog item to a restock-radar product record once.
//
// Until real credentials exist, this always reports unconfigured and the
// server falls back to seed data.

const configured = false;

async function fetchSalesHistory(_itemId, _days) {
  return null; // would return [{date, unitsSold}, ...] from Orders API aggregation
}

async function fetchCurrentStock(_itemId) {
  return null; // would return a number from Inventory API, paid tiers only
}

module.exports = { configured, fetchSalesHistory, fetchCurrentStock };
