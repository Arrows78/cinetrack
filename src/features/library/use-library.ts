import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { libraryRepository, type LibraryPatch } from "@/features/library/library-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
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
