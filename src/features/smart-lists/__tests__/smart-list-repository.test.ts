import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import type { SmartList, SmartListRules } from "@/types/media";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

const rules: SmartListRules = {
  status: "planned",
  mediaType: "movie",
  genre: "Horror",
  maxRuntimeMinutes: 100,
  minRating: null,
  provider: "any",
  hasEpisodeWaiting: false,
};

const smartList = (overrides: Partial<SmartList> = {}): SmartList => ({
  id: "sl-1",
  profileId: DEFAULT_PROFILE_ID,
  name: "Cozy horror night",
  rules,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

// The name/rules validation and active-profile resolution now live in Rust
// and are exercised there (see src-tauri/src/lists/smart/'s own
// tests) — this only verifies the repository wraps invoke() with the right
// command name/args, matching custom-list-repository.test.ts's own shape.
describe("smartListRepository", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list() invokes list_smart_lists", async () => {
    invokeMock.mockResolvedValueOnce([smartList()]);
    const { smartListRepository } = await import("../smart-list-repository");

    await expect(smartListRepository.list()).resolves.toEqual([smartList()]);
    expect(invokeMock).toHaveBeenCalledWith("list_smart_lists", undefined);
  });

  it("create() invokes create_smart_list with name/rules", async () => {
    invokeMock.mockResolvedValueOnce(smartList());
    const { smartListRepository } = await import("../smart-list-repository");

    await smartListRepository.create("Cozy horror night", rules);
    expect(invokeMock).toHaveBeenCalledWith("create_smart_list", { name: "Cozy horror night", rules });
  });

  it("update() invokes update_smart_list with the smartListId/name/rules", async () => {
    invokeMock.mockResolvedValueOnce(smartList());
    const { smartListRepository } = await import("../smart-list-repository");

    await smartListRepository.update("sl-1", "Renamed", rules);
    expect(invokeMock).toHaveBeenCalledWith("update_smart_list", {
      smartListId: "sl-1",
      name: "Renamed",
      rules,
    });
  });

  it("remove() invokes remove_smart_list with the smartListId", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { smartListRepository } = await import("../smart-list-repository");

    await smartListRepository.remove("sl-1");
    expect(invokeMock).toHaveBeenCalledWith("remove_smart_list", { smartListId: "sl-1" });
  });
});
