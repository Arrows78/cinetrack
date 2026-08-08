import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEnabledSocialProviders } from "../provider-availability";

describe("getEnabledSocialProviders", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns null when Supabase isn't configured", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    expect(await getEnabledSocialProviders()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requests the Supabase auth settings endpoint with the publishable key", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    await getEnabledSocialProviders();

    expect(fetch).toHaveBeenCalledWith(
      "https://example.supabase.co/auth/v1/settings",
      expect.objectContaining({ headers: expect.objectContaining({ apikey: "sb_publishable_test" }) })
    );
  });

  it("strips a trailing slash from the configured Supabase URL", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co/");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    await getEnabledSocialProviders();

    expect(fetch).toHaveBeenCalledWith("https://example.supabase.co/auth/v1/settings", expect.anything());
  });

  it("returns null when the request fails", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
    expect(await getEnabledSocialProviders()).toBeNull();
  });

  it("returns an empty list when no external providers are configured", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    expect(await getEnabledSocialProviders()).toEqual([]);
  });

  it("returns only the providers Supabase reports as enabled", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ external: { google: true, apple: false, facebook: true } }), { status: 200 })
    );
    const providers = await getEnabledSocialProviders();
    expect(providers).toEqual(expect.arrayContaining(["google", "facebook"]));
    expect(providers).not.toContain("apple");
    expect(providers).toHaveLength(2);
  });

  it("treats the 'x' provider as enabled via either the 'x' or 'twitter' settings key", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ external: { twitter: true } }), { status: 200 }));
    expect(await getEnabledSocialProviders()).toEqual(["x"]);
  });

  it("forwards the abort signal to fetch", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const controller = new AbortController();

    await getEnabledSocialProviders(controller.signal);

    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: controller.signal }));
  });
});
