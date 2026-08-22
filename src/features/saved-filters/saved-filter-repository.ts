import { invokeCommand } from "@/shared/lib/invoke";
import type { SavedFilter, SavedFilterPage, SavedFilterState } from "@/types/media";

// Name validation, page validation, JSON-shape checks and active-profile
// resolution all live in Rust (see src-tauri/src/commands/saved_filters.rs)
// — this repository is a thin invoke() wrapper. Reopening a saved filter is
// entirely client-side: the caller just spreads `filters` back into the
// page's own state, there is no "apply"/"evaluate" command.
export const savedFilterRepository = {
  async list<TState extends SavedFilterState>(page: SavedFilterPage): Promise<Array<SavedFilter<TState>>> {
    return invokeCommand<Array<SavedFilter<TState>>>("list_saved_filters", { page });
  },

  async create<TState extends SavedFilterState>(
    page: SavedFilterPage,
    name: string,
    filters: TState
  ): Promise<SavedFilter<TState>> {
    return invokeCommand<SavedFilter<TState>>("create_saved_filter", { page, name, filters });
  },

  async remove(savedFilterId: string): Promise<void> {
    await invokeCommand<void>("remove_saved_filter", { savedFilterId });
  },
};
