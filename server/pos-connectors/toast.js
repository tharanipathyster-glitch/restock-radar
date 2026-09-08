// Toast POS connector — PLACEHOLDER, does not call Toast today.
//
// What the real integration would need:
//  1. OAuth: Toast API access requires a partner/integration agreement with
//     Toast (not a simple self-serve API key) plus a restaurant GUID and
//     management-group GUID.
//  2. Sales history: Toast's Orders API returns individual checks with menu
//     item selections — aggregating by menuItemGuid per day gives dish-level
//     "units sold," the same shape as this app's dish sales history.
//  3. The hard part Toast (or any POS) can't solve for you: dish sales alone
//     don't tell you ingredient stock. A burger sold doesn't decrement "bun
//     inventory" anywhere in Toast's data model. This app's recipe-mapping
//     layer (restaurant-recipes.json) is what bridges dish sales to
//     ingredient usage — that mapping has to be entered once per restaurant,
//     by the restaurant, regardless of which POS they run.
//  4. Toast does have its own inventory module in some plans, but it's a
//     separate paid add-on most independent restaurants don't use — which is
//     part of why this gap exists for them in the first place.
//
// Until real credentials + a partner agreement exist, this always reports
// unconfigured and the server falls back to seed data.

const configured = false;

async function fetchSalesHistory(_dishId, _days) {
  return null; // would return [{date, unitsSold}, ...] aggregated from Orders API checks
}

async function fetchCurrentStock(_ingredientId) {
  return null; // Toast has no native concept of ingredient-level stock; would
  // require Toast's separate inventory add-on (rare) or this app's own
  // recipe-mapping + manual restock-logging approach instead.
}

module.exports = { configured, fetchSalesHistory, fetchCurrentStock };
