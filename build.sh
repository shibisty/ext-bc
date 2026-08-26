#!/usr/bin/env bash
# Builds the extension for both Chrome and Firefox from the shared src/
# folder, stamping in the browser-specific manifest.json for each.
#
# Usage: ./build.sh
# Output: dist/chrome/  dist/firefox/  and matching .zip files in dist/

set -euo pipefail
cd "$(dirname "$0")"

rm -rf dist
mkdir -p dist/chrome dist/firefox

for browser in chrome firefox; do
  echo "==> Building $browser..."
  cp -r src/. "dist/$browser/"
  cp "$browser/manifest.json" "dist/$browser/manifest.json"

  # Firefox has no Side Panel API — drop the file that's only useful on Chrome
  if [ "$browser" = "firefox" ]; then
    rm -f "dist/$browser/sidepanel.html"
  fi

  (cd "dist/$browser" && zip -qr "../bookmark-status-checker-$browser.zip" . -x "*.DS_Store")
  echo "    -> dist/bookmark-status-checker-$browser.zip"
done

echo "Done."
