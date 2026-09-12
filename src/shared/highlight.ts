/**
 * Marks every occurrence of the search query inside a piece of text.
 *
 * Built as DOM nodes rather than an HTML string: bookmark titles and URLs are
 * user data that would otherwise need escaping, and the extension's CSP rules
 * out innerHTML anyway.
 */
export function highlightFragment(text: string, query: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const needle = query.trim().toLowerCase();

  if (!needle) {
    fragment.appendChild(document.createTextNode(text));
    return fragment;
  }

  const haystack = text.toLowerCase();
  let cursor = 0;

  for (;;) {
    const hit = haystack.indexOf(needle, cursor);
    if (hit === -1) break;

    if (hit > cursor) {
      fragment.appendChild(document.createTextNode(text.slice(cursor, hit)));
    }

    const mark = document.createElement("mark");
    mark.className = "match";
    mark.textContent = text.slice(hit, hit + needle.length);
    fragment.appendChild(mark);

    cursor = hit + needle.length;
  }

  if (cursor < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(cursor)));
  }

  return fragment;
}

/** Replaces an element's content with the highlighted text. */
export function setHighlightedText(el: HTMLElement, text: string, query: string): void {
  el.replaceChildren(highlightFragment(text, query));
}

/**
 * Splits text into the runs the highlighter would produce. Exposed so the
 * matching itself can be tested without a DOM.
 */
export function highlightRuns(text: string, query: string): { text: string; match: boolean }[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return text ? [{ text, match: false }] : [];

  const haystack = text.toLowerCase();
  const runs: { text: string; match: boolean }[] = [];
  let cursor = 0;

  for (;;) {
    const hit = haystack.indexOf(needle, cursor);
    if (hit === -1) break;
    if (hit > cursor) runs.push({ text: text.slice(cursor, hit), match: false });
    runs.push({ text: text.slice(hit, hit + needle.length), match: true });
    cursor = hit + needle.length;
  }

  if (cursor < text.length) runs.push({ text: text.slice(cursor), match: false });
  return runs;
}
