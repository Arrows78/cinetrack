import { libraryRepository } from "@/features/library/library-repository";
import { mediaRepository } from "@/features/media/media-repository";
import { logger } from "@/features/diagnostics/logger";
import type { MediaSummary, MediaType, Movie, Series } from "@/types/media";

export interface WatchTonightFilters {
  genreMovie?: number;
  genreSeries?: number;
  provider?: number;
  maxRuntime?: number;
}

export interface WatchTonightPicks {
  movies: Movie[];
  series: Series[];
}

const PICKS_PER_TYPE = 4;
const PLANNED_CANDIDATE_CAP = 20;

// Movie.runtime is the film's own length; Series.runtime (inherited from
// MediaSummary) is TMDB's average episode runtime — comparing both the same
// way against maxRuntime matches the actual ask ("something I can watch
// tonight"), since watching a series tonight means one episode, not the
// whole show.
function matchesRuntime(item: MediaSummary, maxRuntime?: number): boolean {
  return !maxRuntime || !item.runtime || item.runtime <= maxRuntime;
}

function matchesGenre(item: MediaSummary, genre?: number): boolean {
  return genre === undefined || Boolean(item.genreIds?.includes(genre));
}

async function matchesProvider(mediaType: MediaType, mediaId: number, provider?: number): Promise<boolean> {
  if (provider === undefined) return true;
  const availability = await mediaRepository.getWatchAvailability(mediaType, mediaId).catch((error) => {
    logger.warn(`Failed to fetch watch availability for ${mediaType}/${mediaId}: ${error}`);
    return null;
  });
  if (!availability) return false;
  return [...availability.flatrate, ...availability.free].some((item) => item.id === provider);
}

function shuffle<T>(items: T[]): T[] {
  return items
    .map((item) => ({ item, key: crypto.getRandomValues(new Uint32Array(1))[0] ?? 0 }))
    .sort((left, right) => left.key - right.key)
    .map(({ item }) => item);
}

async function filterByProvider<T extends MediaSummary>(
  candidates: T[],
  mediaType: MediaType,
  provider?: number
): Promise<T[]> {
  if (provider === undefined || !candidates.length) return candidates;
  const matches = await Promise.all(candidates.map((item) => matchesProvider(mediaType, item.id, provider)));
  return candidates.filter((_item, index) => matches[index]);
}

async function pickMovies(filters: WatchTonightFilters): Promise<Movie[]> {
  const planned = (await libraryRepository.list()).filter(
    (item) => item.mediaType === "movie" && item.status === "planned"
  );
  const detailed = await Promise.all(
    planned
      .slice(0, PLANNED_CANDIDATE_CAP)
      .map((item) => mediaRepository.getMovieDetails(item.mediaId).catch((error) => {
        logger.warn(`Failed to fetch movie details for ${item.mediaId}: ${error}`);
        return null;
      }))
  );
  let candidates = detailed
    .filter((item): item is Movie => Boolean(item))
    .filter((movie) => matchesRuntime(movie, filters.maxRuntime) && matchesGenre(movie, filters.genreMovie));

  candidates = await filterByProvider(candidates, "movie", filters.provider);

  if (!candidates.length) {
    candidates = (
      await mediaRepository.discoverMovies({
        genre: filters.genreMovie,
        provider: filters.provider,
        maxRuntime: filters.maxRuntime,
      })
    ).results;
  }

  return shuffle(candidates).slice(0, PICKS_PER_TYPE);
}

async function pickSeries(filters: WatchTonightFilters): Promise<Series[]> {
  const planned = (await libraryRepository.list()).filter(
    (item) => item.mediaType === "series" && item.status === "planned"
  );
  const detailed = await Promise.all(
    planned
      .slice(0, PLANNED_CANDIDATE_CAP)
      .map((item) => mediaRepository.getSeriesDetails(item.mediaId).catch((error) => {
        logger.warn(`Failed to fetch series details for ${item.mediaId}: ${error}`);
        return null;
      }))
  );
  let candidates = detailed
    .filter((item): item is Series => Boolean(item))
    .filter((series) => matchesRuntime(series, filters.maxRuntime) && matchesGenre(series, filters.genreSeries));

  candidates = await filterByProvider(candidates, "series", filters.provider);

  if (!candidates.length) {
    candidates = (
      await mediaRepository.discoverSeries({
        genre: filters.genreSeries,
        provider: filters.provider,
        maxRuntime: filters.maxRuntime,
      })
    ).results;
  }

  return shuffle(candidates).slice(0, PICKS_PER_TYPE);
}

export const watchTonightService = {
  async pick(filters: WatchTonightFilters): Promise<WatchTonightPicks> {
    const [movies, series] = await Promise.all([pickMovies(filters), pickSeries(filters)]);
    return { movies, series };
  },
};
