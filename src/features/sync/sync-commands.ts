import { defineCommand } from "@/shared/lib/invoke";

import type {
  RemoteSyncChange,
  SyncConflict,
  SyncConflictDetail,
  SyncMutationAck,
  SyncOutboxMutation,
  SyncStatus,
} from "./sync-types";

// Every step of a run after `prepare` names the profile `prepare` returned:
// Rust refuses the call if the active profile changed in between.
type PrepareArgs = { supabaseUserId: string };
type RunArgs = { profileId: string };
type OutboxArgs = RunArgs & { limit?: number };
type LimitArgs = { limit?: number };
type AckArgs = RunArgs & { acks: SyncMutationAck[] };
type ConflictArgs = RunArgs & { conflicts: SyncConflict[] };
type RemoteArgs = RunArgs & { changes: RemoteSyncChange[] };

export const syncCommands = {
  deviceId: defineCommand<undefined, string>("get_sync_device_id"),
  prepare: defineCommand<PrepareArgs, string>("prepare_sync"),
  status: defineCommand<undefined, SyncStatus>("get_sync_status"),
  cursor: defineCommand<RunArgs, number>("get_sync_cursor"),
  markCompleted: defineCommand<RunArgs, void>("mark_sync_completed"),
  outbox: defineCommand<OutboxArgs, SyncOutboxMutation[]>("list_sync_outbox"),
  conflicts: defineCommand<LimitArgs, SyncConflictDetail[]>("list_sync_conflicts"),
  ack: defineCommand<AckArgs, void>("ack_sync_mutations"),
  rebase: defineCommand<ConflictArgs, void>("rebase_sync_conflicts"),
  applyRemote: defineCommand<RemoteArgs, void>("apply_remote_sync_changes"),
} as const;
