import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { libraryRepository, type LibraryPatch } from "@/features/library/library-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import type { MediaSummary } from "@/types/media";

export function useLibrary() {
  const profileId = useActiveProfileId();
  return useQuery({ queryKey: queryKeys.local.library(profileId), queryFn: () => libraryRepository.list() });
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
        queryClient.invalidateQueries({ queryKey: queryKeys.local.stats(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.watchTonight(profileId) }),
      ]);
    },
  });
  const remove = useMutation({
    mutationFn: () => libraryRepository.remove(media.id, media.mediaType),
    onSuccess: async () => {
      queryClient.setQueryData(queryKeys.local.libraryItem(profileId, media.mediaType, media.id), null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.local.library(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.stats(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.watchTonight(profileId) }),
      ]);
    },
  });
  return { ...query, save: save.mutateAsync, remove: remove.mutateAsync, isSaving: save.isPending || remove.isPending };
}

export function useIsInLibrary(mediaId: number, mediaType: MediaSummary["mediaType"]) {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: [...queryKeys.local.library(profileId), "has", mediaId, mediaType],
    queryFn: () => libraryRepository.has(mediaId, mediaType),
  });
}

// Backs the grid/detail-page quick "add to library" toggle — a lighter
// weight pair than useLibraryItem (no full LibraryItem fetch) matching the
// presence-only shape useIsInLibrary already provides for reads.
export function useLibraryQuickToggle() {
  const profileId = useActiveProfileId();
  const invalidateKeys = [
    queryKeys.local.library(profileId),
    queryKeys.local.history(profileId),
    queryKeys.local.stats(profileId),
    queryKeys.local.watchTonight(profileId),
  ];

  const addPlanned = useInvalidatingMutation(
    (media: MediaSummary) => libraryRepository.save(media, { status: "planned" }),
    invalidateKeys
  );
  const removeIfPlanned = useInvalidatingMutation(
    ({ mediaId, mediaType }: { mediaId: number; mediaType: MediaSummary["mediaType"] }) =>
      libraryRepository.removeIfPlanned(mediaId, mediaType),
    invalidateKeys
  );

  return {
    addPlanned: addPlanned.mutateAsync,
    removeIfPlanned: removeIfPlanned.mutateAsync,
    isMutating: addPlanned.isPending || removeIfPlanned.isPending,
  };
}
