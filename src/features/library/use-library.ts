import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { libraryRepository, type LibraryPageSort, type LibraryPatch } from "@/features/library/library-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import type { LibraryFilterParams, LibraryMediaKey, LibraryStatus, MediaSummary, MediaType } from "@/types/media";

export function useLibrary(options?: { enabled?: boolean; mediaType?: MediaType }) {
  const profileId = useActiveProfileId();
  const mediaType = options?.mediaType;
  return useQuery({
    queryKey: mediaType
      ? [...queryKeys.local.library(profileId), "mediaType", mediaType]
      : queryKeys.local.library(profileId),
    queryFn: () => libraryRepository.list(mediaType),
    enabled: options?.enabled ?? true,
  });
}

// A membership set only — for "am I already tracking this" style filters
// (recommendation rails excluding owned titles) that don't need full rows.
export function useLibraryMediaKeys() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: queryKeys.local.libraryMediaKeys(profileId),
    queryFn: () => libraryRepository.listMediaKeys(),
  });
}

// Batch lookup for a caller-bounded set of specific keys (a TMDB
// collection's parts, one custom list's items) — nested under the plain
// library() key (like useIsInLibrary below) so it's invalidated for free
// by every existing library-mutation site instead of needing its own
// entry added to each one.
export function useLibraryItemsByKeys(keys: LibraryMediaKey[]) {
  const profileId = useActiveProfileId();
  const signature = keys
    .map((key) => `${key.mediaType}:${key.mediaId}`)
    .sort()
    .join(",");
  return useQuery({
    queryKey: [...queryKeys.local.library(profileId), "byKeys", signature],
    queryFn: () => libraryRepository.getItemsByKeys(keys),
    enabled: keys.length > 0,
  });
}

// Ids matching a narrow set of purely-relational filters — see
// LibraryFilterParams' own doc comment for why this stays narrow (a
// SmartList's provider/episode-waiting/runtime rules are never among
// them). Nested under the plain library() key for the same reason as
// useLibraryItemsByKeys above.
export function useLibraryIdsMatchingFilters(filters: LibraryFilterParams) {
  const profileId = useActiveProfileId();
  const signature = `${filters.mediaType ?? ""}:${filters.status ?? ""}:${filters.genre ?? ""}:${filters.minRating ?? ""}`;
  return useQuery({
    queryKey: [...queryKeys.local.library(profileId), "idsMatchingFilters", signature],
    queryFn: () => libraryRepository.idsMatchingFilters(filters),
  });
}

const LIBRARY_PAGE_SIZE = 60;

export interface LibraryPageFilters {
  mediaType?: MediaType;
  status: LibraryStatus | "all";
  favouritesOnly: boolean;
  search: string;
  sort: LibraryPageSort;
}

// Cursor-paginated, server-filtered/sorted Library listing — backs the
// standalone /library page's default browse view (no custom-list or
// smart-list filter active), the one place that renders an unbounded,
// scrollable view of the whole library. See library-repository.ts's
// listPage doc comment for why every other Library consumer stays on the
// plain useLibrary() above instead.
export function useLibraryPage(filters: LibraryPageFilters, options?: { enabled?: boolean }) {
  const profileId = useActiveProfileId();
  const status = filters.status === "all" ? undefined : filters.status;
  const search = filters.search.trim() || undefined;

  return useInfiniteQuery({
    queryKey: [
      ...queryKeys.local.libraryPage(profileId),
      { mediaType: filters.mediaType, status, favouritesOnly: filters.favouritesOnly, search, sort: filters.sort },
    ],
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      libraryRepository.listPage({
        mediaType: filters.mediaType,
        status,
        favouritesOnly: filters.favouritesOnly,
        search,
        sort: filters.sort,
        cursor: pageParam,
        limit: LIBRARY_PAGE_SIZE,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
  });
}

export function useLibraryItem(media: MediaSummary) {
  const profileId = useActiveProfileId();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.local.libraryItem(profileId, media.mediaType, media.id),
    queryFn: () => libraryRepository.get(media.id, media.mediaType),
  });
  const save = useMutation({
    mutationFn: (patch: LibraryPatch) => libraryRepository.save(media, patch),
    onSuccess: async (item) => {
      queryClient.setQueryData(queryKeys.local.libraryItem(profileId, media.mediaType, media.id), item);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.local.library(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.libraryPage(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.stats(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.watchTonight(profileId) }),
        // Adding a movie to the library can flip its calendar entry from
        // "discovery" to "mine" on the tracking feed (see tracking-service.ts).
        queryClient.invalidateQueries({ queryKey: queryKeys.local.tracking(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.libraryMediaKeys(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.completedLibraryCandidates(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.bestRecommendationSeed(profileId) }),
      ]);
    },
  });
  const remove = useMutation({
    mutationFn: () => libraryRepository.remove(media.id, media.mediaType),
    onSuccess: async () => {
      queryClient.setQueryData(queryKeys.local.libraryItem(profileId, media.mediaType, media.id), null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.local.library(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.libraryPage(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.stats(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.watchTonight(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.tracking(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.libraryMediaKeys(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.completedLibraryCandidates(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.bestRecommendationSeed(profileId) }),
      ]);
    },
  });
  return { ...query, save: save.mutateAsync, remove: remove.mutateAsync, isSaving: save.isPending || remove.isPending };
}

export function useIsInLibrary(mediaId: number, mediaType: MediaSummary["mediaType"], options?: { enabled?: boolean }) {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: [...queryKeys.local.library(profileId), "has", mediaId, mediaType],
    queryFn: () => libraryRepository.has(mediaId, mediaType),
    enabled: options?.enabled ?? true,
    // Card quick actions are mounted by every visible grid item. Keep the
    // presence check warm for a short window so virtualization and route
    // transitions do not turn the same local lookup into repeated IPC calls.
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}

// Every query key a library mutation can move something out from under —
// shared so a new mutation site (see useLibraryHealthActions) reaches for
// this instead of retyping the list and risking it drifting from this one.
export function libraryInvalidationKeys(profileId: string) {
  return [
    queryKeys.local.library(profileId),
    queryKeys.local.libraryPage(profileId),
    queryKeys.local.history(profileId),
    queryKeys.local.stats(profileId),
    queryKeys.local.watchTonight(profileId),
    queryKeys.local.tracking(profileId),
    queryKeys.local.libraryMediaKeys(profileId),
    queryKeys.local.completedLibraryCandidates(profileId),
    queryKeys.local.bestRecommendationSeed(profileId),
  ];
}

// Backs the grid/detail-page quick "add to library" toggle — a lighter
// weight pair than useLibraryItem (no full LibraryItem fetch) matching the
// presence-only shape useIsInLibrary already provides for reads.
export function useLibraryQuickToggle() {
  const profileId = useActiveProfileId();
  const invalidateKeys = libraryInvalidationKeys(profileId);

  const addPlanned = useInvalidatingMutation(
    (media: MediaSummary) => libraryRepository.save(media, { status: "planned" }),
    invalidateKeys
  );
  const removeIfPlanned = useInvalidatingMutation(
    ({ mediaId, mediaType }: { mediaId: number; mediaType: MediaSummary["mediaType"] }) =>
      libraryRepository.removeIfPlanned(mediaId, mediaType),
    invalidateKeys
  );
  // The real, unguarded delete — used once removeIfPlanned reports the item
  // has real progress and the caller has confirmed discarding it anyway
  // (see useAddToLibraryToggle), never as a silent fallback.
  const forceRemove = useInvalidatingMutation(
    ({ mediaId, mediaType }: { mediaId: number; mediaType: MediaSummary["mediaType"] }) =>
      libraryRepository.remove(mediaId, mediaType),
    invalidateKeys
  );

  return {
    addPlanned: addPlanned.mutateAsync,
    removeIfPlanned: removeIfPlanned.mutateAsync,
    forceRemove: forceRemove.mutateAsync,
    isSaving: addPlanned.isPending || removeIfPlanned.isPending || forceRemove.isPending,
  };
}
