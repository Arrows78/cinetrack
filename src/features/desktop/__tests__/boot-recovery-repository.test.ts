import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

describe("bootRecoveryRepository", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("get() invokes get_boot_recovery", async () => {
    invokeMock.mockResolvedValueOnce({ recovered: false, quarantinedPath: null, originalError: null });
    const { bootRecoveryRepository } = await import("../boot-recovery-repository");

    await expect(bootRecoveryRepository.get()).resolves.toEqual({
      recovered: false,
      quarantinedPath: null,
      originalError: null,
    });
    expect(invokeMock).toHaveBeenCalledWith("get_boot_recovery", undefined);
  });
});
