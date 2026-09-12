import { api } from "./api";
import type { DropPosition, State } from "./types";

/**
 * Every message the popup can send to the background worker. Both sides import
 * this union, so a typo in a message type or a missing field is a compile
 * error rather than a request that silently never gets answered.
 */
export type Message =
  | { type: "PING" }
  | { type: "SYNC" }
  | { type: "GET_STATE" }
  | { type: "SET_INTERVAL"; minutes: number }
  | { type: "SET_CREDENTIALS"; send: boolean }
  | { type: "RESET_INDEX" }
  | { type: "TOGGLE_PIN"; id: string; mirrorToToolbar?: boolean }
  | { type: "TOGGLE_DISABLE_CHECK"; id: string }
  | { type: "CHECK_ONE"; id: string }
  | { type: "DELETE"; id: string }
  | { type: "DELETE_MANY"; ids: string[] }
  | { type: "TOGGLE_ARCHIVE"; id: string }
  | { type: "RENAME"; id: string; title: string }
  | { type: "MOVE_BOOKMARKS"; ids: string[]; targetId: string; position: DropPosition };

export type MessageType = Message["type"];

export interface MessageResponse {
  ok: boolean;
  state?: State;
  /** Present when the worker refused or failed; shown to the user. */
  error?: string;
  /** The manifest version the background worker itself was built from. */
  version?: string;
}

/** Every handler answers with the state as it stands after the operation. */
export function sendMessage(msg: Message): Promise<MessageResponse | undefined> {
  return api.runtime.sendMessage(msg) as Promise<MessageResponse | undefined>;
}
