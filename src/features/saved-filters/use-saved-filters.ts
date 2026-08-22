import { useQuery } from "@tanstack/react-query";
import { savedFilterRepository } from "@/features/saved-filters/saved-filter-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import type { SavedFilterPage, SavedFilterState } from "@/types/media";

/**
 * One page's list of saved filters, plus create/remove mutations. `page`
 * pins both the query key and the Rust-side scoping (see
 * src-tauri/src/commands/saved_filters.rs) so LibraryExplorer and SearchPage
 * each only ever see their own saved filters, never the other page's.
 *
 * Reapplying a saved filter is not a mutation here — it's just the caller
 * spreading `savedFilter.filters` into its own local state, entirely
 * client-side (see each page's own "apply" handler).
 */
export function useSavedFilters<TState extends SavedFilterState>(page: SavedFilterPage) {
  const profileId = useActiveProfileId();
  const query = useQuery({
    queryKey: queryKeys.local.savedFilters(profileId, page),
    queryFn: () => savedFilterRepository.list<TState>(page),
  });
  const create = useInvalidatingMutation(
    ({ name, filters }: { name: string; filters: TState }) => savedFilterRepository.create(page, name, filters),
    [queryKeys.local.savedFilters(profileId, page)]
  );
  const remove = useInvalidatingMutation(
    (savedFilterId: string) => savedFilterRepository.remove(savedFilterId),
    [queryKeys.local.savedFilters(profileId, page)]
  );
  return {
    ...query,
    create: create.mutateAsync,
    remove: remove.mutateAsync,
    isSaving: create.isPending || remove.isPending,
  };
}
