# Restock Radar

A phone-friendly prototype that reads sales history (standing in for a real
POS export today) and tells an independent retailer or restaurant two
things: **what's selling most**, and **what's about to run out and when to
reorder it** — with an alert once something crosses 80% depleted. Built as a
variant of Hardware Check's architecture (Express backend + static
mobile-first frontend, real math over honestly-labeled seed data), split
into two independent product lines because retail and restaurants are
different data problems, not just different skins.

## Run it

```bash
cd server
npm install
npm run seed      # regenerates server/seed-data/*.json (already included)
npm start         # serves the API + frontend on http://localhost:3001
```

Open `http://localhost:3001` in a phone browser (or resize a desktop browser
to phone width) — it's a single responsive page, no separate mobile build.
"Add to Home Screen" will install it like an app via the included
`manifest.json`.

## Run it as a native Android / iOS app

This repo is also wrapped with [Capacitor](https://capacitorjs.com/) so the
same `www/` frontend ships as an installable native app on both platforms,
instead of only a browser tab. The `android/` and `ios/` folders here are
generated native projects (already added via `npx cap add android|ios`).

Building the Android project from the command line needs **JDK 21**
specifically (Capacitor 8's Android Gradle setup targets Java 21 —  newer
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
   repo and push. (Requires a one-time VS Code window reload after
   installing Git so the Source Control panel picks it up.)
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

## Who this is for

**Retail / grocery:** independent grocery stores, convenience stores, and
small multi-location chains — the segment squeezed between doing restocking
by gut feel (walking the aisles) and paying for a full retail-management
suite. Square's own Inventory features are gated to its paid Plus/Premium
tiers; a store on Square's free tier or on a simpler system has *no* built-in
"you're about to run out" signal today. That's the customer: someone with a
working POS but no restock-timing layer on top of it.

**Restaurants:** independent restaurants and small multi-unit groups that
run a mainstream POS (Toast, Square, Clover) but don't pay for a dedicated
back-office system like MarketMan (~$239/mo) or Restaurant365 (~$300+/mo).
Those tools are real and capable, but priced and scoped for operations big
enough to justify a category manager — this is the cheaper, narrower tool
for the operator who's currently tracking "are we low on buns" by walking
into the walk-in cooler.

These are deliberately kept as **two separate products** in this repo (own
data model, own screens, own API namespace) because a grocery SKU restocks
the same item it sells, while a restaurant sells a *dish* but restocks
*ingredients* — see below.

## What's real vs. placeholder — read this before treating any number as live

**Real, and doing actual work:**
- The analytics engine (`server/analytics.js`): sales-velocity averaging,
  days-until-depleted projection, tentative restock date, and the ≥80%-
  depleted alert flag are genuine calculations over whatever sales history
  they're given — verify this by changing a number in `seed-data/*.json`
  and reloading; the projections move accordingly.
- The recipe → ingredient-usage math for restaurants: ingredient daily usage
  is summed live from `dishUnitsSold × recipeQtyPerDish` across every dish
  that uses it (see `restaurant-recipes.json` and `generate-seed-data.js`'s
  `buildRestaurant()`), not hand-entered.
- The day-wise "this month" sales breakdown and the alert sort/priority
  ordering (critical before watch, soonest depletion first).

**Placeholder — simulated, not connected to anything live:**
- **All sales history and current stock come from `generate-seed-data.js`**,
  a seeded random-number script that invents 45 days of daily sales for 21
  grocery products and 10 restaurant dishes, then derives "current stock" as
  par level minus cumulative sales since a randomized last-restock date.
  This is a believable stand-in for a POS export, not real transactions.
- **`server/pos-connectors/{square,toast,clover}.js`** — each documents
  exactly what a real integration needs (OAuth flow, specific endpoint,
  the field-mapping step) and returns `null`. None of them call a real API.
  This is the same pattern as Hardware Check's `retailer-actors.js`: the
  wiring is there, the credentials and live calls are not.
- Push notifications for the 80%-depleted alert: **not implemented.** The
  app is now wrapped in Capacitor (`android/` and `ios/` folders) so it
  installs and runs as a real native app rather than only a browser tab,
  but native push still needs the Capacitor Push Notifications plugin plus
  registering with Firebase Cloud Messaging (Android) and APNs (iOS) —
  a real backend push service and a real device to test delivery on, not
  achievable inside this prototype. Today, "checking the Alerts tab" (and
  the red badge count on the nav bar) is the notification.
- The native apps have no backend of their own bundled in — they're a
  WebView shell pointed at wherever `server/server.js` happens to be
  running (configurable from the in-app ⚙️ Settings screen). That's a
  realistic shape for the real product too: the phone app talks to a
  backend that does the actual POS integration, it doesn't run Node on
  the device.

## The retail vs. restaurant data problem, explained

A grocery store's POS sells the exact thing that gets restocked — a can of
Coke sold is a can of Coke to reorder. One sales-history feed is enough.

A restaurant's POS only ever records **dish** sales ("2x Cheeseburger"). It
has no idea that a cheeseburger consumes one bun, one beef patty, and a
slice of cheese, because the POS was never told the recipe. So restocking a
restaurant kitchen needs one extra piece that retail doesn't:
**`restaurant-recipes.json`**, a one-time, manually-entered mapping of
dish → ingredients → quantity per order. Once that mapping exists, ingredient
usage can be derived automatically from dish sales forever — but a real
deployment would need each restaurant to enter their own recipes once during
onboarding. This app ships with 10 sample recipes already filled in so the
math can be demonstrated end-to-end; a real customer's kitchen would need
their own.

This is also why restaurant "stock on hand" is a **derived estimate**, not a
number read from a device: nobody scans a chicken breast in the walk-in the
way a UPC gets scanned at checkout. The same par-level-minus-usage-since-
restock model used for retail applies here, but it's one layer more
removed from ground truth — worth flagging to a restaurant customer rather
than presenting as exact.

## API

All endpoints are read-only, seeded from the JSON files in `server/seed-data/`.

**Retail:** `GET /api/retail/products` · `GET /api/retail/products/:id`
(day-wise sales this month + restock projection) · `GET /api/retail/alerts`

**Restaurant:** `GET /api/restaurant/dishes` · `GET /api/restaurant/dishes/:id`
(day-wise sales + recipe) · `GET /api/restaurant/ingredients` ·
`GET /api/restaurant/ingredients/:id` · `GET /api/restaurant/alerts`

**Both:** `GET /healthz`

## What "80% depleted" means here

`alertLevel` is `"critical"` once current stock falls to ≤20% of par level
(i.e., 80% depleted), `"watch"` once the projected depletion date is within
the item's restock lead time plus a 3-day buffer (so slow-lead-time items
get flagged earlier — a 6-day-lead item needs more warning than a 1-day one),
and `"ok"` otherwise. `restockOverdue` is true when there's no longer enough
runway left to place an order and have it arrive before stockout.

## Next steps toward a real product

1. Pick one POS to integrate for real first — Square is the most
   self-serve (published REST API, developer account, no partner
   agreement needed) — and replace `pos-connectors/square.js`'s two
   functions with real API calls.
2. Design the recipe-entry onboarding flow for restaurants — this is a
   real product-design problem, not just a data-entry form, since most
   restaurant owners won't know exact per-dish quantities by heart.
3. Decide on notification delivery: email/SMS alerts are achievable
   immediately with a service like SendGrid/Twilio and don't require an
   app-store deployment; native push is the "real app" path but is a
   materially bigger lift (see above).
4. Validate the $20-50/month price point directly with a handful of
   independent grocers and restaurant owners before building further —
   this repo has not done that validation yet.

---
*Built via conversation with Claude, September 2026, as a working prototype
following the strategic research in the neighboring Restaurant Services
repo. Every "real vs. placeholder" claim above was checked against the
actual code, not assumed.*
