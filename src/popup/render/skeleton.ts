import { dom } from "../dom";

/** Grey placeholder rows shown while the first state read is in flight. */
export function renderSkeleton(count: number): void {
  const frag = document.createDocumentFragment();

  for (let i = 0; i < count; i++) {
    const row = document.createElement("div");
    row.className = "skeleton-row";

    const favicon = document.createElement("div");
    favicon.className = "skeleton-fav";

    const main = document.createElement("div");
    main.className = "skeleton-main";

    const titleBar = document.createElement("div");
    titleBar.className = "skeleton-bar skeleton-title";

    const urlBar = document.createElement("div");
    urlBar.className = "skeleton-bar skeleton-url";

    main.append(titleBar, urlBar);
    row.append(favicon, main);
    frag.appendChild(row);
  }

  dom.list.replaceChildren(frag);
}
