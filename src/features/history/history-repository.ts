import { historyCommands } from "@/features/history/history-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import type { ViewingHistoryItem } from "@/types/media";

// The activity_log upsert, profile scoping and profileId fallback logic now
// live in Rust (see src-tauri/src/commands/history.rs) — this repository is
// a thin invoke() wrapper.
export interface HistoryCursor {
  beforeTimestamp: string;
  beforeId: string;
}

export const historyRepository = {
  async list(limit = 50, before?: HistoryCursor): Promise<ViewingHistoryItem[]> {
    return invokeTypedCommand(historyCommands.list, {
      limit,
      beforeTimestamp: before?.beforeTimestamp,
      beforeId: before?.beforeId,
    });
  },
};
