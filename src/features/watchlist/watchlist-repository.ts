import type { WatchlistItem } from "@/types/media";
import { invokeCommand } from "@/shared/lib/invoke";

// The upsert/remove transactions, history logging and active-profile
// resolution now live in Rust (see src-tauri/src/commands/watchlist.rs) —
// this repository is a thin invoke() wrapper.
export const watchlistRepository = {
  async list(): Promise<WatchlistItem[]> {
    return invokeCommand<WatchlistItem[]>("list_watchlist");
  },

  async has(mediaId: number, mediaType: WatchlistItem["mediaType"]): Promise<boolean> {
    return invokeCommand<boolean>("has_watchlist_item", { mediaId, mediaType });
  },

  async upsert(item: WatchlistItem): Promise<void> {
    await invokeCommand<void>("upsert_watchlist_item", { item });
  },

  async remove(mediaId: number, mediaType: WatchlistItem["mediaType"]): Promise<void> {
    await invokeCommand<void>("remove_watchlist_item", { mediaId, mediaType });
  },
};
