// Restock Radar — frontend
//
// Plain JS, no framework/build step, so this runs as-is from any static
// host or inside a Capacitor WebView shell (see README for what wrapping
// this as an installable phone app would still need). All data comes from
// the /api endpoints in server.js, which are themselves seed data run
// through analytics.js — see README's "what's real vs placeholder" section.

const state = {
  mode: "retail", // "retail" | "restaurant"
  tab: "alerts", // retail: alerts|products ; restaurant: alerts|dishes|ingredients
  detail: null, // { kind: "product"|"dish"|"ingredient", id }
  cache: {}, // simple per-endpoint cache, cleared on mode switch
};

const screenEl = document.getElementById("screen");
const navEl = document.getElementById("bottomNav");
const modeToggleEl = document.getElementById("modeToggle");
const settingsBtnEl = document.getElementById("settingsBtn");

// Native app shells (Capacitor on Android/iOS) load this page from a
// bundled file:// / capacitor:// origin, so relative /api/... calls can't
// reach the Express backend the way they can on the web build. The base
// URL below lets a device point at wherever the backend is actually
// running (a LAN IP while testing, a real host once deployed).
function apiBase() {
  const saved = localStorage.getItem("restockApiBase");
  if (saved !== null) return saved.replace(/\/$/, "");
  // No saved setting yet: native builds fall back to localhost:3001, which
  // works out of the box when testing over USB with `adb reverse tcp:3001
  // tcp:3001`. Override this from the in-app Settings screen for anything
  // else (LAN IP, a real deployed host, etc).
  return isNative ? "http://localhost:3001" : "";
}
const isNative = Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

settingsBtnEl.addEventListener("click", () => openDetail("settings", null));

modeToggleEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-mode]");
  if (!btn) return;
  state.mode = btn.dataset.mode;
  state.tab = "alerts";
  state.detail = null;
  state.cache = {};
  syncModeToggle();
  render();
});

function syncModeToggle() {
  modeToggleEl.querySelectorAll("button[data-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === state.mode);
  });
}

function setTab(tab) {
  state.tab = tab;
  state.detail = null;
  render();
}

function openDetail(kind, id) {
  state.detail = { kind, id };
  render();
}

function closeDetail() {
  state.detail = null;
  render();
}

async function getJSON(url) {
  const fullUrl = url.startsWith("/api") ? apiBase() + url : url;
  if (state.cache[fullUrl]) return state.cache[fullUrl];
  let res;
  try {
    res = await fetch(fullUrl);
  } catch (err) {
    throw new Error("Couldn't reach the server. Check the Settings screen for the correct server address.");
  }
  if (!res.ok) throw new Error(`Server returned an error (${res.status}).`);
  const data = await res.json();
  state.cache[fullUrl] = data;
  return data;
}

// ---------------------------------------------------------------- NAV -----

function renderNav() {
  const items =
    state.mode === "retail"
      ? [
          { tab: "alerts", icon: "⚠️", label: "Alerts" },
          { tab: "products", icon: "🛍️", label: "Products" },
        ]
      : [
          { tab: "alerts", icon: "⚠️", label: "Alerts" },
          { tab: "dishes", icon: "🍽️", label: "Dishes" },
          { tab: "ingredients", icon: "🥬", label: "Ingredients" },
        ];

  navEl.innerHTML = items
    .map(
      (it) => `
      <button data-tab="${it.tab}" class="${state.tab === it.tab && !state.detail ? "active" : ""}">
        <span class="icon">${it.icon}</span>
        <span>${it.label}</span>
        <span class="nav-badge" data-badge="${it.tab}" hidden></span>
      </button>`
    )
    .join("");

  navEl.querySelectorAll("button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  // Alert count badge
  const alertUrl = state.mode === "retail" ? "/api/retail/alerts" : "/api/restaurant/alerts";
  getJSON(alertUrl)
    .then((alerts) => {
      const badge = navEl.querySelector('[data-badge="alerts"]');
      if (!badge) return;
      const criticalCount = alerts.filter((a) => a.alertLevel === "critical").length;
      if (criticalCount > 0) {
        badge.hidden = false;
        badge.textContent = criticalCount;
      } else {
        badge.hidden = true;
      }
    })
    .catch(() => {});
}

// -------------------------------------------------------------- HELPERS ---

function pctColor(alertLevel) {
  return alertLevel; // "critical" | "watch" | "ok" map directly to CSS classes
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function restockChip(item) {
  if (!item.tentativeRestockDate) {
    return `<span class="restock-date-chip">No sales velocity — can't project</span>`;
  }
  if (item.restockOverdue) {
    return `<span class="restock-date-chip overdue">⏰ Order now — overdue</span>`;
  }
  return `<span class="restock-date-chip upcoming">📅 Order by ${fmtDate(item.tentativeRestockDate)}</span>`;
}

function barRow({ id, name, sub, pctRemaining, alertLevel, kind }) {
  const cls = pctColor(alertLevel);
  const pillLabel = alertLevel === "critical" ? "Reorder now" : alertLevel === "watch" ? "Watch" : "OK";
  return `
    <div class="row-card" data-open="${kind}:${id}">
      <div class="row-top">
        <div>
          <div class="row-name">${name}</div>
          <div class="row-cat">${sub}</div>
        </div>
        <span class="pill ${cls}">${pillLabel}</span>
      </div>
      <div class="bar-track"><div class="bar-fill ${cls}" style="width:${Math.min(100, Math.max(2, pctRemaining))}%"></div></div>
      <div class="row-meta">
        <span>${pctRemaining.toFixed(0)}% of par remaining</span>
      </div>
    </div>`;
}

function attachRowOpeners(container) {
  container.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", () => {
      const [kind, id] = el.dataset.open.split(":");
      openDetail(kind, id);
    });
  });
}

function dayChart(dayWiseSales) {
  if (!dayWiseSales || !dayWiseSales.length) {
    return `<div class="empty-state">No sales logged yet this month.</div>`;
  }
  const max = Math.max(...dayWiseSales.map((d) => d.unitsSold), 1);
  const bars = dayWiseSales
    .map((d) => {
      const dt = new Date(d.date + "T00:00:00");
      const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
      const h = Math.max(4, Math.round((d.unitsSold / max) * 100));
      return `<div class="chart-bar-wrap" title="${d.date}: ${d.unitsSold} sold">
        <div class="chart-bar ${isWeekend ? "weekend" : ""}" style="height:${h}%"></div>
      </div>`;
    })
    .join("");
  const first = dayWiseSales[0].date.slice(5);
  const last = dayWiseSales[dayWiseSales.length - 1].date.slice(5);
  return `<div class="chart">${bars}</div><div class="chart-axis"><span>${first}</span><span>${last}</span></div>`;
}

// -------------------------------------------------------------- SCREENS ---

async function renderAlerts(url, emptyLabel) {
  screenEl.innerHTML = `
    <div class="section-header"><h2>Alerts</h2><span class="sub" id="alertCount"></span></div>
    <div class="list" id="alertList"><div class="loading">Loading…</div></div>`;
  const alerts = await getJSON(url);
  const countEl = document.getElementById("alertCount");
  countEl.textContent = alerts.length ? `${alerts.length} need attention` : "all clear";

  const listEl = document.getElementById("alertList");
  if (!alerts.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="big">✅</div>Nothing near ${emptyLabel} depleted right now.</div>`;
    return;
  }
  listEl.innerHTML = alerts
    .map((a) => {
      const kind = url.includes("retail") ? "product" : "ingredient";
      return `
      <div class="alert-card ${a.alertLevel}" data-open="${kind}:${a.id}">
        <div class="alert-top">
          <span class="alert-name">${a.name}</span>
          <span class="pill ${a.alertLevel}">${a.alertLevel === "critical" ? "Critical" : "Watch"}</span>
        </div>
        <div class="alert-detail">
          <b>${a.pctRemaining.toFixed(0)}%</b> of par level remaining
          ${a.daysUntilDepleted !== null ? ` — sells out in <b>~${a.daysUntilDepleted}d</b>` : ""}
          ${a.usedInDishes ? `<br/>Used in: ${a.usedInDishes.join(", ")}` : ""}
        </div>
        ${restockChip(a)}
      </div>`;
    })
    .join("");
  attachRowOpeners(listEl);
}

async function renderRetailProducts() {
  screenEl.innerHTML = `
    <div class="section-header"><h2>Products</h2><span class="sub" id="prodCount"></span></div>
    <div class="list" id="prodList"><div class="loading">Loading…</div></div>`;
  const products = await getJSON("/api/retail/products");
  document.getElementById("prodCount").textContent = `${products.length} tracked`;
  const listEl = document.getElementById("prodList");
  listEl.innerHTML = products
    .map((p) =>
      barRow({
        id: p.id,
        kind: "product",
        name: p.name,
        sub: `${p.category} · ${p.dailyVelocity}/day avg`,
        pctRemaining: p.pctRemaining,
        alertLevel: p.alertLevel,
      })
    )
    .join("");
  attachRowOpeners(listEl);
}

async function renderRestaurantDishes() {
  screenEl.innerHTML = `
    <div class="section-header"><h2>Dishes</h2><span class="sub">what's selling most</span></div>
    <div class="list" id="dishList"><div class="loading">Loading…</div></div>`;
  const dishes = await getJSON("/api/restaurant/dishes");
  const sorted = [...dishes].sort((a, b) => (b.velocity?.trailing14 || 0) - (a.velocity?.trailing14 || 0));
  const listEl = document.getElementById("dishList");
  listEl.innerHTML = sorted
    .map(
      (d, i) => `
      <div class="row-card" data-open="dish:${d.id}">
        <div class="row-top">
          <div>
            <div class="row-name">${i === 0 ? "🔥 " : ""}${d.name}</div>
            <div class="row-cat">${d.category} · $${d.price.toFixed(2)}</div>
          </div>
          <span class="pill ok">${d.velocity ? d.velocity.trailing14 : "—"}/day</span>
        </div>
        <div class="row-meta"><span>${d.monthToDateUnitsSold ?? 0} sold this month</span></div>
      </div>`
    )
    .join("");
  attachRowOpeners(listEl);
}

async function renderRestaurantIngredients() {
  screenEl.innerHTML = `
    <div class="section-header"><h2>Ingredients</h2><span class="sub" id="ingCount"></span></div>
    <div class="list" id="ingList"><div class="loading">Loading…</div></div>`;
  const ingredients = await getJSON("/api/restaurant/ingredients");
  document.getElementById("ingCount").textContent = `${ingredients.length} tracked`;
  const listEl = document.getElementById("ingList");
  listEl.innerHTML = ingredients
    .map((i) =>
      barRow({
        id: i.id,
        kind: "ingredient",
        name: i.name,
        sub: `used in ${i.usedInDishes.length} dish${i.usedInDishes.length === 1 ? "" : "es"} · ${i.dailyVelocity} ${i.unit}/day`,
        pctRemaining: i.pctRemaining,
        alertLevel: i.alertLevel,
      })
    )
    .join("");
  attachRowOpeners(listEl);
}

// ------------------------------------------------------------ DETAILS -----

function alertBanner(item) {
  if (item.alertLevel === "critical") {
    return `<div class="banner critical"><span class="emoji">🚨</span><div><b>${item.pctRemaining.toFixed(0)}% of par remaining</b> — this has crossed the 80%-depleted line. ${item.restockOverdue ? "Restock is already overdue." : ""}</div></div>`;
  }
  if (item.alertLevel === "watch") {
    return `<div class="banner watch"><span class="emoji">👀</span><div>Trending toward the depletion threshold within its restock lead time — worth reordering soon.</div></div>`;
  }
  return `<div class="banner ok"><span class="emoji">✅</span><div>Stock level is healthy relative to par.</div></div>`;
}

async function renderProductDetail(id) {
  screenEl.innerHTML = `<div class="detail-header"><button class="back-btn" id="backBtn">← Back</button><span class="title">Loading…</span></div>`;
  document.getElementById("backBtn").addEventListener("click", closeDetail);
  const p = await getJSON(`/api/retail/products/${id}`);

  screenEl.innerHTML = `
    <div class="detail-header"><button class="back-btn" id="backBtn">← Back</button><span class="title">${p.name}</span></div>
    <div class="detail-body">
      ${alertBanner(p)}
      <div class="card">
        <h3>Stock level</h3>
        <div class="big-bar-track">
          <div class="big-bar-fill ${p.alertLevel}" style="width:${Math.min(100, Math.max(6, p.pctRemaining))}%; background:${p.alertLevel === "critical" ? "var(--critical)" : p.alertLevel === "watch" ? "var(--watch)" : "var(--accent)"}">${p.pctRemaining.toFixed(0)}%</div>
        </div>
        <div class="stock-caption"><span>${p.currentStock} ${p.unit} on hand</span><span>par ${p.parLevel} ${p.unit}</span></div>
      </div>
      <div class="stat-grid">
        <div class="stat-box"><div class="label">Daily velocity</div><div class="value">${p.velocity.trailing14}<span style="font-size:12px;font-weight:600"> /day</span></div></div>
        <div class="stat-box"><div class="label">This month</div><div class="value">${p.monthToDateUnitsSold}<span style="font-size:12px;font-weight:600"> sold</span></div></div>
        <div class="stat-box"><div class="label">Sells out in</div><div class="value">${p.daysUntilDepleted !== null ? p.daysUntilDepleted + "d" : "—"}</div></div>
        <div class="stat-box"><div class="label">Restock lead time</div><div class="value">${p.restockLeadDays}d</div></div>
      </div>
      <div class="card">
        <h3>Restock timing</h3>
        ${restockChip(p)}
        <div class="kv-list" style="margin-top:12px">
          <div class="kv-row"><span class="k">Projected sell-out date</span><span class="v">${fmtDate(p.depletedDate)}</span></div>
          <div class="kv-row"><span class="k">Last restocked</span><span class="v">${fmtDate(p.lastRestockedDate)}</span></div>
          <div class="kv-row"><span class="k">Unit cost / price</span><span class="v">$${p.unitCost.toFixed(2)} / $${p.unitPrice.toFixed(2)}</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Day-wise sales — this month</h3>
        ${dayChart(p.dayWiseSales)}
      </div>
      <div class="footnote">SKU ${p.sku} · Category: ${p.category}</div>
    </div>`;
  document.getElementById("backBtn").addEventListener("click", closeDetail);
}

async function renderIngredientDetail(id) {
  screenEl.innerHTML = `<div class="detail-header"><button class="back-btn" id="backBtn">← Back</button><span class="title">Loading…</span></div>`;
  document.getElementById("backBtn").addEventListener("click", closeDetail);
  const i = await getJSON(`/api/restaurant/ingredients/${id}`);

  screenEl.innerHTML = `
    <div class="detail-header"><button class="back-btn" id="backBtn">← Back</button><span class="title">${i.name}</span></div>
    <div class="detail-body">
      ${alertBanner(i)}
      <div class="card">
        <h3>Stock level</h3>
        <div class="big-bar-track">
          <div class="big-bar-fill" style="width:${Math.min(100, Math.max(6, i.pctRemaining))}%; background:${i.alertLevel === "critical" ? "var(--critical)" : i.alertLevel === "watch" ? "var(--watch)" : "var(--accent)"}">${i.pctRemaining.toFixed(0)}%</div>
        </div>
        <div class="stock-caption"><span>${i.currentStock} ${i.unit} on hand</span><span>par ${i.parLevel} ${i.unit}</span></div>
      </div>
      <div class="stat-grid">
        <div class="stat-box"><div class="label">Usage rate</div><div class="value">${i.dailyVelocity}<span style="font-size:12px;font-weight:600"> ${i.unit}/day</span></div></div>
        <div class="stat-box"><div class="label">Depletes in</div><div class="value">${i.daysUntilDepleted !== null ? i.daysUntilDepleted + "d" : "—"}</div></div>
        <div class="stat-box"><div class="label">Restock lead time</div><div class="value">${i.restockLeadDays}d</div></div>
        <div class="stat-box"><div class="label">Cost / ${i.unit}</div><div class="value">$${i.costPerUnit.toFixed(2)}</div></div>
      </div>
      <div class="card">
        <h3>Restock timing</h3>
        ${restockChip(i)}
        <div class="kv-list" style="margin-top:12px">
          <div class="kv-row"><span class="k">Projected depletion date</span><span class="v">${fmtDate(i.depletedDate)}</span></div>
          <div class="kv-row"><span class="k">Last restocked</span><span class="v">${fmtDate(i.lastRestockedDate)}</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Used in</h3>
        ${i.usedInDishes.map((d) => `<span class="ingredient-chip">${d}</span>`).join("")}
      </div>
      <div class="footnote">Usage is derived from dish sales × the recipe mapping (see Restaurant Services README) — not read directly from the POS, since POS systems track dish sales, not raw ingredient stock.</div>
    </div>`;
  document.getElementById("backBtn").addEventListener("click", closeDetail);
}

async function renderDishDetail(id) {
  screenEl.innerHTML = `<div class="detail-header"><button class="back-btn" id="backBtn">← Back</button><span class="title">Loading…</span></div>`;
  document.getElementById("backBtn").addEventListener("click", closeDetail);
  const d = await getJSON(`/api/restaurant/dishes/${id}`);

  screenEl.innerHTML = `
    <div class="detail-header"><button class="back-btn" id="backBtn">← Back</button><span class="title">${d.name}</span></div>
    <div class="detail-body">
      <div class="stat-grid">
        <div class="stat-box"><div class="label">Price</div><div class="value">$${d.price.toFixed(2)}</div></div>
        <div class="stat-box"><div class="label">This month</div><div class="value">${d.monthToDateUnitsSold}<span style="font-size:12px;font-weight:600"> sold</span></div></div>
        <div class="stat-box"><div class="label">Daily avg (14d)</div><div class="value">${d.velocity.trailing14}</div></div>
        <div class="stat-box"><div class="label">Daily avg (7d)</div><div class="value">${d.velocity.trailing7}</div></div>
      </div>
      <div class="card">
        <h3>Day-wise sales — this month</h3>
        ${dayChart(d.dayWiseSales)}
      </div>
      <div class="card">
        <h3>Recipe (ingredient usage per order)</h3>
        ${d.recipe.map((r) => `<span class="ingredient-chip">${r.ing.replace(/_/g, " ")}<span class="qty">×${r.qty}</span></span>`).join("")}
      </div>
      <div class="footnote">Tap into Ingredients to see stock-on-hand and restock timing for anything used in this dish.</div>
    </div>`;
  document.getElementById("backBtn").addEventListener("click", closeDetail);
}

// ------------------------------------------------------------- SETTINGS ---

function renderSettings() {
  const current = localStorage.getItem("restockApiBase") || "";
  screenEl.innerHTML = `
    <div class="detail-header"><button class="back-btn" id="backBtn">← Back</button><span class="title">Settings</span></div>
    <div class="detail-body">
      <div class="card">
        <h3>Backend server address</h3>
        <p class="footnote" style="margin-top:0">${
          isNative
            ? "Running as an installed app — defaults to http://localhost:3001 (works over USB with `adb reverse tcp:3001 tcp:3001`). Point this at your deployed backend URL to test from any network."
            : "Running in a browser — leave blank to use this same site's /api routes. Only needed if the backend is hosted elsewhere."
        }</p>
        <input id="apiBaseInput" type="text" placeholder="http://192.168.1.20:3001" value="${current.replace(/"/g, "&quot;")}" style="width:100%; box-sizing:border-box; padding:10px; border-radius:8px; border:1px solid #ccc; font-size:15px; margin-top:8px" />
        <div style="display:flex; gap:10px; margin-top:14px">
          <button id="saveApiBase" class="pill ok" style="cursor:pointer; padding:10px 16px">Save</button>
          <button id="testApiBase" class="pill watch" style="cursor:pointer; padding:10px 16px">Test connection</button>
        </div>
        <div id="apiBaseStatus" class="footnote" style="margin-top:10px"></div>
      </div>
      <div class="footnote">All data shown today comes from seeded sample data standing in for a real POS export — see README for what's real vs. placeholder.</div>
    </div>`;
  document.getElementById("backBtn").addEventListener("click", closeDetail);

  const input = document.getElementById("apiBaseInput");
  const statusEl = document.getElementById("apiBaseStatus");

  document.getElementById("saveApiBase").onclick = () => {
    localStorage.setItem("restockApiBase", input.value.trim());
    state.cache = {};
    statusEl.textContent = "Saved.";
  };
  document.getElementById("testApiBase").onclick = async () => {
    statusEl.textContent = "Checking…";
    const base = input.value.trim().replace(/\/$/, "");
    try {
      const res = await fetch(base + "/healthz");
      const data = await res.json();
      statusEl.textContent = data.ok ? "✅ Connected — server is reachable." : "⚠️ Server responded but reported an issue.";
    } catch (err) {
      statusEl.textContent = "❌ Couldn't reach that address from this device.";
    }
  };
}

function renderConnectionError(err) {
  screenEl.innerHTML = `
    <div class="section-header"><h2>Can't load data</h2></div>
    <div class="empty-state">
      <div class="big">📡</div>
      ${err && err.message ? err.message : "Something went wrong talking to the server."}
      <div style="margin-top:16px"><button id="goSettingsBtn" class="pill watch" style="cursor:pointer; padding:10px 16px">Open Settings</button></div>
    </div>`;
  document.getElementById("goSettingsBtn").addEventListener("click", () => openDetail("settings", null));
}

// --------------------------------------------------------------- MAIN -----

async function render() {
  syncModeToggle();
  renderNav();

  try {
    if (state.detail) {
      if (state.detail.kind === "settings") return renderSettings();
      if (state.detail.kind === "product") return await renderProductDetail(state.detail.id);
      if (state.detail.kind === "ingredient") return await renderIngredientDetail(state.detail.id);
      if (state.detail.kind === "dish") return await renderDishDetail(state.detail.id);
    }

    if (state.mode === "retail") {
      if (state.tab === "alerts") return await renderAlerts("/api/retail/alerts", "80%");
      if (state.tab === "products") return await renderRetailProducts();
    } else {
      if (state.tab === "alerts") return await renderAlerts("/api/restaurant/alerts", "80%");
      if (state.tab === "dishes") return await renderRestaurantDishes();
      if (state.tab === "ingredients") return await renderRestaurantIngredients();
    }
  } catch (err) {
    renderConnectionError(err);
  }
}

render();
