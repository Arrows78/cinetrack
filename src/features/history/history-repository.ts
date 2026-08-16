import type { ViewingHistoryItem } from "@/types/media";
import { invokeCommand } from "@/shared/lib/invoke";

// The activity_log upsert, profile scoping and profileId fallback logic now
// live in Rust (see src-tauri/src/commands/history.rs) — this repository is
// a thin invoke() wrapper.
export interface HistoryCursor {
  beforeTimestamp: string;
  beforeId: string;
}

export const historyRepository = {
  async list(limit = 50, before?: HistoryCursor): Promise<ViewingHistoryItem[]> {
    return invokeCommand<ViewingHistoryItem[]>("list_history", {
      limit,
      beforeTimestamp: before?.beforeTimestamp,
      beforeId: before?.beforeId,
    });
  },
};
