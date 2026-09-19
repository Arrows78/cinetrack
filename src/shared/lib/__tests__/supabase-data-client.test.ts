import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getClerkInstanceMock = vi.fn();
const createClientMock = vi.fn();

vi.mock("@/shared/lib/clerk-instance", () => ({
  getClerkInstance: () => getClerkInstanceMock(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

async function importFresh() {
  vi.resetModules();
  return import("../supabase-data-client");
}

describe("supabase-data-client", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    getClerkInstanceMock.mockReset();
    createClientMock.mockReset().mockReturnValue({ from: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is unconfigured when either Supabase env is missing", async () => {
    const { dataClientConfig, getDataClient } = await importFresh();
    expect(dataClientConfig.configured).toBe(false);
    await expect(getDataClient()).resolves.toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("builds one client with accessToken and no JWT template", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    const getToken = vi.fn().mockResolvedValue("clerk-session-jwt");
    getClerkInstanceMock.mockReturnValue({ session: { getToken } });

    const { dataClientConfig, getDataClient } = await importFresh();
    expect(dataClientConfig.configured).toBe(true);

    const first = await getDataClient();
    const second = await getDataClient();
    expect(first).toBe(second);
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_test",
      expect.objectContaining({ accessToken: expect.any(Function) })
    );

    const firstCallOptions = createClientMock.mock.calls[0]?.[2] as
      { accessToken: () => Promise<string | null> } | undefined;
    if (!firstCallOptions) throw new Error("expected createClient options");
    await expect(firstCallOptions.accessToken()).resolves.toBe("clerk-session-jwt");
    expect(getToken).toHaveBeenCalledWith();
  });

  it("returns a null access token when Clerk has no session", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    getClerkInstanceMock.mockReturnValue({ session: null });

    await importFresh().then(({ getDataClient }) => getDataClient());
    const firstCallOptions = createClientMock.mock.calls[0]?.[2] as
      { accessToken: () => Promise<string | null> } | undefined;
    if (!firstCallOptions) throw new Error("expected createClient options");
    await expect(firstCallOptions.accessToken()).resolves.toBeNull();
  });

  it("reads the Clerk user id, never supabase.auth", async () => {
    getClerkInstanceMock.mockReturnValue({ user: { id: "user_2abc" } });
    const { getCurrentUserId } = await importFresh();
    expect(getCurrentUserId()).toBe("user_2abc");
  });
});
