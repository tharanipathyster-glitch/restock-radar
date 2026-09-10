# Building the Restock Radar iOS app on a Mac

The iOS app is already scaffolded in `ios/` — it's a [Capacitor](https://capacitorjs.com/)
wrapper around the same web frontend in `www/`. It talks to the hosted backend at
`https://restock-radar-evch.onrender.com` by default, so it works on first launch
with no configuration.

This project uses **Swift Package Manager**, not CocoaPods — there is no `pod install`
step. Xcode resolves the packages on its own.

> Running Claude Code on the Mac? Just say: **"follow MAC-SETUP.md"** and it will run
> these steps with you and fix whatever breaks.

---

## 1. One-time prerequisites

| Tool | How to get it | Notes |
|------|---------------|-------|
| **Xcode** | Mac App Store → search "Xcode" → Install | ~10 GB, can take an hour. Open it once after install and accept the license. |
| **Xcode Command Line Tools** | `xcode-select --install` | Small. Skip if already present. |
| **Homebrew** | https://brew.sh (paste the one-line install command) | Package manager for the next items. |
| **Node.js (LTS)** | `brew install node` | Provides `npm` / `npx`. |
| **CocoaPods** | Not needed — this project uses SPM. | — |

Accept the Xcode license from the terminal too (needed for command-line builds):

```
sudo xcodebuild -license accept
```

## 2. Get the code

```
git clone https://github.com/tharanipathyster-glitch/restock-radar.git
cd restock-radar
npm install
```

## 3. Sync the web assets into the iOS project

```
npx cap sync ios
```

This copies `www/` into the iOS app and updates native dependencies. Re-run it any
time `www/` changes.

## 4. Open in Xcode

```
npx cap open ios
```

Xcode opens `ios/App/App.xcodeproj`. First launch will "Resolve Package Versions" —
wait for that to finish (progress bar top of window).

## 5. Set up signing (free Apple ID is fine for testing)

1. In Xcode's left sidebar, click the blue **App** project → **App** target → **Signing & Capabilities** tab.
2. **Team**: pick your Apple ID. If it's not listed: Xcode menu → **Settings → Accounts → +** → add your Apple ID.
3. Leave **Automatically manage signing** checked.
4. If you see a bundle-ID conflict error, change **Bundle Identifier** from
   `com.restockradar.app` to something unique like `com.yourname.restockradar`.

## 6. Run it

- **Simulator**: pick an iPhone from the device dropdown (top bar) → press **▶ (Run)**.
- **Your iPhone**: plug it in via USB → select it in the dropdown → **Run**. The first
  time, the iPhone will ask you to trust the developer: **Settings → General → VPN &
  Device Management → (your Apple ID) → Trust**.

The app should launch showing the Alerts screen with live data from the Render backend.

> Render's free tier sleeps after inactivity — the very first request after a while
> can take 30–60 seconds to wake the server. After that it's fast.

## 7. Optional — point at a local backend during development

Run the backend on the Mac:

```
cd server
npm install
npm start        # listens on http://localhost:3001
```

Then in the app: **Settings** (gear icon) → set **Backend server address** to
`http://localhost:3001` (Simulator) or `http://<your-mac-LAN-IP>:3001` (physical
iPhone on the same Wi-Fi) → **Save**.

---

## Sharing with friends to test

**Goal: your iPhone + friends' iPhones, so they can test too.**

### Option A — free Apple ID (you + friends physically present)

Works, but with real limits:
- The installed app **stops working after 7 days** — rebuild and reinstall to renew.
- Each device must be **plugged into this Mac** to install (Xcode → select their
  device → Run).
- ~10 devices per 7-day window.

Fine for yourself and a friend or two who can come by. Not practical for remote testing.

### Option B — TestFlight (recommended for friends) — needs paid account

Requires the **Apple Developer Program**, $99/year (enroll at
<https://developer.apple.com/programs/enroll/>). Then friends install with just a link —
no cable, no 7-day expiry (builds last 90 days), automatic updates.

Setup, once enrolled:

1. In Xcode → **Signing & Capabilities**, set **Team** to the paid account.
2. Device dropdown → **Any iOS Device (arm64)**.
3. **Product → Archive**. When the Organizer opens: **Distribute App → TestFlight (Internal Only)** → **Upload**.
4. Go to <https://appstoreconnect.apple.com> → **My Apps** → the app → **TestFlight** tab.
5. Add a build to **Internal Testing** (up to 100 people, instant) — or create an
   **External** group to get a shareable public link (one-time ~24h Apple review of
   the first build).
6. Friends: install **TestFlight** from the App Store → open your invite link → Install.

To push an update: bump the build number, `npx cap sync ios`, Archive, Upload again.

## Going further (later)

- **App icon / splash**: replace assets in `ios/App/App/Assets.xcassets`, or use
  `@capacitor/assets` to generate them from a single source image.
- **App Store public release**: paid account + app review, screenshots, privacy
  disclosures. In Xcode: **Product → Archive → Distribute App → App Store Connect**.
- **Native "open POS terminal" button**: currently uses `window.open`; on iOS this
  wants the `@capacitor/browser` plugin for a clean in-app browser.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `xcodebuild: error: SDK "iphoneos" cannot be located` | Xcode not fully installed, or CLT pointed at the wrong place: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` |
| Package resolution hangs | Xcode → **File → Packages → Reset Package Caches**, then reopen. |
| "Could not launch — app not trusted" on iPhone | Settings → General → VPN & Device Management → Trust the developer profile. |
| App loads but shows "Couldn't reach the server" | Wait ~60s (Render cold start), then pull to refresh. Check **Settings** address is `https://restock-radar-evch.onrender.com`. |
| `npx cap sync ios` fails on Windows | Expected — the iOS half of Capacitor only runs on macOS. Do this step on the Mac. |
