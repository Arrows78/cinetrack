import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDataClient: vi.fn(),
  getCurrentUserId: vi.fn(),
  isTauriApp: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  getDeviceId: vi.fn(),
  prepare: vi.fn(),
  getStatus: vi.fn(),
  markCompleted: vi.fn(),
  getCursor: vi.fn(),
  listOutbox: vi.fn(),
  ack: vi.fn(),
  rebase: vi.fn(),
  applyRemote: vi.fn(),
}));

vi.mock("@/shared/lib/supabase-data-client", () => ({
  getDataClient: () => mocks.getDataClient(),
  getCurrentUserId: () => mocks.getCurrentUserId(),
}));
vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => mocks.isTauriApp() }));
vi.mock("@/shared/lib/logger", () => ({
  logger: {
    info: (...args: unknown[]) => mocks.loggerInfo(...args),
    warn: (...args: unknown[]) => mocks.loggerWarn(...args),
  },
}));
vi.mock("@/features/sync/sync-repository", () => ({
  syncRepository: {
    getDeviceId: (...args: unknown[]) => mocks.getDeviceId(...args),
    prepare: (...args: unknown[]) => mocks.prepare(...args),
    getStatus: (...args: unknown[]) => mocks.getStatus(...args),
    markCompleted: (...args: unknown[]) => mocks.markCompleted(...args),
    getCursor: (...args: unknown[]) => mocks.getCursor(...args),
    listOutbox: (...args: unknown[]) => mocks.listOutbox(...args),
    ack: (...args: unknown[]) => mocks.ack(...args),
    rebase: (...args: unknown[]) => mocks.rebase(...args),
    applyRemote: (...args: unknown[]) => mocks.applyRemote(...args),
  },
}));

import { syncService } from "@/features/sync/sync-service";

const mutation = {
  mutationId: "m1",
  entityType: "library_item",
  entityId: "item-1",
  operation: "upsert" as const,
  payload: { uuid: "item-1" },
  baseVersion: 0,
  createdAt: "2026-08-30T20:00:00.000Z",
  attemptCount: 0,
};

function makeClient() {
  let realtimeWake: (() => void) | undefined;
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, _config: unknown, callback: () => void) => {
      realtimeWake = callback;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  const client = {
    rpc: vi.fn(),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn().mockResolvedValue(undefined),
  };
  return { client, channel, wake: () => realtimeWake?.() };
}

function queryClientMock() {
  return { invalidateQueries: vi.fn().mockResolvedValue(undefined) } as unknown as QueryClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  mocks.isTauriApp.mockReturnValue(true);
  mocks.getCurrentUserId.mockReturnValue("user_1");
  mocks.getDeviceId.mockResolvedValue("device-1");
  mocks.prepare.mockResolvedValue("profile-1");
  mocks.getStatus.mockResolvedValue({
    deviceId: "device-1",
    cursor: 0,
    pendingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    lastSyncedAt: null,
  });
  mocks.markCompleted.mockResolvedValue(undefined);
  mocks.getCursor.mockResolvedValue(0);
  mocks.listOutbox.mockResolvedValue([]);
  mocks.ack.mockResolvedValue(undefined);
  mocks.rebase.mockResolvedValue(undefined);
  mocks.applyRemote.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("syncService.run", () => {
  it("is a no-op outside Tauri or while offline", async () => {
    mocks.isTauriApp.mockReturnValue(false);
    await expect(syncService.run()).resolves.toEqual({ pushed: 0, pulled: 0, conflicts: 0 });
    expect(mocks.getDataClient).not.toHaveBeenCalled();

    mocks.isTauriApp.mockReturnValue(true);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(syncService.run()).resolves.toEqual({ pushed: 0, pulled: 0, conflicts: 0 });
  });

  it("is a no-op when Supabase or the current Clerk user id is unavailable", async () => {
    mocks.getDataClient.mockResolvedValueOnce(null);
    await expect(syncService.run()).resolves.toEqual({ pushed: 0, pulled: 0, conflicts: 0 });

    const { client } = makeClient();
    mocks.getDataClient.mockResolvedValue(client);
    mocks.getCurrentUserId.mockReturnValueOnce(null);
    await expect(syncService.run()).resolves.toEqual({ pushed: 0, pulled: 0, conflicts: 0 });
  });

  it("pushes, pulls, applies remote changes and invalidates local queries", async () => {
    const { client } = makeClient();
    mocks.getDataClient.mockResolvedValue(client);
    mocks.listOutbox.mockResolvedValueOnce([mutation]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    client.rpc.mockImplementation(async (name: string) => {
      if (name === "apply_sync_batch") {
        return {
          data: {
            acks: [{ mutationId: "m1", entityType: "library_item", entityId: "item-1", version: 1 }],
            conflicts: [],
            cursor: 1,
          },
          error: null,
        };
      }
      return {
        data: [
          {
            sequence: 2,
            entity_type: "library_item",
            entity_id: "remote-1",
            operation: "upsert",
            version: 3,
            data: { uuid: "remote-1" },
            created_at: "2026-08-30T20:01:00.000Z",
          },
        ],
        error: null,
      };
    });
    const queryClient = queryClientMock();

    await expect(syncService.run(queryClient)).resolves.toEqual({ pushed: 1, pulled: 1, conflicts: 0 });
    expect(mocks.ack).toHaveBeenCalledTimes(1);
    expect(mocks.applyRemote).toHaveBeenCalledWith("profile-1", [
      expect.objectContaining({ sequence: 2, entityType: "library_item", entityId: "remote-1", version: 3 }),
    ]);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["local"] });
    expect(mocks.loggerInfo).toHaveBeenCalledWith("cloud.sync pushed=1 pulled=1 conflicts=0");
    expect(mocks.markCompleted).toHaveBeenCalledTimes(1);
  });

  it("records completion even when nothing was pushed or pulled", async () => {
    const { client } = makeClient();
    mocks.getDataClient.mockResolvedValue(client);
    mocks.listOutbox.mockResolvedValue([]);
    client.rpc.mockResolvedValue({ data: [], error: null });

    await expect(syncService.run()).resolves.toEqual({ pushed: 0, pulled: 0, conflicts: 0 });
    expect(mocks.markCompleted).toHaveBeenCalledTimes(1);
  });

  it("rebases optimistic conflicts and retries them", async () => {
    const { client } = makeClient();
    mocks.getDataClient.mockResolvedValue(client);
    mocks.listOutbox
      .mockResolvedValueOnce([mutation])
      .mockResolvedValueOnce([mutation])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    let applyCall = 0;
    client.rpc.mockImplementation(async (name: string) => {
      if (name === "pull_sync_changes") return { data: [], error: null };
      applyCall += 1;
      if (applyCall === 1) {
        return {
          data: {
            acks: [],
            conflicts: [{ mutationId: "m1", entityType: "library_item", entityId: "item-1", serverVersion: 8 }],
            cursor: 8,
          },
          error: null,
        };
      }
      return {
        data: {
          acks: [{ mutationId: "m1", entityType: "library_item", entityId: "item-1", version: 9 }],
          conflicts: [],
          cursor: 9,
        },
        error: null,
      };
    });

    await expect(syncService.run()).resolves.toEqual({ pushed: 1, pulled: 0, conflicts: 1 });
    expect(mocks.rebase).toHaveBeenCalledWith("profile-1", [
      expect.objectContaining({ mutationId: "m1", entityId: "item-1", serverVersion: 8 }),
    ]);
  });

  it("rejects a non-empty batch when the server makes no progress", async () => {
    const { client } = makeClient();
    mocks.getDataClient.mockResolvedValue(client);
    mocks.listOutbox.mockResolvedValueOnce([mutation]);
    client.rpc.mockResolvedValue({ data: { acks: [], conflicts: [], cursor: 0 }, error: null });

    await expect(syncService.run()).rejects.toThrow("Sync server made no progress");
  });

  it("propagates remote pull errors", async () => {
    const { client } = makeClient();
    mocks.getDataClient.mockResolvedValue(client);
    mocks.listOutbox.mockResolvedValue([]);
    const failure = new Error("pull failed");
    client.rpc.mockResolvedValue({ data: null, error: failure });

    await expect(syncService.run()).rejects.toBe(failure);
  });

  it("binds every step to the profile Rust agreed to sync, for the signed-in account", async () => {
    const { client } = makeClient();
    mocks.getDataClient.mockResolvedValue(client);
    mocks.listOutbox.mockResolvedValueOnce([mutation]).mockResolvedValue([]);
    client.rpc.mockImplementation(async (name: string) =>
      name === "apply_sync_batch"
        ? {
            data: {
              acks: [{ mutationId: "m1", entityType: "library_item", entityId: "item-1", version: 1 }],
              conflicts: [],
              cursor: 1,
            },
            error: null,
          }
        : { data: [], error: null }
    );

    await syncService.run();

    expect(mocks.prepare).toHaveBeenCalledWith("user_1");
    expect(mocks.listOutbox).toHaveBeenCalledWith("profile-1", 100);
    expect(mocks.ack).toHaveBeenCalledWith("profile-1", expect.any(Array));
    expect(mocks.getCursor).toHaveBeenCalledWith("profile-1");
    expect(mocks.markCompleted).toHaveBeenCalledWith("profile-1");
  });

  it("does not touch the server when the active profile isn't the account's", async () => {
    const { client } = makeClient();
    mocks.getDataClient.mockResolvedValue(client);
    const refusal = new Error("Cloud sync only runs on the profile linked to the signed-in account.");
    mocks.prepare.mockRejectedValue(refusal);

    await expect(syncService.run()).rejects.toBe(refusal);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(mocks.listOutbox).not.toHaveBeenCalled();
    expect(mocks.applyRemote).not.toHaveBeenCalled();
  });

  it("keeps the mutation queued when the push fails, and delivers it on the next run", async () => {
    const { client } = makeClient();
    mocks.getDataClient.mockResolvedValue(client);
    mocks.listOutbox.mockResolvedValue([mutation]);
    const failure = new Error("network down");
    client.rpc.mockResolvedValueOnce({ data: null, error: failure });

    await expect(syncService.run()).rejects.toBe(failure);
    expect(mocks.ack).not.toHaveBeenCalled();
    expect(mocks.markCompleted).not.toHaveBeenCalled();

    // The same outbox row (same mutation id) is sent again: the server
    // dedupes by id, so a retry can never double-apply.
    mocks.listOutbox.mockReset().mockResolvedValueOnce([mutation]).mockResolvedValue([]);
    client.rpc.mockImplementation(async (name: string) =>
      name === "apply_sync_batch"
        ? {
            data: {
              acks: [
                { mutationId: "m1", entityType: "library_item", entityId: "item-1", version: 1, deduplicated: true },
              ],
              conflicts: [],
              cursor: 1,
            },
            error: null,
          }
        : { data: [], error: null }
    );
    await expect(syncService.run()).resolves.toEqual({ pushed: 1, pulled: 0, conflicts: 0 });
    const sent = client.rpc.mock.calls.find(([name]) => name === "apply_sync_batch")?.[1] as {
      p_mutations: Array<{ mutationId: string }>;
    };
    expect(sent.p_mutations.map((entry) => entry.mutationId)).toEqual(["m1"]);
  });

  it("acknowledges the accepted mutations of a partially rejected batch and rebases only the conflicting one", async () => {
    const { client } = makeClient();
    mocks.getDataClient.mockResolvedValue(client);
    const other = { ...mutation, mutationId: "m2", entityId: "item-2" };
    mocks.listOutbox.mockResolvedValueOnce([mutation, other]).mockResolvedValueOnce([mutation]).mockResolvedValue([]);
    let batches = 0;
    client.rpc.mockImplementation(async (name: string) => {
      if (name !== "apply_sync_batch") return { data: [], error: null };
      batches += 1;
      return {
        data:
          batches === 1
            ? {
                acks: [{ mutationId: "m2", entityType: "library_item", entityId: "item-2", version: 1 }],
                conflicts: [{ mutationId: "m1", entityType: "library_item", entityId: "item-1", serverVersion: 4 }],
                cursor: 4,
              }
            : {
                acks: [{ mutationId: "m1", entityType: "library_item", entityId: "item-1", version: 5 }],
                conflicts: [],
                cursor: 5,
              },
        error: null,
      };
    });

    await expect(syncService.run()).resolves.toEqual({ pushed: 2, pulled: 0, conflicts: 1 });
    expect(mocks.ack).toHaveBeenNthCalledWith(1, "profile-1", [expect.objectContaining({ mutationId: "m2" })]);
    expect(mocks.rebase).toHaveBeenCalledWith("profile-1", [expect.objectContaining({ mutationId: "m1" })]);
  });

  it("stops pulling when a full page doesn't move the cursor", async () => {
    const { client } = makeClient();
    mocks.getDataClient.mockResolvedValue(client);
    mocks.listOutbox.mockResolvedValue([]);
    const page = Array.from({ length: 200 }, (_, index) => ({
      sequence: index + 1,
      entity_type: "entity_from_a_newer_app",
      entity_id: `x${index}`,
      operation: "upsert",
      version: 1,
      data: {},
      created_at: "2026-08-30T20:01:00.000Z",
    }));
    client.rpc.mockResolvedValue({ data: page, error: null });
    // The native side never advances (e.g. an older build ignoring the page).
    mocks.getCursor.mockResolvedValue(0);

    await expect(syncService.run()).resolves.toMatchObject({ pulled: 200 });
    expect(mocks.applyRemote).toHaveBeenCalledTimes(1);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining("cursor stuck"));
  });
});

describe("syncService.initialize", () => {
  it("wires realtime/online wakeups and releases every resource", async () => {
    vi.useFakeTimers();
    const { client, channel, wake } = makeClient();
    mocks.getDataClient.mockResolvedValue(client);
    mocks.listOutbox.mockResolvedValue([]);
    client.rpc.mockResolvedValue({ data: [], error: null });
    const queryClient = queryClientMock();

    const cleanup = await syncService.initialize(queryClient);
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    expect(client.channel).toHaveBeenCalledWith("cinetrack-sync-user_1");

    wake();
    await vi.advanceTimersByTimeAsync(251);
    cleanup?.();

    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("wakes on visibilitychange when the document becomes visible again", async () => {
    vi.useFakeTimers();
    const { client } = makeClient();
    mocks.getDataClient.mockResolvedValue(client);
    mocks.listOutbox.mockResolvedValue([]);
    client.rpc.mockResolvedValue({ data: [], error: null });

    const cleanup = await syncService.initialize(queryClientMock());
    const callsBeforeResume = mocks.getDeviceId.mock.calls.length;

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(251);
    expect(mocks.getDeviceId.mock.calls.length).toBe(callsBeforeResume);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(251);
    expect(mocks.getDeviceId.mock.calls.length).toBeGreaterThan(callsBeforeResume);

    cleanup?.();
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(251);
  });

  it("still returns its cleanup when the first run fails, and logs the failure", async () => {
    const { client } = makeClient();
    mocks.getDataClient.mockResolvedValue(client);
    mocks.prepare.mockRejectedValue(new Error("profile not linked"));

    const cleanup = await syncService.initialize(queryClientMock());
    expect(typeof cleanup).toBe("function");
    expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining("profile not linked"));
    cleanup?.();
  });

  it("does not initialize outside Tauri or without a current Clerk user id", async () => {
    mocks.isTauriApp.mockReturnValue(false);
    await expect(syncService.initialize(queryClientMock())).resolves.toBeUndefined();

    mocks.isTauriApp.mockReturnValue(true);
    mocks.getDataClient.mockResolvedValue(null);
    await expect(syncService.initialize(queryClientMock())).resolves.toBeUndefined();
  });
});
