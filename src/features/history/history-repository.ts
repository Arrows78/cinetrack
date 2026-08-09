import type { ViewingHistoryItem } from "@/types/media";
import { invokeCommand } from "@/shared/lib/invoke";

// The activity_log upsert, profile scoping and profileId fallback logic now
// live in Rust (see src-tauri/src/commands/history.rs) — this repository is
// a thin invoke() wrapper.
export const historyRepository = {
  async list(limit = 50): Promise<ViewingHistoryItem[]> {
    return invokeCommand<ViewingHistoryItem[]>("list_history", { limit });
  },
};
