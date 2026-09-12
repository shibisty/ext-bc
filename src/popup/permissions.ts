import { sendMessage } from "../shared/messages";
import { hasHostAccess, requestHostAccess } from "../shared/permissions";
import { dom } from "./dom";
import { applyState } from "./ui-state";

/**
 * Shows the "site access is off" banner when checks cannot possibly work, and
 * asks for the permission when the user clicks.
 *
 * On Firefox the manifest's `<all_urls>` is only a request: until it is
 * granted, every check comes back ERR except on the few sites that send
 * permissive CORS headers. Granting it from here re-runs the sync so the list
 * stops showing a wall of failures.
 */
export async function registerPermissionBanner(): Promise<void> {
  const banner = dom.permissionBanner;
  const button = dom.grantAccessBtn;
  if (!banner || !button) return;

  const refresh = async (): Promise<void> => {
    banner.hidden = await hasHostAccess();
  };

  button.addEventListener("click", () => {
    void (async () => {
      // Straight out of the click: a permission prompt needs the user gesture.
      const granted = await requestHostAccess();
      if (!granted) return;
      banner.hidden = true;
      const res = await sendMessage({ type: "SYNC" });
      if (res?.ok && res.state) applyState(res.state);
    })();
  });

  await refresh();
}
