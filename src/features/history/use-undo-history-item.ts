import { useQueryClient } from "@tanstack/react-query";
import { libraryRepository } from "@/features/library/library-repository";
import { libraryInvalidationKeys } from "@/features/library/use-library";
import { mediaRepository } from "@/features/media/media-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { progressRepository } from "@/features/progress/progress-repository";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import { queryKeys } from "@/shared/constants/query-keys";
import type { ViewingHistoryItem } from "@/types/media";

// Every other action (episode/season/series bulk toggles, list add/remove,
// a library field edit) either needs a full season's worth of episode data
// to reverse correctly or has no single well-defined "opposite" — scoped
// down to the cases with an unambiguous reverse and a cheap way to fetch
// the real catalogue data an undo needs, rather than reconstructing a
// partial MediaSummary stub that could silently clobber an existing
// library row's poster/genres/etc.
const UNDOABLE_ACTIONS = new Set<ViewingHistoryItem["action"]>([
  "movie:watched",
  "movie:unwatched",
  "watchlist:add",
  "watchlist:remove",
]);

export function isHistoryItemUndoable(item: ViewingHistoryItem): boolean {
  return UNDOABLE_ACTIONS.has(item.action);
}

/**
 * Reverses a handful of history actions in place, refetching the title's
 * real catalogue data first wherever the reversal writes it back (a movie
 * toggle, a library re-add) instead of ever sending a partial stand-in.
 */
export function useUndoHistoryItem() {
  const queryClient = useQueryClient();
  const profileId = useActiveProfileId();

  return useInvalidatingMutation(
    async (item: ViewingHistoryItem) => {
      switch (item.action) {
        case "movie:watched":
        case "movie:unwatched": {
          const movie = await queryClient.fetchQuery({
            queryKey: queryKeys.remote.movieDetails(item.mediaId),
            queryFn: () => mediaRepository.getMovieDetails(item.mediaId),
          });
          await progressRepository.toggleMovieSeen(movie, item.action === "movie:unwatched");
          return;
        }
        case "watchlist:add":
          await libraryRepository.remove(item.mediaId, item.mediaType);
          return;
        case "watchlist:remove": {
          const media =
            item.mediaType === "movie"
              ? await queryClient.fetchQuery({
                  queryKey: queryKeys.remote.movieDetails(item.mediaId),
                  queryFn: () => mediaRepository.getMovieDetails(item.mediaId),
                })
              : await queryClient.fetchQuery({
                  queryKey: queryKeys.remote.seriesDetails(item.mediaId),
                  queryFn: () => mediaRepository.getSeriesDetails(item.mediaId),
                });
          await libraryRepository.save(media);
          return;
        }
        default:
          // isHistoryItemUndoable already gates the UI down to the cases
          // above — reaching here means a caller invoked this directly for
          // an action it was never meant to cover.
          throw new Error(`History action "${item.action}" cannot be undone.`);
      }
    },
    [queryKeys.local.history(profileId), ...libraryInvalidationKeys(profileId)]
  );
}
