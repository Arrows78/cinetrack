import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { libraryRepository, type LibraryPatch } from "@/services/local/library-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import type { MediaSummary } from "@/types/media";

export function useLibrary() {
  return useQuery({ queryKey: queryKeys.local.library, queryFn: () => libraryRepository.list() });
}

export function useLibraryItem(media: MediaSummary) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.local.libraryItem(media.mediaType, media.id),
    queryFn: () => libraryRepository.get(media.id, media.mediaType),
  });
  const save = useMutation({
    mutationFn: (patch: LibraryPatch) => libraryRepository.upsert(media, patch),
    onSuccess: async (item) => {
      queryClient.setQueryData(queryKeys.local.libraryItem(media.mediaType, media.id), item);
      await queryClient.invalidateQueries({ queryKey: queryKeys.local.library });
    },
  });
  const remove = useMutation({
    mutationFn: () => libraryRepository.remove(media.id, media.mediaType),
    onSuccess: async () => {
      queryClient.setQueryData(queryKeys.local.libraryItem(media.mediaType, media.id), null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.local.library });
    },
  });
  return { ...query, save: save.mutateAsync, remove: remove.mutateAsync, isSaving: save.isPending || remove.isPending };
}
