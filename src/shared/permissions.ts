import { api } from "./api";

/**
 * Checking a bookmark means fetching it, and that needs access to every site.
 *
 * Chrome grants `host_permissions` at install. Firefox's MV3 does not: the same
 * entry is *optional* there, and until the user grants it every fetch is a
 * plain cross-origin request — which succeeds only on sites that happen to send
 * permissive CORS headers and fails as a network error everywhere else. That is
 * exactly what a list full of ERR with the occasional 200 looks like, so the
 * popup asks for the permission instead of leaving the user to guess.
 */
export const ALL_URLS = "<all_urls>";

type Permissions = typeof chrome.permissions | undefined;

function permissions(): Permissions {
  return (api as typeof chrome & { permissions?: typeof chrome.permissions }).permissions;
}

/** Whether the extension may fetch arbitrary sites right now. */
export async function hasHostAccess(): Promise<boolean> {
  const perms = permissions();
  // No permissions API at all: nothing to ask for, so assume the manifest holds.
  if (!perms) return true;
  try {
    return await perms.contains({ origins: [ALL_URLS] });
  } catch {
    return true;
  }
}

/**
 * Asks for site access. Must be called straight out of a click: both browsers
 * refuse a permission prompt that no user gesture led to.
 */
export async function requestHostAccess(): Promise<boolean> {
  const perms = permissions();
  if (!perms) return false;
  try {
    return await perms.request({ origins: [ALL_URLS] });
  } catch {
    return false;
  }
}
