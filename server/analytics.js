// Restock Radar — analytics engine
//
// Everything here is derived math over the seed data (which stands in for a
// real POS transaction-history pull). No new facts are invented: sales
// velocity comes straight from the trailing sales history, and every
// projection is a simple "at this rate, when do we hit zero / hit the alert
// line" calculation. This is intentionally NOT a full inventory-accounting
// system — see README.md for what that distinction means and why it matters.

const ALERT_THRESHOLD = 0.2; // "80% depleted" == 20% of par level remaining

// Trailing daily sales velocity, computed two ways:
//  - trailing7: last 7 days average (reacts fast to recent changes)
//  - trailing14: last 14 days average (smooths out day-to-day noise)
// We use trailing14 as the "official" velocity for projections since a
// single unusually slow or busy day shouldn't swing a restock date.
function velocityFromHistory(history) {
  const last = (n) => history.slice(-n).reduce((sum, d) => sum + d.unitsSold, 0) / n;
  return {
    trailing7: Math.round(last(7) * 100) / 100,
    trailing14: Math.round(last(14) * 100) / 100,
  };
}

// Day-wise sales for the current calendar month (matches the user's ask:
// "day wise what is the sale happening" / "type of dish" for restaurants).
function currentMonthHistory(history, today) {
  const y = today.getFullYear();
  const m = today.getMonth();
  return history.filter((d) => {
    const dt = new Date(d.date + "T00:00:00");
    return dt.getFullYear() === y && dt.getMonth() === m;
  });
}

function monthToDateTotal(history, today) {
  return currentMonthHistory(history, today).reduce((s, d) => s + d.unitsSold, 0);
}

// Core projection: given current stock, a daily velocity, and the lead time
// it takes a restock order to arrive, figure out:
//  - daysUntilDepleted: how many days of selling at this rate until stock hits 0
//  - depletedDate: the calendar date that would land on
//  - tentativeRestockDate: depletedDate minus the lead time — i.e. the last
//    safe day to place the order so it arrives before you run out. If that
//    date is today or in the past, the order is already overdue.
//  - alertLevel: "critical" (at/under alert threshold now), "watch" (will
//    cross the threshold within the lead time + 3 days), or "ok"
function projectRestock(currentStock, parLevel, dailyVelocity, restockLeadDays, today) {
  const pctRemaining = parLevel > 0 ? currentStock / parLevel : 0;
  const alertNow = pctRemaining <= ALERT_THRESHOLD;

  let daysUntilDepleted = null;
  let depletedDate = null;
  let tentativeRestockDate = null;
  let daysUntilAlertThreshold = null;

  if (dailyVelocity > 0) {
    daysUntilDepleted = Math.round((currentStock / dailyVelocity) * 10) / 10;
    const d = new Date(today);
    d.setDate(d.getDate() + Math.ceil(daysUntilDepleted));
    depletedDate = d.toISOString().slice(0, 10);

    const restockD = new Date(today);
    const daysToOrderBy = Math.ceil(daysUntilDepleted) - restockLeadDays;
    restockD.setDate(restockD.getDate() + Math.max(0, daysToOrderBy));
    tentativeRestockDate = restockD.toISOString().slice(0, 10);

    const unitsAboveAlertLine = currentStock - parLevel * ALERT_THRESHOLD;
    daysUntilAlertThreshold = Math.round((unitsAboveAlertLine / dailyVelocity) * 10) / 10;
  }

  let alertLevel = "ok";
  if (alertNow) {
    alertLevel = "critical";
  } else if (
    daysUntilAlertThreshold !== null &&
    daysUntilAlertThreshold <= restockLeadDays + 3
  ) {
    alertLevel = "watch";
  }

  const isOverdue =
    dailyVelocity > 0 && Math.ceil(daysUntilDepleted) - restockLeadDays <= 0;

  return {
    pctRemaining: Math.round(pctRemaining * 1000) / 10, // e.g. 41.3 (%)
    alertLevel, // "critical" | "watch" | "ok"
    daysUntilDepleted,
    depletedDate,
    tentativeRestockDate,
    restockOverdue: alertNow ? isOverdue : false,
  };
}

// Full detail payload for one retail product: stock projection + day-wise
// sales for the current month + trailing velocity figures.
function buildRetailDetail(product, historyRecord, today) {
  const { trailing7, trailing14 } = velocityFromHistory(historyRecord.history);
  const projection = projectRestock(
    product.currentStock,
    product.parLevel,
    trailing14,
    product.restockLeadDays,
    today
  );
  return {
    ...product,
    velocity: { trailing7, trailing14 },
    ...projection,
    monthToDateUnitsSold: monthToDateTotal(historyRecord.history, today),
    dayWiseSales: currentMonthHistory(historyRecord.history, today),
  };
}

// Same idea for a restaurant ingredient — velocity here is *ingredient units
// consumed per day*, derived upstream (in generate-seed-data / a real
// integration: recipe qty x dish units sold), not dish counts directly.
function buildIngredientDetail(ingredient, today) {
  const projection = projectRestock(
    ingredient.currentStock,
    ingredient.parLevel,
    ingredient.dailyVelocity,
    ingredient.restockLeadDays,
    today
  );
  return { ...ingredient, ...projection };
}

// Dish detail: day-wise sales for the month, no stock concept (dishes aren't
// stocked directly — their ingredients are).
function buildDishDetail(dish, historyRecord, today) {
  const { trailing7, trailing14 } = velocityFromHistory(historyRecord.history);
  return {
    ...dish,
    velocity: { trailing7, trailing14 },
    monthToDateUnitsSold: monthToDateTotal(historyRecord.history, today),
    dayWiseSales: currentMonthHistory(historyRecord.history, today),
  };
}

module.exports = {
  ALERT_THRESHOLD,
  velocityFromHistory,
  currentMonthHistory,
  monthToDateTotal,
  projectRestock,
  buildRetailDetail,
  buildIngredientDetail,
  buildDishDetail,
};
