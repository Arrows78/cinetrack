import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => false }));

describe("getDatabase outside Tauri", () => {
  it("throws a dedicated TauriRequiredError instead of silently returning null", async () => {
    const { getDatabase, TauriRequiredError } = await import("../client");

    await expect(getDatabase()).rejects.toBeInstanceOf(TauriRequiredError);
    await expect(getDatabase()).rejects.toThrow(/Tauri/);
  });
});
