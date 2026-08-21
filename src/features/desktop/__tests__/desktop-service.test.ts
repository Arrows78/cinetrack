import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { registerMock, unregisterMock, onOpenUrlMock, listenMock, navigateMock, isTauriAppMock } = vi.hoisted(() => ({
  registerMock: vi.fn(),
  unregisterMock: vi.fn(),
  onOpenUrlMock: vi.fn(),
  listenMock: vi.fn(),
  navigateMock: vi.fn(),
  isTauriAppMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  register: registerMock,
  unregister: unregisterMock,
}));

// Mocking the dynamic import target this way also satisfies the static
// `import("@tauri-apps/plugin-deep-link")` inside desktop-service.ts.
vi.mock("@tauri-apps/plugin-deep-link", () => ({
  onOpenUrl: onOpenUrlMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

vi.mock("@/app/router-config", () => ({
  router: { navigate: navigateMock },
}));

vi.mock("@/shared/lib/platform", () => ({
  isTauriApp: isTauriAppMock,
}));

import { desktopService } from "../desktop-service";

type EventCallback = (event: { payload: string }) => void;

describe("desktopService.initialize", () => {
  let openUrlCallback: (urls: string[]) => void;
  let navigateCallback: EventCallback;
  let deepLinkCallback: EventCallback;
  let deepLinkUnlisten: ReturnType<typeof vi.fn>;
  let navigateUnlisten: ReturnType<typeof vi.fn>;
  let deepLinkEventUnlisten: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    isTauriAppMock.mockReturnValue(true);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    registerMock.mockResolvedValue(undefined);
    unregisterMock.mockResolvedValue(undefined);

    deepLinkUnlisten = vi.fn();
    onOpenUrlMock.mockImplementation(async (cb: (urls: string[]) => void) => {
      openUrlCallback = cb;
      return deepLinkUnlisten;
    });

    navigateUnlisten = vi.fn();
    deepLinkEventUnlisten = vi.fn();
    listenMock.mockImplementation(async (eventName: string, cb: EventCallback) => {
      if (eventName === "cinetrack:navigate") {
        navigateCallback = cb;
        return navigateUnlisten;
      }
      if (eventName === "cinetrack:deep-link") {
        deepLinkCallback = cb;
        return deepLinkEventUnlisten;
      }
      throw new Error(`unexpected event: ${eventName}`);
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns a no-op cleanup outside Tauri and skips all wiring", async () => {
    isTauriAppMock.mockReturnValue(false);

    const cleanup = await desktopService.initialize();
    expect(cleanup()).toBeUndefined();

    expect(registerMock).not.toHaveBeenCalled();
    expect(onOpenUrlMock).not.toHaveBeenCalled();
    expect(listenMock).not.toHaveBeenCalled();
  });

  it("wires up all four integrations and the returned cleanup tears each of them down", async () => {
    const cleanup = await desktopService.initialize();

    expect(registerMock).toHaveBeenCalledWith("CommandOrControl+Shift+K", expect.any(Function));
    expect(onOpenUrlMock).toHaveBeenCalledWith(expect.any(Function));
    expect(listenMock).toHaveBeenCalledWith("cinetrack:navigate", expect.any(Function));
    expect(listenMock).toHaveBeenCalledWith("cinetrack:deep-link", expect.any(Function));
    expect(warnSpy).not.toHaveBeenCalled();

    cleanup();

    expect(unregisterMock).toHaveBeenCalledWith("CommandOrControl+Shift+K");
    expect(deepLinkUnlisten).toHaveBeenCalledTimes(1);
    expect(navigateUnlisten).toHaveBeenCalledTimes(1);
    expect(deepLinkEventUnlisten).toHaveBeenCalledTimes(1);
  });

  it("invokes the registered global shortcut handler by dispatching a command-palette event", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    await desktopService.initialize();
    const shortcutHandler = registerMock.mock.calls[0]![1] as () => void;
    shortcutHandler();

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "cinetrack:command-palette" }));
    dispatchSpy.mockRestore();
  });

  it("warns and skips the cleanup when the global shortcut registration fails", async () => {
    const error = new Error("shortcut boom");
    registerMock.mockRejectedValueOnce(error);

    const cleanup = await desktopService.initialize();
    cleanup();

    expect(warnSpy).toHaveBeenCalledWith("Global shortcut unavailable", error);
    expect(unregisterMock).not.toHaveBeenCalled();
  });

  it("warns and skips the cleanup when deep links are unavailable", async () => {
    const error = new Error("deep link boom");
    onOpenUrlMock.mockRejectedValueOnce(error);

    const cleanup = await desktopService.initialize();
    cleanup();

    expect(warnSpy).toHaveBeenCalledWith("Deep links unavailable", error);
    expect(deepLinkUnlisten).not.toHaveBeenCalled();
  });

  it("warns and skips the cleanup when tray navigation is unavailable", async () => {
    const error = new Error("tray boom");
    listenMock.mockImplementationOnce(async (eventName: string) => {
      if (eventName === "cinetrack:navigate") throw error;
      throw new Error(`unexpected first call: ${eventName}`);
    });

    const cleanup = await desktopService.initialize();
    cleanup();

    expect(warnSpy).toHaveBeenCalledWith("Tray navigation unavailable", error);
    expect(navigateUnlisten).not.toHaveBeenCalled();
  });

  it("warns and skips the cleanup when single-instance deep links are unavailable", async () => {
    const error = new Error("single instance boom");
    listenMock
      .mockImplementationOnce(async (eventName: string, cb: EventCallback) => {
        navigateCallback = cb;
        return navigateUnlisten;
      })
      .mockImplementationOnce(async () => {
        throw error;
      });

    const cleanup = await desktopService.initialize();
    cleanup();

    expect(warnSpy).toHaveBeenCalledWith("Single-instance deep links unavailable", error);
    expect(deepLinkEventUnlisten).not.toHaveBeenCalled();
  });

  it("dispatches through the tray navigation listener with the exact payload", async () => {
    await desktopService.initialize();

    navigateCallback({ payload: "/some/path" });

    expect(navigateMock).toHaveBeenCalledWith({ to: "/some/path" });
  });

  it("routes the first resolving URL from a deep-link open-url batch and ignores non-resolving ones", async () => {
    await desktopService.initialize();

    openUrlCallback([
      "cinetrack://bogus/nothing",
      "cinetrack://movie/abc",
      "cinetrack://nomatch/foo",
      "cinetrack://series/456",
    ]);

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith({ to: "/series/456" });
  });

  it("does not navigate when none of the open-url batch resolves to a route", async () => {
    await desktopService.initialize();

    openUrlCallback(["cinetrack://bogus/nothing", "cinetrack://movie/abc"]);

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("covers all routeFromUrl branches via the single-instance deep-link listener", async () => {
    await desktopService.initialize();

    deepLinkCallback({ payload: "cinetrack://movie/123" });
    expect(navigateMock).toHaveBeenLastCalledWith({ to: "/movies/123" });

    deepLinkCallback({ payload: "cinetrack://series/456" });
    expect(navigateMock).toHaveBeenLastCalledWith({ to: "/series/456" });

    deepLinkCallback({ payload: "cinetrack://person/55" });
    expect(navigateMock).toHaveBeenLastCalledWith({ to: "/people/55" });

    deepLinkCallback({ payload: "cinetrack://tonight/anything/here" });
    expect(navigateMock).toHaveBeenLastCalledWith({ to: "/watch-tonight" });

    expect(navigateMock).toHaveBeenCalledTimes(4);

    // Hostname matches none of the known kinds -> falls through to null.
    deepLinkCallback({ payload: "cinetrack://nomatch/foo" });
    expect(navigateMock).toHaveBeenCalledTimes(4);

    // Known kind but a non-numeric id fails the /^\d+$/ test -> null.
    deepLinkCallback({ payload: "cinetrack://movie/abc" });
    expect(navigateMock).toHaveBeenCalledTimes(4);

    // `new URL(raw)` throws for a genuinely malformed string -> caught, returns null.
    deepLinkCallback({ payload: "not a url" });
    expect(navigateMock).toHaveBeenCalledTimes(4);
  });
});
