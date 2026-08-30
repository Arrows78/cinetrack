import { invokeTypedCommand } from "@/shared/lib/invoke";

import { syncCommands } from "./sync-commands";
import type { RemoteSyncChange, SyncConflict, SyncMutationAck } from "./sync-types";

export const syncRepository = {
  getDeviceId() {
    return invokeTypedCommand(syncCommands.deviceId);
  },

  prepare() {
    return invokeTypedCommand(syncCommands.prepare);
  },

  getStatus() {
    return invokeTypedCommand(syncCommands.status);
  },

  getCursor() {
    return invokeTypedCommand(syncCommands.cursor);
  },

  listOutbox(limit: number) {
    return invokeTypedCommand(syncCommands.outbox, { limit });
  },

  ack(acks: SyncMutationAck[]) {
    return invokeTypedCommand(syncCommands.ack, { acks });
  },

  rebase(conflicts: SyncConflict[]) {
    return invokeTypedCommand(syncCommands.rebase, { conflicts });
  },

  applyRemote(changes: RemoteSyncChange[]) {
    return invokeTypedCommand(syncCommands.applyRemote, { changes });
  },
};
