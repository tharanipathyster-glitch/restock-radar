# Restock Radar

A phone-friendly app for an independent grocery/retail store that tracks
stock against a known baseline and tells you **what needs restocking now**
— triggered once an item's stock drops below 50% of its initial level, with
a tentative restock date based on that item's own lead time. Stock changes
come from recording sales, either typed in by hand or uploaded as a bill
file shaped like a real billing system's export.

## Run it

```bash
cd server
npm install
npm run seed      # regenerates server/seed-data/retail-products.json from Testing File.xlsx
npm start         # serves the API + frontend on http://localhost:3001
```

Open `http://localhost:3001` in a phone browser (or resize a desktop browser
to phone width) — it's a single responsive page, no separate mobile build.
"Add to Home Screen" will install it like an app via the included
`manifest.json`.

## How it works

1. **Product catalog + initial stock** come from the store's own billing
   data — transcribed in `server/generate-seed-data.js` from
   `Testing File.xlsx` (Item / Quantity in Lbs / Cost / Restock Time). That
   initial quantity is the 100% baseline every alert is measured against.
2. **Record a sale** (the "Record Sale" tab) two ways:
   - Type in quantities sold per product by hand, or
   - Upload a bill file — `POST /api/retail/upload-bill` accepts JSON
     shaped like `server/seed-data/mock-billing-export.json` (a mocked
     example of what a real billing/POS system's export would look like).
     Use "Download sample bill" in the app to grab that exact file and
     upload it right back to see the flow end-to-end.
3. Either path decrements `currentStock` for the matching products and logs
   a transaction (visible under "Recent activity" on the Record Sale tab).
4. Once a product's `currentStock` falls below **50%** of its
   `initialStock`, it's flagged `critical` — "Restock now" — with a
   tentative restock date of today plus that product's own
   `restockLeadDays` (from the Testing File's "Restock Time" column).
   Below 70% it's flagged `watch` as an early warning.

State lives in memory in `server.js` and resets when the server restarts —
intentional for a prototype/test build. `POST /api/retail/reset` also
resets every product back to its initial stock level on demand (used by
the "Reset demo data" button in the app).

## Test data

`Testing File.xlsx` (in the repo root, one level above `restock-radar/`) is
the source of truth for the 12 seeded products:

| Item | Initial stock (lbs) | Total cost | Restock time |
|---|---|---|---|
| Tomatoes | 100 | $117 | 1 week |
| Onions | 120 | $239 | 2 weeks |
| Chillis | 140 | $229 | 3 weeks |
| Toor Dhal | 500 | $180 | 4 weeks |
| Sona Masuri Rice | 1000 | $235 | 5 weeks |
| Ghee | 50 | $296 | 6 weeks |
| Mustard Oil | 50 | $164 | 7 weeks |
| Parle G Biscuits | 10 | $163 | 8 weeks |
| Amul Paneer | 141 | $216 | 9 weeks |
| Bitter Gourd | 253 | $222 | 10 weeks |
| Capsicum | 271 | $194 | 11 weeks |
| Chilli Powder | 219 | $191 | 12 weeks |

Per-unit cost is derived as `totalCost / quantity`. Restock lead time is
converted to days (`weeks × 7`) for the tentative-restock-date math.

## API

- `GET /api/retail/products` — full catalog with computed stock status
- `GET /api/retail/products/:id` — single product detail
- `GET /api/retail/alerts` — products currently `critical` or `watch`, sorted critical-first
- `GET /api/retail/mock-bill` — sample billing-system export (same file the app's "Download sample bill" button fetches)
- `GET /api/retail/transactions` — recent recorded sales (manual entries + uploaded bills)
- `POST /api/retail/sales` — body `{ items: [{ id, quantitySold }] }` — manual sale entry
- `POST /api/retail/upload-bill` — body shaped like `mock-billing-export.json` — bulk sale entry from a bill
- `POST /api/retail/reset` — resets every product back to its initial stock level
- `GET /healthz`

## What's real vs. placeholder

**Real:** the 50%-of-baseline restock trigger, the tentative-restock-date
math (today + that product's own lead time), the sale-recording and
bill-upload endpoints, and the transaction log — all genuine calculations
over whatever stock numbers exist at the time.

**Placeholder:**
- The 12-product catalog and its initial stock/cost/lead-time numbers come
  from a manually-authored test spreadsheet (`Testing File.xlsx`), standing
  in for a real billing-system product export.
- `server/pos-connectors/{square,clover}.js` — each documents what a real
  POS integration needs (OAuth flow, endpoint, field-mapping) and returns
  `null`. Wiring one of these up for real — so sales get recorded
  automatically instead of via manual entry/upload — is the natural next
  step once a specific POS is chosen.
- Push notifications for the restock alert: not implemented. The app is
  wrapped in Capacitor (`android/`, `ios/` folders) so it installs as a
  real native app, but native push needs the Capacitor Push Notifications
  plugin plus Firebase Cloud Messaging (Android) / APNs (iOS) registration
  — a real backend push service and device to test on. Today, the red
  badge count on the Alerts tab is the notification.
- State resets on server restart (in-memory only) — a real deployment
  would persist to a database instead.

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
   `https://restock-radar.onrender.com`.
3. **Point the app at it:** open the **⚙️ Settings** screen in the app
   (web or the installed native app), paste that Render URL in, tap
   "Test connection," then "Save." Anyone using the app — on any network —
   now hits the same live backend.

Note: Render's free tier spins the service down after inactivity, so the
first request after a while can take ~30-60s to wake it back up — expected
on a free plan, not a bug.

## Next steps toward a real product

1. Pick one POS to integrate for real first — Square is the most
   self-serve (published REST API, developer account, no partner
   agreement needed) — and replace `pos-connectors/square.js`'s two
   functions with real API calls so sales record automatically instead of
   via manual entry/upload.
2. Persist state to a real database instead of in-memory, so stock levels
   survive a server restart.
3. Decide on notification delivery: email/SMS alerts are achievable
   immediately with a service like SendGrid/Twilio and don't require an
   app-store deployment; native push is the "real app" path but is a
   materially bigger lift (see above).
4. Validate the 50%-restock-threshold and lead-time assumptions with a real
   store owner — this repo has not done that validation yet.

---
*Restaurant support (recipe-based ingredient tracking) was explored in an
earlier iteration of this repo and removed to keep this build focused on
the retail/grocery bill-upload flow — see git history if that's needed
again as a separate product.*
