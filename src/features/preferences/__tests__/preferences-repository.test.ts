import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

describe("preferencesRepository.setActiveProfile", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("sends the profile alone as explicit nulls for the account and the PIN", async () => {
    invokeMock.mockResolvedValueOnce({});
    const { preferencesRepository } = await import("../preferences-repository");

    await preferencesRepository.setActiveProfile("profile-2");

    expect(invokeMock).toHaveBeenCalledWith("set_active_profile", {
      profileId: "profile-2",
      supabaseUserId: null,
      pin: null,
    });
  });

  it("passes the account and the PIN through when the caller has them", async () => {
    invokeMock.mockResolvedValueOnce({});
    const { preferencesRepository } = await import("../preferences-repository");

    await preferencesRepository.setActiveProfile("profile-2", "user_abc", "1234");

    expect(invokeMock).toHaveBeenCalledWith("set_active_profile", {
      profileId: "profile-2",
      supabaseUserId: "user_abc",
      pin: "1234",
    });
  });
});
