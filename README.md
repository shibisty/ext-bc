# Bookmark Status Checker

[![Patreon](https://c5.patreon.com/external/logo/become_a_patron_button.png)](https://www.patreon.com/cw/shibisty)

A browser extension that checks your bookmarks one by one and displays the HTTP response status code (200, 404, 500, etc.) next to each bookmark.

## Repository Structure

```text
repo/

├── src/                 # all shared code — single source of truth for Chrome and Firefox
│   ├── popup.html
│   ├── popup.css
│   ├── popup.js
│   ├── background.js
│   ├── sidepanel.html   (used only by the Chrome build)
│   ├── icons/
│   └── _locales/
├── chrome/
│   └── manifest.json    # Chrome manifest (MV3, service_worker, sidePanel)
├── firefox/
│   └── manifest.json    # Firefox manifest (MV3, background.scripts, without sidePanel)
├── build.sh             # builds both packages
└── dist/                # created after the build — contains the ready-to-use .zip files
```

All logic (`popup.js`, `background.js`) is written once in `src/` and works unchanged in both browsers thanks to a small shim at the beginning of each file:

```js
const api = typeof browser !== "undefined" ? browser : chrome;
```

In Firefox, `browser.*` is the native promise-based API. In Chrome (MV3), `chrome.*` also returns promises when called without a callback, so the rest of the code uses a unified `api.*` interface.

### Manifest Differences

| | Chrome | Firefox |
|---|---|---|
| Background | `background.service_worker` | `background.scripts` |
| Side Panel | supported (`side_panel`, `sidePanel` permission) | not supported — Firefox does not support the Chrome Side Panel API |
| Additional field | — | `browser_specific_settings.gecko.id` (required for Firefox) |

The "Open in Side Panel" button is automatically hidden in Firefox (`popup.js` checks `api.sidePanel` at runtime). All other functionality (bookmark checking, search, drag & drop, theme, settings, etc.) is identical.

## Build

```bash
./build.sh
```

This builds `dist/chrome/`, `dist/firefox/`, and two ready-to-use archives:

`dist/bookmark-status-checker-chrome.zip`

`dist/bookmark-status-checker-firefox.zip`

## Development Installation

**Chrome / Edge / other Chromium-based browsers:**

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Select "Load unpacked" → choose `dist/chrome`

**Firefox:**

1. Open `about:debugging#/runtime/this-firefox`
2. Select "Load Temporary Add-on" → choose `dist/firefox/manifest.json`

   (The temporary installation remains active until Firefox is restarted. For a permanent installation, the extension must be signed through [addons.mozilla.org](https://addons.mozilla.org) or you can use Firefox Developer Edition / Nightly with signature verification disabled.)

## Publishing

- **Chrome Web Store**: upload `dist/bookmark-status-checker-chrome.zip` as is.

[![Patreon](https://c5.patreon.com/external/logo/become_a_patron_button.png)](https://www.patreon.com/cw/shibisty)

If this project helps you, consider supporting its development on Patreon ❤️

- **Firefox Add-ons (AMO)**: upload `dist/bookmark-status-checker-firefox.zip`; before publishing, replace `gecko.id` in `firefox/manifest.json` with your own ID (for example, `your-name@yourdomain.com`), and verify `strict_min_version` against the current minimum version that supports MV3.
