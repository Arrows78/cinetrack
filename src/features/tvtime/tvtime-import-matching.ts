import { TmdbRequestError, mediaRepository } from "@/features/media/media-repository";
import { fetchSeriesDetailsCached } from "@/features/media";
import { logger } from "@/shared/lib/logger";
import { errorMessage } from "@/shared/lib/errors";
import { normalizeTitle } from "@/shared/utils/text";
import type { MediaSummary, Series } from "@/types/media";

const RATE_LIMIT_MAX_ATTEMPTS = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1000;

/** Called each time a TMDB lookup is retried after a 429, so the UI can say a stall is expected. */
export type ThrottleReporter = () => void;

const isRateLimitError = (error: unknown): boolean => error instanceof TmdbRequestError && error.status === 429;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// TMDB rate-limits (429) under sustained load, and a bulk TV Time import can
// fire hundreds of lookups through mapWithConcurrency. Without this, a 429
// burst gets recorded as "title could not be matched" for every lookup
// still in flight — indistinguishable from a title that genuinely doesn't
// exist on TMDB. Retries only 429 specifically: a real 404/network error
// still fails immediately and counts as unmatched, same as before.
// `onThrottled` is passed in by whoever runs the import (never module state),
// so two imports — or an import and a manual resolution — can't report each
// other's throttling.
export async function withRateLimitRetry<T>(fn: () => Promise<T>, onThrottled?: ThrottleReporter): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (!isRateLimitError(error) || attempt >= RATE_LIMIT_MAX_ATTEMPTS) throw error;
      onThrottled?.();
      await delay(RATE_LIMIT_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
}

// "Bodyguard (2018)" → { title: "Bodyguard", year: 2018 }
export const splitTitleYear = (name: string): { title: string; year: number | null } => {
  const match = /^(.*)\s+\((\d{4})\)$/.exec(name.trim());
  if (!match) return { title: name.trim(), year: null };
  return { title: match[1]!.trim(), year: Number(match[2]) };
};

// "Show Name: Subtitle" → "Show Name" — retried only when the exact title
// returns zero TMDB results, never as the first attempt, so a title that
// already matches fine is never weakened into a broader, riskier query.
const simplifyTitle = (value: string): string | null => {
  const match = /^(.+?)\s*[:\-–—]\s+.+$/.exec(value.trim());
  const simplified = match?.[1]?.trim();
  return simplified && simplified !== value.trim() ? simplified : null;
};

export interface MatchResult {
  match: MediaSummary | null;
  /** True when the pick came from several same-titled results with no year to confirm it. */
  ambiguous: boolean;
}

const NO_MATCH: MatchResult = { match: null, ambiguous: false };

// Only ever returns a result whose title actually matches — never the
// first search hit just because nothing better was found. Falling back to
// an unrelated top result would silently attach the wrong movie/series to
// the imported history instead of surfacing it as unmatched for review.
//
// A single title-matching candidate is auto-accepted even without a year to
// confirm it (there's nothing to be ambiguous *between*). Several
// same-titled candidates with no year in the export to pick among them
// (e.g. a remake, a regional franchise reuse of the same title) used to
// fall back to `titled[0]` — TMDB's own popularity-sorted order, not an
// actual match confidence signal — and get auto-imported anyway, flagged
// `ambiguous` only for a post-import summary line nobody had to act on.
// That's exactly the "confident-looking but not actually confirmed" import
// this function's own contract says not to produce. Returning `match: null`
// here instead routes it through the same unmatched/retryable path a
// title TMDB has nothing for already goes through — no new UI needed, see
// tvtime-unmatched-resolver.tsx.
export const pickBestMatch = (results: MediaSummary[], title: string, year: number | null): MatchResult => {
  if (!results.length) return NO_MATCH;
  const normalized = normalizeTitle(title);
  const titled = results.filter((result) => normalizeTitle(result.title) === normalized);
  if (!titled.length) return NO_MATCH;
  if (year !== null) {
    const exact = titled.find((result) => result.year === year);
    if (exact) return { match: exact, ambiguous: false };
  }
  if (titled.length > 1) return { match: null, ambiguous: true };
  return { match: titled[0]!, ambiguous: false };
};

// Runs the exact-title search, and — only if that comes back empty — one
// retry against a simplified title (see simplifyTitle). Centralizes that
// fallback so series/movie/watchlist matching all get it identically.
export async function searchWithFallback(
  title: string,
  scope: "movie" | "series",
  onThrottled?: ThrottleReporter
): Promise<{ results: MediaSummary[]; queriedTitle: string }> {
  const page = await withRateLimitRetry(() => mediaRepository.search(title, scope), onThrottled);
  if (page.results.length > 0) return { results: page.results, queriedTitle: title };

  const simplified = simplifyTitle(title);
  if (!simplified) return { results: [], queriedTitle: title };
  const retried = await withRateLimitRetry(() => mediaRepository.search(simplified, scope), onThrottled);
  return { results: retried.results, queriedTitle: simplified };
}

// Full details through the shared cache (a series already opened in the app is
// a hit, concurrent lookups of one title are deduped); `retry: false` because
// withRateLimitRetry owns the retry policy here.
export const fetchSeriesDetailsForImport = (seriesId: number, onThrottled?: ThrottleReporter): Promise<Series> =>
  withRateLimitRetry(() => fetchSeriesDetailsCached(seriesId, { retry: false }), onThrottled);

export interface MatchSeriesResult {
  series: Series | null;
  ambiguous: boolean;
}

/**
 * Finds the TMDB series for one TV Time show: by its TheTVDB id when the
 * export gives one (exact), else by name. A TVDB hit only returns TMDB's
 * `find` payload — no episode count, no status — so the full details are
 * read afterwards; those are what the library entry and the tracked-series
 * cache are built from.
 */
export async function resolveSeries(
  name: string,
  tvdbId: number | undefined,
  onThrottled?: ThrottleReporter
): Promise<MatchSeriesResult> {
  if (tvdbId !== undefined) {
    try {
      const found = await withRateLimitRetry(() => mediaRepository.findSeriesByTvdbId(tvdbId), onThrottled);
      if (found) {
        try {
          return { series: await fetchSeriesDetailsForImport(found.id, onThrottled), ambiguous: false };
        } catch (error) {
          // The id is right; only the extra detail is missing. Importing with
          // the lookup payload beats treating a confirmed match as unmatched.
          logger.warn(`TV Time import: details of "${name}" unavailable after the TVDB match: ${errorMessage(error)}`);
          return { series: found, ambiguous: false };
        }
      }
    } catch (error) {
      logger.warn(`TV Time import: TVDB lookup failed for "${name}": ${errorMessage(error)}`);
      // Fall through to name search.
    }
  }
  const { title, year } = splitTitleYear(name);
  const { results, queriedTitle } = await searchWithFallback(title, "series", onThrottled);
  const { match, ambiguous } = pickBestMatch(results, queriedTitle, year);
  if (!match) return { series: null, ambiguous };
  return { series: await fetchSeriesDetailsForImport(match.id, onThrottled), ambiguous };
}
