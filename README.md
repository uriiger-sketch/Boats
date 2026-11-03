# Broadside of the Deep

A top-down pixel-art naval battle game for iPhone and iPad. You captain a striped-sail warship,
line up broadsides against pirate sloops, navy brigs, fire ships, war frigates and the
Crimson Galleon boss, then spend your plunder on upgrades in the harbor between waves.

## What's in the repo

| Path | What it is |
|------|------------|
| `web/` | The game: plain HTML5 canvas + JavaScript, no dependencies, works offline. Open `web/index.html` in any browser to play. |
| `ios/BroadsideOfTheDeep.xcodeproj` | Native iOS app (Swift, UIKit + WKWebView) that bundles `web/` as a resource. |
| `.github/workflows/ios.yml` | CI: checks the JS syntax and builds the iOS app on macOS for simulator and device. |
| `.github/workflows/testflight.yml` | One-click archive, sign and upload to App Store Connect / TestFlight. |
| `Dockerfile`, `Caddyfile`, `railway.json` | Static hosting of the web build on Railway. |
| `Boats_main` | The original React prototype, kept for reference. |

## Gameplay

- **Steer**: drag anywhere on the left half of the screen (a joystick appears under your thumb). Let go and the ship keeps cruising.
- **Fire**: hold the FIRE button (or anywhere on the right half). Cannons fire from whichever side has an enemy in its arc. Aim assist leads the target, and a dotted arc plus a reticle show when a shot is lined up. The ring around FIRE shows reload for port (left half) and starboard (right half).
- **Powder kegs**: tap the blue keg button to drop a mine behind you.
- **Pickups**: gold coins from sunk ships, floating repair barrels, and RAPID FIRE / FIRE SHOT crates.
- **Waves**: each wave brings a new archipelago and a new time of day (day, golden hour, sunset, night, dawn). Every 5th wave is a boss fight against the Crimson Galleon, whose mortar volleys you dodge by watching for the red target rings.
- **Harbor**: between waves, upgrade Hull, Cannons, Powder, Gun Crew and Sails, or buy repairs.
- Keyboard: WASD/arrows to steer, Space to fire, Q/E for port/starboard, K for a keg, P to pause. Gamepads work too.

All art is generated in code (per-pixel ship sprites for 32 headings, dithered water, islands, foam),
and all sound and music are synthesised with Web Audio, so there are no third-party assets to license.

## Shipping to the App Store

Requirements: a Mac with Xcode 15 or later and a paid Apple Developer Program membership.

1. Open `ios/BroadsideOfTheDeep.xcodeproj` in Xcode.
2. Select the **BroadsideOfTheDeep** target, then **Signing & Capabilities**:
   - choose your **Team**,
   - change the **Bundle Identifier** (`com.uriiger.broadside`) to one you own.
3. Run it on a device or simulator to try it.
4. In [App Store Connect](https://appstoreconnect.apple.com), create a new app with the same bundle ID.
5. In Xcode, pick **Any iOS Device (arm64)**, then **Product > Archive**, then **Distribute App > App Store Connect > Upload**.
6. In App Store Connect, fill in the listing (screenshots, description, age rating, privacy) and submit for review.

### Automated upload from GitHub (optional, no Mac needed after setup)

1. In App Store Connect, go to **Users and Access > Integrations > App Store Connect API** and create a key with the **App Manager** role. Download the `.p8` file and note the **Key ID** and **Issuer ID**.
2. Create the app record in App Store Connect with your bundle ID.
3. In the GitHub repo, open **Settings > Secrets and variables > Actions** and add:
   `APPLE_TEAM_ID`, `APP_BUNDLE_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, and `ASC_KEY_P8` (paste the whole `.p8` file contents).
4. Go to **Actions > Upload to TestFlight > Run workflow**. The build number is the run number, so it increases automatically.
5. When processing finishes, the build appears in TestFlight. Select it for an App Store version and submit for review.

Already set up for review:

- App icon (1024 px, no alpha) and launch screen.
- Landscape-only, full screen, status bar and home indicator hidden.
- `PrivacyInfo.xcprivacy` privacy manifest: no tracking and no data collected. In App Store Connect,
  answer the privacy questionnaire with **Data Not Collected**.
- `ITSAppUsesNonExemptEncryption = NO`, so no export-compliance prompt.
- Audio uses the *ambient* session: it respects the silent switch and mixes with the player's music.
- Native haptics through a JavaScript-to-Swift bridge. The game pauses automatically when the app goes to the background.

To bump the version for an update, change **MARKETING_VERSION** (for example 1.1) and
**CURRENT_PROJECT_VERSION** (build number, which must increase on every upload) in the target's build settings.

## Developing

Edit the files in `web/js/`. Xcode picks up `web/` as a folder reference, so changes are bundled on the next build.
For quick iteration, open `web/index.html` in a desktop browser.
