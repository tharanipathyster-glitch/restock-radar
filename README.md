# Restock Radar

A phone-friendly app for an independent grocery/retail store that tallies
current stock against sales as they happen and tells you **what needs
restocking now** — per product, against a threshold *you* set (not a fixed
global rule). Backed by a real SQLite database, not seed files, so
recorded sales, uploaded bills, and threshold edits all persist across
restarts.

## Run it

```bash
cd server
npm install
npm start         # serves the API + frontend on http://localhost:3001
```

Requires **Node 22.5+** (uses the built-in `node:sqlite` module — no native
DB dependency to compile). The database seeds itself automatically on
first run; see "Test data" below.

Open `http://localhost:3001` in a phone browser (or resize a desktop browser
to phone width) — it's a single responsive page, no separate mobile build.
"Add to Home Screen" will install it like an app via the included
`manifest.json`.

## How it works

Two separate flows change stock, matching how a real store actually
operates — selling inventory and receiving inventory are different events:

1. **Record Sale tab — a sale decreases stock.** Type in quantities sold by
   hand, or upload a bill file shaped like
   `server/seed-data/mock-billing-export.json` (a mocked example of a
   billing-system export — use "Download sample bill" to grab it and
   upload it right back to see the flow end-to-end).
2. **Reports tab — "Upload the latest inventory received" increases stock.**
   This is a restock, not a sale: it raises `stocked`/`currentStock` and
   resets the last-restock date. Two ways to do it:
   - **Read with AI** — paste a supplier bill's text and an LLM
     (OpenAI `gpt-4o-mini`) extracts the line items. Requires
     `OPENAI_API_KEY` set on the server (see below); without it the
     endpoint returns a clear "not configured" message rather than
     failing silently.
   - **Structured JSON upload** — no AI/API key needed, same idea as the
     sales-bill upload but for restocks.
   Either way, **new items on the bill become new tracked products
   automatically** — the catalog isn't fixed to the 12 seeded items.
3. Every product has its **own restock threshold** (default 50%, editable
   and saved from the product detail screen). Once
   `currentStock / stocked` drops below that product's threshold, it's
   flagged **"Restock Needed"** — otherwise **"Stock Available"**.
4. Each product also tracks **Last 5 Days** quantity sold and a **30-day
   weekday average** (Mon–Sun), both computed from the sales history table
   — visible on the product detail screen.
5. **Reports tab** also has a one-click **Excel export** of the entire
   database — a Products sheet (stock %, threshold, alert) and a Detail
   sheet (last-5-days + weekday averages per product) — see "Daily Excel
   report" below.

All of this is backed by SQLite (`server/data/restock.db`, created
automatically, gitignored as runtime state). `POST /api/retail/reset` wipes
it and reseeds the 12 starting products for demoing repeatedly.

### Enabling AI bill reading

```bash
# in server/, before npm start
export OPENAI_API_KEY=sk-...        # macOS/Linux
$env:OPENAI_API_KEY = "sk-..."      # Windows PowerShell
```

Without this set, "Read with AI" on the Reports tab returns a 501 with an
explanation — the structured JSON upload option next to it works with no
key at all, so the app is fully testable either way.

## Daily Excel report

`GET /api/retail/report.xlsx` (the "Download Excel report" button on the
Reports tab) builds a workbook fresh from the current database:

- **Products sheet** — Item, Unit, Stocked, Cost/Unit, Restock Time, Last
  Restock Date, Current Stock, % Stock at Store, Restock Threshold, Alert —
  one row per product, mirroring the spec's Output.xlsx layout.
- **Detail sheet** — each product's Last 5 Days dates + quantities sold,
  and its 30-day weekday-average sold, stacked per product.

A same-day snapshot is also cached under `server/reports/` (gitignored) the
first time it's requested each day, so there's a same-day archive to look
back at even if you don't download it right away.

## Test data

| Item | Unit | Initial stock | Total cost | Restock time |
|---|---|---|---|---|
| Tomatoes | lb | 100 | $117 | 1 week |
| Onions | lb | 120 | $239 | 2 weeks |
| Chillis | lb | 140 | $229 | 3 weeks |
| Toor Dhal | lb | 500 | $180 | 4 weeks |
| Sona Masuri Rice | lb | 1000 | $235 | 5 weeks |
| Ghee | tin | 50 | $296 | 6 weeks |
| Mustard Oil | bottle | 50 | $164 | 7 weeks |
| Parle G Biscuits | pack | 10 | $163 | 8 weeks |
| Amul Paneer | pack | 141 | $216 | 9 weeks |
| Bitter Gourd | lb | 253 | $222 | 10 weeks |
| Capsicum | lb | 271 | $194 | 11 weeks |
| Chilli Powder | lb | 219 | $191 | 12 weeks |

Every quantity in the app — stock on hand, quantities sold, restock amounts —
is counted in that product's own **stocking unit** (shown next to the number
everywhere), so "10" reads as "10 pack" for biscuits and "100 lb" for
tomatoes, never an ambiguous bare count. Per-unit cost is derived as
`totalCost / quantity`. Restock lead time is converted to days (`weeks × 7`)
for the tentative-restock-date math.

## API

- `GET /api/retail/products` — full catalog with computed stock status
- `GET /api/retail/products/:id` — product detail incl. Last 5 Days + 30-day weekday averages
- `PATCH /api/retail/products/:id/threshold` — body `{ thresholdPct }` (0–1) — saves that product's restock threshold
- `GET /api/retail/alerts` — products currently below their own threshold ("Restock Needed")
- `GET /api/retail/mock-bill` — sample sales-bill export (same file the app's "Download sample bill" button fetches)
- `GET /api/retail/transactions` — recent recorded sales (manual, uploaded bill, or seed history)
- `POST /api/retail/sales` — body `{ items: [{ id, quantitySold }] }` — manual sale entry (decreases stock)
- `POST /api/retail/upload-bill` — body shaped like `mock-billing-export.json` — bulk sale entry from a bill (decreases stock)
- `POST /api/retail/upload-inventory` — body `{ items: [{ item, quantity, unitCost?, unit? }] }` — structured restock, no AI needed (increases stock, can create new products; `unit` sets the stocking unit for a newly-created product, default `lb`)
- `POST /api/retail/upload-inventory-llm` — body `{ text }` or `{ imageBase64 }` — same as above but the line items are read from free-form bill text/image by an LLM (needs `OPENAI_API_KEY`)
- `GET /api/retail/report.xlsx` — downloads the Excel report described above
- `POST /api/retail/reset` — wipes and reseeds the database back to the 12 starting products
- `GET /healthz`

## What's real vs. placeholder

**Real:** the per-product threshold comparison and "Restock Needed"/"Stock
Available" alert, the Last 5 Days and 30-day weekday-average aggregations
(read straight from the sales table), the sale-recording and
inventory-upload endpoints (both structured and LLM-based), the Excel
report generation, and SQLite persistence — all genuine over whatever data
exists in the database at the time.

**Placeholder:**
- The 12-product catalog and its starting stock/cost/lead-time numbers
  (`server/seed.js`) come from a manually-authored test spreadsheet
  (`Testing File.xlsx`), standing in for a real billing-system product
  export. The 30 days of seeded sales history is synthetic/randomized so
  the day-wise and weekday-average analytics have something to show from
  first launch.
- `server/pos-connectors/{square,clover}.js` — each documents what a real
  POS integration needs (OAuth flow, endpoint, field-mapping) and returns
  `null`. Wiring one of these up for real — so sales get recorded
  automatically instead of via manual entry/upload — is the natural next
  step once a specific POS is chosen.
- The LLM bill reader (`server/llm-bill-parser.js`) is real code that
  makes a real OpenAI API call, but needs your own `OPENAI_API_KEY` to run
  — there's no key bundled with this repo. It also only reads text/images
  passed to it directly; there's no OCR/photo-capture pipeline wired into
  the app's UI yet, just a paste-text box.
- Push notifications for the restock alert: not implemented. The app is
  wrapped in Capacitor (`android/`, `ios/` folders) so it installs as a
  real native app, but native push needs the Capacitor Push Notifications
  plugin plus Firebase Cloud Messaging (Android) / APNs (iOS) registration
  — a real backend push service and device to test on. Today, the red
  badge count on the Alerts tab is the notification.

## Run it as a native Android / iOS app

This repo is wrapped with [Capacitor](https://capacitorjs.com/) so the same
`www/` frontend ships as an installable native app on both platforms,
instead of only a browser tab. The `android/` and `ios/` folders here are
generated native projects (already added via `npx cap add android|ios`).

Building the Android project from the command line needs **JDK 21**
specifically (Capacitor 8's Android Gradle setup targets Java 21 — newer
JDKs like the JBR bundled with recent Android Studio builds are too new for
this Gradle version, and JDK 17 is too old). Android Studio handles this
automatically if you open the project there instead.

```bash
npm install          # installs @capacitor/* at the repo root
npx cap sync         # copies www/ into both native projects + syncs plugins
npm run cap:android  # opens the project in Android Studio
npm run cap:ios      # opens the project in Xcode (macOS only)
```

From there, build/run onto a simulator, emulator, or a connected device the
normal Android Studio / Xcode way (Run ▶). iOS builds require a Mac with
Xcode installed — Capacitor's iOS project can be generated on any OS, but
compiling and signing it needs Xcode's toolchain.

**Important — pointing the app at a server:** a native app has no "same
origin" server to fall back on the way a browser tab does, so the app can't
assume `/api/...` means "this same host." Open the **⚙️ Settings** screen
inside the app and enter the address where `server/server.js` is running
(e.g. `http://192.168.1.20:3001` for a machine on the same Wi-Fi network as
the phone, or a real deployed URL once this is hosted somewhere). Tap
"Test connection" to confirm the phone can reach it, then "Save." The web
build (opened directly in a browser) needs no configuration and keeps using
relative `/api/...` calls automatically.

Whenever `www/` changes, re-run `npx cap sync` before rebuilding the native
apps so they pick up the latest frontend code.

### Test the Android build on your own phone right now (fastest path)

No Play Store, no APK signing needed for testing — this uses Android's
built-in developer mode over USB:

1. On the phone: Settings → About phone → tap "Build number" 7 times to
   unlock Developer Options, then Settings → Developer Options → enable
   "USB debugging."
2. Plug the phone into this computer with a USB cable. Tap "Allow" on the
   phone when the "Allow USB debugging?" prompt appears.
3. From `android/`, forward the backend port over the USB connection so the
   phone can reach it at `localhost:3001` regardless of Wi-Fi:
   ```bash
   adb reverse tcp:3001 tcp:3001
   ```
4. Build and install the debug APK:
   ```bash
   cd android
   ./gradlew assembleDebug
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```
5. Make sure `server/server.js` is running (`npm start` in `server/`), then
   open the "Restock Radar" app icon on the phone. It talks to
   `http://localhost:3001` by default when installed as a native app — no
   Settings screen changes needed for this USB-tethered setup.

Re-run steps 4 whenever you change the frontend or backend code and want to
test the update on the phone (step 3 only needs to be redone if the phone
disconnects/reconnects).

### Publishing to GitHub + hosting the backend publicly

Two separate things need to happen for someone outside your Wi-Fi to use
this: the **code** needs to be on GitHub, and the **backend** needs to run
somewhere reachable from the internet — GitHub itself only stores code and
doesn't run a Node server for you.

1. **Push the code to GitHub:** open the Source Control panel in VS Code
   (the branch icon in the left sidebar) and click **Publish to Branch** /
   **Publish to GitHub**. Choose public or private, and let it create the
   repo and push.
2. **Deploy the backend on Render.com** (free tier): sign in to
   [render.com](https://render.com) with GitHub, click **New → Blueprint**,
   pick this repo — Render will read the included `render.yaml` and deploy
   `server/` automatically. Once deployed you'll get a public URL like
   `https://restock-radar.onrender.com`. To enable AI bill reading there
   too, add an `OPENAI_API_KEY` environment variable under that service's
   **Environment** tab.
3. **Point the app at it:** open the **⚙️ Settings** screen in the app
   (web or the installed native app), paste that Render URL in, tap
   "Test connection," then "Save." Anyone using the app — on any network —
   now hits the same live backend.

Note: Render's free tier spins the service down after inactivity, so the
first request after a while can take ~30-60s to wake it back up — expected
on a free plan, not a bug. Also note the free tier's filesystem isn't
persistent across deploys, so `server/data/restock.db` resets on redeploy
— fine for demoing, but a real deployment would want a persistent disk or
an external database.

## Next steps toward a real product

1. Pick one POS to integrate for real first — Square is the most
   self-serve (published REST API, developer account, no partner
   agreement needed) — and replace `pos-connectors/square.js`'s two
   functions with real API calls so sales record automatically instead of
   via manual entry/upload.
2. Move off Render's free-tier ephemeral filesystem to a persistent disk
   or a managed Postgres/MySQL instance so the database survives redeploys.
3. Add photo-capture for bill uploads (camera → image → LLM) instead of a
   paste-text box, and OCR fallback for scanned/printed bills.
4. Decide on notification delivery: email/SMS alerts are achievable
   immediately with a service like SendGrid/Twilio and don't require an
   app-store deployment; native push is the "real app" path but is a
   materially bigger lift (see above).
5. Validate the default 50%-restock-threshold with a real store owner per
   product category — this repo has not done that validation yet.

---
*Restaurant support (recipe-based ingredient tracking) was explored in an
earlier iteration of this repo and removed to keep this build focused on
the retail/grocery bill-upload flow — see git history if that's needed
again as a separate product.*
