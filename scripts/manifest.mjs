import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
);

const ICONS = {
  16: "icons/icon16.png",
  48: "icons/icon48.png",
  128: "icons/icon128.png",
};

/** Fields shared by both browsers. Version comes from package.json — one place. */
const base = {
  manifest_version: 3,
  name: "Bookmarks 2 - Bookmarks Checker",
  version: pkg.version,
  description:
    "Checks your bookmarks one by one and shows the HTTP status code (200, 404, 500, etc.)",
  default_locale: "en",
  host_permissions: ["<all_urls>"],
  action: {
    default_popup: "popup.html",
    default_title: "Bookmarks 2 - Bookmarks Checker",
    default_icon: ICONS,
  },
  icons: ICONS,
};

/**
 * Chrome: MV3 service worker + side panel.
 * Firefox: MV3 background scripts, no side panel API, needs a gecko id.
 */
export function manifestFor(target) {
  if (target === "chrome") {
    return {
      ...base,
      permissions: ["bookmarks", "storage", "alarms", "tabs", "sidePanel"],
      background: { service_worker: "background.js" },
      side_panel: { default_path: "sidepanel.html" },
    };
  }

  // Firefox has no chrome.sidePanel, but it has had its own sidebar for years;
  // sidebar_action points at the same page the Chrome side panel uses.
  return {
    ...base,
    permissions: ["bookmarks", "storage", "alarms", "tabs"],
    background: { scripts: ["background.js"] },
    sidebar_action: {
      default_panel: "sidepanel.html",
      default_title: "Bookmarks 2 - Bookmarks Checker",
      default_icon: ICONS,
    },
    browser_specific_settings: {
      gecko: {
        id: "bookmark-status-checker@example.com",
        strict_min_version: "115.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
  };
}

export const TARGETS = ["chrome", "firefox"];
