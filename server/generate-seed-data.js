// Generates realistic sample sales history + current inventory state for both
// the retail/grocery side and the restaurant side. This stands in for what a
// real integration would pull from Square/Clover (retail) or Toast (restaurant)
// APIs — see pos-connectors/ for where the real API calls would go instead.
//
// Model: each item has a "par level" (the stock level right after its last
// restock) and a daily sales velocity with some randomness + a weekly pattern
// (weekends busier). Current stock = par level minus cumulative units sold
// since the last restock date, floored at 0. This makes the simulated "today"
// internally consistent with the sales history, so some items land naturally
// near the 80%-depleted alert threshold and others don't — a realistic mix.

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "seed-data");
const DAYS_OF_HISTORY = 45; // ~1.5 months, enough for "this month" + a trailing velocity window
const TODAY = new Date("2026-09-08"); // fixed "today" so the demo is reproducible

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

// Builds DAYS_OF_HISTORY days of daily unit sales for one item, given a base
// daily velocity, weekend multiplier, and a bit of noise. Returns
// { history: [{date, unitsSold}], totalSold, last14DaysSold }
function buildSalesHistory(rand, baseVelocity, weekendBoost, trendPerDay = 0) {
  const history = [];
  let totalSold = 0;
  let last14 = 0;
  for (let i = DAYS_OF_HISTORY - 1; i >= 0; i--) {
    const d = daysAgo(i);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const trendAdj = trendPerDay * (DAYS_OF_HISTORY - 1 - i); // slow drift up/down over time
    const noise = 0.75 + rand() * 0.5; // +/-25%
    let units = Math.round((baseVelocity + trendAdj) * (isWeekend ? weekendBoost : 1) * noise);
    if (units < 0) units = 0;
    history.push({ date: dateStr(d), unitsSold: units });
    totalSold += units;
    if (i < 14) last14 += units;
  }
  return { history, totalSold, last14DaysSold: last14 };
}

// --- RETAIL / GROCERY -------------------------------------------------------

const RETAIL_PRODUCTS = [
  { name: "Whole Milk, 1 Gallon", category: "Dairy", unit: "each", unitCost: 2.85, unitPrice: 4.29, parLevel: 120, velocity: 9, weekendBoost: 1.4, restockLeadDays: 2 },
  { name: "Large Eggs, Dozen", category: "Dairy", unit: "each", unitCost: 2.1, unitPrice: 3.49, parLevel: 150, velocity: 11, weekendBoost: 1.3, restockLeadDays: 2 },
  { name: "White Bread Loaf", category: "Bakery", unit: "each", unitCost: 1.4, unitPrice: 2.99, parLevel: 80, velocity: 6, weekendBoost: 1.2, restockLeadDays: 1 },
  { name: "Bananas", category: "Produce", unit: "lb", unitCost: 0.35, unitPrice: 0.59, parLevel: 300, velocity: 22, weekendBoost: 1.5, restockLeadDays: 2 },
  { name: "Roma Tomatoes", category: "Produce", unit: "lb", unitCost: 0.9, unitPrice: 1.79, parLevel: 150, velocity: 10, weekendBoost: 1.3, restockLeadDays: 2 },
  { name: "Ground Beef 80/20, 1lb", category: "Meat", unit: "each", unitCost: 3.6, unitPrice: 5.99, parLevel: 90, velocity: 7, weekendBoost: 1.6, restockLeadDays: 3 },
  { name: "Boneless Chicken Breast, 1lb", category: "Meat", unit: "each", unitCost: 2.9, unitPrice: 4.79, parLevel: 100, velocity: 8, weekendBoost: 1.5, restockLeadDays: 3 },
  { name: "Iowa Sweet Corn (6ct)", category: "Produce", unit: "each", unitCost: 1.8, unitPrice: 3.29, parLevel: 60, velocity: 4, weekendBoost: 1.2, restockLeadDays: 2 },
  { name: "Coca-Cola 12pk Cans", category: "Beverages", unit: "each", unitCost: 4.5, unitPrice: 6.99, parLevel: 100, velocity: 6, weekendBoost: 1.7, restockLeadDays: 4 },
  { name: "Bottled Water, 24pk", category: "Beverages", unit: "each", unitCost: 3.2, unitPrice: 4.99, parLevel: 80, velocity: 5, weekendBoost: 1.4, restockLeadDays: 4 },
  { name: "Potato Chips, Family Size", category: "Snacks", unit: "each", unitCost: 2.4, unitPrice: 4.49, parLevel: 70, velocity: 4, weekendBoost: 1.6, restockLeadDays: 5 },
  { name: "Toilet Paper, 12 Roll", category: "Household", unit: "each", unitCost: 8.5, unitPrice: 13.99, parLevel: 50, velocity: 3, weekendBoost: 1.1, restockLeadDays: 5 },
  { name: "Laundry Detergent, 100oz", category: "Household", unit: "each", unitCost: 9.2, unitPrice: 15.99, parLevel: 35, velocity: 2, weekendBoost: 1.1, restockLeadDays: 6 },
  { name: "Cheddar Cheese Block, 8oz", category: "Dairy", unit: "each", unitCost: 2.6, unitPrice: 4.29, parLevel: 60, velocity: 4, weekendBoost: 1.3, restockLeadDays: 3 },
  { name: "Frozen Pizza, Pepperoni", category: "Frozen", unit: "each", unitCost: 3.1, unitPrice: 5.99, parLevel: 55, velocity: 4, weekendBoost: 1.5, restockLeadDays: 5 },
  { name: "Orange Juice, 64oz", category: "Beverages", unit: "each", unitCost: 3.0, unitPrice: 4.79, parLevel: 65, velocity: 4, weekendBoost: 1.3, restockLeadDays: 3 },
  { name: "Iceberg Lettuce", category: "Produce", unit: "each", unitCost: 0.8, unitPrice: 1.69, parLevel: 90, velocity: 6, weekendBoost: 1.3, restockLeadDays: 2 },
  { name: "Russet Potatoes, 5lb Bag", category: "Produce", unit: "each", unitCost: 2.2, unitPrice: 3.99, parLevel: 70, velocity: 4, weekendBoost: 1.2, restockLeadDays: 3 },
];

// A couple of "last restocked N days ago" scenarios so stock levels vary —
// some items freshly restocked, some genuinely close to running out.
const RESTOCK_AGE_PATTERN = [2, 8, 1, 12, 4, 9, 3, 6, 14, 2, 10, 5, 16, 3, 11, 7, 4, 8];

function buildRetail() {
  const rand = seededRandom(42);
  const products = [];
  const salesHistory = [];

  RETAIL_PRODUCTS.forEach((p, idx) => {
    const id = `R${String(idx + 1).padStart(3, "0")}`;
    const { history, last14DaysSold } = buildSalesHistory(rand, p.velocity, p.weekendBoost, (rand() - 0.5) * 0.05);
    salesHistory.push({ productId: id, history });

    const lastRestockDaysAgo = RESTOCK_AGE_PATTERN[idx % RESTOCK_AGE_PATTERN.length];
    const soldSinceRestock = history
      .slice(DAYS_OF_HISTORY - lastRestockDaysAgo)
      .reduce((sum, d) => sum + d.unitsSold, 0);
    const currentStock = Math.max(0, p.parLevel - soldSinceRestock);
    const dailyVelocity = Math.round((last14DaysSold / 14) * 100) / 100;

    products.push({
      id,
      sku: `SKU-${10000 + idx}`,
      name: p.name,
      category: p.category,
      unit: p.unit,
      unitCost: p.unitCost,
      unitPrice: p.unitPrice,
      parLevel: p.parLevel,
      currentStock,
      lastRestockedDate: dateStr(daysAgo(lastRestockDaysAgo)),
      restockLeadDays: p.restockLeadDays,
      dailyVelocity,
    });
  });

  fs.writeFileSync(path.join(OUT, "retail-products.json"), JSON.stringify(products, null, 2));
  fs.writeFileSync(path.join(OUT, "retail-sales-history.json"), JSON.stringify(salesHistory, null, 2));
  console.log(`Retail: ${products.length} products, ${DAYS_OF_HISTORY} days of history each.`);
}

// --- RESTAURANT --------------------------------------------------------------

const DISHES = [
  { name: "Classic Cheeseburger", category: "Entree", price: 12.5, velocity: 18, weekendBoost: 1.4 },
  { name: "Margherita Pizza", category: "Entree", price: 14.0, velocity: 14, weekendBoost: 1.5 },
  { name: "Caesar Salad", category: "Salad", price: 9.5, velocity: 10, weekendBoost: 1.1 },
  { name: "Grilled Chicken Sandwich", category: "Entree", price: 11.5, velocity: 12, weekendBoost: 1.3 },
  { name: "Fish Tacos (3pc)", category: "Entree", price: 13.0, velocity: 8, weekendBoost: 1.6 },
  { name: "Loaded Nachos", category: "Appetizer", price: 10.0, velocity: 9, weekendBoost: 1.7 },
  { name: "Spaghetti & Meatballs", category: "Entree", price: 13.5, velocity: 7, weekendBoost: 1.2 },
  { name: "French Fries (side)", category: "Side", price: 4.5, velocity: 25, weekendBoost: 1.4 },
  { name: "Chocolate Lava Cake", category: "Dessert", price: 7.0, velocity: 6, weekendBoost: 1.8 },
  { name: "Iced Tea", category: "Beverage", price: 3.0, velocity: 20, weekendBoost: 1.2 },
];

// dishId index -> ingredient usage per dish sold
const RECIPES = [
  { dish: 0, ingredients: [{ ing: "beef_patty", qty: 1 }, { ing: "burger_bun", qty: 1 }, { ing: "cheddar_slice", qty: 1 }, { ing: "lettuce", qty: 0.05 }] },
  { dish: 1, ingredients: [{ ing: "pizza_dough", qty: 1 }, { ing: "mozzarella", qty: 0.3 }, { ing: "marinara", qty: 0.2 }] },
  { dish: 2, ingredients: [{ ing: "romaine", qty: 0.2 }, { ing: "parmesan", qty: 0.05 }, { ing: "caesar_dressing", qty: 0.1 }] },
  { dish: 3, ingredients: [{ ing: "chicken_breast", qty: 1 }, { ing: "burger_bun", qty: 1 }, { ing: "lettuce", qty: 0.05 }] },
  { dish: 4, ingredients: [{ ing: "tilapia", qty: 0.5 }, { ing: "corn_tortilla", qty: 3 }, { ing: "cabbage_slaw", qty: 0.15 }] },
  { dish: 5, ingredients: [{ ing: "tortilla_chips", qty: 0.4 }, { ing: "cheddar_slice", qty: 2 }, { ing: "jalapeno", qty: 0.1 }] },
  { dish: 6, ingredients: [{ ing: "spaghetti", qty: 0.5 }, { ing: "beef_patty", qty: 0.8 }, { ing: "marinara", qty: 0.4 }] },
  { dish: 7, ingredients: [{ ing: "potato", qty: 0.6 }] },
  { dish: 8, ingredients: [{ ing: "chocolate_cake_mix", qty: 0.3 }] },
  { dish: 9, ingredients: [{ ing: "tea_bags", qty: 1 }] },
];

const INGREDIENTS = {
  beef_patty: { name: "Ground Beef Patties", unit: "each", parLevel: 400, restockLeadDays: 2, costPerUnit: 1.1 },
  burger_bun: { name: "Burger Buns", unit: "each", parLevel: 400, restockLeadDays: 2, costPerUnit: 0.35 },
  cheddar_slice: { name: "Cheddar Slices", unit: "each", parLevel: 500, restockLeadDays: 3, costPerUnit: 0.2 },
  lettuce: { name: "Shredded Lettuce", unit: "lb", parLevel: 60, restockLeadDays: 2, costPerUnit: 1.2 },
  pizza_dough: { name: "Pizza Dough Balls", unit: "each", parLevel: 250, restockLeadDays: 2, costPerUnit: 0.9 },
  mozzarella: { name: "Shredded Mozzarella", unit: "lb", parLevel: 120, restockLeadDays: 3, costPerUnit: 3.5 },
  marinara: { name: "Marinara Sauce", unit: "lb", parLevel: 100, restockLeadDays: 3, costPerUnit: 1.8 },
  romaine: { name: "Romaine Lettuce", unit: "lb", parLevel: 50, restockLeadDays: 2, costPerUnit: 1.6 },
  parmesan: { name: "Shredded Parmesan", unit: "lb", parLevel: 20, restockLeadDays: 4, costPerUnit: 5.5 },
  caesar_dressing: { name: "Caesar Dressing", unit: "gal", parLevel: 10, restockLeadDays: 4, costPerUnit: 12.0 },
  chicken_breast: { name: "Chicken Breast Portions", unit: "each", parLevel: 300, restockLeadDays: 3, costPerUnit: 1.6 },
  tilapia: { name: "Tilapia Fillets", unit: "lb", parLevel: 60, restockLeadDays: 4, costPerUnit: 4.2 },
  corn_tortilla: { name: "Corn Tortillas", unit: "each", parLevel: 600, restockLeadDays: 2, costPerUnit: 0.08 },
  cabbage_slaw: { name: "Cabbage Slaw Mix", unit: "lb", parLevel: 40, restockLeadDays: 2, costPerUnit: 1.0 },
  tortilla_chips: { name: "Tortilla Chips", unit: "lb", parLevel: 80, restockLeadDays: 4, costPerUnit: 1.4 },
  jalapeno: { name: "Sliced Jalapenos", unit: "lb", parLevel: 20, restockLeadDays: 4, costPerUnit: 2.1 },
  spaghetti: { name: "Dry Spaghetti", unit: "lb", parLevel: 60, restockLeadDays: 5, costPerUnit: 1.1 },
  potato: { name: "Frozen Fry Cut Potatoes", unit: "lb", parLevel: 200, restockLeadDays: 4, costPerUnit: 0.9 },
  chocolate_cake_mix: { name: "Lava Cake Batter Mix", unit: "lb", parLevel: 40, restockLeadDays: 5, costPerUnit: 2.8 },
  tea_bags: { name: "Iced Tea Bags", unit: "each", parLevel: 600, restockLeadDays: 5, costPerUnit: 0.06 },
};

function buildRestaurant() {
  const rand = seededRandom(99);
  const dishes = [];
  const salesHistory = [];
  const dishHistories = []; // keep raw history arrays around to derive ingredient usage

  DISHES.forEach((d, idx) => {
    const id = `D${String(idx + 1).padStart(2, "0")}`;
    const { history, last14DaysSold } = buildSalesHistory(rand, d.velocity, d.weekendBoost, (rand() - 0.5) * 0.08);
    salesHistory.push({ dishId: id, history });
    dishHistories.push(history);
    dishes.push({
      id,
      name: d.name,
      category: d.category,
      price: d.price,
      dailyVelocity: Math.round((last14DaysSold / 14) * 100) / 100,
    });
  });

  // Derive ingredient usage per day from dish sales x recipe, then simulate
  // stock the same way as retail: parLevel minus cumulative usage since a
  // per-ingredient "last restocked" date.
  const ingredientRestockAge = [3, 5, 1, 9, 2, 7, 4, 11, 6, 9, 8, 3, 5, 10, 2, 16, 4, 12, 3, 7];
  const ingredientKeys = Object.keys(INGREDIENTS);
  const ingredients = [];

  ingredientKeys.forEach((key, i) => {
    const meta = INGREDIENTS[key];
    // Build this ingredient's daily usage history by summing over all recipes that use it
    const dailyUsage = new Array(DAYS_OF_HISTORY).fill(0);
    RECIPES.forEach((r) => {
      const uses = r.ingredients.find((x) => x.ing === key);
      if (!uses) return;
      const hist = dishHistories[r.dish];
      hist.forEach((day, dayIdx) => {
        dailyUsage[dayIdx] += day.unitsSold * uses.qty;
      });
    });

    const lastRestockDaysAgo = ingredientRestockAge[i % ingredientRestockAge.length];
    const usedSinceRestock = dailyUsage.slice(DAYS_OF_HISTORY - lastRestockDaysAgo).reduce((s, v) => s + v, 0);
    const currentStock = Math.max(0, Math.round((meta.parLevel - usedSinceRestock) * 10) / 10);
    const last14 = dailyUsage.slice(DAYS_OF_HISTORY - 14).reduce((s, v) => s + v, 0);
    const dailyVelocity = Math.round((last14 / 14) * 100) / 100;

    ingredients.push({
      id: key,
      name: meta.name,
      unit: meta.unit,
      parLevel: meta.parLevel,
      currentStock,
      lastRestockedDate: dateStr(daysAgo(lastRestockDaysAgo)),
      restockLeadDays: meta.restockLeadDays,
      costPerUnit: meta.costPerUnit,
      dailyVelocity,
      usedInDishes: RECIPES.filter((r) => r.ingredients.some((x) => x.ing === key)).map((r) => DISHES[r.dish].name),
    });
  });

  fs.writeFileSync(path.join(OUT, "restaurant-dishes.json"), JSON.stringify(dishes, null, 2));
  fs.writeFileSync(path.join(OUT, "restaurant-sales-history.json"), JSON.stringify(salesHistory, null, 2));
  fs.writeFileSync(path.join(OUT, "restaurant-ingredients.json"), JSON.stringify(ingredients, null, 2));
  fs.writeFileSync(
    path.join(OUT, "restaurant-recipes.json"),
    JSON.stringify(
      RECIPES.map((r) => ({ dishId: DISHES[r.dish] ? dishes[r.dish].id : null, dishName: DISHES[r.dish].name, ingredients: r.ingredients })),
      null,
      2
    )
  );
  console.log(`Restaurant: ${dishes.length} dishes, ${ingredients.length} tracked ingredients.`);
}

buildRetail();
buildRestaurant();
console.log("Seed data generation complete. TODAY =", dateStr(TODAY));
