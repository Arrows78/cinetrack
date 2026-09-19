import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getClerkInstanceMock } = vi.hoisted(() => ({ getClerkInstanceMock: vi.fn() }));

vi.mock("@/features/auth/auth-client", () => ({ getClerkInstance: () => getClerkInstanceMock() }));

import { getEnabledSocialProviders } from "../provider-availability";

describe("getEnabledSocialProviders", () => {
  beforeEach(() => {
    getClerkInstanceMock.mockReturnValue({ frontendApi: "example.clerk.accounts.dev" });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when Clerk isn't configured/bootstrapped", async () => {
    getClerkInstanceMock.mockReturnValue(null);
    expect(await getEnabledSocialProviders()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requests Clerk's public environment endpoint for the bootstrapped Frontend API host", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    await getEnabledSocialProviders();

    expect(fetch).toHaveBeenCalledWith(
      "https://example.clerk.accounts.dev/v1/environment",
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/json" }) })
    );
  });

  it("returns null when the request fails", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
    expect(await getEnabledSocialProviders()).toBeNull();
  });

  it("returns an empty list when no social connections are configured", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    expect(await getEnabledSocialProviders()).toEqual([]);
  });

  it("returns only the providers Clerk reports as enabled", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          user_settings: {
            social: {
              oauth_google: { enabled: true },
              oauth_apple: { enabled: false },
              oauth_facebook: { enabled: true },
            },
          },
        }),
        { status: 200 }
      )
    );
    const providers = await getEnabledSocialProviders();
    expect(providers).toEqual(expect.arrayContaining(["google", "facebook"]));
    expect(providers).not.toContain("apple");
    expect(providers).toHaveLength(2);
  });

  it("maps oauth_x to the 'x' provider", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ user_settings: { social: { oauth_x: { enabled: true } } } }), { status: 200 })
    );
    expect(await getEnabledSocialProviders()).toEqual(["x"]);
  });

  it("forwards the abort signal to fetch", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const controller = new AbortController();

    await getEnabledSocialProviders(controller.signal);

    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: controller.signal }));
  });
});
