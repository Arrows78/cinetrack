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
    await syncRepository.prepare();
    await syncRepository.getStatus();
    await syncRepository.getCursor();
    await syncRepository.listOutbox(25);
    await syncRepository.ack([ack]);
    await syncRepository.rebase([conflict]);
    await syncRepository.applyRemote([change]);

    expect(invokeTypedCommandMock).toHaveBeenCalledTimes(8);
    expect(invokeTypedCommandMock).toHaveBeenNthCalledWith(5, "list_sync_outbox", { limit: 25 });
    expect(invokeTypedCommandMock).toHaveBeenNthCalledWith(6, "ack_sync_mutations", { acks: [ack] });
    expect(invokeTypedCommandMock).toHaveBeenNthCalledWith(7, "rebase_sync_conflicts", { conflicts: [conflict] });
    expect(invokeTypedCommandMock).toHaveBeenNthCalledWith(8, "apply_remote_sync_changes", { changes: [change] });
  });
});
