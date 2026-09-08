// Restock Radar — backend
//
// What this actually does: serves the bundled seed data (18 retail/grocery
// products, 10 restaurant dishes + 20 recipe-mapped ingredients, 45 days of
// simulated daily sales each) through the analytics engine in analytics.js,
// which computes real sales velocity, depletion projections, and 80%-
// depleted alerts from that data. Retail and restaurant are separate,
// unrelated product lines, per the ask — different data shapes, different
// endpoints, different frontend screens.
//
// What this does NOT do yet: pull from a real POS. The pos-connectors/
// directory documents exactly what each integration would need (OAuth flow,
// endpoint, field-mapping problem) but every connector returns null today —
// see README.md's "What's real vs. placeholder" section before treating any
// number here as live.

const express = require("express");
const cors = require("cors");
const path = require("path");
const {
  buildRetailDetail,
  buildIngredientDetail,
  buildDishDetail,
  projectRestock,
} = require("./analytics");

const RETAIL_PRODUCTS = require("./seed-data/retail-products.json");
const RETAIL_HISTORY = require("./seed-data/retail-sales-history.json");
const RESTAURANT_DISHES = require("./seed-data/restaurant-dishes.json");
const RESTAURANT_HISTORY = require("./seed-data/restaurant-sales-history.json");
const RESTAURANT_INGREDIENTS = require("./seed-data/restaurant-ingredients.json");
const RESTAURANT_RECIPES = require("./seed-data/restaurant-recipes.json");

const TODAY = new Date("2026-09-08"); // fixed to match generate-seed-data.js

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "../www")));

function retailHistoryFor(id) {
  return RETAIL_HISTORY.find((h) => h.productId === id);
}
function restaurantHistoryFor(id) {
  return RESTAURANT_HISTORY.find((h) => h.dishId === id);
}

// ---------------------------------------------------------------- RETAIL ---

app.get("/api/retail/products", (req, res) => {
  const list = RETAIL_PRODUCTS.map((p) => {
    const hist = retailHistoryFor(p.id);
    const projection = projectRestock(
      p.currentStock,
      p.parLevel,
      p.dailyVelocity,
      p.restockLeadDays,
      TODAY
    );
    return { ...p, ...projection, monthToDateUnitsSold: undefined, hasHistory: Boolean(hist) };
  });
  res.json(list);
});

app.get("/api/retail/products/:id", (req, res) => {
  const product = RETAIL_PRODUCTS.find((p) => p.id === req.params.id);
  const hist = retailHistoryFor(req.params.id);
  if (!product || !hist) return res.status(404).json({ error: "Product not found" });
  res.json(buildRetailDetail(product, hist, TODAY));
});

app.get("/api/retail/alerts", (req, res) => {
  const alerts = RETAIL_PRODUCTS.map((p) => {
    const projection = projectRestock(
      p.currentStock,
      p.parLevel,
      p.dailyVelocity,
      p.restockLeadDays,
      TODAY
    );
    return { id: p.id, name: p.name, category: p.category, ...projection };
  }).filter((p) => p.alertLevel !== "ok");
  // critical first, then watch; within each, soonest depletion first
  alerts.sort((a, b) => {
    if (a.alertLevel !== b.alertLevel) return a.alertLevel === "critical" ? -1 : 1;
    return (a.daysUntilDepleted ?? 999) - (b.daysUntilDepleted ?? 999);
  });
  res.json(alerts);
});

// ------------------------------------------------------------- RESTAURANT --

app.get("/api/restaurant/dishes", (req, res) => {
  const list = RESTAURANT_DISHES.map((d) => {
    const hist = restaurantHistoryFor(d.id);
    return hist ? buildDishDetail(d, hist, TODAY) : d;
  });
  res.json(list);
});

app.get("/api/restaurant/dishes/:id", (req, res) => {
  const dish = RESTAURANT_DISHES.find((d) => d.id === req.params.id);
  const hist = restaurantHistoryFor(req.params.id);
  if (!dish || !hist) return res.status(404).json({ error: "Dish not found" });
  const recipe = RESTAURANT_RECIPES.find((r) => r.dishId === req.params.id);
  res.json({ ...buildDishDetail(dish, hist, TODAY), recipe: recipe ? recipe.ingredients : [] });
});

app.get("/api/restaurant/ingredients", (req, res) => {
  const list = RESTAURANT_INGREDIENTS.map((i) => buildIngredientDetail(i, TODAY));
  res.json(list);
});

app.get("/api/restaurant/ingredients/:id", (req, res) => {
  const ingredient = RESTAURANT_INGREDIENTS.find((i) => i.id === req.params.id);
  if (!ingredient) return res.status(404).json({ error: "Ingredient not found" });
  res.json(buildIngredientDetail(ingredient, TODAY));
});

app.get("/api/restaurant/alerts", (req, res) => {
  const alerts = RESTAURANT_INGREDIENTS.map((i) => {
    const projection = projectRestock(
      i.currentStock,
      i.parLevel,
      i.dailyVelocity,
      i.restockLeadDays,
      TODAY
    );
    return {
      id: i.id,
      name: i.name,
      unit: i.unit,
      usedInDishes: i.usedInDishes,
      ...projection,
    };
  }).filter((i) => i.alertLevel !== "ok");
  alerts.sort((a, b) => {
    if (a.alertLevel !== b.alertLevel) return a.alertLevel === "critical" ? -1 : 1;
    return (a.daysUntilDepleted ?? 999) - (b.daysUntilDepleted ?? 999);
  });
  res.json(alerts);
});

app.get("/healthz", (req, res) =>
  res.json({
    ok: true,
    today: TODAY.toISOString().slice(0, 10),
    posIntegrationsConfigured: false,
    retailProducts: RETAIL_PRODUCTS.length,
    restaurantDishes: RESTAURANT_DISHES.length,
    restaurantIngredients: RESTAURANT_INGREDIENTS.length,
  })
);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Restock Radar backend listening on :${PORT}`);
  console.log("POS integrations configured: false (running on seed data — see pos-connectors/)");
});
