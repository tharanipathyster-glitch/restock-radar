# POS connectors — placeholder layer

This mirrors how `retailer-actors.js` works in Hardware Check: a named config
per data source, with a function that would call the real API, sitting behind
a flag so the app runs on seed data until real credentials exist.

**None of these call a real API today.** Each file documents what the actual
integration would need — the OAuth flow, the specific endpoint, and the
field-mapping problem — and returns `null` so the server falls back to the
bundled seed data. Wiring one of these up for real is the single biggest
unknown in this build; see the README's "What's real vs. placeholder"
section.

| File | POS system | Where restock-radar would use it |
|---|---|---|
| `square.js` | Square | Square's Inventory API (paid Plus/Premium tiers) |
| `clover.js` | Clover | Clover's Inventory API, similar shape to Square's |

Every connector exports the same shape so `server.js` can call any of them
interchangeably once real credentials exist:

```js
{
  configured: false,       // true once real API keys are present
  fetchSalesHistory(itemId, days) { /* -> [{date, unitsSold}] */ },
  fetchCurrentStock(itemId) { /* -> number | null, only if the POS tier exposes inventory */ },
}
```
