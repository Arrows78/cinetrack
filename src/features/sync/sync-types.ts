export type SyncOperation = "upsert" | "delete";

export type SyncOutboxMutation = {
  mutationId: string;
  entityType: string;
  entityId: string;
  operation: SyncOperation;
  payload: unknown | null;
  baseVersion: number;
  createdAt: string;
  attemptCount: number;
};

export type SyncMutationAck = {
  mutationId: string;
  entityType: string;
  entityId: string;
  version: number;
  sequence?: number;
  deduplicated?: boolean;
};

export type SyncConflict = {
  mutationId: string;
  entityType: string;
  entityId: string;
  serverVersion: number;
  serverDeleted?: boolean;
  serverData?: unknown;
};

export type RemoteSyncChange = {
  sequence: number;
  entityType: string;
  entityId: string;
  operation: SyncOperation;
  version: number;
  data: unknown | null;
  createdAt?: string;
};

export type SyncBatchResult = {
  acks: SyncMutationAck[];
  conflicts: SyncConflict[];
  cursor: number;
};

export type SyncStatus = {
  deviceId: string;
  cursor: number;
  pendingCount: number;
  failedCount: number;
};

export type SyncRunResult = {
  pushed: number;
  pulled: number;
  conflicts: number;
};

export const SYNC_BATCH_SIZE = 100;
export const SYNC_PULL_SIZE = 200;
