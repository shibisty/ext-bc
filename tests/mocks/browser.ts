import { vi } from "vitest";

type Listener<T extends unknown[]> = (...args: T) => void;

/**
 * Every event created for one mock, so `__reset()` can drop all registered
 * listeners. Missing one means listeners pile up across tests and each message
 * gets handled several times over.
 */
const allEvents: { listeners: unknown[] }[] = [];

/** Minimal stand-in for `chrome.events.Event`. */
function makeEvent<T extends unknown[]>() {
  const listeners: Listener<T>[] = [];
  allEvents.push({ listeners });
  return {
    addListener: (fn: Listener<T>) => listeners.push(fn),
    removeListener: (fn: Listener<T>) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    hasListener: (fn: Listener<T>) => listeners.includes(fn),
    /** Test-only: fire every registered listener. */
    emit: (...args: T) => listeners.forEach((fn) => fn(...args)),
    listeners,
  };
}

export interface BookmarkNodeFixture {
  id: string;
  title?: string;
  url?: string;
  parentId?: string | undefined;
  index?: number;
  children?: BookmarkNodeFixture[];
}

/**
 * In-memory implementation of the slice of the extensions API this codebase
 * uses. Storage is a real object with change notifications, so read-modify-write
 * flows and the popup's storage.onChanged path can be exercised end to end.
 */
export function createBrowserMock() {
  let store: Record<string, unknown> = {};
  let tree: BookmarkNodeFixture[] = [];
  /** Which browser's bookmarks.move index rule to imitate. */
  let moveSemantics: "before-removal" | "after-removal" = "before-removal";
  let nextId = 1;

  allEvents.length = 0;

  const storageChanged = makeEvent<[Record<string, chrome.storage.StorageChange>, string]>();
  const alarmFired = makeEvent<[chrome.alarms.Alarm]>();

  function findNode(
    id: string,
    nodes: BookmarkNodeFixture[] = tree,
    parent?: BookmarkNodeFixture,
  ): { node: BookmarkNodeFixture; parent?: BookmarkNodeFixture | undefined } | null {
    for (const node of nodes) {
      if (node.id === id) return { node, parent };
      if (node.children) {
        const hit = findNode(id, node.children, node);
        if (hit) return hit;
      }
    }
    return null;
  }

  /** Fills in parentId/index the way the real API reports them. */
  function decorate(nodes: BookmarkNodeFixture[], parentId?: string): void {
    nodes.forEach((node, index) => {
      node.parentId = parentId;
      node.index = index;
      if (node.children) decorate(node.children, node.id);
    });
  }

  /** Firefox for Android answers getTree() without nested children. */
  let shallowTree = false;

  /** Copies a node without its children, the way a shallow browser answers. */
  function strip(nodes: BookmarkNodeFixture[]): BookmarkNodeFixture[] {
    return nodes.map(({ children: _children, ...rest }) => ({ ...rest }));
  }

  const api = {
    storage: {
      local: {
        get: vi.fn(async (keys: string[] | string) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const key of list) if (key in store) out[key] = store[key];
          return structuredClone(out);
        }),
        set: vi.fn(async (patch: Record<string, unknown>) => {
          const changes: Record<string, chrome.storage.StorageChange> = {};
          for (const [key, value] of Object.entries(patch)) {
            changes[key] = { oldValue: store[key], newValue: value };
          }
          store = { ...store, ...structuredClone(patch) };
          storageChanged.emit(changes, "local");
        }),
        remove: vi.fn(async (key: string) => {
          delete store[key];
        }),
      },
      onChanged: storageChanged,
    },

    bookmarks: {
      getTree: vi.fn(async () => {
        const children = shallowTree ? strip(tree) : tree;
        return structuredClone([{ id: "0", title: "", children }]);
      }),
      get: vi.fn(async (id: string) => {
        const hit = findNode(id);
        return hit ? [structuredClone(hit.node)] : [];
      }),
      getChildren: vi.fn(async (id: string) => {
        const hit = findNode(id);
        return structuredClone(hit?.node.children ?? []);
      }),
      create: vi.fn(
        async (details: { parentId?: string; index?: number; title?: string; url?: string }) => {
          const parent = details.parentId ? findNode(details.parentId) : null;
          const siblings = parent ? (parent.node.children ??= []) : tree;
          const node: BookmarkNodeFixture = {
            id: `gen-${nextId++}`,
            title: details.title ?? "",
            ...(details.url === undefined ? {} : { url: details.url }),
          };
          siblings.splice(details.index ?? siblings.length, 0, node);
          decorate(tree);
          return structuredClone(node);
        },
      ),
      remove: vi.fn(async (id: string) => {
        const hit = findNode(id);
        if (!hit) throw new Error("no such bookmark");
        const siblings = hit.parent?.children ?? tree;
        siblings.splice(siblings.indexOf(hit.node), 1);
        decorate(tree);
      }),
      update: vi.fn(async (id: string, changes: { title?: string; url?: string }) => {
        const hit = findNode(id);
        if (!hit) throw new Error("no such bookmark");
        if (changes.title !== undefined) hit.node.title = changes.title;
        if (changes.url !== undefined) hit.node.url = changes.url;
        return structuredClone(hit.node);
      }),
      /**
       * Mirrors Chrome's measured behaviour: the index is resolved against the
       * destination's children *as they are now*, and only then is the node
       * lifted out of its old place. Moving A to index 2 in [A,B,C,D] therefore
       * lands it at 1, not 2. `moveSemantics` flips this to the other reading
       * so the same code can be tested against both.
       */
      move: vi.fn(async (id: string, dest: { parentId?: string; index?: number }) => {
        const hit = findNode(id);
        if (!hit) throw new Error("no such bookmark");

        const target = dest.parentId ? findNode(dest.parentId) : null;
        let to = tree;
        if (target) {
          target.node.children ??= [];
          to = target.node.children;
        }

        const from = hit.parent?.children ?? tree;
        const wanted = dest.index ?? to.length;

        if (moveSemantics === "before-removal") {
          const anchor = to[wanted];
          from.splice(from.indexOf(hit.node), 1);
          const at = anchor ? to.indexOf(anchor) : to.length;
          to.splice(at === -1 ? to.length : at, 0, hit.node);
        } else {
          from.splice(from.indexOf(hit.node), 1);
          to.splice(wanted, 0, hit.node);
        }

        decorate(tree);
      }),
      onCreated: makeEvent(),
      onRemoved: makeEvent(),
      onChanged: makeEvent(),
      onMoved: makeEvent(),
      onChildrenReordered: makeEvent(),
      onImportEnded: makeEvent(),
    },

    alarms: {
      create: vi.fn(),
      clear: vi.fn(async () => true),
      onAlarm: alarmFired,
    },

    runtime: {
      /** Firefox-only, and how the code tells the two messaging styles apart. */
      getBrowserInfo: undefined as undefined | (() => Promise<{ name: string }>),
      sendMessage: vi.fn(),
      getURL: (path: string) => `chrome-extension://test/${path}`,
      getManifest: () => ({ version: "9.9.9" }),
      getPlatformInfo: vi.fn(async () => ({ os: "linux" as chrome.runtime.PlatformOs })),
      onMessage: makeEvent<
        [unknown, chrome.runtime.MessageSender, (response: unknown) => void]
      >(),
      onInstalled: makeEvent(),
      onStartup: makeEvent(),
    },

    tabs: {
      query: vi.fn(async () => [{ id: 1, url: "https://example.com/docs" }]),
      create: vi.fn(async () => ({ id: 2 })),
      update: vi.fn(async () => ({ id: 1 })),
    },

    windows: {
      getCurrent: vi.fn(async () => ({ id: 42 })),
    },

    permissions: {
      contains: vi.fn(async () => true),
      request: vi.fn(async () => true),
    },

    sidePanel: {
      open: vi.fn(async () => undefined),
      setPanelBehavior: vi.fn(async () => undefined),
    },

    i18n: {
      // Echo the key (plus substitutions) so assertions stay readable without
      // depending on any particular translation.
      getMessage: (key: string, subs?: string | string[]) => {
        if (subs === undefined) return key;
        return `${key}(${(Array.isArray(subs) ? subs : [subs]).join(",")})`;
      },
      getUILanguage: () => "en-US",
    },

    // ---- test helpers, not part of the real API ----
    __store: () => store,
    __seed: (data: Record<string, unknown>) => {
      store = { ...store, ...structuredClone(data) };
    },
    __setTree: (nodes: BookmarkNodeFixture[]) => {
      tree = structuredClone(nodes);
      decorate(tree);
    },
    __tree: () => tree,
    /** Make getTree() answer without nested children, as Android does. */
    __setShallowTree: (on: boolean) => {
      shallowTree = on;
    },
    __setMoveSemantics: (mode: "before-removal" | "after-removal") => {
      moveSemantics = mode;
    },
    /** Firefox answers messages by resolving a returned promise, not sendResponse. */
    __setFirefox: (on: boolean) => {
      api.runtime.getBrowserInfo = on ? async () => ({ name: "Firefox" }) : undefined;
    },
    __reset: () => {
      api.runtime.getBrowserInfo = undefined;
      api.permissions.contains.mockResolvedValue(true);
      api.permissions.request.mockResolvedValue(true);
      store = {};
      tree = [];
      moveSemantics = "before-removal";
      shallowTree = false;
      nextId = 1;
      for (const event of allEvents) event.listeners.length = 0;
    },
  };

  return api;
}

export type BrowserMock = ReturnType<typeof createBrowserMock>;
