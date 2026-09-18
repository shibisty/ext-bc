function required<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`popup.html is missing #${id}`);
  return el as T;
}

function optional<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/** Every element the popup talks to, resolved once and typed. */
export const dom = {
  list: required<HTMLElement>("list"),
  emptyState: required<HTMLElement>("emptyState"),
  searchbarWrap: required<HTMLElement>("searchbarWrap"),
  searchInput: required<HTMLInputElement>("searchInput"),
  searchClearBtn: optional<HTMLButtonElement>("searchClearBtn"),
  progressLabel: required<HTMLElement>("progressLabel"),
  settingsView: required<HTMLElement>("settingsView"),
  settingsBtn: required<HTMLButtonElement>("settingsBtn"),
  closeSettingsBtn: required<HTMLButtonElement>("closeSettingsBtn"),
  refreshNowBtn: required<HTMLButtonElement>("refreshNowBtn"),
  collapseAllBtn: required<HTMLButtonElement>("collapseAllBtn"),
  languageSelect: required<HTMLSelectElement>("languageSelect"),
  themeSelect: required<HTMLSelectElement>("themeSelect"),
  intervalSelect: required<HTMLSelectElement>("intervalSelect"),
  credentialsSelect: optional<HTMLSelectElement>("credentialsSelect"),
  openTriggerSelect: optional<HTMLSelectElement>("openTriggerSelect"),
  openTargetSelect: optional<HTMLSelectElement>("openTargetSelect"),
  afterOpenSelect: optional<HTMLSelectElement>("afterOpenSelect"),
  rowDetailSelect: optional<HTMLSelectElement>("rowDetailSelect"),
  rowActionsSelect: optional<HTMLSelectElement>("rowActionsSelect"),
  titleLinesSelect: optional<HTMLSelectElement>("titleLinesSelect"),
  pinToToolbarSelect: optional<HTMLSelectElement>("pinToToolbarSelect"),
  rememberSearchSelect: optional<HTMLSelectElement>("rememberSearchSelect"),
  popupHeightInput: optional<HTMLInputElement>("popupHeightInput"),
  openInTabBtn: optional<HTMLButtonElement>("openInTabBtn"),
  sidePanelBtn: optional<HTMLButtonElement>("sidePanelBtn"),
  tabBookmarksBtn: optional<HTMLButtonElement>("tabBookmarksBtn"),
  tabArchiveBtn: optional<HTMLButtonElement>("tabArchiveBtn"),
  archiveCount: optional<HTMLElement>("archiveCount"),
  resizeGrip: optional<HTMLElement>("resizeGrip"),
  permissionBanner: optional<HTMLElement>("permissionBanner"),
  grantAccessBtn: optional<HTMLButtonElement>("grantAccessBtn"),
  renameDialog: optional<HTMLDialogElement>("renameDialog"),
  renameInput: optional<HTMLInputElement>("renameInput"),
  renameTitleLabel: optional<HTMLElement>("renameTitleLabel"),
  renameSaveBtn: optional<HTMLButtonElement>("renameSaveBtn"),
  renameCancelBtn: optional<HTMLButtonElement>("renameCancelBtn"),
  versionLabel: optional<HTMLElement>("versionLabel"),
} as const;

/** The same document is served as the side panel with an extra body class. */
export const isSidePanelContext = document.body.classList.contains("side-panel-mode");

/**
 * The same document again, opened as an ordinary tab. A tab has no 600px
 * ceiling, so this is the way to see a long list in full.
 */
export const isTabContext = new URLSearchParams(location.search).get("view") === "tab";

if (isTabContext) document.body.classList.add("tab-mode");

/**
 * Closes the popup — but only when this *is* the popup. The side panel and the
 * tab view are windows the user opened deliberately; closing either would take
 * away the thing they just asked for.
 */
export function closePopupWindow(): void {
  if (isSidePanelContext || isTabContext) return;
  window.close();
}
