export interface TabInfo {
  hostname: string;
  pathname: string;
}

export function extractHostname(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function faviconUrl(url: string): string {
  const host = extractHostname(url);
  return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=32` : "";
}

export function parseTabInfo(url: string | undefined): TabInfo | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return { hostname: parsed.hostname, pathname: parsed.pathname };
  } catch {
    return null;
  }
}

/** Drops a trailing slash so "/docs" and "/docs/" are the same place. */
function normalisePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "/" ? "" : trimmed;
}

/**
 * Whether a bookmark points at exactly the page the user is looking at.
 *
 * Same host, same path — nothing else. Neither substring matching (which went
 * both ways: on github.com/shibisty it lit up github.com/shibisty/x as well)
 * nor "somewhere inside the bookmarked section" is enough: standing on
 * github.com/shibisty/ext-bc must not mark github.com/shibisty as the current
 * page. Only the trailing slash is forgiven, so "/docs" and "/docs/" are the
 * same place.
 */
export function matchesCurrentPage(
  bookmarkUrl: string | undefined,
  tab: TabInfo | null,
): boolean {
  if (!tab || !bookmarkUrl) return false;

  try {
    const parsed = new URL(bookmarkUrl);
    if (parsed.hostname !== tab.hostname) return false;

    return normalisePath(parsed.pathname) === normalisePath(tab.pathname);
  } catch {
    return false;
  }
}
