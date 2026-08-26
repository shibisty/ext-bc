// ---------- instant theme (no flash) ----------
(function applyThemeSync() {
  const theme = localStorage.getItem("bscTheme") || "dark";
  if (theme === "light") document.body.classList.add("theme-light");
})();

// Cross-browser shim — see background.js for details.
const api = typeof browser !== "undefined" ? browser : chrome;

const listEl = document.getElementById("list");
const emptyState = document.getElementById("emptyState");
const settingsView = document.getElementById("settingsView");
const settingsBtn = document.getElementById("settingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const refreshNowBtn = document.getElementById("refreshNowBtn");
const languageSelect = document.getElementById("languageSelect");
const themeSelect = document.getElementById("themeSelect");
// const syncBtn = document.getElementById("syncBtn");
// const checkNowBtn = document.getElementById("checkNowBtn");
const collapseAllBtn = document.getElementById("collapseAllBtn");
const sidePanelBtn = document.getElementById("sidePanelBtn");
const progressLabel = document.getElementById("progressLabel");
// const lastCheckLabel = document.getElementById("lastCheckLabel");
const intervalSelect = document.getElementById("intervalSelect");
const searchInput = document.getElementById("searchInput");
const searchbarWrap = document.getElementById("searchbarWrap");

const LAZY_BATCH_SIZE = 60;

let lastState = null;
let collapsedFolderIds = new Set();
let currentTabInfo = null; // { hostname, pathname }
let selectedIds = new Set();
let lastClickedId = null;
let visibleRowOrder = []; // ids in the order rows were rendered, for shift-select
let currentWindowId = null;
let draggingIds = null;
let languagePref = localStorage.getItem("bscLanguage") || "auto";
let messageDicts = { en: null, ru: null };

const isSidePanelContext = document.body.classList.contains("side-panel-mode");

// Keep the popup within the visible screen so it never gets clipped
// or forces a second, outer scrollbar (only .list scrolls internally).
(function clampPopupHeight() {
  if (isSidePanelContext) return; // the side panel manages its own size
  const available = (window.screen && window.screen.availHeight) || 800;
  const target = Math.max(320, Math.min(600, available - 90));
  document.documentElement.style.maxHeight = target + "px";
  document.documentElement.style.overflow = "hidden";
  document.body.style.maxHeight = target + "px";
  document.body.style.overflow = "hidden";
})();

function sendMessage(msg) {
  return api.runtime.sendMessage(msg);
}

// ---------- i18n (auto via api.i18n, or explicit override) ----------

function substitutePlaceholders(str, subs) {
  if (!subs) return str;
  const arr = Array.isArray(subs) ? subs : [subs];
  return str.replace(/\$(\d+)/g, (m, n) => {
    const idx = parseInt(n, 10) - 1;
    return arr[idx] !== undefined ? arr[idx] : m;
  });
}

function t(key, subs) {
  if (languagePref !== "auto" && messageDicts[languagePref] && messageDicts[languagePref][key]) {
    return substitutePlaceholders(messageDicts[languagePref][key].message, subs);
  }
  return api.i18n.getMessage(key, subs) || key;
}

async function loadMessageDicts() {
  try {
    const [
      arRes,
      amRes,
      bgRes,
      bnRes,
      caRes,
      csRes,
      daRes,
      deRes,
      elRes,
      enRes,
      en_GBRes,
      en_USRes,
      esRes,
      es_419Res,
      etRes,
      faRes,
      fiRes,
      filRes,
      frRes,
      guRes,
      heRes,
      hiRes,
      hrRes,
      huRes,
      idRes,
      itRes,
      jaRes,
      knRes,
      koRes,
      ltRes,
      lvRes,
      mlRes,
      mrRes,
      msRes,
      nlRes,
      noRes,
      plRes,
      pt_BRRes,
      pt_PTRes,
      roRes,
      ruRes,
      skRes,
      slRes,
      srRes,
      svRes,
      swRes,
      taRes,
      teRes,
      thRes,
      trRes,
      ukRes,
      viRes,
      zh_CNRes,
      zh_TWRes,
    ] = await Promise.all([
      fetch(api.runtime.getURL("_locales/ar/messages.json")),
      fetch(api.runtime.getURL("_locales/am/messages.json")),
      fetch(api.runtime.getURL("_locales/bg/messages.json")),
      fetch(api.runtime.getURL("_locales/bn/messages.json")),
      fetch(api.runtime.getURL("_locales/ca/messages.json")),
      fetch(api.runtime.getURL("_locales/cs/messages.json")),
      fetch(api.runtime.getURL("_locales/da/messages.json")),
      fetch(api.runtime.getURL("_locales/de/messages.json")),
      fetch(api.runtime.getURL("_locales/el/messages.json")),
      fetch(api.runtime.getURL("_locales/en/messages.json")),
      fetch(api.runtime.getURL("_locales/en_GB/messages.json")),
      fetch(api.runtime.getURL("_locales/en_US/messages.json")),
      fetch(api.runtime.getURL("_locales/es/messages.json")),
      fetch(api.runtime.getURL("_locales/es_419/messages.json")),
      fetch(api.runtime.getURL("_locales/et/messages.json")),
      fetch(api.runtime.getURL("_locales/fa/messages.json")),
      fetch(api.runtime.getURL("_locales/fi/messages.json")),
      fetch(api.runtime.getURL("_locales/fil/messages.json")),
      fetch(api.runtime.getURL("_locales/fr/messages.json")),
      fetch(api.runtime.getURL("_locales/gu/messages.json")),
      fetch(api.runtime.getURL("_locales/he/messages.json")),
      fetch(api.runtime.getURL("_locales/hi/messages.json")),
      fetch(api.runtime.getURL("_locales/hr/messages.json")),
      fetch(api.runtime.getURL("_locales/hu/messages.json")),
      fetch(api.runtime.getURL("_locales/id/messages.json")),
      fetch(api.runtime.getURL("_locales/it/messages.json")),
      fetch(api.runtime.getURL("_locales/ja/messages.json")),
      fetch(api.runtime.getURL("_locales/kn/messages.json")),
      fetch(api.runtime.getURL("_locales/ko/messages.json")),
      fetch(api.runtime.getURL("_locales/lt/messages.json")),
      fetch(api.runtime.getURL("_locales/lv/messages.json")),
      fetch(api.runtime.getURL("_locales/ml/messages.json")),
      fetch(api.runtime.getURL("_locales/mr/messages.json")),
      fetch(api.runtime.getURL("_locales/ms/messages.json")),
      fetch(api.runtime.getURL("_locales/nl/messages.json")),
      fetch(api.runtime.getURL("_locales/no/messages.json")),
      fetch(api.runtime.getURL("_locales/pl/messages.json")),
      fetch(api.runtime.getURL("_locales/pt_BR/messages.json")),
      fetch(api.runtime.getURL("_locales/pt_PT/messages.json")),
      fetch(api.runtime.getURL("_locales/ro/messages.json")),
      fetch(api.runtime.getURL("_locales/ru/messages.json")),
      fetch(api.runtime.getURL("_locales/sk/messages.json")),
      fetch(api.runtime.getURL("_locales/sl/messages.json")),
      fetch(api.runtime.getURL("_locales/sr/messages.json")),
      fetch(api.runtime.getURL("_locales/sv/messages.json")),
      fetch(api.runtime.getURL("_locales/sw/messages.json")),
      fetch(api.runtime.getURL("_locales/ta/messages.json")),
      fetch(api.runtime.getURL("_locales/te/messages.json")),
      fetch(api.runtime.getURL("_locales/th/messages.json")),
      fetch(api.runtime.getURL("_locales/tr/messages.json")),
      fetch(api.runtime.getURL("_locales/uk/messages.json")),
      fetch(api.runtime.getURL("_locales/vi/messages.json")),
      fetch(api.runtime.getURL("_locales/zh_CN/messages.json")),
      fetch(api.runtime.getURL("_locales/zh_TW/messages.json")),
    ]);
      messageDicts.ar = await arRes.json(),
      messageDicts.am = await amRes.json(),
      messageDicts.bg = await bgRes.json(),
      messageDicts.bn = await bnRes.json(),
      messageDicts.ca = await caRes.json(),
      messageDicts.cs = await csRes.json(),
      messageDicts.da = await daRes.json(),
      messageDicts.de = await deRes.json(),
      messageDicts.el = await elRes.json(),
      messageDicts.en = await enRes.json(),
      messageDicts.en_GB = await en_GBRes.json(),
      messageDicts.en_US = await en_USRes.json(),
      messageDicts.es = await esRes.json(),
      messageDicts.es_419 = await es_419Res.json(),
      messageDicts.et = await etRes.json(),
      messageDicts.fa = await faRes.json(),
      messageDicts.fi = await fiRes.json(),
      messageDicts.fil = await filRes.json(),
      messageDicts.fr = await frRes.json(),
      messageDicts.gu = await guRes.json(),
      messageDicts.he = await heRes.json(),
      messageDicts.hi = await hiRes.json(),
      messageDicts.hr = await hrRes.json(),
      messageDicts.hu = await huRes.json(),
      messageDicts.id = await idRes.json(),
      messageDicts.it = await itRes.json(),
      messageDicts.ja = await jaRes.json(),
      messageDicts.kn = await knRes.json(),
      messageDicts.ko = await koRes.json(),
      messageDicts.lt = await ltRes.json(),
      messageDicts.lv = await lvRes.json(),
      messageDicts.ml = await mlRes.json(),
      messageDicts.mr = await mrRes.json(),
      messageDicts.ms = await msRes.json(),
      messageDicts.nl = await nlRes.json(),
      messageDicts.no = await noRes.json(),
      messageDicts.pl = await plRes.json(),
      messageDicts.pt_BR = await pt_BRRes.json(),
      messageDicts.pt_PT = await pt_PTRes.json(),
      messageDicts.ro = await roRes.json(),
      messageDicts.ru = await ruRes.json(),
      messageDicts.sk = await skRes.json(),
      messageDicts.sl = await slRes.json(),
      messageDicts.sr = await srRes.json(),
      messageDicts.sv = await svRes.json(),
      messageDicts.sw = await swRes.json(),
      messageDicts.ta = await taRes.json(),
      messageDicts.te = await teRes.json(),
      messageDicts.th = await thRes.json(),
      messageDicts.tr = await trRes.json(),
      messageDicts.uk = await ukRes.json(),
      messageDicts.vi = await viRes.json(),
      messageDicts.zh_CN = await zh_CNRes.json(),
      messageDicts.zh_TW = await zh_TWRes.json()
  } catch (e) {
    messageDicts.ar = null;
    messageDicts.am = null;
    messageDicts.bg = null;
    messageDicts.bn = null;
    messageDicts.ca = null;
    messageDicts.cs = null;
    messageDicts.da = null;
    messageDicts.de = null;
    messageDicts.el = null;
    messageDicts.en = null;
    messageDicts.en_GB = null;
    messageDicts.en_US = null;
    messageDicts.es = null;
    messageDicts.es_419 = null;
    messageDicts.et = null;
    messageDicts.fa = null;
    messageDicts.fi = null;
    messageDicts.fil = null;
    messageDicts.fr = null;
    messageDicts.gu = null;
    messageDicts.he = null;
    messageDicts.hi = null;
    messageDicts.hr = null;
    messageDicts.hu = null;
    messageDicts.id = null;
    messageDicts.it = null;
    messageDicts.ja = null;
    messageDicts.kn = null;
    messageDicts.ko = null;
    messageDicts.lt = null;
    messageDicts.lv = null;
    messageDicts.ml = null;
    messageDicts.mr = null;
    messageDicts.ms = null;
    messageDicts.nl = null;
    messageDicts.no = null;
    messageDicts.pl = null;
    messageDicts.pt_BR = null;
    messageDicts.pt_PT = null;
    messageDicts.ro = null;
    messageDicts.ru = null;
    messageDicts.sk = null;
    messageDicts.sl = null;
    messageDicts.sr = null;
    messageDicts.sv = null;
    messageDicts.sw = null;
    messageDicts.ta = null;
    messageDicts.te = null;
    messageDicts.th = null;
    messageDicts.tr = null;
    messageDicts.uk = null;
    messageDicts.vi = null;
    messageDicts.zh_CN = null;
    messageDicts.zh_TW = null;
  }
}

function localizeStaticMarkup() {
  document.documentElement.lang =
    languagePref !== "auto" ? languagePref : api.i18n.getUILanguage().split("-")[0];
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

// ---------- state ----------

async function readStateDirect() {
  const data = await api.storage.local.get([
    "tree",
    "order",
    "items",
    "pinned",
    "disabledChecks",
    "currentIndex",
    "intervalMinutes",
    "lastCheck",
    "checking",
  ]);
  return {
    tree: data.tree || [],
    order: data.order || [],
    items: data.items || {},
    pinned: data.pinned || [],
    disabledChecks: data.disabledChecks || [],
    currentIndex: data.currentIndex || 0,
    intervalMinutes:
      data.intervalMinutes === undefined || data.intervalMinutes === null ? 60 : data.intervalMinutes,
    lastCheck: data.lastCheck || null,
    checking: data.checking || false,
  };
}

// ---------- folder collapse state (persisted locally) ----------

async function loadCollapsedFolders() {
  const data = await api.storage.local.get(["uiCollapsedFolders"]);
  collapsedFolderIds = new Set(data.uiCollapsedFolders || []);
}

function saveCollapsedFolders() {
  api.storage.local.set({ uiCollapsedFolders: Array.from(collapsedFolderIds) });
}

function collectFolderIds(nodes, out) {
  out = out || [];
  for (const node of nodes) {
    if (node.type === "folder") {
      out.push(node.id);
      collectFolderIds(node.children || [], out);
    }
  }
  return out;
}

// ---------- window id / current tab (for side panel + "open now") ----------

async function loadWindowId() {
  try {
    const win = await api.windows.getCurrent();
    currentWindowId = win.id;
  } catch (e) {
    currentWindowId = null;
  }
}

async function loadCurrentTabInfo() {
  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (tab && tab.url) {
      const u = new URL(tab.url);
      currentTabInfo = { hostname: u.hostname, pathname: u.pathname };
    } else {
      currentTabInfo = null;
    }
  } catch (e) {
    currentTabInfo = null;
  }
}

function isCurrentPageBookmark(bookmarkUrl) {
  if (!currentTabInfo || !bookmarkUrl) return false;
  try {
    const b = new URL(bookmarkUrl);
    if (b.hostname !== currentTabInfo.hostname) return false;
    const bp = b.pathname === "/" ? "" : b.pathname;
    const tp = currentTabInfo.pathname === "/" ? "" : currentTabInfo.pathname;
    if (bp === "" && tp === "") return true;
    return tp.includes(bp) || bp.includes(tp);
  } catch (e) {
    return false;
  }
}

// ---------- helpers ----------

function badgeClass(status) {
  if (status === null || status === undefined) return "pending";
  if (status === "ERR" || status === "TIMEOUT") return "neterr";
  if (typeof status === "number") {
    if (status >= 200 && status < 300) return "ok";
    if (status >= 300 && status < 400) return "redirect";
    if (status >= 400 && status < 500) return "clienterr";
    if (status >= 500) return "servererr";
  }
  return "pending";
}

function badgeText(status) {
  if (status === null || status === undefined) return "—";
  if (status === "ERR") return "ERR";
  if (status === "TIMEOUT") return "TIME";
  return String(status);
}

function faviconUrl(url) {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch (e) {
    return "";
  }
}

function timeAgo(ts) {
  if (!ts) return t("timeNever") || "—";
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return t("timeJustNow");
  if (min < 60) return t("timeMinAgo", [String(min)]);
  const h = Math.floor(min / 60);
  if (h < 24) return t("timeHoursAgo", [String(h)]);
  const d = Math.floor(h / 24);
  return t("timeDaysAgo", [String(d)]);
}

function openInNewTab(url, opts) {
  const active = opts && typeof opts.active === "boolean" ? opts.active : true;
  // Only carry the side panel along automatically when the click happened
  // *inside* the side panel itself — not when opening from the regular popup.
  if (isSidePanelContext && currentWindowId != null && api.sidePanel) {
    try {
      api.sidePanel.open({ windowId: currentWindowId });
    } catch (e) {
      /* ignore */
    }
  }
  api.tabs.create({ url, active });
}

// ---------- selection ----------

function updateRowSelectionClass(row, id) {
  row.classList.toggle("selected", selectedIds.has(id));
}

function updateFooterText() {
  if (!lastState) return;
  if (selectedIds.size > 0) {
    progressLabel.textContent = t("selectionHint", [String(selectedIds.size)]);
    return;
  }
  const { pinned, order, currentIndex, disabledChecks, intervalMinutes } = lastState;
  if (!order || order.length === 0) {
    progressLabel.textContent = "—";
    return;
  }
  if (!intervalMinutes || intervalMinutes <= 0) {
    progressLabel.textContent = t("autoCheckOffHint");
    return;
  }
  const pinnedSet = new Set(pinned);
  const disabledSet = new Set(disabledChecks || []);
  const queue = [
    ...pinned.filter((id) => !disabledSet.has(id)),
    ...order.filter((id) => !pinnedSet.has(id) && !disabledSet.has(id)),
  ];
  if (queue.length === 0) {
    progressLabel.textContent = t("allChecksDisabled");
    return;
  }
  progressLabel.textContent = t("progressLabel", [
    String((currentIndex % queue.length) + 1),
    String(queue.length),
  ]);
}

function handleRowClick(e, id) {
  if (e.ctrlKey || e.metaKey) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    lastClickedId = id;
  } else if (e.shiftKey && lastClickedId) {
    const fromIdx = visibleRowOrder.indexOf(lastClickedId);
    const toIdx = visibleRowOrder.indexOf(id);
    if (fromIdx !== -1 && toIdx !== -1) {
      const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      selectedIds = new Set(visibleRowOrder.slice(start, end + 1));
    } else {
      selectedIds = new Set([id]);
    }
  } else {
    selectedIds = new Set([id]);
    lastClickedId = id;
  }
  document.querySelectorAll(".row[data-id]").forEach((rowEl) => {
    updateRowSelectionClass(rowEl, rowEl.dataset.id);
  });
  updateFooterText();
}

async function bulkDelete(ids) {
  if (ids.length === 0) return;
  const msg =
    ids.length === 1
      ? t("deleteConfirm", [(lastState.items[ids[0]] && lastState.items[ids[0]].title) || ""])
      : t("deleteManyConfirm", [String(ids.length)]);
  if (!confirm(msg)) return;
  const res =
    ids.length === 1
      ? await sendMessage({ type: "DELETE", id: ids[0] })
      : await sendMessage({ type: "DELETE_MANY", ids });
  if (res && res.ok) {
    selectedIds.clear();
    render(res.state);
  }
}

document.addEventListener("keydown", (e) => {
  if (document.activeElement === searchInput) return;
  if (!settingsView.hidden) return;
  if (e.key === "Enter") {
    if (selectedIds.size === 0) return;
    e.preventDefault();
    const state = lastState;
    if (!state) return;
    for (const id of selectedIds) {
      const item = state.items[id];
      if (item && item.url) openInNewTab(item.url, { active: false });
    }
  } else if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedIds.size === 0) return;
    e.preventDefault();
    bulkDelete(Array.from(selectedIds));
  }
});

// ---------- lazy rendering ----------

function appendItemsLazily(container, ids, rowFactory) {
  if (ids.length <= LAZY_BATCH_SIZE) {
    const frag = document.createDocumentFragment();
    for (const id of ids) frag.appendChild(rowFactory(id));
    container.appendChild(frag);
    return;
  }

  let index = 0;
  function renderBatch() {
    const frag = document.createDocumentFragment();
    const end = Math.min(index + LAZY_BATCH_SIZE, ids.length);
    for (; index < end; index++) {
      frag.appendChild(rowFactory(ids[index]));
    }
    container.appendChild(frag);

    if (index < ids.length) {
      const sentinel = document.createElement("div");
      sentinel.className = "lazy-sentinel";
      container.appendChild(sentinel);
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            obs.disconnect();
            sentinel.remove();
            renderBatch();
          }
        },
        { root: listEl, rootMargin: "300px" }
      );
      obs.observe(sentinel);
    }
  }
  renderBatch();
}

// ---------- drag & drop ----------

function attachDragHandlers(row, id) {
  row.draggable = true;
  row.addEventListener("dragstart", (e) => {
    const ids =
      selectedIds.has(id) && selectedIds.size > 1
        ? visibleRowOrder.filter((rid) => selectedIds.has(rid))
        : [id];
    draggingIds = ids;
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", id);
    } catch (err) {
      /* ignore */
    }
  });
  row.addEventListener("dragend", () => {
    draggingIds = null;
    document.querySelectorAll(".drag-over-before,.drag-over-after").forEach((el) => {
      el.classList.remove("drag-over-before", "drag-over-after");
    });
  });
  row.addEventListener("dragover", (e) => {
    if (!draggingIds || draggingIds.includes(id)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = row.getBoundingClientRect();
    const before = e.clientY - rect.top < rect.height / 2;
    row.classList.toggle("drag-over-before", before);
    row.classList.toggle("drag-over-after", !before);
  });
  row.addEventListener("dragleave", () => {
    row.classList.remove("drag-over-before", "drag-over-after");
  });
  row.addEventListener("drop", async (e) => {
    e.preventDefault();
    row.classList.remove("drag-over-before", "drag-over-after");
    if (!draggingIds || draggingIds.includes(id)) return;
    const rect = row.getBoundingClientRect();
    const before = e.clientY - rect.top < rect.height / 2;
    const ids = draggingIds;
    draggingIds = null;
    const res = await sendMessage({
      type: "MOVE_BOOKMARKS",
      ids,
      targetId: id,
      position: before ? "before" : "after",
    });
    if (res && res.ok) render(res.state);
  });
}

function attachFolderDropHandlers(summary, folderId) {
  summary.addEventListener("dragover", (e) => {
    if (!draggingIds) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    summary.classList.add("drag-over");
  });
  summary.addEventListener("dragleave", () => summary.classList.remove("drag-over"));
  summary.addEventListener("drop", async (e) => {
    e.preventDefault();
    summary.classList.remove("drag-over");
    if (!draggingIds) return;
    const ids = draggingIds;
    draggingIds = null;
    const res = await sendMessage({ type: "MOVE_BOOKMARKS", ids, targetId: folderId, position: "inside" });
    if (res && res.ok) render(res.state);
  });
}

// ---------- row rendering ----------

function makeRow(id, item, opts) {
  opts = opts || {};
  const row = document.createElement("div");
  row.dataset.id = id;
  row.className =
    "row" +
    (opts.active ? " active" : "") +
    (opts.pinnedRow ? " pinned-row" : "") +
    (opts.isCurrentPage ? " current-page" : "") +
    (opts.isDisabled ? " check-disabled" : "");
  row.title = item.title || item.url;

  visibleRowOrder.push(id);
  updateRowSelectionClass(row, id);

  const fav = document.createElement("img");
  fav.className = "favicon";
  fav.draggable = false;
  fav.src = faviconUrl(item.url);
  fav.onerror = () => { fav.style.visibility = "hidden"; };

  const main = document.createElement("div");
  main.className = "row-main";

  const title = document.createElement("div");
  title.className = "row-title";
  title.textContent = item.title || item.url;

  const urlLine = document.createElement("div");
  urlLine.className = "row-url";
  const meta = item.checkedAt ? `${item.url} · ${timeAgo(item.checkedAt)}` : item.url;
  urlLine.textContent = meta;

  main.appendChild(title);
  main.appendChild(urlLine);

  if (opts.breadcrumb) {
    const bc = document.createElement("div");
    bc.className = "breadcrumb";
    bc.textContent = opts.breadcrumb;
    main.appendChild(bc);
  }

  if (opts.isCurrentPage) {
    const tag = document.createElement("span");
    tag.className = "current-tag";
    tag.textContent = t("currentPageBadge");
    main.appendChild(tag);
  }

  const badge = document.createElement("div");
  if (opts.isDisabled) {
    badge.className = "badge disabled";
    badge.textContent = t("checkDisabledBadge");
  } else {
    badge.className = "badge " + badgeClass(item.status);
    badge.textContent = badgeText(item.status);
  }

  const actions = document.createElement("div");
  actions.className = "row-actions";

  const pinBtn = document.createElement("button");
  pinBtn.className = "row-btn" + (opts.isPinned ? " pin-active" : "");
  pinBtn.textContent = "📌";
  pinBtn.title = opts.isPinned ? t("unpinTooltip") : t("pinTooltip");
  pinBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const res = await sendMessage({ type: "TOGGLE_PIN", id });
    if (res && res.ok) render(res.state);
  });

  const delBtn = document.createElement("button");
  delBtn.className = "row-btn delete-btn";
  delBtn.textContent = "🗑";
  delBtn.title = t("deleteTooltip");
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const ids = selectedIds.has(id) && selectedIds.size > 1 ? Array.from(selectedIds) : [id];
    bulkDelete(ids);
  });

  const disableBtn = document.createElement("button");
  disableBtn.className = "row-btn" + (opts.isDisabled ? " disable-active" : "");
  disableBtn.textContent = opts.isDisabled ? "🔕" : "🔔";
  disableBtn.title = opts.isDisabled ? t("enableCheckTooltip") : t("disableCheckTooltip");
  disableBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const res = await sendMessage({ type: "TOGGLE_DISABLE_CHECK", id });
    if (res && res.ok) render(res.state);
  });

  actions.appendChild(pinBtn);
  actions.appendChild(disableBtn);
  actions.appendChild(delBtn);

  row.appendChild(fav);
  row.appendChild(main);
  row.appendChild(badge);
  row.appendChild(actions);

  row.addEventListener("click", (e) => handleRowClick(e, id));
  row.addEventListener("dblclick", () => openInNewTab(item.url));
  row.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, id, item, opts.isPinned, opts.isDisabled);
  });
  attachDragHandlers(row, id);

  return row;
}

// ---------- custom context menu ----------

let menuEl = null;

function closeContextMenu() {
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
  }
  document.removeEventListener("click", closeContextMenu, true);
  document.removeEventListener("keydown", onMenuKeydown, true);
}

function onMenuKeydown(e) {
  if (e.key === "Escape") closeContextMenu();
}

function menuItem(label, iconChar, handler, opts) {
  opts = opts || {};
  const btn = document.createElement("button");
  if (opts.danger) btn.className = "danger";
  const icon = document.createElement("span");
  icon.className = "cm-icon";
  icon.textContent = iconChar;
  const text = document.createElement("span");
  text.textContent = label;
  btn.appendChild(icon);
  btn.appendChild(text);
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    closeContextMenu();
    await handler();
  });
  return btn;
}

function showContextMenu(x, y, id, item, isPinned, isDisabled) {
  closeContextMenu();

  const multi = selectedIds.size > 1 && selectedIds.has(id);

  menuEl = document.createElement("div");
  menuEl.className = "context-menu";

  const titleEl = document.createElement("div");
  titleEl.className = "cm-title";
  titleEl.textContent = item.title || item.url;
  menuEl.appendChild(titleEl);

  const sep1 = document.createElement("div");
  sep1.className = "cm-sep";
  menuEl.appendChild(sep1);

  menuEl.appendChild(
    menuItem(t("contextCheckNow"), "🔎", async () => {
      const res = await sendMessage({ type: "CHECK_ONE", id });
      if (res && res.ok) render(res.state);
    })
  );

  menuEl.appendChild(
    menuItem(t("contextOpenNewTab"), "↗", async () => {
      openInNewTab(item.url);
    })
  );

  if (multi) {
    menuEl.appendChild(
      menuItem(t("contextOpenSelected", [String(selectedIds.size)]), "↗", async () => {
        for (const sid of selectedIds) {
          const it = lastState && lastState.items[sid];
          if (it && it.url) openInNewTab(it.url, { active: false });
        }
      })
    );
  }

  menuEl.appendChild(
    menuItem(isPinned ? t("contextUnpin") : t("contextPin"), "📌", async () => {
      const res = await sendMessage({ type: "TOGGLE_PIN", id });
      if (res && res.ok) render(res.state);
    })
  );

  menuEl.appendChild(
    menuItem(
      isDisabled ? t("contextEnableCheck") : t("contextDisableCheck"),
      isDisabled ? "🔔" : "🔕",
      async () => {
        const res = await sendMessage({ type: "TOGGLE_DISABLE_CHECK", id });
        if (res && res.ok) render(res.state);
      }
    )
  );

  const sep2 = document.createElement("div");
  sep2.className = "cm-sep";
  menuEl.appendChild(sep2);

  menuEl.appendChild(
    menuItem(
      multi ? t("contextDeleteSelected", [String(selectedIds.size)]) : t("contextDelete"),
      "🗑",
      async () => {
        await bulkDelete(multi ? Array.from(selectedIds) : [id]);
      },
      { danger: true }
    )
  );

  document.body.appendChild(menuEl);

  const menuRect = menuEl.getBoundingClientRect();
  const maxX = document.documentElement.clientWidth - menuRect.width - 6;
  const maxY = document.documentElement.clientHeight - menuRect.height - 6;
  menuEl.style.left = Math.max(6, Math.min(x, maxX)) + "px";
  menuEl.style.top = Math.max(6, Math.min(y, maxY)) + "px";

  setTimeout(() => {
    document.addEventListener("click", closeContextMenu, true);
    document.addEventListener("keydown", onMenuKeydown, true);
  }, 0);
}

// ---------- tree rendering (normal mode) ----------

function renderTreeNode(node, items, pinnedSet, currentActiveId, container, disabledSet) {
  if (node.type === "folder") {
    if (!node.children || node.children.length === 0) return;

    const details = document.createElement("details");
    details.className = "folder";
    details.open = !collapsedFolderIds.has(node.id);

    const summary = document.createElement("summary");
    summary.textContent = node.title;
    attachFolderDropHandlers(summary, node.id);
    details.appendChild(summary);

    const childWrap = document.createElement("div");
    childWrap.className = "folder-children";

    let hasVisibleChild = false;
    let i = 0;
    const children = node.children;
    while (i < children.length) {
      const child = children[i];
      if (child.type === "folder") {
        const before = childWrap.childElementCount;
        renderTreeNode(child, items, pinnedSet, currentActiveId, childWrap, disabledSet);
        if (childWrap.childElementCount > before) hasVisibleChild = true;
        i++;
      } else {
        const runIds = [];
        while (i < children.length && children[i].type === "bookmark") {
          if (!pinnedSet.has(children[i].id)) runIds.push(children[i].id);
          i++;
        }
        if (runIds.length > 0) {
          hasVisibleChild = true;
          appendItemsLazily(childWrap, runIds, (id) =>
            makeRow(id, items[id], {
              active: id === currentActiveId,
              isPinned: false,
              isCurrentPage: isCurrentPageBookmark(items[id].url),
              isDisabled: disabledSet.has(id),
            })
          );
        }
      }
    }

    if (!hasVisibleChild) return;

    details.addEventListener("toggle", () => {
      if (details.open) collapsedFolderIds.delete(node.id);
      else collapsedFolderIds.add(node.id);
      saveCollapsedFolders();
    });

    details.appendChild(childWrap);
    container.appendChild(details);
  } else if (node.type === "bookmark") {
    const item = items[node.id];
    if (!item) return;
    const row = makeRow(node.id, item, {
      active: node.id === currentActiveId,
      isPinned: false,
      isCurrentPage: isCurrentPageBookmark(item.url),
      isDisabled: disabledSet.has(node.id),
    });
    container.appendChild(row);
  }
}

// ---------- flat helpers ----------

function flattenTreeWithPath(nodes, path, out) {
  for (const node of nodes) {
    if (node.type === "folder") {
      flattenTreeWithPath(node.children || [], [...path, node.title], out);
    } else if (node.type === "bookmark") {
      out.push({ id: node.id, path: path.join(" / ") });
    }
  }
}

// ---------- skeleton placeholder ----------

function renderSkeleton(count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const row = document.createElement("div");
    row.className = "skeleton-row";
    const fav = document.createElement("div");
    fav.className = "skeleton-fav";
    const main = document.createElement("div");
    main.className = "skeleton-main";
    const bar1 = document.createElement("div");
    bar1.className = "skeleton-bar skeleton-title";
    const bar2 = document.createElement("div");
    bar2.className = "skeleton-bar skeleton-url";
    main.appendChild(bar1);
    main.appendChild(bar2);
    row.appendChild(fav);
    row.appendChild(main);
    frag.appendChild(row);
  }
  listEl.replaceChildren(frag);
}

// ---------- main render ----------

function render(state) {
  lastState = state;
  visibleRowOrder = [];
  const { tree, order, items, pinned } = state;

  if (selectedIds.size > 0) {
    for (const id of Array.from(selectedIds)) {
      if (!items[id]) selectedIds.delete(id);
    }
  }

  if (!order || order.length === 0) {
    emptyState.style.display = "block";
    emptyState.textContent = t("emptyNoBookmarks");
    const frag = document.createDocumentFragment();
    frag.appendChild(emptyState);
    listEl.replaceChildren(frag);
    updateFooterText();
    // lastCheckLabel.textContent = t("neverChecked");
    return;
  }

  const pinnedSet = new Set(pinned);
  const disabledSet = new Set(state.disabledChecks || []);
  const activeQueue = [
    ...pinned.filter((id) => !disabledSet.has(id)),
    ...order.filter((id) => !pinnedSet.has(id) && !disabledSet.has(id)),
  ];
  const activeId = activeQueue.length ? activeQueue[state.currentIndex % activeQueue.length] : null;

  const query = searchInput.value.trim().toLowerCase();

  // Build everything off-DOM first, then attach in a single swap so the
  // tree never appears to "assemble" piece by piece in front of the user.
  const frag = document.createDocumentFragment();

  if (query) {
    const pathById = {};
    const flatWithPath = [];
    flattenTreeWithPath(tree, [], flatWithPath);
    flatWithPath.forEach((f) => (pathById[f.id] = f.path));

    const matches = order.filter((id) => {
      const item = items[id];
      if (!item) return false;
      const statusStr = badgeText(item.status).toLowerCase();
      return (
        (item.title || "").toLowerCase().includes(query) ||
        (item.url || "").toLowerCase().includes(query) ||
        statusStr.includes(query)
      );
    });

    if (matches.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = t("emptyNoResults");
      frag.appendChild(empty);
    } else {
      appendItemsLazily(frag, matches, (id) => {
        const item = items[id];
        return makeRow(id, item, {
          active: id === activeId,
          isPinned: pinnedSet.has(id),
          pinnedRow: pinnedSet.has(id),
          breadcrumb: pathById[id] || "",
          isCurrentPage: isCurrentPageBookmark(item.url),
          isDisabled: disabledSet.has(id),
        });
      });
    }
  } else {
    if (pinned.length > 0) {
      const label = document.createElement("div");
      label.className = "section-label";
      label.textContent = t("pinnedSectionLabel");
      frag.appendChild(label);

      appendItemsLazily(frag, pinned, (id) => {
        const item = items[id];
        return makeRow(id, item, {
          active: id === activeId,
          isPinned: true,
          pinnedRow: true,
          isCurrentPage: isCurrentPageBookmark(item.url),
          isDisabled: disabledSet.has(id),
        });
      });
    }

    for (const node of tree) {
      renderTreeNode(node, items, pinnedSet, activeId, frag, disabledSet);
    }
  }

  listEl.replaceChildren(frag);

  updateFooterText();
  // lastCheckLabel.textContent = state.lastCheck
  //   ? t("lastCheckPrefix", [timeAgo(state.lastCheck)])
  //   : t("neverChecked");
}

// ---------- settings screen ----------

function openSettings() {
  settingsView.hidden = false;
  listEl.style.display = "none";
  searchbarWrap.style.display = "none";
}

function closeSettings() {
  settingsView.hidden = true;
  listEl.style.display = "";
  searchbarWrap.style.display = "";
}

settingsBtn.addEventListener("click", openSettings);
closeSettingsBtn.addEventListener("click", closeSettings);

languageSelect.addEventListener("change", async () => {
  languagePref = languageSelect.value;
  localStorage.setItem("bscLanguage", languagePref);
  if (languagePref !== "auto" && !messageDicts[languagePref]) {
    await loadMessageDicts();
  }
  localizeStaticMarkup();
  if (lastState) render(lastState);
});

themeSelect.addEventListener("change", () => {
  const theme = themeSelect.value;
  localStorage.setItem("bscTheme", theme);
  document.body.classList.toggle("theme-light", theme === "light");
});

refreshNowBtn.addEventListener("click", async () => {
  refreshNowBtn.disabled = true;
  const res = await sendMessage({ type: "SYNC" });
  refreshNowBtn.disabled = false;
  if (res && res.ok) render(res.state);
});

intervalSelect.addEventListener("change", async () => {
  await sendMessage({ type: "SET_INTERVAL", minutes: Number(intervalSelect.value) });
});

// ---------- events ----------

async function refresh() {
  const cached = await readStateDirect();
  render(cached);
  intervalSelect.value = String(cached.intervalMinutes != null ? cached.intervalMinutes : 60);

  if (!cached.order || cached.order.length === 0) {
    const res = await sendMessage({ type: "SYNC" });
    if (res && res.ok) {
      render(res.state);
      intervalSelect.value = String(res.state.intervalMinutes != null ? res.state.intervalMinutes : 60);
    }
  }
}

// syncBtn.addEventListener("click", async () => {
//   syncBtn.classList.add("spinning");
//   const res = await sendMessage({ type: "SYNC" });
//   syncBtn.classList.remove("spinning");
//   if (res && res.ok) render(res.state);
// });

// checkNowBtn.addEventListener("click", async () => {
//   checkNowBtn.disabled = true;
//   checkNowBtn.classList.add("spinning");
//   const res = await sendMessage({ type: "CHECK_NOW" });
//   checkNowBtn.disabled = false;
//   checkNowBtn.classList.remove("spinning");
//   if (res && res.ok) render(res.state);
// });

collapseAllBtn.addEventListener("click", () => {
  if (!lastState) return;
  const allFolderIds = collectFolderIds(lastState.tree, []);
  const anyExpanded = allFolderIds.some((id) => !collapsedFolderIds.has(id));
  if (anyExpanded) {
    allFolderIds.forEach((id) => collapsedFolderIds.add(id));
  } else {
    collapsedFolderIds.clear();
  }
  saveCollapsedFolders();
  render(lastState);
});

if (sidePanelBtn) {
  if (!api.sidePanel) {
    sidePanelBtn.style.display = "none"; // Firefox / older Chrome — no side panel support
  }
  sidePanelBtn.addEventListener("click", async () => {
    if (currentWindowId != null && api.sidePanel) {
      try {
        await api.sidePanel.open({ windowId: currentWindowId });
      } catch (e) {
        /* ignore — e.g. not available in this Chrome version */
      }
    }
  });
}

searchInput.addEventListener("input", () => {
  if (lastState) render(lastState);
});

// auto-refresh whenever background syncs / checks in real time —
// read straight from storage (fast, works even while the worker is asleep)
api.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes.uiCollapsedFolders && Object.keys(changes).length === 1) return;
  const state = await readStateDirect();
  render(state);
});

async function init() {
  themeSelect.value = localStorage.getItem("bscTheme") || "dark";
  languageSelect.value = languagePref;
  if (languagePref !== "auto") await loadMessageDicts();

  const versionLabel = document.getElementById("versionLabel");
  if (versionLabel) {
    versionLabel.textContent = "v" + api.runtime.getManifest().version;
  }

  localizeStaticMarkup();
  renderSkeleton(8);
  await Promise.all([loadCollapsedFolders(), loadCurrentTabInfo(), loadWindowId()]);
  await refresh();
}

init();
