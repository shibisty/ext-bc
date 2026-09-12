import { api, usesPromiseMessaging } from "../shared/api";
import type { Message, MessageResponse, MessageType } from "../shared/messages";
import { readState, writeState } from "../shared/storage";
import type { State } from "../shared/types";
import { setupAlarm } from "./alarms";
import { moveBookmarksTo, removeBookmarks, renameNode, syncBookmarks } from "./bookmarks";
import { checkOne } from "./checker";
import { mirrorPinToToolbar } from "./toolbar";
import { withLock } from "./lock";

type ListKey = "pinned" | "disabledChecks" | "archived";

/**
 * Adds or removes an id from one of the id lists in state. Pinning puts the id
 * first (most recently pinned on top); disabling just appends.
 */
async function toggleInList(key: ListKey, id: string): Promise<void> {
  const state = await readState();
  const list = state[key].slice();
  const index = list.indexOf(id);

  if (index >= 0) list.splice(index, 1);
  else if (key === "pinned") list.unshift(id);
  else list.push(id);

  await writeState({ [key]: list } as Partial<State>);
}

type Handlers = {
  [K in MessageType]: (msg: Extract<Message, { type: K }>) => Promise<unknown>;
};

/**
 * One entry per message type. Adding a message to the `Message` union without
 * adding it here is a compile error, and vice versa.
 */
const handlers: Handlers = {
  PING: async () => undefined,
  SYNC: () => syncBookmarks(),
  GET_STATE: async () => undefined,
  SET_INTERVAL: async (msg) => {
    await writeState({ intervalMinutes: msg.minutes });
    await setupAlarm();
  },
  SET_CREDENTIALS: (msg) => writeState({ sendCredentials: msg.send }),
  RESET_INDEX: () => writeState({ currentIndex: 0 }),
  TOGGLE_PIN: async (msg) => {
    await toggleInList("pinned", msg.id);
    if (msg.mirrorToToolbar) {
      const { pinned } = await readState();
      await mirrorPinToToolbar(msg.id, pinned.includes(msg.id));
    }
  },
  TOGGLE_DISABLE_CHECK: (msg) => toggleInList("disabledChecks", msg.id),
  CHECK_ONE: (msg) => checkOne(msg.id),
  DELETE: (msg) => removeBookmarks([msg.id]),
  DELETE_MANY: (msg) => removeBookmarks(msg.ids ?? []),
  TOGGLE_ARCHIVE: (msg) => toggleInList("archived", msg.id),
  RENAME: (msg) => renameNode(msg.id, msg.title),
  MOVE_BOOKMARKS: (msg) => moveBookmarksTo(msg.ids ?? [], msg.targetId, msg.position),
};

/** Runs one message and builds the answer. Never throws. */
export async function handleMessage(raw: unknown): Promise<MessageResponse> {
  const msg = raw as Message;
  const handler = handlers[msg.type] as ((m: Message) => Promise<unknown>) | undefined;
  const version = api.runtime.getManifest().version;

  // Answer even an unknown message. Leaving it unanswered rejects the caller's
  // promise with "Receiving end does not exist", which in the popup looked like
  // the button simply doing nothing — the symptom when a stale worker is still
  // registered after an update.
  if (!handler) return { ok: false, error: `unknown message: ${String(msg.type)}`, version };

  try {
    // Every handler that touches `items` goes through the same queue, so a
    // manual check can't race the periodic one.
    await withLock(() => handler(msg));
    return { ok: true, state: await readState(), version };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), version };
  }
}

/**
 * Answers the popup in whichever way this browser understands.
 *
 * Chrome keeps the channel open only when the listener returns a literal
 * `true` and then calls `sendResponse`; Firefox expects the listener to return
 * a promise and ignores the Chrome convention, so on Firefox every message went
 * unanswered — the popup showed "reload the extension" and nothing worked.
 */
export function registerMessageRouter(): void {
  const onMessage = api.runtime.onMessage as unknown as {
    addListener: (
      fn: (
        raw: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: MessageResponse) => void,
      ) => boolean | Promise<MessageResponse>,
    ) => void;
  };

  onMessage.addListener((raw, _sender, sendResponse) => {
    const answer = handleMessage(raw);
    if (usesPromiseMessaging()) return answer;

    void answer.then(sendResponse);
    return true; // keep the message channel open for the async response
  });
}
