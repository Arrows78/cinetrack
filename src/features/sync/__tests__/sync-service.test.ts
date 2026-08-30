import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthClient: vi.fn(),
  isTauriApp: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  getDeviceId: vi.fn(),
  prepare: vi.fn(),
  getStatus: vi.fn(),
  getCursor: vi.fn(),
  listOutbox: vi.fn(),
  ack: vi.fn(),
  rebase: vi.fn(),
  applyRemote: vi.fn(),
}));

vi.mock("@/features/auth", () => ({ getAuthClient: () => mocks.getAuthClient() }));
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
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-1" } } }, error: null }),
    },
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
  mocks.getDeviceId.mockResolvedValue("device-1");
  mocks.prepare.mockResolvedValue(undefined);
  mocks.getStatus.mockResolvedValue({ deviceId: "device-1", cursor: 0, pendingCount: 0, failedCount: 0 });
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
    expect(mocks.getAuthClient).not.toHaveBeenCalled();

    mocks.isTauriApp.mockReturnValue(true);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(syncService.run()).resolves.toEqual({ pushed: 0, pulled: 0, conflicts: 0 });
  });

  it("is a no-op when Supabase or a session is unavailable", async () => {
    mocks.getAuthClient.mockResolvedValueOnce(null);
    await expect(syncService.run()).resolves.toEqual({ pushed: 0, pulled: 0, conflicts: 0 });

    const { client } = makeClient();
    client.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    mocks.getAuthClient.mockResolvedValue(client);
    await expect(syncService.run()).resolves.toEqual({ pushed: 0, pulled: 0, conflicts: 0 });
  });

  it("propagates session lookup failures", async () => {
    const { client } = makeClient();
    const failure = new Error("session failed");
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error: failure });
    mocks.getAuthClient.mockResolvedValue(client);

    await expect(syncService.run()).rejects.toBe(failure);
  });

  it("pushes, pulls, applies remote changes and invalidates local queries", async () => {
    const { client } = makeClient();
    mocks.getAuthClient.mockResolvedValue(client);
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
    expect(mocks.applyRemote).toHaveBeenCalledWith([
      expect.objectContaining({ sequence: 2, entityType: "library_item", entityId: "remote-1", version: 3 }),
    ]);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["local"] });
    expect(mocks.loggerInfo).toHaveBeenCalledWith("cloud.sync pushed=1 pulled=1 conflicts=0");
  });

  it("rebases optimistic conflicts and retries them", async () => {
    const { client } = makeClient();
    mocks.getAuthClient.mockResolvedValue(client);
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
    expect(mocks.rebase).toHaveBeenCalledWith([
      expect.objectContaining({ mutationId: "m1", entityId: "item-1", serverVersion: 8 }),
    ]);
  });

  it("rejects a non-empty batch when the server makes no progress", async () => {
    const { client } = makeClient();
    mocks.getAuthClient.mockResolvedValue(client);
    mocks.listOutbox.mockResolvedValueOnce([mutation]);
    client.rpc.mockResolvedValue({ data: { acks: [], conflicts: [], cursor: 0 }, error: null });

    await expect(syncService.run()).rejects.toThrow("Sync server made no progress");
  });

  it("propagates remote pull errors", async () => {
    const { client } = makeClient();
    mocks.getAuthClient.mockResolvedValue(client);
    mocks.listOutbox.mockResolvedValue([]);
    const failure = new Error("pull failed");
    client.rpc.mockResolvedValue({ data: null, error: failure });

    await expect(syncService.run()).rejects.toBe(failure);
  });
});

describe("syncService.initialize", () => {
  it("wires realtime/online wakeups and releases every resource", async () => {
    vi.useFakeTimers();
    const { client, channel, wake } = makeClient();
    mocks.getAuthClient.mockResolvedValue(client);
    mocks.listOutbox.mockResolvedValue([]);
    client.rpc.mockResolvedValue({ data: [], error: null });
    const queryClient = queryClientMock();

    const cleanup = await syncService.initialize(queryClient);
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    expect(client.channel).toHaveBeenCalledWith("cinetrack-sync-user-1");

    wake();
    await vi.advanceTimersByTimeAsync(251);
    cleanup?.();

    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("does not initialize outside Tauri or without an authenticated client", async () => {
    mocks.isTauriApp.mockReturnValue(false);
    await expect(syncService.initialize(queryClientMock())).resolves.toBeUndefined();

    mocks.isTauriApp.mockReturnValue(true);
    mocks.getAuthClient.mockResolvedValue(null);
    await expect(syncService.initialize(queryClientMock())).resolves.toBeUndefined();
  });
});
