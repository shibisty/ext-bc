# Bookmark Status Checker

[![Patreon](https://c5.patreon.com/external/logo/become_a_patron_button.png)](https://www.patreon.com/cw/shibisty)

A browser extension that checks your bookmarks one by one and displays the HTTP response status code (200, 404, 500, etc.) next to each bookmark.

## Repository Structure

```text
repo/
├── src/
│   ├── shared/            # code used by both the popup and the background worker
│   │   ├── api.ts         # cross-browser shim (browser.* / chrome.*) + side panel
│   │   ├── types.ts       # State, Item, TreeNode — the storage schema
│   │   ├── storage.ts     # DEFAULTS + readState() / writeState()
│   │   ├── messages.ts    # typed popup <-> background protocol
│   │   ├── queue.ts       # check order (pinned first, disabled and archived skipped)
│   │   ├── archive.ts     # splits one tree into the Bookmarks and Archive views
│   │   ├── challenge.ts   # Cloudflare / CAPTCHA detection from headers and URL
│   │   ├── highlight.ts   # marks search matches without innerHTML
│   │   ├── popup-height.ts# height bounds and clamping, independent of the DOM
│   │   ├── status.ts      # HTTP status -> badge class/text
│   │   ├── url.ts, time.ts, i18n.ts
│   ├── background/        # service worker: sync, checking, alarms, message router
│   │   ├── bookmarks.ts   # tree walk, reconcile, rename, delete, drag & drop moves
│   │   ├── checker.ts     # the fetch itself (credentials, timeouts, challenges)
│   │   ├── toolbar.ts     # mirrors pinned bookmarks onto the bookmarks toolbar
│   │   ├── router.ts      # typed handler table, one write lock, version stamp
│   │   └── alarms.ts, domain.ts, lock.ts
│   ├── popup/             # popup + side panel + tab view UI
│   │   ├── preferences.ts # the view-only settings (localStorage)
│   │   ├── tabs.ts        # Bookmarks / Archive
│   │   ├── search.ts      # remembered query, clear button, focus
│   │   ├── rename.ts      # rename dialog, written back to the browser
│   │   ├── resize.ts      # drag-to-resize with a remembered height
│   │   ├── scroll.ts      # remembered scroll position, reset on search
│   │   ├── side-panel.ts  # opens the panel and closes the popup behind it
│   │   ├── notice.ts      # transient footer messages
│   │   └── render/        # list, tree, row, skeleton, lazy loading
│   ├── ui/
│   │   ├── popup.html     # sidepanel.html is generated from this at build time
│   │   └── popup.css
│   ├── icons/
│   └── _locales/
├── scripts/
│   ├── build.mjs          # the whole build (replaces build.sh/build.bat/firefox.py)
│   └── manifest.mjs       # both manifests from one definition
├── tests/
│   ├── mocks/browser.ts   # in-memory chrome.* (storage, bookmarks, alarms, i18n)
│   ├── unit/              # pure logic: queue, status, url, archive, highlight, height
│   ├── integration/       # checking, the message router, the write lock, the toolbar
│   └── dom/               # rendering, search, preferences, scroll, menu, drag & drop
└── dist/                  # created by the build — unpacked folders + .zip files
```

All logic is written once in TypeScript under `src/` and bundled for both
browsers. The cross-browser shim lives in `src/shared/api.ts`:

```ts
export const api: typeof chrome = typeof browser !== "undefined" ? browser : chrome;
```

In Firefox, `browser.*` is the native promise-based API. In Chrome (MV3),
`chrome.*` also returns promises when called without a callback, so the rest of
the code uses a unified `api.*` interface.

### Manifest Differences

| | Chrome | Firefox |
|---|---|---|
| Background | `background.service_worker` | `background.scripts` |
| Side Panel | `side_panel` + the `sidePanel` permission | `sidebar_action` — Firefox's own sidebar, same page |
| Additional field | — | `browser_specific_settings.gecko.id` (required for Firefox) |

Both manifests are generated from `scripts/manifest.mjs`, and the version comes
from `package.json` — bump it in one place.

## The list

### Search

The query is remembered across closes by default, so reopening the popup lands
back where you were; the **Search box** setting switches that to a clean box
every time, and turning it off also drops whatever query was already stored. A × button clears it, the field is focused on open, and every match —
in titles, URLs and status codes alike — is highlighted in place. The highlight
is built as DOM nodes rather than through `innerHTML`, so a bookmark title can
contain anything at all.

### Archive

A bookmark or folder can be moved to the Archive tab from its context menu. This
is a view, not a move: the real browser bookmark stays exactly where it is, so
restoring is instant and nothing can be lost. Archived branches drop out of the
main list and out of the check queue, and the archive reproduces the same folder
hierarchy so an archived bookmark still appears under the folders it lives in.
Search works there the same way.

### Rename

A bookmark can be renamed from its context menu. The new title is written back
through `bookmarks.update`, so it is the browser's own bookmark that changes,
not a label kept beside it.

### Pinned bookmarks

Pinned bookmarks are checked first and shown at the top. With **Mirror pinned to
the bookmarks toolbar** turned on, pinning also *copies* the bookmark to the
front of the toolbar — it is a copy, never a move, and unpinning only removes
the copy this extension created. Anything you placed on the toolbar yourself is
left alone, and the toolbar never influences what is pinned; the relationship
runs one way only.

### Challenge markers

A 200 from Cloudflare, a CAPTCHA wall or a WAF says the guard answered, not that
the page is alive. `src/shared/challenge.ts` recognises those responses and the
row shows a four-letter marker **in place of** the code — `CLDF`, `CPHC`,
`DDOM`, `PRMX`, `IMPV`, `AKAM`, `AWAF`, `SCRI`, `DDGD`, `BLOK` — so a guarded
URL is never mistaken for a healthy one.

When checking is switched off entirely (interval = *Disabled*), the status
section disappears from every row rather than showing a stale code.

## Settings

Beyond the interval, theme and language, the settings view holds:

| Setting | Choices | Default |
|---|---|---|
| Open a bookmark by | double click / single click | double click |
| Open in | new tab / current tab | new tab |
| After opening | keep open / close the popup | keep open |
| Row content | everything / title only | everything |
| Row buttons | buttons + menu / context menu only | buttons + menu |
| Title | one line / two lines | one line |
| Search box | keeps the query / clears on each open | keeps the query |
| Mirror pinned to the bookmarks toolbar | off / on | off |
| Send cookies while checking | omit / include | omit |
| Popup height | a number, at least 200 | measured |

Opening in the current tab goes through `tabs.update`, so the navigation is a
normal one and the Back button returns to where you were. "Close the popup after
opening" applies to the popup only — the side panel and the tab view stay put.

Everything in that table except the last two lives in `localStorage`, shared by
the popup and the side panel because they are the same origin. **Send cookies**
is extension state instead: the background worker makes the request, and a
service worker has no `localStorage`. Turn it on to see the codes an
authenticated user would get; leave it off to check as an anonymous visitor.

## Window size

The popup can be resized by dragging the grip at its bottom edge, in either
direction, and the height is remembered. Double-clicking the grip goes back to
sizing by content. The same value can be typed into the settings field, which is
the fallback if dragging ever misbehaves — it reports the height the window
*actually* got rather than the one that was asked for.

Chrome refuses to render an action popup taller than 600px: measured on a bare
extension whose popup had no CSS height limit and 3000px of content, which still
reported `innerHeight` 600. Two ways around it:

- the **side panel**, through Chrome's `chrome.sidePanel` and Firefox's
  `sidebarAction` — the shim hides the difference, and `sidepanel.html`
  (generated from `popup.html`) ships in both builds. Opening it closes the
  popup behind it — as soon as the call has been issued, since Chrome does not
  settle `sidePanel.open()` until the panel has finished loading, and only when
  there is in fact a panel to open.
- **Open in a tab** (`popup.html?view=tab`), which has no ceiling at all.

All three views run the same code; the popup-only pieces (the resize grip, the
height field, closing after opening) switch themselves off in the other two.

## Right-to-left languages

With the interface in Arabic, Hebrew, Persian or Urdu the whole layout mirrors:
the stylesheet is written with logical properties, and bookmark titles use
`unicode-bidi: plaintext` so a Latin title inside an RTL interface (and the
reverse) still reads in its own direction.

## Version handshake

A browser can keep an older background worker registered across an in-place
update, in which case anything the new popup asks for that the old worker never
knew about goes unanswered and looks broken for no visible reason. The popup
therefore pings the worker on open, compares the reported version against its
own manifest, and says so in the footer when they disagree — reloading the
extension fixes it. The router also answers unknown messages with an explicit
error instead of silence, and the worker claims control as soon as it activates.

State from older versions is migrated on first sync: statuses, pins, mutes, the
interval and collapsed folders are preserved, `host`/`reason`/`challenge` are
backfilled from what is already there, localized status text left by older
builds is cleared, and the new `archived`/`toolbarPins` collections are created
empty.

## Build

```bash
npm install
npm run build
```

This produces `dist/chrome/`, `dist/firefox/` and two ready-to-upload archives:

- `dist/bookmark-status-checker-chrome.zip`
- `dist/bookmark-status-checker-firefox.zip`

The archives are written with POSIX path separators, so the same command works
on Windows and the result is accepted by AMO — no separate fix-up step.

Other scripts:

| Command | What it does |
|---|---|
| `npm run dev` | rebuild on change (unminified, inline sourcemaps) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | run the test suite once |
| `npm run test:watch` | re-run affected tests on change |
| `npm run coverage` | test suite with a coverage report |
| `npm run check` | typecheck + tests + build |

## Firefox for Android

**It cannot work there, and that is a fact about the browser.** Firefox for
Android exposes no `bookmarks` API to extensions at all: the permission is
dropped at install — the add-on's permission screen lists only "Access browser
tabs" — and `browser.bookmarks` is `undefined`. Everything this extension does
starts from reading the bookmark tree, so there is nothing to fall back to.

What the code does about it:

- the background never touches `api.bookmarks` without `?.`, so a missing
  namespace cannot take the whole script down at load;
- a walk that finds nothing records *why* in `lastSyncError`, and the popup
  prints it under the empty state. The missing-API case is stored as the code
  `NO_BOOKMARKS_API` and rendered as a translated sentence, so the user reads an
  explanation rather than an internal error;
- the Firefox manifest carries no `browser_specific_settings.gecko_android`
  key, which is what AMO uses to opt an add-on in to Android. Without it the
  add-on is not offered there, and nobody installs something that cannot work.

The layout work for Android is still in place and still correct — a `viewport`
meta tag, a `body.android-mode` class that fills the screen and sizes targets
for a finger, settings stacked one per line — so if Mozilla ever ships the
bookmarks API on Android, the UI side is ready.

### Trying it on a device

For whenever that matters again. Firefox for Android cannot load an unsigned
folder the way desktop does, so the quickest loop is `web-ext` over ADB against
**Firefox Nightly**, with *Settings → Remote debugging via USB* turned on and
`adb devices` listing the device as `device` rather than `unauthorized`:

```bash
npm run build
adb devices
npx web-ext run --target firefox-android --android-device emulator-5554 --firefox-apk org.mozilla.fenix --source-dir dist/firefox
```

Pass the id exactly as `adb devices` printed it, with no angle brackets around
it: on Windows `cmd` reads `<` as input redirection and answers "The system
cannot find the file specified" before web-ext is ever started. The APK id above
is Nightly's; release Firefox is `org.mozilla.firefox`, but it will not load an
unsigned build.

On Android the action has no toolbar button — it opens from the browser menu,
and `about:debugging` on a desktop, connected to the device, gives the console
for the background script.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: `npm ci`, then
the typecheck and the test suite on Node 20 and 22, then one build job that
produces both extensions, asserts each generated manifest carries the version
from `package.json` and contains the files it should, and uploads the two store
archives as a build artifact. A second push to the same branch cancels the run
still in flight.

`.github/workflows/release.yml` runs on a `v*` tag: the same gates, plus a check
that the tag matches `package.json`, and then a **draft** GitHub release with
both archives attached — so nothing is published until you look it over. To cut
one:

```bash
npm version patch      # bumps package.json and creates the tag
git push --follow-tags
```

To show the badge, add this near the top of this file, with your own repository
in the path:

```markdown
[![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/<repo>/actions/workflows/ci.yml)
```

## Tests

Vitest with jsdom. `tests/mocks/browser.ts` is an in-memory stand-in for the
parts of the extensions API the code uses — storage is a real object with
change notifications, so read-modify-write flows and the popup's
`storage.onChanged` path run end to end rather than against stubs. Its bookmark
tree is writable too, and `__setMoveSemantics()` flips between the two readings
of `bookmarks.move`'s index (Chrome resolves it *before* the node is lifted out
of its old place, which is why dragging downward used to land one row short) so
the same code is tested against both.

Anything that does not touch the DOM is written as a pure function in
`src/shared/`, which is where most of the coverage sits. The jsdom tests mount
the real `src/ui/popup.html`, so a markup change that removes an element the
popup needs fails the suite instead of the extension. `tests/unit/theme.test.ts`
parses `popup.css` directly and fails if a rule hardcodes a colour without a
`body.theme-light` counterpart, or if a class overrides the `[hidden]`
attribute — two classes of bug that render fine in jsdom and only show up on
screen.

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
- **Firefox Add-ons (AMO)**: upload `dist/bookmark-status-checker-firefox.zip`; before publishing, replace `gecko.id` in `scripts/manifest.mjs` with your own ID (for example, `your-name@yourdomain.com`), and verify `strict_min_version` against the current minimum version that supports MV3.

[![Patreon](https://c5.patreon.com/external/logo/become_a_patron_button.png)](https://www.patreon.com/cw/shibisty)

If this project helps you, consider supporting its development on Patreon ❤️
