import { format, formatDistanceToNow, parseISO } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import i18n from "@/i18n";

const isFrench = () => (i18n.language ?? "").toLowerCase().startsWith("fr");
const dateLocale = () => (isFrench() ? fr : enUS);

export type TmdbImageSize = "w92" | "w185" | "w342" | "w500" | "w780" | "original";

export const buildTmdbImageUrl = (path: string | null | undefined, size: TmdbImageSize = "w780") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;

const POSTER_WIDTHS: Array<{ size: TmdbImageSize; width: number }> = [
  { size: "w185", width: 185 },
  { size: "w342", width: 342 },
  { size: "w500", width: 500 },
  { size: "w780", width: 780 },
];

/** A `srcset` string spanning TMDB's poster widths, so the browser can pick a size matching the rendered card instead of always downloading `w780`. */
export const buildTmdbPosterSrcSet = (path: string | null | undefined) =>
  path ? POSTER_WIDTHS.map(({ size, width }) => `${buildTmdbImageUrl(path, size)} ${width}w`).join(", ") : undefined;

export const formatDate = (value?: string | null) => {
  if (!value) return i18n.t("common.unknownDate");

  try {
    return format(new Date(value), "dd MMM yyyy", { locale: dateLocale() });
  } catch {
    return value;
  }
};

/**
 * Full weekday + date (e.g. "samedi 8 août 2026") — calendar page's group
 * headers. Uses parseISO rather than `new Date(value)`: TMDB release/air
 * dates are date-only ("2026-08-08"), which `new Date()` parses as UTC
 * midnight — shifted a day earlier in any negative-UTC-offset timezone once
 * displayed locally. parseISO reads a date-only string as local midnight.
 */
export const formatFullDate = (value: string) => format(parseISO(value), "EEEE d MMMM yyyy", { locale: dateLocale() });

export const formatRelativeDate = (value?: string | null) => {
  if (!value) return i18n.t("common.unknownDate");

  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true, locale: dateLocale() });
  } catch {
    return value;
  }
};

export const formatRuntime = (runtime?: number | null) => {
  if (!runtime) return "—";
  const hours = Math.floor(runtime / 60);
  const minutes = runtime % 60;
  return hours > 0
    ? i18n.t("common.durationHoursMinutes", { hours, minutes: minutes.toString().padStart(2, "0") })
    : i18n.t("common.durationMinutes", { minutes });
};

export const formatRating = (rating?: number | null) => {
  if (!rating) return "—";
  return new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(rating);
};

const pad2 = (value: number) => value.toString().padStart(2, "0");

export const formatEpisodeCode = (season: number, episode: number, options?: { padded?: boolean }) =>
  i18n.t("common.episodeCode", {
    season: options?.padded ? pad2(season) : season,
    episode: options?.padded ? pad2(episode) : episode,
  });

export const formatEpisodeNumber = (episode: number, options?: { padded?: boolean }) =>
  i18n.t("common.episodeNumber", { episode: options?.padded ? pad2(episode) : episode });

export const yearFromDate = (value?: string | null) => {
  if (!value) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
};

const MINUTES_PER_DAY = 24 * 60;
// A month figure only reads as meaningful once the total is at least a full
// month's worth of days — below that, rounding a handful of days into
// "~1 month" would be misleading rather than helpful.
const DAYS_PER_MONTH = 30;

/**
 * Long-form breakdown of a watched-duration total in minutes, for the
 * headline numbers where a bare hour count doesn't convey scale (the "Time
 * watched" stat card, the Wrapped hero figure) — everywhere else keeps the
 * plain `stats.durationHoursMinutes` hours/minutes label.
 *
 * - Under 24h: no day breakdown at all (a 3-hour total isn't "0 days" of
 *   anything).
 * - 24h up to just under a month (30 days): hours + a day count.
 * - A month or more: hours + day count + an approximate month count.
 *
 * Days and months are floored, not rounded, so the figures read as "at
 * least this much" rather than implying a precision the estimate doesn't
 * have.
 */
export const formatWatchDurationBreakdown = (minutes: number): string => {
  const hours = i18n.t("stats.durationHoursMinutes", {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  });
  if (minutes < MINUTES_PER_DAY) return hours;

  const days = Math.floor(minutes / MINUTES_PER_DAY);
  const daysLabel = i18n.t("stats.watchDurationDays", { count: days });
  if (days < DAYS_PER_MONTH) {
    return i18n.t("stats.watchDurationWithDays", { hours, days: daysLabel });
  }

  const months = Math.floor(days / DAYS_PER_MONTH);
  const monthsLabel = i18n.t("stats.watchDurationMonths", { count: months });
  return i18n.t("stats.watchDurationWithMonths", { hours, days: daysLabel, months: monthsLabel });
};

export const percent = (value: number, total: number) => (total === 0 ? 0 : Math.round((value / total) * 100));

export const pluralize = (value: number, one: string, many: string) => (value > 1 ? many : one);

/**
 * Placeholder image URL via placehold.co. Centralizes the background/foreground
 * colors so every fallback image shares the same brand-aligned palette.
 */
const PLACEHOLDER_BG = "111827";
const PLACEHOLDER_FG = "374151";
export const placeholderUrl = (width: number, height: number, text = "") =>
  `https://placehold.co/${width}x${height}/${PLACEHOLDER_BG}/${PLACEHOLDER_FG}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
