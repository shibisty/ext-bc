// ===== Bookmark Status Checker — background service worker =====

// Cross-browser shim: Firefox exposes a native, promise-based `browser`
// namespace; Chrome's MV3 `chrome` namespace also returns promises for the
// APIs this extension uses when the callback argument is omitted. Using
// `api` everywhere below lets the exact same file run unmodified on both.
const api = typeof browser !== "undefined" ? browser : chrome;

const ALARM_NAME = "bsc-periodic-check";
const DEFAULT_INTERVAL_MINUTES = 60;
const FETCH_TIMEOUT_MS = 8000;

// ---------- storage helpers ----------

async function getState() {
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
      data.intervalMinutes === undefined || data.intervalMinutes === null
        ? DEFAULT_INTERVAL_MINUTES
        : data.intervalMinutes,
    lastCheck: data.lastCheck || null,
    checking: data.checking || false,
  };
}

async function setState(partial) {
  await api.storage.local.set(partial);
}

// ---------- bookmarks ----------

// Walks the real chrome bookmarks tree, producing:
//  - a simplified tree (folders + bookmarks) for display, preserving structure
//  - a flat DFS list of bookmark leaves for the check queue
function processNode(node, flatOut) {
  if (node.children) {
    // folder
    const children = node.children.map((child) => processNode(child, flatOut));
    return { id: node.id, title: node.title || api.i18n.getMessage("unnamedFolder"), type: "folder", children };
  }
  if (node.url) {
    flatOut.push({ id: node.id, title: node.title || node.url, url: node.url });
    return { id: node.id, title: node.title || node.url, url: node.url, type: "bookmark" };
  }
  return null;
}

async function syncBookmarks() {
  const treeRoot = await api.bookmarks.getTree();
  const topNodes = (treeRoot[0] && treeRoot[0].children) || [];
  const flat = [];
  const tree = topNodes.map((n) => processNode(n, flat)).filter(Boolean);

  const state = await getState();
  const items = { ...state.items };
  const seen = new Set();
  const order = [];

  for (const bm of flat) {
    seen.add(bm.id);
    order.push(bm.id);
    if (items[bm.id]) {
      items[bm.id].title = bm.title;
      items[bm.id].url = bm.url;
    } else {
      items[bm.id] = {
        title: bm.title,
        url: bm.url,
        status: null,
        statusText: null,
        checkedAt: null,
      };
    }
  }

  for (const id of Object.keys(items)) {
    if (!seen.has(id)) delete items[id];
  }

  const pinned = (state.pinned || []).filter((id) => seen.has(id));
  const disabledChecks = (state.disabledChecks || []).filter((id) => seen.has(id));

  let currentIndex = state.currentIndex;
  if (order.length > 0 && currentIndex >= order.length) currentIndex = 0;

  await setState({ tree, order, items, pinned, disabledChecks, currentIndex });
  return { tree, order, items, pinned, disabledChecks, currentIndex };
}

// ---------- checking ----------

async function checkUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let res;
    try {
      res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (e) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        cache: "no-store",
      });
    }
    return { status: res.status, statusText: res.statusText || "" };
  } catch (err) {
    if (err.name === "AbortError") {
      return { status: "TIMEOUT", statusText: "Таймаут" };
    }
    return { status: "ERR", statusText: "Нет соединения" };
  } finally {
    clearTimeout(timer);
  }
}

async function checkSpecificBookmark(id) {
  const state = await getState();
  const items = { ...state.items };
  const item = items[id];
  if (!item) return;

  const result = await checkUrl(item.url);
  item.status = result.status;
  item.statusText = result.statusText;
  item.checkedAt = Date.now();
  items[id] = item;
  propagateDomainStatus(items, id, result);

  await setState({ items, lastCheck: Date.now() });
}

function extractHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

// If a bookmark's whole domain turns out to be unreachable, mark every other
// bookmark on that same domain as unreachable too — saves fetching each one
// individually before the domain (hopefully) comes back.
function propagateDomainStatus(items, sourceId, result) {
  if (result.status !== "ERR") return; // only genuine connection failures, not 404/500/timeout
  const sourceHost = extractHostname(items[sourceId] && items[sourceId].url);
  if (!sourceHost) return;
  const now = Date.now();
  for (const id of Object.keys(items)) {
    if (id === sourceId) continue;
    const host = extractHostname(items[id].url);
    if (host === sourceHost) {
      items[id].status = "ERR";
      items[id].statusText = "Domain unreachable";
      items[id].checkedAt = now;
    }
  }
}

function buildQueue(order, pinned, disabledChecks) {
  const pinnedSet = new Set(pinned);
  const disabledSet = new Set(disabledChecks || []);
  const activePinned = pinned.filter((id) => !disabledSet.has(id));
  const activeRest = order.filter((id) => !pinnedSet.has(id) && !disabledSet.has(id));
  return [...activePinned, ...activeRest];
}

const CHECKING_STALE_MS = 60000; // if "checking" has been stuck this long, treat it as dead and proceed anyway

async function checkNextBookmark() {
  const already = await getState();
  const stuckTooLong =
    already.checking && already.checkingSince && Date.now() - already.checkingSince > CHECKING_STALE_MS;
  if (already.checking && !stuckTooLong) return;
  await setState({ checking: true, checkingSince: Date.now() });

  try {
    const { order, items, pinned, disabledChecks } = await syncBookmarks();
    const queue = buildQueue(order, pinned, disabledChecks);
    if (queue.length === 0) {
      await setState({ checking: false, lastCheck: Date.now() });
      return;
    }

    const state = await getState();
    const idx = state.currentIndex % queue.length;
    const id = queue[idx];
    const item = items[id];

    if (item) {
      const result = await checkUrl(item.url);
      item.status = result.status;
      item.statusText = result.statusText;
      item.checkedAt = Date.now();
      items[id] = item;
      propagateDomainStatus(items, id, result);
    }

    const nextIndex = idx + 1;
    await setState({
      items,
      currentIndex: nextIndex,
      lastCheck: Date.now(),
      checking: false,
    });
  } catch (e) {
    await setState({ checking: false });
  }
}

// ---------- alarms ----------

async function setupAlarm() {
  const state = await getState();
  await api.alarms.clear(ALARM_NAME);
  if (!state.intervalMinutes || state.intervalMinutes <= 0) {
    return; // auto-check turned off — no alarm scheduled
  }
  api.alarms.create(ALARM_NAME, {
    periodInMinutes: state.intervalMinutes,
  });
}

api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkNextBookmark();
  }
});

api.runtime.onInstalled.addListener(async () => {
  await syncBookmarks();
  await setupAlarm();
  if (api.sidePanel && api.sidePanel.setPanelBehavior) {
    try {
      await api.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    } catch (e) {
      /* older Chrome without side panel support — ignore */
    }
  }
});

api.runtime.onStartup.addListener(async () => {
  await setupAlarm();
});

// ---------- live auto-sync on any bookmarks change ----------
let syncDebounce = null;
function scheduleSync() {
  clearTimeout(syncDebounce);
  syncDebounce = setTimeout(() => {
    syncBookmarks();
  }, 300);
}

api.bookmarks.onCreated.addListener(scheduleSync);
api.bookmarks.onRemoved.addListener(scheduleSync);
api.bookmarks.onChanged.addListener(scheduleSync);
api.bookmarks.onMoved.addListener(scheduleSync);
api.bookmarks.onChildrenReordered.addListener(scheduleSync);
api.bookmarks.onImportEnded.addListener(scheduleSync);

// Moves one or more bookmarks next to (or into) a target node, persisting
// the new order to the real browser bookmarks, then re-syncs.
// position: "before" | "after" | "inside" (drop onto a folder)
async function moveBookmarksTo(ids, targetId, position) {
  for (const id of ids) {
    if (id === targetId) continue;
    let parentId, index;
    if (position === "inside") {
      parentId = targetId;
      const children = await api.bookmarks.getChildren(targetId);
      index = children.length;
    } else {
      const targetNode = (await api.bookmarks.get(targetId))[0];
      if (!targetNode) continue;
      parentId = targetNode.parentId;
      index = targetNode.index + (position === "after" ? 1 : 0);
    }
    try {
      const node = (await api.bookmarks.get(id))[0];
      let idx = index;
      if (node && node.parentId === parentId && node.index < idx) idx -= 1;
      await api.bookmarks.move(id, { parentId, index: idx });
    } catch (e) {
      // e.g. dropping a folder into its own descendant — skip that one
    }
  }
  await syncBookmarks();
}

// ---------- messages from popup ----------

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === "SYNC") {
      await syncBookmarks();
      sendResponse({ ok: true, state: await getState() });
    } else if (msg.type === "CHECK_NOW") {
      await checkNextBookmark();
      sendResponse({ ok: true, state: await getState() });
    } else if (msg.type === "GET_STATE") {
      sendResponse({ ok: true, state: await getState() });
    } else if (msg.type === "SET_INTERVAL") {
      await setState({ intervalMinutes: msg.minutes });
      await setupAlarm();
      sendResponse({ ok: true });
    } else if (msg.type === "RESET_INDEX") {
      await setState({ currentIndex: 0 });
      sendResponse({ ok: true, state: await getState() });
    } else if (msg.type === "TOGGLE_PIN") {
      const state = await getState();
      let pinned = state.pinned.slice();
      const i = pinned.indexOf(msg.id);
      if (i >= 0) {
        pinned.splice(i, 1);
      } else {
        pinned.unshift(msg.id);
      }
      await setState({ pinned });
      sendResponse({ ok: true, state: await getState() });
    } else if (msg.type === "CHECK_ONE") {
      await checkSpecificBookmark(msg.id);
      sendResponse({ ok: true, state: await getState() });
    } else if (msg.type === "DELETE") {
      try {
        await api.bookmarks.remove(msg.id);
      } catch (e) {
        // already gone or is a non-empty folder — ignore
      }
      await syncBookmarks();
      sendResponse({ ok: true, state: await getState() });
    } else if (msg.type === "TOGGLE_DISABLE_CHECK") {
      const state = await getState();
      let disabledChecks = state.disabledChecks.slice();
      const i = disabledChecks.indexOf(msg.id);
      if (i >= 0) {
        disabledChecks.splice(i, 1);
      } else {
        disabledChecks.push(msg.id);
      }
      await setState({ disabledChecks });
      sendResponse({ ok: true, state: await getState() });
    } else if (msg.type === "DELETE_MANY") {
      for (const id of msg.ids || []) {
        try {
          await api.bookmarks.remove(id);
        } catch (e) {
          /* already gone or non-empty folder — ignore */
        }
      }
      await syncBookmarks();
      sendResponse({ ok: true, state: await getState() });
    } else if (msg.type === "MOVE_BOOKMARKS") {
      await moveBookmarksTo(msg.ids || [], msg.targetId, msg.position);
      sendResponse({ ok: true, state: await getState() });
    }
  })();
  return true;
});
