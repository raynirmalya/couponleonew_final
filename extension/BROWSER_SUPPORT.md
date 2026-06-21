# Browser Support

CouponLeo Companion now uses one shared WebExtension source folder and a small packaging step for browser-specific outputs.

## Browser targets

- Chrome: use `dist/chromium`
- Microsoft Edge: use `dist/chromium`
- Firefox: use `dist/firefox`
- Safari: use `dist/safari`

## Build the browser packages

Run the packaging script from PowerShell:

```powershell
.\build-packages.ps1
```

This creates:

- `dist/chromium` with the shared Chromium manifest
- `dist/firefox` with Firefox `gecko` settings preserved
- `dist/safari` with Firefox-only manifest settings removed for Safari packaging

## Load locally

Chrome and Edge:

1. Open `chrome://extensions` or `edge://extensions`
2. Turn on `Developer mode`
3. Choose `Load unpacked`
4. Select `dist/chromium`

Firefox:

1. Open `about:debugging#/runtime/this-firefox`
2. Choose `Load Temporary Add-on`
3. Select `dist/firefox/manifest.json`

Safari on macOS:

1. Open Safari
2. Go to `Safari > Settings > Developer`
3. Choose `Add Temporary Extension...`
4. Select `dist/safari`

## Package for Safari distribution

Safari distribution still requires Apple packaging. Use one of these paths:

- On macOS with Xcode:

```bash
xcrun safari-web-extension-packager /path/to/dist/safari --copy-resources
```

- Without a Mac: upload the zipped contents of `dist/safari` to the Safari Web Extension Packager in App Store Connect.

## Runtime notes

- Edge uses the Chromium build directly.
- Safari uses the same HTML, CSS, and JavaScript source, but it should be packaged from `dist/safari` so Firefox-only manifest settings are stripped.
- The popup now prefers the extension tab API when opening deals, which is more reliable across Chromium, Firefox, and Safari popup environments.
