import { invokeTypedCommand } from "@/shared/lib/invoke";

import { syncCommands } from "./sync-commands";
import type { RemoteSyncChange, SyncConflict, SyncConflictDetail, SyncMutationAck } from "./sync-types";

export const syncRepository = {
  getDeviceId() {
    return invokeTypedCommand(syncCommands.deviceId);
  },

  /** Binds a run to the active profile once Rust confirmed it is the one linked to `supabaseUserId`; returns its id. */
  prepare(supabaseUserId: string) {
    return invokeTypedCommand(syncCommands.prepare, { supabaseUserId });
  },

  getStatus() {
    return invokeTypedCommand(syncCommands.status);
  },

  markCompleted(profileId: string) {
    return invokeTypedCommand(syncCommands.markCompleted, { profileId });
  },

  getCursor(profileId: string) {
    return invokeTypedCommand(syncCommands.cursor, { profileId });
  },

  listOutbox(profileId: string, limit: number) {
    return invokeTypedCommand(syncCommands.outbox, { profileId, limit });
  },

  listConflicts(limit: number): Promise<SyncConflictDetail[]> {
    return invokeTypedCommand(syncCommands.conflicts, { limit });
  },

  ack(profileId: string, acks: SyncMutationAck[]) {
    return invokeTypedCommand(syncCommands.ack, { profileId, acks });
  },

  rebase(profileId: string, conflicts: SyncConflict[]) {
    return invokeTypedCommand(syncCommands.rebase, { profileId, conflicts });
  },

  applyRemote(profileId: string, changes: RemoteSyncChange[]) {
    return invokeTypedCommand(syncCommands.applyRemote, { profileId, changes });
  },
};
