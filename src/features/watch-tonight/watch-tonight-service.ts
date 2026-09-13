import { libraryRepository } from "@/features/library/library-repository";
import {
  filterHiddenIfWatchedByKeySet,
  filterDismissedByKeySet,
  buildKeySetFromMediaKeys,
} from "@/shared/utils/library-set";
import { mediaRepository } from "@/features/media/media-repository";
import { recommendationsRepository } from "@/features/recommendations/recommendations-repository";
import { logger } from "@/shared/lib/logger";
import { GENRES } from "@/shared/constants/discover";
import type { LibraryItem, MediaSummary, MediaType, Movie, Series } from "@/types/media";

export interface WatchTonightFilters {
  genreMovie?: number;
  genreSeries?: number;
  /** A single provider id, or several (e.g. "my services") — matches if any one of them has the title. */
  provider?: number | number[];
  maxRuntime?: number;
  /** The persistent "Hide watched" preference — drops any candidate already `completed` in the library, most relevant to the catalogue fallback below (planned-item candidates are never `completed` by definition). */
  hideWatched?: boolean;
  /** ISO 3166-1 country code — only titles originating from that country. */
  originCountry?: string;
}

/** Why a candidate was ranked highly — surfaced by the hero pick so "what to watch" reads as an explained suggestion, not a black box. `genreLabelKey` is a GENRES labelKey (e.g. "genres.drama"), translated by the caller. */
export type WatchTonightReason = { kind: "genre"; genreLabelKey: string } | { kind: "highlyRated" };

export interface WatchTonightPicks {
  movies: Array<Movie & { watchTonightReason: WatchTonightReason | null }>;
  series: Array<Series & { watchTonightReason: WatchTonightReason | null }>;
}

const PICKS_PER_TYPE = 4;
const PLANNED_CANDIDATE_CAP = 20;
// How many of the profile's most-recently-completed titles feed the genre
// affinity signal below — same recency-biased pool size and rationale as
// PLANNED_CANDIDATE_CAP and the "because you liked" rail's own candidate cap.
const AFFINITY_CANDIDATE_CAP = 20;
// A single completed title in a genre is too weak a signal to explain a pick
// ("because you liked Horror" off of one rewatch would overclaim); this is
// the minimum repeat count before a genre becomes the displayed reason. It
// still counts toward ranking below this threshold — just not the sentence.
const GENRE_REASON_MIN_COUNT = 2;
const HIGH_RATING_THRESHOLD = 7.5;
// Genre affinity is the primary ranking signal; a full TMDB rating (max 10)
// only breaks ties within the same genre-match tier, never outranks a
// stronger genre match — see rankCandidates.
const GENRE_AFFINITY_SCORE_STEP = 100;

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

function matchesOriginCountry(item: MediaSummary, originCountry?: string): boolean {
  return !originCountry || Boolean(item.country?.includes(originCountry));
}

function normalizeProviderIds(provider?: number | number[]): number[] | undefined {
  if (provider === undefined) return undefined;
  const ids = Array.isArray(provider) ? provider : [provider];
  return ids.length ? ids : undefined;
}

async function matchesProvider(mediaType: MediaType, mediaId: number, provider?: number | number[]): Promise<boolean> {
  const providerIds = normalizeProviderIds(provider);
  if (!providerIds) return true;
  const availability = await mediaRepository.getWatchAvailability(mediaType, mediaId).catch((error) => {
    logger.warn(`Failed to fetch watch availability for ${mediaType}/${mediaId}: ${error}`);
    return null;
  });
  if (!availability) return false;
  return [...availability.flatrate, ...availability.free].some((item) => providerIds.includes(item.id));
}

function shuffle<T>(items: T[]): T[] {
  return items
    .map((item) => ({ item, key: crypto.getRandomValues(new Uint32Array(1))[0] ?? 0 }))
    .sort((left, right) => left.key - right.key)
    .map(({ item }) => item);
}

interface GenreRef {
  label: string;
  labelKey: string;
}

const MOVIE_GENRES_BY_ID = new Map<number, GenreRef>(GENRES.movies.map((genre) => [genre.id, genre]));
const SERIES_GENRES_BY_ID = new Map<number, GenreRef>(GENRES.series.map((genre) => [genre.id, genre]));

/** Frequency of each canonical genre label (LibraryItem.genres' own format) across a profile's most-recently-completed titles of one media type — this profile's actual taste, not a preference toggle. */
function buildGenreAffinity(completed: LibraryItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of completed) for (const genre of item.genres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  return counts;
}

function bestGenreMatch(
  genreIds: number[] | undefined,
  genresById: Map<number, GenreRef>,
  affinity: Map<string, number>
): { labelKey: string; count: number } | null {
  let best: { labelKey: string; count: number } | null = null;
  for (const id of genreIds ?? []) {
    const genre = genresById.get(id);
    if (!genre) continue;
    const count = affinity.get(genre.label) ?? 0;
    if (count > 0 && (!best || count > best.count)) best = { labelKey: genre.labelKey, count };
  }
  return best;
}

function reasonFor(
  genreMatch: { labelKey: string; count: number } | null,
  rating: number | null | undefined
): WatchTonightReason | null {
  if (genreMatch && genreMatch.count >= GENRE_REASON_MIN_COUNT)
    return { kind: "genre", genreLabelKey: genreMatch.labelKey };
  if ((rating ?? 0) >= HIGH_RATING_THRESHOLD) return { kind: "highlyRated" };
  return null;
}

/**
 * Ranks candidates by genre affinity first (how often the profile has
 * completed something in this title's best-matching genre), TMDB rating as
 * a tie-break within the same genre tier, and a random shuffle as the final
 * tie-break — so a brand-new profile with no affinity signal at all (every
 * candidate scores 0) still gets a varied pick instead of the same shuffle
 * order every time. Attaches the reason that ranking is allowed to explain.
 */
function rankCandidates<T extends MediaSummary>(
  candidates: T[],
  affinity: Map<string, number>,
  genresById: Map<number, GenreRef>
): Array<T & { watchTonightReason: WatchTonightReason | null }> {
  const scored = shuffle(candidates).map((item) => {
    const genreMatch = bestGenreMatch(item.genreIds, genresById, affinity);
    const score = (genreMatch?.count ?? 0) * GENRE_AFFINITY_SCORE_STEP + (item.rating ?? 0);
    return { item, score, reason: reasonFor(genreMatch, item.rating) };
  });
  scored.sort((left, right) => right.score - left.score);
  return scored.map(({ item, reason }) => ({ ...item, watchTonightReason: reason }));
}

async function filterByProvider<T extends MediaSummary>(
  candidates: T[],
  mediaType: MediaType,
  provider?: number | number[]
): Promise<T[]> {
  if (!normalizeProviderIds(provider) || !candidates.length) return candidates;
  const matches = await Promise.all(candidates.map((item) => matchesProvider(mediaType, item.id, provider)));
  return candidates.filter((_item, index) => matches[index]);
}

async function pickMovies(
  filters: WatchTonightFilters,
  planned: LibraryItem[],
  completedKeySet: Set<string>,
  dismissedKeySet: Set<string>,
  genreAffinity: Map<string, number>
): Promise<Array<Movie & { watchTonightReason: WatchTonightReason | null }>> {
  const detailed = await Promise.all(
    planned.map((item) =>
      mediaRepository.getMovieDetails(item.mediaId).catch((error) => {
        logger.warn(`Failed to fetch movie details for ${item.mediaId}: ${error}`);
        return null;
      })
    )
  );
  let candidates = detailed
    .filter((item): item is Movie => Boolean(item))
    .filter(
      (movie) =>
        matchesRuntime(movie, filters.maxRuntime) &&
        matchesGenre(movie, filters.genreMovie) &&
        matchesOriginCountry(movie, filters.originCountry)
    );

  candidates = await filterByProvider(candidates, "movie", filters.provider);

  if (!candidates.length) {
    candidates = (
      await mediaRepository.discoverMovies({
        genre: filters.genreMovie,
        provider: filters.provider,
        maxRuntime: filters.maxRuntime,
        originCountry: filters.originCountry,
      })
    ).results;
  }

  // Applied last, against the full completed-key set (not just the
  // `planned` candidates above) — the main place this actually removes
  // anything is the catalogue fallback just above, since a `planned` item
  // is never `completed` by definition.
  candidates = filterHiddenIfWatchedByKeySet(candidates, completedKeySet, Boolean(filters.hideWatched));
  candidates = filterDismissedByKeySet(candidates, dismissedKeySet);

  return rankCandidates(candidates, genreAffinity, MOVIE_GENRES_BY_ID).slice(0, PICKS_PER_TYPE);
}

async function pickSeries(
  filters: WatchTonightFilters,
  planned: LibraryItem[],
  completedKeySet: Set<string>,
  dismissedKeySet: Set<string>,
  genreAffinity: Map<string, number>
): Promise<Array<Series & { watchTonightReason: WatchTonightReason | null }>> {
  const detailed = await Promise.all(
    planned.map((item) =>
      mediaRepository.getSeriesDetails(item.mediaId).catch((error) => {
        logger.warn(`Failed to fetch series details for ${item.mediaId}: ${error}`);
        return null;
      })
    )
  );
  let candidates = detailed
    .filter((item): item is Series => Boolean(item))
    .filter(
      (series) =>
        matchesRuntime(series, filters.maxRuntime) &&
        matchesGenre(series, filters.genreSeries) &&
        matchesOriginCountry(series, filters.originCountry)
    );

  candidates = await filterByProvider(candidates, "series", filters.provider);

  if (!candidates.length) {
    candidates = (
      await mediaRepository.discoverSeries({
        genre: filters.genreSeries,
        provider: filters.provider,
        maxRuntime: filters.maxRuntime,
        originCountry: filters.originCountry,
      })
    ).results;
  }

  candidates = filterHiddenIfWatchedByKeySet(candidates, completedKeySet, Boolean(filters.hideWatched));
  candidates = filterDismissedByKeySet(candidates, dismissedKeySet);

  return rankCandidates(candidates, genreAffinity, SERIES_GENRES_BY_ID).slice(0, PICKS_PER_TYPE);
}

export const watchTonightService = {
  async pick(filters: WatchTonightFilters): Promise<WatchTonightPicks> {
    const [plannedMovies, plannedSeries, completedKeys, completedMovies, completedSeries, dismissed] =
      await Promise.all([
        libraryRepository.plannedCandidates("movie", PLANNED_CANDIDATE_CAP),
        libraryRepository.plannedCandidates("series", PLANNED_CANDIDATE_CAP),
        // Only needed for the hide-watched pass — still fetched unconditionally
        // rather than gated on filters.hideWatched, since this same result
        // would otherwise need refetching the moment the user flips that
        // preference mid-session.
        libraryRepository.idsMatchingFilters({ status: "completed" }),
        // Feeds the genre-affinity ranking signal (rankCandidates) — the same
        // recently-completed candidate pool the "because you liked" rail
        // draws its own seed from, just aggregated across several titles
        // instead of picking a single one.
        libraryRepository.completedCandidates("movie", AFFINITY_CANDIDATE_CAP),
        libraryRepository.completedCandidates("series", AFFINITY_CANDIDATE_CAP),
        // A "pas intéressé" dismissal always applies, unlike hideWatched above
        // — see filterDismissedByKeySet.
        recommendationsRepository.listDismissed(),
      ]);
    const completedKeySet = buildKeySetFromMediaKeys(completedKeys);
    const dismissedKeySet = new Set(dismissed.map((item) => `${item.mediaType}:${item.mediaId}`));
    const movieAffinity = buildGenreAffinity(completedMovies);
    const seriesAffinity = buildGenreAffinity(completedSeries);
    const [movies, series] = await Promise.all([
      pickMovies(filters, plannedMovies, completedKeySet, dismissedKeySet, movieAffinity),
      pickSeries(filters, plannedSeries, completedKeySet, dismissedKeySet, seriesAffinity),
    ]);
    return { movies, series };
  },
};
