// Restock Radar — frontend (retail/grocery)
//
// Plain JS, no framework/build step. Two things change stock:
//  - Record Sale: manual quantity entry or an uploaded sales bill
//    (decrements stock) — see /api/retail/sales, /api/retail/upload-bill
//  - Upload Inventory Received: a restock bill, either pasted as text and
//    read by an LLM, or a structured JSON fallback (increments stock,
//    can create new products) — see /api/retail/upload-inventory[-llm]
// Each product has its own editable, saved restock threshold — alert flips
// to "Restock Needed" once % stock at store drops below it.

const state = {
  tab: "alerts", // "alerts" | "products" | "record" | "reports"
  detail: null, // { kind: "product", id } | { kind: "settings" }
  cache: {},
};

const screenEl = document.getElementById("screen");
const navEl = document.getElementById("bottomNav");
const settingsBtnEl = document.getElementById("settingsBtn");

// Hosted backend — the installed iOS/Android app talks to this by default so it
// works on first launch. Override in Settings (e.g. http://localhost:3001 for
// local dev, or a LAN address like http://192.168.1.20:3001).
const DEFAULT_NATIVE_API_BASE = "https://restock-radar-evch.onrender.com";

function apiBase() {
  const saved = localStorage.getItem("restockApiBase");
  if (saved !== null) return saved.replace(/\/$/, "");
  return isNative ? DEFAULT_NATIVE_API_BASE : "";
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
    const e = new Error("Couldn't reach the server. Check the Settings screen for the correct server address.");
    e.isNetwork = true;
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`Server returned an error (${res.status}).`);
    e.isNetwork = true;
    throw e;
  }
  const data = await res.json();
  state.cache[fullUrl] = data;
  return data;
}

async function sendJSON(method, url, body) {
  const fullUrl = url.startsWith("/api") ? apiBase() + url : url;
  const res = await fetch(fullUrl, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server returned an error (${res.status}).`);
  return data;
}
const postJSON = (url, body) => sendJSON("POST", url, body);
const patchJSON = (url, body) => sendJSON("PATCH", url, body);

// ---------------------------------------------------------------- NAV -----

function renderNav() {
  const items = [
    { tab: "alerts", icon: "⚠️", label: "Alerts" },
    { tab: "products", icon: "🧺", label: "Products" },
    { tab: "record", icon: "🧾", label: "Record Sale" },
    { tab: "reports", icon: "📊", label: "Reports" },
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
      if (alerts.length > 0) {
        badge.hidden = false;
        badge.textContent = alerts.length;
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

// `num` — tolerate a missing / non-numeric field instead of throwing on
// .toFixed and blanking the whole screen.
function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// A quantity always carries its unit so a bare number is never ambiguous:
// "84.6 lb", "8 pack", "22 bottle".
function qty(value, unit) {
  const n = num(value);
  const rounded = Math.round(n * 10) / 10;
  return `${rounded} ${unit || "unit"}`;
}

function barRow({ id, name, sub, pctStock, currentStock, stocked, unit, alertLevel, alertLabel }) {
  const pct = num(pctStock);
  return `
    <div class="row-card" data-open="product:${id}">
      <div class="row-top">
        <div>
          <div class="row-name">${name}</div>
          <div class="row-cat">${sub}</div>
        </div>
        <span class="pill ${alertLevel}">${alertLabel}</span>
      </div>
      <div class="bar-track"><div class="bar-fill ${alertLevel}" style="width:${Math.min(100, Math.max(2, pct))}%"></div></div>
      <div class="row-meta">
        <span>${qty(currentStock, unit)} on hand of ${qty(stocked, unit)}</span>
        <span>${pct.toFixed(0)}%</span>
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

function last5DaysBlock(last5Days, unit) {
  if (!last5Days.hasAnySales) {
    return `<div class="empty-state" style="padding:14px 0">No Data yet</div>`;
  }
  return `<div class="daywise-grid">
    ${last5Days.days
      .map(
        (d) => `<div class="daywise-cell">
          <div class="daywise-date">${fmtDate(d.date).replace(/, \d{4}$/, "")}</div>
          <div class="daywise-qty">${num(d.quantitySold)}</div>
          <div class="daywise-unit">${unit || "unit"}</div>
        </div>`
      )
      .join("")}
  </div>`;
}

function weekdayBlock(weekdayAverages, unit) {
  return `<div class="daywise-grid">
    ${weekdayAverages
      .map(
        (w) => `<div class="daywise-cell">
          <div class="daywise-date">${w.day.slice(0, 3)}</div>
          <div class="daywise-qty">${num(w.avgSold)}</div>
          <div class="daywise-unit">${unit || "unit"}</div>
        </div>`
      )
      .join("")}
  </div>`;
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
    listEl.innerHTML = `<div class="empty-state"><div class="big">✅</div>Every product is above its own restock threshold right now.</div>`;
    return;
  }
  listEl.innerHTML = alerts
    .map(
      (a) => `
      <div class="alert-card critical" data-open="product:${a.id}">
        <div class="alert-top">
          <span class="alert-name">${a.name}</span>
          <span class="pill critical">Restock Needed</span>
        </div>
        <div class="alert-detail">
          <b>${num(a.pctStock).toFixed(0)}%</b> of stocked baseline remaining (${qty(a.currentStock, a.unit)} of ${qty(a.stocked, a.unit)}) — threshold is ${(num(a.thresholdPct) * 100).toFixed(0)}%
        </div>
      </div>`
    )
    .join("");
  attachRowOpeners(listEl);
}

async function renderProducts() {
  screenEl.innerHTML = `
    <div class="section-header"><h2>Products</h2><span class="sub" id="prodCount"></span></div>
    <p class="footnote" style="padding:0 16px 10px">Every quantity is in that product's own stocking unit — <b>lb</b> for loose goods, <b>pack</b>/<b>tin</b>/<b>bottle</b> for counted goods.</p>
    <div class="list" id="prodList"><div class="loading">Loading…</div></div>`;
  const products = await getJSON("/api/retail/products");
  document.getElementById("prodCount").textContent = `${products.length} tracked`;
  const listEl = document.getElementById("prodList");
  listEl.innerHTML = products
    .map((p) =>
      barRow({
        id: p.id,
        name: p.name,
        sub: `$${num(p.unitCost).toFixed(2)} per ${p.unit || "unit"} · restock takes ${num(p.restockLeadDays)}d · threshold ${(num(p.thresholdPct) * 100).toFixed(0)}%`,
        pctStock: p.pctStock,
        currentStock: p.currentStock,
        stocked: p.stocked,
        unit: p.unit,
        alertLevel: p.alertLevel,
        alertLabel: p.alertLabel,
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
        <span class="emoji">${p.alertLevel === "critical" ? "🚨" : "✅"}</span>
        <div>${p.alertLabel} — currently <b>${num(p.pctStock).toFixed(0)}%</b> of the ${qty(p.stocked, p.unit)} stocked baseline, threshold is ${(num(p.thresholdPct) * 100).toFixed(0)}%.</div>
      </div>
      <div class="card">
        <h3>Stock level</h3>
        <div class="big-bar-track">
          <div class="big-bar-fill ${p.alertLevel}" style="width:${Math.min(100, Math.max(6, num(p.pctStock)))}%">${num(p.pctStock).toFixed(0)}%</div>
        </div>
        <div class="stock-caption"><span>${qty(p.currentStock, p.unit)} on hand</span><span>stocked ${qty(p.stocked, p.unit)}</span></div>
      </div>
      <div class="card">
        <h3>Restock threshold</h3>
        <p class="footnote" style="margin-top:0; padding:0 0 8px">Alert flips to "Restock Needed" once % stock at store drops below this.</p>
        <div style="display:flex; align-items:center; gap:10px">
          <input id="thresholdInput" type="number" min="0" max="100" step="1" value="${Math.round(num(p.thresholdPct) * 100)}" style="width:80px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-size:15px" />
          <span>%</span>
          <button id="saveThresholdBtn" class="btn-primary">Save</button>
        </div>
        <div id="thresholdStatus" class="footnote" style="margin-top:8px"></div>
      </div>
      <div class="stat-grid">
        <div class="stat-box"><div class="label">Cost per ${p.unit || "unit"}</div><div class="value">$${num(p.unitCost).toFixed(2)}</div></div>
        <div class="stat-box"><div class="label">Restock lead time</div><div class="value">${num(p.restockLeadDays)}d</div></div>
      </div>
      <div class="card">
        <h3>Last 5 days — quantity sold (${p.unit || "unit"})</h3>
        ${last5DaysBlock(p.last5Days, p.unit)}
      </div>
      <div class="card">
        <h3>30-day weekday average sold (${p.unit || "unit"})</h3>
        ${weekdayBlock(p.weekdayAverages, p.unit)}
      </div>
      <div class="footnote">Last restocked ${fmtDate(p.lastRestockDate)}.</div>
    </div>`;
  document.getElementById("backBtn").addEventListener("click", closeDetail);

  document.getElementById("saveThresholdBtn").onclick = async () => {
    const statusEl = document.getElementById("thresholdStatus");
    const pct = parseFloat(document.getElementById("thresholdInput").value) / 100;
    if (!Number.isFinite(pct) || pct < 0 || pct > 1) {
      statusEl.textContent = "Enter a number between 0 and 100.";
      return;
    }
    statusEl.textContent = "Saving…";
    try {
      await patchJSON(`/api/retail/products/${id}/threshold`, { thresholdPct: pct });
      state.cache = {};
      statusEl.textContent = "✅ Saved.";
      renderProductDetail(id);
    } catch (err) {
      statusEl.textContent = `❌ ${err.message}`;
    }
  };
}

// --------------------------------------------------------- RECORD SALE ----

async function renderRecordSale() {
  screenEl.innerHTML = `
    <div class="section-header"><h2>Record Sale</h2><span class="sub">decreases stock</span></div>
    <div class="detail-body" style="padding-top:0">
      <div class="card">
        <h3>How sales get here</h3>
        <p class="footnote" style="margin-top:0; padding:0 0 10px">
          A real store's POS/billing system would post each bill automatically (see <code>server/pos-connectors/</code> for the Square/Clover stubs). Until one is wired up, sales come in three ways: the <b>mock billing terminal</b> below, a <b>bill file</b>, or <b>manual entry</b>. All three decrease stock the same way.
        </p>
        <button id="openPosBtn" class="btn-secondary">🧾 Open mock billing terminal</button>
      </div>
      <div class="card">
        <h3>Upload a sales bill</h3>
        <p class="footnote" style="margin-top:0; padding:0 0 10px">
          Upload a JSON bill (same shape as the sample below) to apply every line item's quantity against stock.
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
          <div class="row-cat">${qty(p.currentStock, p.unit)} on hand</div>
        </div>
        <input type="number" min="0" step="0.1" placeholder="0" class="qty-input" data-id="${p.id}" title="quantity sold in ${p.unit || "units"}" />
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

  document.getElementById("openPosBtn").onclick = () => {
    window.open(apiBase() + "/pos", "_blank");
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
          <span class="k">${t.source === "bill" ? "📄 Bill" : t.source === "manual" ? "✍️ Manual" : "🌱 Seed"} · ${t.date}</span>
          <span class="v">${t.productName} ×${t.quantitySold}</span>
        </div>`
      )
      .join("");
  }
}

// ------------------------------------------------------------- REPORTS ----

async function renderReports() {
  screenEl.innerHTML = `
    <div class="section-header"><h2>Reports</h2><span class="sub">Excel export</span></div>
    <div class="detail-body" style="padding-top:0">
      <div class="card">
        <h3>Download today's stock report</h3>
        <p class="footnote" style="margin-top:0; padding:0 0 10px">
          A spreadsheet with every product's stock %, threshold, and alert on one sheet, and Last 5 Days / 30-day weekday-average sales on a Detail sheet — built fresh from the current database.
        </p>
        <button id="downloadReportBtn" class="btn-primary">⬇️ Download Excel report</button>
        <div id="pastReports" style="margin-top:14px"></div>
      </div>
      <div class="card">
        <h3>Upload the latest inventory received</h3>
        <p class="footnote" style="margin-top:0; padding:0 0 10px">
          This is a <b>restock</b>, not a sale — it raises stock and resets the last-restock date. New items on the bill become new tracked products automatically, and each product's % stock / alert is recomputed against its threshold right away.
        </p>
        <h4 style="margin:0 0 6px; font-size:12.5px; color:var(--muted)">Read a scanned bill / photo with AI</h4>
        <label class="btn-primary" style="cursor:pointer; display:inline-flex">
          📷 Choose bill image
          <input id="llmImageInput" type="file" accept="image/*" style="display:none" />
        </label>
        <div id="llmImageStatus" class="footnote" style="margin-top:8px"></div>
        <h4 style="margin:12px 0 6px; font-size:12.5px; color:var(--muted)">…or paste the bill text</h4>
        <textarea id="llmBillText" rows="4" placeholder="Paste the text of a supplier bill/invoice here…" style="width:100%; box-sizing:border-box; padding:10px; border-radius:8px; border:1px solid var(--border); font-size:14px; font-family:inherit"></textarea>
        <button id="parseLlmBtn" class="btn-secondary" style="margin-top:8px">Read pasted text with AI</button>
        <div id="llmStatus" class="footnote" style="margin-top:8px"></div>
        <p class="footnote" style="padding:8px 0 0">Both need an <code>OPENAI_API_KEY</code> set on the server (Render → service → Environment). Without it, use the structured JSON option below.</p>
        <hr style="border:none; border-top:1px solid var(--border); margin:14px 0" />
        <h4 style="margin:0 0 6px; font-size:12.5px; color:var(--muted)">Or upload structured JSON (no AI needed)</h4>
        <div style="display:flex; gap:10px; flex-wrap:wrap">
          <label class="btn-secondary" style="cursor:pointer">
            Upload inventory (.json)
            <input id="inventoryFileInput" type="file" accept="application/json" style="display:none" />
          </label>
          <button id="downloadSampleInvBtn" class="btn-text">Download sample</button>
        </div>
        <div id="inventoryStatus" class="footnote" style="margin-top:8px"></div>
      </div>
      <div class="card">
        <h3>Mock billing terminal</h3>
        <p class="footnote" style="margin-top:0; padding:0 0 10px">
          A stand-in for a real store POS/billing system. Ring up items there and it posts the bill straight into Restock Radar (decreasing stock), the same way a live POS integration would.
        </p>
        <button id="openPosBtn" class="btn-secondary">🧾 Open billing terminal</button>
      </div>
    </div>`;

  const reportUrl = (qs) => apiBase() + "/api/retail/report.xlsx" + (qs ? `?${qs}` : "");

  document.getElementById("downloadReportBtn").onclick = () => window.open(reportUrl(), "_blank");
  document.getElementById("openPosBtn").onclick = () => window.open(apiBase() + "/pos", "_blank");
  document.getElementById("downloadSampleInvBtn").onclick = () =>
    window.open(apiBase() + "/api/retail/mock-inventory", "_blank");

  getJSON("/api/retail/reports")
    .then((reports) => {
      const el = document.getElementById("pastReports");
      if (!el) return;
      if (!reports.length) {
        el.innerHTML = `<div class="footnote" style="padding:0">No past snapshots yet — the first download each day is archived here.</div>`;
        return;
      }
      el.innerHTML =
        `<div class="footnote" style="padding:0 0 6px; font-weight:700; text-transform:uppercase; letter-spacing:.03em">Past reports</div>` +
        reports
          .map(
            (r) => `<div class="kv-row"><span class="k">${fmtDate(r.date)}</span>
              <a class="v" href="${reportUrl("date=" + r.date)}" target="_blank" style="color:var(--accent-dark); text-decoration:underline">Download</a></div>`
          )
          .join("");
    })
    .catch(() => {});

  document.getElementById("llmImageInput").addEventListener("change", async (e) => {
    const statusEl = document.getElementById("llmImageStatus");
    const file = e.target.files[0];
    if (!file) return;
    statusEl.textContent = "Reading image…";
    try {
      const imageBase64 = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(new Error("Couldn't read that image."));
        fr.readAsDataURL(file);
      });
      statusEl.textContent = "Reading bill with AI…";
      const result = await postJSON("/api/retail/upload-inventory-llm", { imageBase64 });
      state.cache = {};
      const created = result.applied.filter((a) => a.created).map((a) => a.name);
      statusEl.textContent =
        `✅ Applied ${result.applied.length} line(s) — stock raised and alerts recomputed.` +
        (created.length ? ` New product(s): ${created.join(", ")}.` : "");
    } catch (err) {
      statusEl.textContent = `❌ ${err.message}`;
    }
  });

  document.getElementById("parseLlmBtn").onclick = async () => {
    const statusEl = document.getElementById("llmStatus");
    const text = document.getElementById("llmBillText").value.trim();
    if (!text) {
      statusEl.textContent = "Paste some bill text first.";
      return;
    }
    statusEl.textContent = "Reading with AI…";
    try {
      const result = await postJSON("/api/retail/upload-inventory-llm", { text });
      state.cache = {};
      statusEl.textContent = `✅ Applied ${result.applied.length} item(s) from the bill.`;
    } catch (err) {
      statusEl.textContent = `❌ ${err.message}`;
    }
  };

  document.getElementById("inventoryFileInput").addEventListener("change", async (e) => {
    const statusEl = document.getElementById("inventoryStatus");
    const file = e.target.files[0];
    if (!file) return;
    statusEl.textContent = "Reading file…";
    try {
      const parsed = JSON.parse(await file.text());
      const result = await postJSON("/api/retail/upload-inventory", parsed);
      state.cache = {};
      statusEl.textContent = `✅ Applied ${result.applied.length} item(s) (${result.skipped.length} skipped).`;
    } catch (err) {
      statusEl.textContent = `❌ ${err.message || "Couldn't read that file."}`;
    }
  });
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
            ? `Running as an installed app — defaults to the hosted backend (${DEFAULT_NATIVE_API_BASE}). Change this only to point at a local or different backend.`
            : "Running in a browser — leave blank to use this same site's /api routes. Only needed if the backend is hosted elsewhere."
        }</p>
        <input id="apiBaseInput" type="text" placeholder="http://192.168.1.20:3001" value="${current.replace(/"/g, "&quot;")}" style="width:100%; box-sizing:border-box; padding:10px; border-radius:8px; border:1px solid var(--border); font-size:15px; margin-top:8px" />
        <div style="display:flex; gap:10px; margin-top:14px">
          <button id="saveApiBase" class="btn-primary">Save</button>
          <button id="testApiBase" class="btn-secondary">Test connection</button>
        </div>
        <div id="apiBaseStatus" class="footnote" style="margin-top:10px"></div>
      </div>
      <div class="footnote">"Read with AI" on the Reports tab needs an OPENAI_API_KEY set on the server — that's a server-side setting, not something entered here.</div>
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
  const isNetwork = Boolean(err && err.isNetwork);
  const message = err && err.message ? err.message : "Something went wrong loading this screen.";
  if (!isNetwork && err) console.error("Restock Radar render error:", err);
  screenEl.innerHTML = `
    <div class="section-header"><h2>${isNetwork ? "Can't load data" : "Something went wrong"}</h2></div>
    <div class="empty-state">
      <div class="big">${isNetwork ? "📡" : "⚠️"}</div>
      ${message}
      <div style="margin-top:16px; display:flex; gap:10px; justify-content:center">
        <button id="retryBtn" class="btn-primary">Retry</button>
        ${isNetwork ? `<button id="goSettingsBtn" class="btn-secondary">Open Settings</button>` : ""}
      </div>
    </div>`;
  document.getElementById("retryBtn").addEventListener("click", () => {
    state.cache = {};
    render();
  });
  const settingsBtn = document.getElementById("goSettingsBtn");
  if (settingsBtn) settingsBtn.addEventListener("click", () => openDetail("settings", null));
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
    if (state.tab === "reports") return await renderReports();
  } catch (err) {
    renderConnectionError(err);
  }
}

render();
