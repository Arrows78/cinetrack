import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { libraryRepository } from "@/features/library/library-repository";
import { mediaRepository } from "@/features/media/media-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { progressRepository } from "@/features/progress/progress-repository";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import { UserFacingError } from "@/shared/lib/user-facing-error";
import { invalidationKeys } from "@/shared/constants/invalidation";
import { queryKeys } from "@/shared/constants/query-keys";
import { logger } from "@/shared/lib/logger";
import type { MediaSummary, ViewingHistoryItem } from "@/types/media";

// Every other action (episode/season/series bulk toggles, list add/remove,
// a library field edit) either needs a full season's worth of episode data
// to reverse correctly or has no single well-defined "opposite" — scoped
// down to the cases with an unambiguous reverse and complete catalogue data
// (the snapshot stored in the entry, else TMDB).
const UNDOABLE_ACTIONS = new Set<ViewingHistoryItem["action"]>([
  "movie:watched",
  "movie:unwatched",
  "watchlist:add",
  "watchlist:remove",
]);

export function isHistoryItemUndoable(item: ViewingHistoryItem): boolean {
  return UNDOABLE_ACTIONS.has(item.action);
}

const isNullableString = (value: unknown): value is string | null | undefined =>
  value === undefined || value === null || typeof value === "string";
const isNullableNumber = (value: unknown): value is number | null | undefined =>
  value === undefined || value === null || typeof value === "number";

/**
 * The catalogue fields Rust stored under `metadata.media` when it wrote the
 * entry (see `MediaSnapshot` in src-tauri/src/history/models.rs), rebuilt as
 * a MediaSummary. Everything an undo writes back (title, images, year,
 * rating, genres, runtime) is in it, so no TMDB call is needed. Null for an
 * entry written before the snapshot existed, or one whose snapshot doesn't
 * have the expected shape.
 */
function summaryFromSnapshot(item: ViewingHistoryItem): MediaSummary | null {
  const raw = item.metadata?.media;
  if (typeof raw !== "object" || raw === null) return null;
  const media = raw as Record<string, unknown>;
  const genres = media.genres;
  if (
    typeof media.title !== "string" ||
    !Array.isArray(genres) ||
    !genres.every((genre) => typeof genre === "string") ||
    !isNullableString(media.posterPath) ||
    !isNullableString(media.backdropPath) ||
    !isNullableNumber(media.runtime) ||
    !isNullableNumber(media.year) ||
    !isNullableNumber(media.rating)
  ) {
    return null;
  }
  return {
    id: item.mediaId,
    mediaType: item.mediaType,
    title: media.title,
    overview: "",
    posterPath: media.posterPath,
    backdropPath: media.backdropPath,
    runtime: media.runtime,
    year: media.year,
    rating: media.rating,
    genres,
    cast: [],
  };
}

/**
 * Reverses a handful of history actions in place. The title's catalogue data
 * comes from the entry's own stored snapshot; only an older entry without
 * one falls back to fetching TMDB, and an unreachable catalogue then ends in
 * a translated message rather than a generic failure.
 */
export function useUndoHistoryItem() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const profileId = useActiveProfileId();

  const loadMedia = async (item: ViewingHistoryItem): Promise<MediaSummary> => {
    const snapshot = summaryFromSnapshot(item);
    if (snapshot) return snapshot;
    try {
      return item.mediaType === "movie"
        ? await queryClient.fetchQuery({
            queryKey: queryKeys.remote.movieDetails(item.mediaId),
            queryFn: () => mediaRepository.getMovieDetails(item.mediaId),
          })
        : await queryClient.fetchQuery({
            queryKey: queryKeys.remote.seriesDetails(item.mediaId),
            queryFn: () => mediaRepository.getSeriesDetails(item.mediaId),
          });
    } catch (error) {
      logger.error(
        `History undo needs the catalogue for ${item.mediaType} ${item.mediaId}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new UserFacingError(t("history.undoNeedsCatalogue"));
    }
  };

  return useInvalidatingMutation(
    async (item: ViewingHistoryItem) => {
      switch (item.action) {
        case "movie:watched":
        case "movie:unwatched": {
          const movie = await loadMedia(item);
          await progressRepository.toggleMovieSeen(movie, item.action === "movie:unwatched");
          return;
        }
        case "watchlist:add": {
          // Only while it's still "to watch": an add undone after the title
          // was rated, noted or finished would delete all of that with it.
          const removed = await libraryRepository.removeIfPlanned(item.mediaId, item.mediaType);
          if (!removed) throw new UserFacingError(t("history.undoKeptLibraryItem"));
          return;
        }
        case "watchlist:remove": {
          await libraryRepository.save(await loadMedia(item));
          return;
        }
        default:
          // isHistoryItemUndoable already gates the UI down to the cases
          // above — reaching here means a caller invoked this directly for
          // an action it was never meant to cover.
          throw new Error(`History action "${item.action}" cannot be undone.`);
      }
    },
    // A movie toggle also moves the title's own seen state and watch log.
    (_data, item) => [
      queryKeys.local.history(profileId),
      ...(item.mediaType === "movie"
        ? invalidationKeys.movieWatch(profileId, item.mediaId)
        : invalidationKeys.library(profileId)),
    ]
  );
}
