// Restock Radar — frontend (retail/grocery only)
//
// Plain JS, no framework/build step. All data comes from the /api/retail
// endpoints in server.js. Stock only ever changes when a sale is recorded
// (Record Sale tab) — either typed in by hand or uploaded as a bill file
// shaped like server/seed-data/mock-billing-export.json.

const state = {
  tab: "alerts", // "alerts" | "products" | "record"
  detail: null, // { kind: "product", id } | { kind: "settings" }
  cache: {},
};

const screenEl = document.getElementById("screen");
const navEl = document.getElementById("bottomNav");
const settingsBtnEl = document.getElementById("settingsBtn");

// Native app shells (Capacitor on Android/iOS) load this page from a
// bundled origin, so relative /api/... calls can't reach the Express
// backend the way they can on the web build.
function apiBase() {
  const saved = localStorage.getItem("restockApiBase");
  if (saved !== null) return saved.replace(/\/$/, "");
  return isNative ? "http://localhost:3001" : "";
}
const isNative = Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

settingsBtnEl.addEventListener("click", () => openDetail("settings", null));

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

async function postJSON(url, body) {
  const fullUrl = url.startsWith("/api") ? apiBase() + url : url;
  const res = await fetch(fullUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server returned an error (${res.status}).`);
  return data;
}

// ---------------------------------------------------------------- NAV -----

function renderNav() {
  const items = [
    { tab: "alerts", icon: "⚠️", label: "Alerts" },
    { tab: "products", icon: "🧺", label: "Products" },
    { tab: "record", icon: "🧾", label: "Record Sale" },
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

  getJSON("/api/retail/alerts")
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

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function restockChip(item) {
  if (!item.needsRestockNow) {
    return `<span class="restock-date-chip ok">✅ Stock healthy</span>`;
  }
  return `<span class="restock-date-chip overdue">⏰ Restock now — arrives ~${fmtDate(item.tentativeRestockDate)}</span>`;
}

function barRow({ id, name, sub, pctRemaining, alertLevel }) {
  const pillLabel = alertLevel === "critical" ? "Restock now" : alertLevel === "watch" ? "Watch" : "OK";
  return `
    <div class="row-card" data-open="product:${id}">
      <div class="row-top">
        <div>
          <div class="row-name">${name}</div>
          <div class="row-cat">${sub}</div>
        </div>
        <span class="pill ${alertLevel}">${pillLabel}</span>
      </div>
      <div class="bar-track"><div class="bar-fill ${alertLevel}" style="width:${Math.min(100, Math.max(2, pctRemaining))}%"></div></div>
      <div class="row-meta">
        <span>${pctRemaining.toFixed(0)}% of initial stock remaining</span>
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

// -------------------------------------------------------------- SCREENS ---

async function renderAlerts() {
  screenEl.innerHTML = `
    <div class="section-header"><h2>Alerts</h2><span class="sub" id="alertCount"></span></div>
    <div class="list" id="alertList"><div class="loading">Loading…</div></div>`;
  const alerts = await getJSON("/api/retail/alerts");
  document.getElementById("alertCount").textContent = alerts.length ? `${alerts.length} need attention` : "all clear";

  const listEl = document.getElementById("alertList");
  if (!alerts.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="big">✅</div>Everything is above the 50% restock line right now.</div>`;
    return;
  }
  listEl.innerHTML = alerts
    .map(
      (a) => `
      <div class="alert-card ${a.alertLevel}" data-open="product:${a.id}">
        <div class="alert-top">
          <span class="alert-name">${a.name}</span>
          <span class="pill ${a.alertLevel}">${a.alertLevel === "critical" ? "Critical" : "Watch"}</span>
        </div>
        <div class="alert-detail">
          <b>${a.pctRemaining.toFixed(0)}%</b> of initial stock remaining (${a.currentStock} of ${a.initialStock} ${a.unit})
        </div>
        ${restockChip(a)}
      </div>`
    )
    .join("");
  attachRowOpeners(listEl);
}

async function renderProducts() {
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
        name: p.name,
        sub: `$${p.unitCost.toFixed(2)}/${p.unit} · restock takes ${p.restockLeadDays}d`,
        pctRemaining: p.pctRemaining,
        alertLevel: p.alertLevel,
      })
    )
    .join("");
  attachRowOpeners(listEl);
}

async function renderProductDetail(id) {
  screenEl.innerHTML = `<div class="detail-header"><button class="back-btn" id="backBtn">← Back</button><span class="title">Loading…</span></div>`;
  document.getElementById("backBtn").addEventListener("click", closeDetail);
  const p = await getJSON(`/api/retail/products/${id}`);

  screenEl.innerHTML = `
    <div class="detail-header"><button class="back-btn" id="backBtn">← Back</button><span class="title">${p.name}</span></div>
    <div class="detail-body">
      <div class="banner ${p.alertLevel}">
        <span class="emoji">${p.alertLevel === "critical" ? "🚨" : p.alertLevel === "watch" ? "👀" : "✅"}</span>
        <div>${
          p.alertLevel === "critical"
            ? `Below 50% of initial stock — restock now. A reorder placed today would arrive around <b>${fmtDate(p.tentativeRestockDate)}</b>.`
            : p.alertLevel === "watch"
            ? "Getting low — keep an eye on this one."
            : "Stock level is healthy relative to the initial baseline."
        }</div>
      </div>
      <div class="card">
        <h3>Stock level</h3>
        <div class="big-bar-track">
          <div class="big-bar-fill ${p.alertLevel}" style="width:${Math.min(100, Math.max(6, p.pctRemaining))}%">${p.pctRemaining.toFixed(0)}%</div>
        </div>
        <div class="stock-caption"><span>${p.currentStock} ${p.unit} on hand</span><span>initial ${p.initialStock} ${p.unit}</span></div>
      </div>
      <div class="stat-grid">
        <div class="stat-box"><div class="label">Cost per ${p.unit}</div><div class="value">$${p.unitCost.toFixed(2)}</div></div>
        <div class="stat-box"><div class="label">Restock lead time</div><div class="value">${p.restockLeadDays}d</div></div>
      </div>
      <div class="card">
        <h3>Restock timing</h3>
        ${restockChip(p)}
        <div class="kv-list" style="margin-top:12px">
          <div class="kv-row"><span class="k">Tentative restock date</span><span class="v">${fmtDate(p.tentativeRestockDate)}</span></div>
          <div class="kv-row"><span class="k">Initial stock recorded</span><span class="v">${fmtDate(p.lastRestockedDate)}</span></div>
        </div>
      </div>
      <div class="footnote">SKU ${p.sku} · Restock triggers automatically once stock drops below 50% of the initial ${p.initialStock} ${p.unit} baseline.</div>
    </div>`;
  document.getElementById("backBtn").addEventListener("click", closeDetail);
}

// --------------------------------------------------------- RECORD SALE ----

async function renderRecordSale() {
  screenEl.innerHTML = `
    <div class="section-header"><h2>Record Sale</h2><span class="sub">updates stock</span></div>
    <div class="detail-body" style="padding-top:0">
      <div class="card">
        <h3>Upload a bill</h3>
        <p class="footnote" style="margin-top:0; padding:0 0 10px">
          Upload a JSON bill exported from a billing system (same shape as the sample below) to apply every line item's quantity against stock in one go.
        </p>
        <div style="display:flex; gap:10px; flex-wrap:wrap">
          <label class="btn-primary" style="cursor:pointer">
            Upload bill (.json)
            <input id="billFileInput" type="file" accept="application/json" style="display:none" />
          </label>
          <button id="downloadSampleBtn" class="btn-secondary">Download sample bill</button>
        </div>
        <div id="billStatus" class="footnote" style="margin-top:10px"></div>
      </div>
      <div class="card">
        <h3>Or enter quantities sold by hand</h3>
        <div class="list" id="saleList" style="padding:0; margin-top:6px"><div class="loading">Loading…</div></div>
        <button id="submitSaleBtn" class="btn-primary" style="width:100%; margin-top:14px">Record sale &amp; update stock</button>
        <div id="saleStatus" class="footnote" style="margin-top:10px"></div>
      </div>
      <div class="card">
        <h3>Recent activity</h3>
        <div id="txnList"><div class="loading">Loading…</div></div>
      </div>
      <div style="text-align:center; margin-top:4px">
        <button id="resetBtn" class="btn-text">Reset demo data to initial stock</button>
      </div>
    </div>`;

  const products = await getJSON("/api/retail/products");
  const saleListEl = document.getElementById("saleList");
  saleListEl.innerHTML = products
    .map(
      (p) => `
      <div class="qty-row">
        <div class="qty-row-label">
          <div class="row-name">${p.name}</div>
          <div class="row-cat">${p.currentStock} ${p.unit} on hand</div>
        </div>
        <input type="number" min="0" step="0.1" placeholder="0" class="qty-input" data-id="${p.id}" />
      </div>`
    )
    .join("");

  document.getElementById("submitSaleBtn").onclick = async () => {
    const statusEl = document.getElementById("saleStatus");
    const items = Array.from(saleListEl.querySelectorAll(".qty-input"))
      .map((input) => ({ id: input.dataset.id, quantitySold: parseFloat(input.value) }))
      .filter((it) => Number.isFinite(it.quantitySold) && it.quantitySold > 0);
    if (!items.length) {
      statusEl.textContent = "Enter at least one quantity sold.";
      return;
    }
    statusEl.textContent = "Recording…";
    try {
      const result = await postJSON("/api/retail/sales", { items });
      state.cache = {};
      statusEl.textContent = `✅ Recorded ${result.applied.length} item(s). Stock updated.`;
      renderRecordSale();
    } catch (err) {
      statusEl.textContent = `❌ ${err.message}`;
    }
  };

  document.getElementById("downloadSampleBtn").onclick = () => {
    window.open(apiBase() + "/api/retail/mock-bill", "_blank");
  };

  document.getElementById("billFileInput").addEventListener("change", async (e) => {
    const statusEl = document.getElementById("billStatus");
    const file = e.target.files[0];
    if (!file) return;
    statusEl.textContent = "Reading file…";
    try {
      const text = await file.text();
      const bill = JSON.parse(text);
      const result = await postJSON("/api/retail/upload-bill", bill);
      state.cache = {};
      const unmatchedNote = result.unmatched.length ? ` (${result.unmatched.length} line(s) didn't match a known product)` : "";
      statusEl.textContent = `✅ Applied ${result.applied.length} item(s) from the bill${unmatchedNote}.`;
      renderRecordSale();
    } catch (err) {
      statusEl.textContent = `❌ ${err.message || "Couldn't read that file."}`;
    }
  });

  document.getElementById("resetBtn").onclick = async () => {
    await postJSON("/api/retail/reset", {});
    state.cache = {};
    renderRecordSale();
  };

  const txns = await getJSON("/api/retail/transactions");
  const txnEl = document.getElementById("txnList");
  if (!txns.length) {
    txnEl.innerHTML = `<div class="empty-state" style="padding:16px 0">No sales recorded yet.</div>`;
  } else {
    txnEl.innerHTML = txns
      .slice(0, 8)
      .map(
        (t) => `
        <div class="kv-row">
          <span class="k">${t.source === "bill" ? "📄 Bill" : "✍️ Manual"} · ${t.date}</span>
          <span class="v">${t.items.map((i) => `${i.name} ×${i.quantitySold}`).join(", ")}</span>
        </div>`
      )
      .join("");
  }
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
        <input id="apiBaseInput" type="text" placeholder="http://192.168.1.20:3001" value="${current.replace(/"/g, "&quot;")}" style="width:100%; box-sizing:border-box; padding:10px; border-radius:8px; border:1px solid var(--border); font-size:15px; margin-top:8px" />
        <div style="display:flex; gap:10px; margin-top:14px">
          <button id="saveApiBase" class="btn-primary">Save</button>
          <button id="testApiBase" class="btn-secondary">Test connection</button>
        </div>
        <div id="apiBaseStatus" class="footnote" style="margin-top:10px"></div>
      </div>
      <div class="footnote">Product catalog and initial stock come from the store's own billing-system export (Testing File.xlsx) — see README for what's real vs. placeholder.</div>
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
      <div style="margin-top:16px"><button id="goSettingsBtn" class="btn-secondary">Open Settings</button></div>
    </div>`;
  document.getElementById("goSettingsBtn").addEventListener("click", () => openDetail("settings", null));
}

// --------------------------------------------------------------- MAIN -----

async function render() {
  renderNav();
  try {
    if (state.detail) {
      if (state.detail.kind === "settings") return renderSettings();
      if (state.detail.kind === "product") return await renderProductDetail(state.detail.id);
    }
    if (state.tab === "alerts") return await renderAlerts();
    if (state.tab === "products") return await renderProducts();
    if (state.tab === "record") return await renderRecordSale();
  } catch (err) {
    renderConnectionError(err);
  }
}

render();
