// Clover POS connector — PLACEHOLDER, does not call Clover today.
//
// What the real integration would need:
//  1. OAuth: Clover App Market OAuth flow, merchant installs a Clover "app"
//     (this would need to be published to Clover's App Market or installed
//     as a private/dev app on a merchant's account).
//  2. Sales history: GET /v3/merchants/{mId}/orders with line items expanded,
//     aggregated by item ID per day — same target shape as the other
//     connectors.
//  3. Stock levels: Clover's Inventory API (GET /v3/merchants/{mId}/items
//     with stock count fields) is available on plans that include the
//     Inventory app — not universal across all Clover merchants, similar
//     tier-gating pattern to Square.
//  4. Same field-mapping caveat as Square: Clover item IDs need a one-time
//     mapping to this app's product records.
//
// Until real credentials exist, this always reports unconfigured and the
// server falls back to seed data.

const configured = false;

async function fetchSalesHistory(_itemId, _days) {
  return null; // would return [{date, unitsSold}, ...] from Orders API aggregation
}

async function fetchCurrentStock(_itemId) {
  return null; // would return a number from Clover's Inventory app, where installed
}

module.exports = { configured, fetchSalesHistory, fetchCurrentStock };
