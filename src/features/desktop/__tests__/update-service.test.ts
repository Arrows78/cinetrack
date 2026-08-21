import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";

const isTauriAppMock = vi.fn(() => true);
vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => isTauriAppMock() }));

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

const relaunchMock = vi.fn(async (): Promise<void> => undefined);
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: () => relaunchMock() }));

const checkMock = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({ check: (...args: unknown[]) => checkMock(...args) }));

async function importFresh() {
  vi.resetModules();
  // Import from the same fresh module graph as update-service so
  // `instanceof UserFacingError` checks compare the same class identity
  // (vi.resetModules() gives every test its own module instances).
  const [updateServiceModule, userFacingErrorModule] = await Promise.all([
    import("../update-service"),
    import("@/shared/lib/user-facing-error"),
  ]);
  return { updateService: updateServiceModule.updateService, UserFacingError: userFacingErrorModule.UserFacingError };
}

describe("updateService.checkAndInstall", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    isTauriAppMock.mockReset().mockReturnValue(true);
    invokeMock.mockReset().mockResolvedValue(true);
    relaunchMock.mockReset().mockResolvedValue(undefined);
    checkMock.mockReset();
  });

  it("returns the native-only message outside Tauri, without checking the update channel", async () => {
    isTauriAppMock.mockReturnValue(false);
    const { updateService } = await importFresh();

    const result = await updateService.checkAndInstall();

    expect(result).toBe(i18n.t("desktop.updateNativeOnly"));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("returns the not-configured message when updater_is_configured resolves false", async () => {
    invokeMock.mockResolvedValue(false);
    const { updateService } = await importFresh();

    const result = await updateService.checkAndInstall();

    expect(result).toBe(i18n.t("desktop.updateChannelNotConfigured"));
    expect(checkMock).not.toHaveBeenCalled();
  });

  it("treats a rejected updater_is_configured call as not configured", async () => {
    invokeMock.mockRejectedValue(new Error("ipc failure"));
    const { updateService } = await importFresh();

    const result = await updateService.checkAndInstall();

    expect(result).toBe(i18n.t("desktop.updateChannelNotConfigured"));
    expect(checkMock).not.toHaveBeenCalled();
  });

  it("returns up-to-date when check() resolves falsy (no update available)", async () => {
    invokeMock.mockResolvedValue(true);
    checkMock.mockResolvedValue(null);
    const { updateService } = await importFresh();

    const result = await updateService.checkAndInstall();

    expect(result).toBe(i18n.t("desktop.upToDate"));
  });

  it("converts a check() rejection whose message matches the configuration pattern into a UserFacingError", async () => {
    invokeMock.mockResolvedValue(true);
    checkMock.mockRejectedValue(new Error("invalid pubkey"));
    const { updateService, UserFacingError } = await importFresh();

    await expect(updateService.checkAndInstall()).rejects.toMatchObject({
      constructor: UserFacingError,
      message: i18n.t("desktop.updateChannelNotConfigured"),
    });
  });

  it("matches other configuration-related wording (endpoint) in the same way", async () => {
    invokeMock.mockResolvedValue(true);
    checkMock.mockRejectedValue(new Error("missing endpoint configuration"));
    const { updateService, UserFacingError } = await importFresh();

    await expect(updateService.checkAndInstall()).rejects.toBeInstanceOf(UserFacingError);
  });

  it("rethrows a check() rejection whose Error message does not match the configuration pattern", async () => {
    invokeMock.mockResolvedValue(true);
    const networkError = new Error("network timeout");
    checkMock.mockRejectedValue(networkError);
    const { updateService } = await importFresh();

    await expect(updateService.checkAndInstall()).rejects.toBe(networkError);
  });

  it("rethrows a non-Error rejection from check() as-is (String() branch of the ternary)", async () => {
    invokeMock.mockResolvedValue(true);
    checkMock.mockRejectedValue("plain string failure");
    const { updateService } = await importFresh();

    await expect(updateService.checkAndInstall()).rejects.toBe("plain string failure");
  });

  it("a non-Error rejection that happens to match the configuration pattern still becomes a UserFacingError", async () => {
    invokeMock.mockResolvedValue(true);
    checkMock.mockRejectedValue("bad pubkey supplied");
    const { updateService, UserFacingError } = await importFresh();

    await expect(updateService.checkAndInstall()).rejects.toMatchObject({
      constructor: UserFacingError,
      message: i18n.t("desktop.updateChannelNotConfigured"),
    });
  });

  it("downloads, installs, relaunches, and reports the installed version, driving onProgress with accumulated totals", async () => {
    invokeMock.mockResolvedValue(true);
    const onProgress = vi.fn();
    const downloadAndInstall = vi.fn(async (onEvent: (event: unknown) => void) => {
      onEvent({ event: "Started", data: { contentLength: 1000 } });
      onEvent({ event: "Progress", data: { chunkLength: 400 } });
      onEvent({ event: "Progress", data: { chunkLength: 600 } });
    });
    checkMock.mockResolvedValue({ version: "2.4.0", downloadAndInstall });
    const { updateService } = await importFresh();

    const result = await updateService.checkAndInstall(onProgress);

    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenNthCalledWith(1, 400, 1000);
    expect(onProgress).toHaveBeenNthCalledWith(2, 1000, 1000);
    expect(relaunchMock).toHaveBeenCalledTimes(1);
    expect(result).toBe(i18n.t("desktop.updateInstalled", { version: "2.4.0" }));
  });

  it("completes the download/install flow without a crash when onProgress is omitted", async () => {
    invokeMock.mockResolvedValue(true);
    const downloadAndInstall = vi.fn(async (onEvent: (event: unknown) => void) => {
      onEvent({ event: "Started", data: { contentLength: 500 } });
      onEvent({ event: "Progress", data: { chunkLength: 500 } });
    });
    checkMock.mockResolvedValue({ version: "3.0.0", downloadAndInstall });
    const { updateService } = await importFresh();

    const result = await updateService.checkAndInstall();

    expect(relaunchMock).toHaveBeenCalledTimes(1);
    expect(result).toBe(i18n.t("desktop.updateInstalled", { version: "3.0.0" }));
  });

  it("handles a Started event with no contentLength (total stays undefined)", async () => {
    invokeMock.mockResolvedValue(true);
    const onProgress = vi.fn();
    const downloadAndInstall = vi.fn(async (onEvent: (event: unknown) => void) => {
      onEvent({ event: "Started", data: {} });
      onEvent({ event: "Progress", data: { chunkLength: 250 } });
    });
    checkMock.mockResolvedValue({ version: "1.9.9", downloadAndInstall });
    const { updateService } = await importFresh();

    await updateService.checkAndInstall(onProgress);

    expect(onProgress).toHaveBeenCalledWith(250, undefined);
  });
});
