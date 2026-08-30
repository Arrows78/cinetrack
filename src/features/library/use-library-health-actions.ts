import { libraryInvalidationKeys } from "@/features/library/use-library";
import { libraryRepository } from "@/features/library/library-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import type { LibraryItem, LibraryStatus, MediaSummary } from "@/types/media";

// LibraryItem carries every field a fresh MediaSummary needs *except*
// overview/cast — library_items has no such columns (see
// 001-initial-schema.sql), so upsert_impl never reads them back. Placeholder
// values here are harmless: they're only ever round-tripped through this
// one insert, never displayed.
function toMediaSummary(item: LibraryItem): MediaSummary {
  return {
    id: item.mediaId,
    mediaType: item.mediaType,
    title: item.title,
    overview: "",
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    year: item.year,
    rating: item.rating,
    genres: item.genres,
    cast: [],
  };
}

/**
 * Bulk mutations for the Library Health Center — remove, restore (its
 * session-only undo), and status changes across a caller-selected batch of
 * items. Each already exists as a per-item repository call
 * (libraryRepository.remove/save); this only adds the Promise.all fan-out
 * and the shared invalidation list every other library mutation uses.
 */
export function useLibraryHealthActions() {
  const profileId = useActiveProfileId();
  const invalidateKeys = libraryInvalidationKeys(profileId);

  const bulkRemove = useInvalidatingMutation(
    (items: LibraryItem[]) => Promise.all(items.map((item) => libraryRepository.remove(item.mediaId, item.mediaType))),
    invalidateKeys
  );

  // Undo for bulkRemove — recreates each item via the normal save() upsert.
  // The restored row gets a fresh uuid/createdAt (server-assigned), which is
  // invisible to the user in a same-session "oops, undo" flow.
  const bulkRestore = useInvalidatingMutation(
    (items: LibraryItem[]) =>
      Promise.all(
        items.map((item) =>
          libraryRepository.save(toMediaSummary(item), {
            status: item.status,
            favourite: item.favourite,
            userRating: item.userRating,
            notes: item.notes,
            tags: item.tags,
            rewatchCount: item.rewatchCount,
          })
        )
      ),
    invalidateKeys
  );

  const bulkSetStatus = useInvalidatingMutation(
    ({ items, status }: { items: LibraryItem[]; status: LibraryStatus }) =>
      Promise.all(items.map((item) => libraryRepository.save(toMediaSummary(item), { status }))),
    invalidateKeys
  );

  // Undo for bulkSetStatus — same call, replaying each item's own prior
  // status instead of one status for the whole batch.
  const bulkRestoreStatus = useInvalidatingMutation(
    (items: LibraryItem[]) =>
      Promise.all(items.map((item) => libraryRepository.save(toMediaSummary(item), { status: item.status }))),
    invalidateKeys
  );

  return {
    remove: bulkRemove.mutateAsync,
    restore: bulkRestore.mutateAsync,
    setStatus: (items: LibraryItem[], status: LibraryStatus) => bulkSetStatus.mutateAsync({ items, status }),
    restoreStatus: bulkRestoreStatus.mutateAsync,
    isApplying: bulkRemove.isPending || bulkRestore.isPending || bulkSetStatus.isPending || bulkRestoreStatus.isPending,
  };
}
