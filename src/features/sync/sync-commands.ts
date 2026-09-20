import { defineCommand } from "@/shared/lib/invoke";

import type {
  RemoteSyncChange,
  SyncConflict,
  SyncConflictDetail,
  SyncMutationAck,
  SyncOutboxMutation,
  SyncStatus,
} from "./sync-types";

type LimitArgs = { limit?: number };
type AckArgs = { acks: SyncMutationAck[] };
type ConflictArgs = { conflicts: SyncConflict[] };
type RemoteArgs = { changes: RemoteSyncChange[] };

export const syncCommands = {
  deviceId: defineCommand<undefined, string>("get_sync_device_id"),
  prepare: defineCommand<undefined, void>("prepare_sync"),
  status: defineCommand<undefined, SyncStatus>("get_sync_status"),
  cursor: defineCommand<undefined, number>("get_sync_cursor"),
  markCompleted: defineCommand<undefined, void>("mark_sync_completed"),
  outbox: defineCommand<LimitArgs, SyncOutboxMutation[]>("list_sync_outbox"),
  conflicts: defineCommand<LimitArgs, SyncConflictDetail[]>("list_sync_conflicts"),
  ack: defineCommand<AckArgs, void>("ack_sync_mutations"),
  rebase: defineCommand<ConflictArgs, void>("rebase_sync_conflicts"),
  applyRemote: defineCommand<RemoteArgs, void>("apply_remote_sync_changes"),
} as const;
