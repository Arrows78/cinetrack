import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn<() => string | null>(),
  initialize: vi.fn(),
  lock: vi.fn(),
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

import { ApiConfigurationError, TmdbRequestError, tmdbFetch } from "../client";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("tmdbFetch (webview transport)", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockReturnValue("test-token");
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects with ApiConfigurationError when no token is available", async () => {
    mocks.getToken.mockReturnValue(null);

    await expect(tmdbFetch("/movie/550")).rejects.toBeInstanceOf(ApiConfigurationError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the bearer token and drops empty or undefined params", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));

    await tmdbFetch("/movie/550", { language: "fr-FR", region: "", page: undefined, year: 1999 });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://api.themoviedb.org/3/movie/550?language=fr-FR&year=1999");
    expect(init.headers.Authorization).toBe("Bearer test-token");
  });

  it("returns the parsed JSON body on success", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ id: 550 }));

    await expect(tmdbFetch<{ id: number }>("/movie/550")).resolves.toEqual({ id: 550 });
  });

  it("maps a non-ok response to a TmdbRequestError carrying the status", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ status_message: "Not found" }, 404));

    const error = await tmdbFetch("/movie/0").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TmdbRequestError);
    expect((error as TmdbRequestError).status).toBe(404);
  });

  it("maps a network failure to a TmdbRequestError", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(tmdbFetch("/movie/550")).rejects.toBeInstanceOf(TmdbRequestError);
  });
});
