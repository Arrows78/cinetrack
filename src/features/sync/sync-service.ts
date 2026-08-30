import type { QueryClient } from "@tanstack/react-query";

import { getAuthClient } from "@/features/auth";
import { logger } from "@/shared/lib/logger";
import { isTauriApp } from "@/shared/lib/platform";

import { syncRepository } from "./sync-repository";
import type { RemoteSyncChange, SyncBatchResult, SyncRunResult } from "./sync-types";
import { SYNC_BATCH_SIZE, SYNC_PULL_SIZE } from "./sync-types";

const PERIODIC_SYNC_MS = 5 * 60 * 1000;
const MAX_PUSH_ROUNDS = 20;

let running: Promise<SyncRunResult> | null = null;

async function requireSession() {
  const client = await getAuthClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) return null;
  return { client, session: data.session };
}

async function pushOutbox(): Promise<{ pushed: number; conflicts: number }> {
  const auth = await requireSession();
  if (!auth) return { pushed: 0, conflicts: 0 };
  const deviceId = await syncRepository.getDeviceId();
  let pushed = 0;
  let conflicts = 0;

  for (let round = 0; round < MAX_PUSH_ROUNDS; round += 1) {
    const mutations = await syncRepository.listOutbox(SYNC_BATCH_SIZE);
    if (mutations.length === 0) break;

    const { data, error } = await auth.client.rpc("apply_sync_batch", {
      p_device_id: deviceId,
      p_mutations: mutations,
    });
    if (error) throw error;

    const result = data as unknown as SyncBatchResult;
    const acks = result.acks ?? [];
    const batchConflicts = result.conflicts ?? [];
    if (acks.length > 0) {
      await syncRepository.ack(acks);
      pushed += acks.length;
    }
    if (batchConflicts.length > 0) {
      // Deterministic local-pending-wins policy: the native outbox keeps the
      // local payload and only rebases its baseVersion, then the next round
      // retries against the version that caused the conflict.
      await syncRepository.rebase(batchConflicts);
      conflicts += batchConflicts.length;
    }

    if (acks.length === 0 && batchConflicts.length === 0) {
      throw new Error("Sync server made no progress for a non-empty batch");
    }
  }

  return { pushed, conflicts };
}

async function pullChanges(): Promise<number> {
  const auth = await requireSession();
  if (!auth) return 0;
  let pulled = 0;

  for (;;) {
    const cursor = await syncRepository.getCursor();
    const { data, error } = await auth.client.rpc("pull_sync_changes", {
      p_after: cursor,
      p_limit: SYNC_PULL_SIZE,
    });
    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<{
      sequence: number;
      entity_type: string;
      entity_id: string;
      operation: "upsert" | "delete";
      version: number;
      data: unknown | null;
      created_at: string;
    }>;
    if (rows.length === 0) break;

    const changes: RemoteSyncChange[] = rows.map((row) => ({
      sequence: row.sequence,
      entityType: row.entity_type,
      entityId: row.entity_id,
      operation: row.operation,
      version: row.version,
      data: row.data,
      createdAt: row.created_at,
    }));
    await syncRepository.applyRemote(changes);
    pulled += changes.length;
    if (changes.length < SYNC_PULL_SIZE) break;
  }

  return pulled;
}

async function execute(queryClient?: QueryClient): Promise<SyncRunResult> {
  if (!isTauriApp() || !navigator.onLine) return { pushed: 0, pulled: 0, conflicts: 0 };
  const auth = await requireSession();
  if (!auth) return { pushed: 0, pulled: 0, conflicts: 0 };

  await syncRepository.prepare();
  const firstPush = await pushOutbox();
  const pulled = await pullChanges();
  // A pull may have rebased pending local edits onto a newer remote version.
  // Flush them now instead of waiting for the next periodic wake-up.
  const secondPush = await pushOutbox();

  if (pulled > 0) {
    await queryClient?.invalidateQueries({ queryKey: ["local"] });
  }

  const result = {
    pushed: firstPush.pushed + secondPush.pushed,
    pulled,
    conflicts: firstPush.conflicts + secondPush.conflicts,
  };
  logger.info(`cloud.sync pushed=${result.pushed} pulled=${result.pulled} conflicts=${result.conflicts}`);
  return result;
}

function run(queryClient?: QueryClient): Promise<SyncRunResult> {
  running ??= execute(queryClient).finally(() => {
    running = null;
  });
  return running;
}

export const syncService = {
  run,

  async initialize(queryClient: QueryClient): Promise<(() => void) | undefined> {
    if (!isTauriApp()) return undefined;
    const auth = await requireSession();
    if (!auth) return undefined;

    let debounce: number | undefined;
    const wake = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void run(queryClient).catch((error: unknown) => logger.warn(`Cloud sync failed: ${String(error)}`));
      }, 250);
    };

    window.addEventListener("online", wake);
    const timer = window.setInterval(wake, PERIODIC_SYNC_MS);

    // Realtime is deliberately not the transport. Missing this notification
    // while the app sleeps/offline is harmless because pull_sync_changes is
    // cursor-based and durable.
    const channel = auth.client
      .channel(`cinetrack-sync-${auth.session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sync_changes",
          filter: `user_id=eq.${auth.session.user.id}`,
        },
        wake
      )
      .subscribe();

    await run(queryClient);

    return () => {
      window.removeEventListener("online", wake);
      window.clearInterval(timer);
      window.clearTimeout(debounce);
      void auth.client.removeChannel(channel);
    };
  },
};
