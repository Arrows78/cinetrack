import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn<() => string | null>(),
  initialize: vi.fn(),
  lock: vi.fn(),
  isTauriApp: vi.fn<() => boolean>(),
  invoke: vi.fn(),
}));

vi.mock("@/features/desktop/token-vault", () => ({
  tokenVault: {
    getToken: mocks.getToken,
    initialize: mocks.initialize,
    lock: mocks.lock,
  },
}));

vi.mock("@/shared/config/env", () => ({
  env: { VITE_TMDB_API_TOKEN: undefined },
  hasTmdbToken: false,
}));

vi.mock("@/shared/lib/platform", () => ({
  isTauriApp: () => mocks.isTauriApp(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mocks.invoke(...args),
}));

import { ApiConfigurationError, TmdbRequestError, tmdbFetch } from "../client";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("tmdbFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockReturnValue("test-token");
    mocks.isTauriApp.mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws ApiConfigurationError without attempting either transport when no token is available", async () => {
    mocks.getToken.mockReturnValue(null);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(tmdbFetch("/movie/550")).rejects.toBeInstanceOf(ApiConfigurationError);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("awaits tokenVault.initialize() before resolving the bearer token or picking a transport", async () => {
    const order: string[] = [];
    mocks.initialize.mockImplementation(async () => {
      order.push("initialize");
    });
    mocks.getToken.mockImplementation(() => {
      order.push("getToken");
      return "test-token";
    });
    mocks.isTauriApp.mockImplementation(() => {
      order.push("isTauriApp");
      return false;
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true })));

    await tmdbFetch("/movie/550");

    // The second "isTauriApp" isn't tmdbFetch's own transport-branch check
    // (already recorded) — it's logger.info()'s own internal isTauriApp()
    // guard, fired when tmdbFetch logs the request's duration after the
    // webview fetch resolves. Both mocked functions share the same
    // `@/shared/lib/platform` module, so this order array sees both.
    expect(order).toEqual(["initialize", "getToken", "isTauriApp", "isTauriApp"]);
  });

  describe("webview transport (outside Tauri)", () => {
    const fetchSpy = vi.fn();

    beforeEach(() => {
      fetchSpy.mockReset();
      vi.stubGlobal("fetch", fetchSpy);
    });

    it("builds the URL from base + path + params, dropping undefined and empty-string params", async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));

      await tmdbFetch("/movie/550", { language: "fr-FR", region: "", page: undefined, year: 1999 });

      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(String(url)).toBe("https://api.themoviedb.org/3/movie/550?language=fr-FR&year=1999");
      expect(init.headers.Authorization).toBe("Bearer test-token");
      expect(mocks.invoke).not.toHaveBeenCalled();
    });

    it("returns the parsed JSON body on success", async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ id: 550 }));

      await expect(tmdbFetch<{ id: number }>("/movie/550")).resolves.toEqual({ id: 550 });
    });

    it("maps a non-ok response to a TmdbRequestError carrying the response status", async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ status_message: "Not found" }, 404));

      const error = await tmdbFetch("/movie/0").catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(TmdbRequestError);
      expect((error as TmdbRequestError).status).toBe(404);
    });

    it("maps an AbortError into the translated timeout message", async () => {
      fetchSpy.mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));

      const error = await tmdbFetch("/movie/550").catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(TmdbRequestError);
      expect((error as Error).message).toBe(i18n.t("errors.tmdbTimeout", { seconds: 20, path: "/movie/550" }));
    });

    it("maps any other fetch rejection into the translated unreachable message", async () => {
      fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

      const error = await tmdbFetch("/movie/550").catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(TmdbRequestError);
      expect((error as Error).message).toBe(i18n.t("errors.tmdbUnreachable", { details: "Failed to fetch" }));
    });
  });

  describe("native transport (inside Tauri)", () => {
    beforeEach(() => {
      mocks.isTauriApp.mockReturnValue(true);
    });

    it("invokes tmdb_request with the path, cleaned params, and bearer token", async () => {
      mocks.invoke.mockResolvedValue({ id: 550 });

      await tmdbFetch("/movie/550", { language: "fr-FR", region: "", page: undefined, year: 1999 });

      expect(mocks.invoke).toHaveBeenCalledWith("tmdb_request", {
        path: "/movie/550",
        params: { language: "fr-FR", year: "1999" },
        token: "test-token",
      });
    });

    it("returns the invoke result and never touches the webview fetch path", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      mocks.invoke.mockResolvedValue({ id: 550 });

      await expect(tmdbFetch<{ id: number }>("/movie/550")).resolves.toEqual({ id: 550 });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("maps a structured { message, status } rejection to a TmdbRequestError carrying that status", async () => {
      mocks.invoke.mockRejectedValue({ message: "Not found", status: 404 });

      const error = await tmdbFetch("/movie/0").catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(TmdbRequestError);
      expect((error as TmdbRequestError).message).toBe("Not found");
      expect((error as TmdbRequestError).status).toBe(404);
    });

    it("preserves the message and status of an already-TmdbRequestError rejection", async () => {
      // Not a toBe(original) reference check: invokeCommand() (src/shared/lib/invoke.ts)
      // sits between the mocked invoke() here and client.ts, and it
      // unconditionally normalizes every rejection — including an
      // already-rich Error instance — into a fresh ApiCommandError before
      // client.ts's own asTmdbError ever sees it (see ApiCommandError's own
      // doc comment: "let this shape flow up"). No feature-specific error
      // class can survive that boundary by reference; the content
      // (message/status) is what's guaranteed to make it through unchanged.
      const original = new TmdbRequestError("boom", 500);
      mocks.invoke.mockRejectedValue(original);

      const error = await tmdbFetch("/movie/550").catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(TmdbRequestError);
      expect((error as TmdbRequestError).message).toBe("boom");
      expect((error as TmdbRequestError).status).toBe(500);
    });

    it("falls back to errorMessage(error) for any other thrown value", async () => {
      mocks.invoke.mockRejectedValue("plain string failure");

      const error = await tmdbFetch("/movie/550").catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(TmdbRequestError);
      expect((error as TmdbRequestError).message).toBe("plain string failure");
      expect((error as TmdbRequestError).status).toBeUndefined();
    });

    it("locks the token vault when the resulting error has status 401", async () => {
      mocks.invoke.mockRejectedValue({ message: "Unauthorized", status: 401 });

      await tmdbFetch("/movie/550").catch(() => undefined);

      expect(mocks.lock).toHaveBeenCalledTimes(1);
    });

    it("locks the token vault when the resulting error has status 403", async () => {
      mocks.invoke.mockRejectedValue({ message: "Forbidden", status: 403 });

      await tmdbFetch("/movie/550").catch(() => undefined);

      expect(mocks.lock).toHaveBeenCalledTimes(1);
    });

    it("does not lock the token vault for a non-authentication status", async () => {
      mocks.invoke.mockRejectedValue({ message: "Server error", status: 500 });

      await tmdbFetch("/movie/550").catch(() => undefined);

      expect(mocks.lock).not.toHaveBeenCalled();
    });

    it("does not lock the token vault when the request succeeds", async () => {
      mocks.invoke.mockResolvedValue({ id: 550 });

      await tmdbFetch("/movie/550");

      expect(mocks.lock).not.toHaveBeenCalled();
    });
  });
});
