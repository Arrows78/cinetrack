import { historyCommands } from "@/features/history/history-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import type { ViewingHistoryItem } from "@/types/media";

// The activity_log upsert, profile scoping and profileId fallback logic now
// live in Rust (see src-tauri/src/history/) — this repository is
// a thin invoke() wrapper.
export interface HistoryCursor {
  beforeTimestamp: string;
  beforeId: string;
}

export interface HistoryFilters {
  search?: string;
  /** Inclusive ISO timestamp bounds — same semantics as the Rust side's HistoryFilters. */
  from?: string;
  to?: string;
}

export const historyRepository = {
  async list(limit = 50, before?: HistoryCursor, filters?: HistoryFilters): Promise<ViewingHistoryItem[]> {
    return invokeTypedCommand(historyCommands.list, {
      limit,
      beforeTimestamp: before?.beforeTimestamp,
      beforeId: before?.beforeId,
      search: filters?.search,
      from: filters?.from,
      to: filters?.to,
    });
  },
};
