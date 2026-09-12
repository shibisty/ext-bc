import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockBrowser } from "../setup";

const POPUP_HTML = readFileSync(path.resolve(process.cwd(), "src/ui/popup.html"), "utf8");

async function mount() {
  document.body.innerHTML = POPUP_HTML.replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
  document.body.className = "";
  vi.resetModules();
  const { registerPermissionBanner } = await import("../../src/popup/permissions");
  await registerPermissionBanner();
  return {
    banner: document.getElementById("permissionBanner") as HTMLElement,
    button: document.getElementById("grantAccessBtn") as HTMLButtonElement,
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

/**
 * Firefox's MV3 treats the manifest's `<all_urls>` as a request rather than a
 * grant, and without it every check comes back ERR. The banner is the only
 * place the user is told why.
 */
describe("site access banner", () => {
  it("stays hidden when access is already granted", async () => {
    mockBrowser().permissions.contains.mockResolvedValue(true);

    const { banner } = await mount();

    expect(banner.hidden).toBe(true);
  });

  it("appears when access is missing", async () => {
    mockBrowser().permissions.contains.mockResolvedValue(false);

    const { banner } = await mount();

    expect(banner.hidden).toBe(false);
  });

  it("asks for the permission and re-syncs once granted", async () => {
    mockBrowser().permissions.contains.mockResolvedValue(false);
    mockBrowser().permissions.request.mockResolvedValue(true);
    mockBrowser().runtime.sendMessage.mockResolvedValue({ ok: true });

    const { banner, button } = await mount();
    button.click();
    await vi.waitFor(() => expect(banner.hidden).toBe(true));

    expect(mockBrowser().permissions.request).toHaveBeenCalledWith({ origins: ["<all_urls>"] });
    expect(mockBrowser().runtime.sendMessage).toHaveBeenCalledWith({ type: "SYNC" });
  });

  it("keeps the banner up when the request is declined", async () => {
    mockBrowser().permissions.contains.mockResolvedValue(false);
    mockBrowser().permissions.request.mockResolvedValue(false);

    const { banner, button } = await mount();
    button.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(banner.hidden).toBe(false);
  });
});
