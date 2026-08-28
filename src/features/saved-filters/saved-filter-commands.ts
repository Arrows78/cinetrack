import { defineCommand } from "@/shared/lib/invoke";
import type { SavedFilter, SavedFilterPage, SavedFilterState } from "@/types/media";

type ListSavedFiltersArgs = {
  page: SavedFilterPage;
};

type CreateSavedFilterArgs<TState extends SavedFilterState> = {
  page: SavedFilterPage;
  name: string;
  filters: TState;
};

type RemoveSavedFilterArgs = {
  savedFilterId: string;
};

export const savedFilterCommands = {
  list: <TState extends SavedFilterState>() =>
    defineCommand<ListSavedFiltersArgs, Array<SavedFilter<TState>>>("list_saved_filters"),
  create: <TState extends SavedFilterState>() =>
    defineCommand<CreateSavedFilterArgs<TState>, SavedFilter<TState>>("create_saved_filter"),
  remove: defineCommand<RemoveSavedFilterArgs, void>("remove_saved_filter"),
} as const;
