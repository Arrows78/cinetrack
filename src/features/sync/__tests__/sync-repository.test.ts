import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeTypedCommandMock } = vi.hoisted(() => ({
  invokeTypedCommandMock: vi.fn(),
}));

vi.mock("@/shared/lib/invoke", () => ({
  defineCommand: (name: string) => name,
  invokeTypedCommand: (...args: unknown[]) => invokeTypedCommandMock(...args),
}));

import { syncRepository } from "@/features/sync/sync-repository";

beforeEach(() => {
  invokeTypedCommandMock.mockReset().mockResolvedValue(undefined);
});

describe("syncRepository", () => {
  it("maps every native sync operation through the typed invoke boundary", async () => {
    const ack = { mutationId: "m1", entityType: "library_item", entityId: "e1", version: 2 };
    const conflict = { mutationId: "m2", entityType: "library_item", entityId: "e2", serverVersion: 3 };
    const change = {
      sequence: 4,
      entityType: "library_item",
      entityId: "e3",
      operation: "upsert" as const,
      version: 4,
      data: { uuid: "e3" },
    };

    await syncRepository.getDeviceId();
    await syncRepository.prepare("user_1");
    await syncRepository.getStatus();
    await syncRepository.markCompleted("p1");
    await syncRepository.getCursor("p1");
    await syncRepository.listOutbox("p1", 25);
    await syncRepository.listConflicts(20);
    await syncRepository.ack("p1", [ack]);
    await syncRepository.rebase("p1", [conflict]);
    await syncRepository.applyRemote("p1", [change]);

    expect(invokeTypedCommandMock).toHaveBeenCalledTimes(10);
    expect(invokeTypedCommandMock).toHaveBeenNthCalledWith(4, "mark_sync_completed", { profileId: "p1" });
    expect(invokeTypedCommandMock).toHaveBeenNthCalledWith(6, "list_sync_outbox", { profileId: "p1", limit: 25 });
    expect(invokeTypedCommandMock).toHaveBeenNthCalledWith(7, "list_sync_conflicts", { limit: 20 });
    expect(invokeTypedCommandMock).toHaveBeenNthCalledWith(8, "ack_sync_mutations", { profileId: "p1", acks: [ack] });
    expect(invokeTypedCommandMock).toHaveBeenNthCalledWith(9, "rebase_sync_conflicts", {
      profileId: "p1",
      conflicts: [conflict],
    });
    expect(invokeTypedCommandMock).toHaveBeenNthCalledWith(10, "apply_remote_sync_changes", {
      profileId: "p1",
      changes: [change],
    });
  });
});
