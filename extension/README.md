# CouponLeo Companion

This folder contains the shared CouponLeo WebExtension source for Chrome, Microsoft Edge, Firefox, and Safari.

It now lives beside the active revamp stack at `revamp/couponleo_ultimate/extension`.

## What it does

- Detects the active tab's merchant domain
- Looks up a matching store through the local CouponLeo API when it is running, then falls back to `https://couponleo.com/couponleo/api/stores/match`
- Shows live CouponLeo deals and coupon codes in the popup
- Updates the toolbar badge with the current site's offer count when a match exists
- Shows a floating notification card on matched merchant pages
- Routes extension API reads through the background worker so merchant-page CORS does not block lookups

## Browser packages

Run `.\build-packages.ps1` inside this folder to generate browser-specific outputs in `dist/`.

- `dist/chromium`: Chrome and Microsoft Edge
- `dist/firefox`: Firefox
- `dist/safari`: Safari

## Load it in Chrome

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Choose `Load unpacked`
4. Select `dist/chromium`

## Load it in Microsoft Edge

1. Open `edge://extensions`
2. Turn on `Developer mode`
3. Choose `Load unpacked`
4. Select `dist/chromium`

## Load it in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Choose `Load Temporary Add-on`
3. Select `dist/firefox/manifest.json`

## Load it in Safari

1. Open Safari on macOS
2. Go to `Safari > Settings > Developer`
3. Choose `Add Temporary Extension...`
4. Select `dist/safari`

For App Store or TestFlight distribution, package `dist/safari` with Apple's Safari Web Extension tooling. See `BROWSER_SUPPORT.md` for the Xcode and App Store Connect paths.

## Local dependency

When `couponleo_ultimate/start-local.ps1` is running, the extension will prefer:

- UI: `http://127.0.0.1:4300`
- API: `http://127.0.0.1:5000/couponleo/api`

It still falls back to the live site if the local stack is not reachable.

## Live dependency

The extension depends on the live CouponLeo API exposing:

- `GET /couponleo/api/stores/match`
- `GET /couponleo/api/stores`
