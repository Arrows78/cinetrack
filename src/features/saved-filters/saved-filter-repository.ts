import { savedFilterCommands } from "@/features/saved-filters/saved-filter-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import type { SavedFilter, SavedFilterPage, SavedFilterState } from "@/types/media";

// Name validation, page validation, JSON-shape checks and active-profile
// resolution all live in Rust (see src-tauri/src/commands/saved_filters.rs)
// — this repository is a thin invoke() wrapper. Reopening a saved filter is
// entirely client-side: the caller just spreads `filters` back into the
// page's own state, there is no "apply"/"evaluate" command.
export const savedFilterRepository = {
  async list<TState extends SavedFilterState>(page: SavedFilterPage): Promise<Array<SavedFilter<TState>>> {
    return invokeTypedCommand(savedFilterCommands.list<TState>(), { page });
  },

  async create<TState extends SavedFilterState>(
    page: SavedFilterPage,
    name: string,
    filters: TState
  ): Promise<SavedFilter<TState>> {
    return invokeTypedCommand(savedFilterCommands.create<TState>(), { page, name, filters });
  },

  async remove(savedFilterId: string): Promise<void> {
    await invokeTypedCommand(savedFilterCommands.remove, { savedFilterId });
  },
};
