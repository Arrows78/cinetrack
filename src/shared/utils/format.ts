import { differenceInCalendarDays, format, formatDistanceToNow, parseISO } from "date-fns";
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

const DAYS_PER_WEEK = 7;
// Below this many days out, the countdown stays in day granularity ("In 6
// days"); at or beyond it, it switches to week granularity ("In 1 week").
const COUNTDOWN_WEEK_THRESHOLD_DAYS = 7;

/**
 * Short countdown chip for a Calendar/Upcoming date ("Today", "Tomorrow",
 * "In 3 days", "In 2 weeks") — pairs with the exact date wherever a
 * `CalendarEntry` is shown, rather than replacing it. `value` is a date-only
 * string ("2026-08-08"), so this uses `parseISO` for the same reason
 * `formatFullDate` does: `new Date(value)` would parse it as UTC midnight,
 * which reads as the previous day in any negative-UTC-offset timezone.
 *
 * Granularity adapts to distance instead of always showing one unit, same
 * spirit as `formatWatchDurationBreakdown`'s non-zero-unit rule: days count
 * up to (but not including) a full week, then it switches to whole weeks —
 * so it never shows something like "In 0 weeks" or "In 7 days" once a full
 * week has passed. A date already in the past (shouldn't normally reach
 * this — Calendar/Upcoming entries are always today or later — but a stale
 * cache or a caller reusing this outside that context could still pass one)
 * falls back to the generic relative-date phrasing instead of a nonsensical
 * negative countdown.
 */
export const formatRelativeCountdown = (value: string): string => {
  try {
    const days = differenceInCalendarDays(parseISO(value), new Date());
    // date-fns returns NaN rather than throwing for an unparseable date —
    // unlike formatDate/formatRelativeDate's underlying calls, so this needs
    // its own explicit guard to reach the same "return the raw value"
    // fallback on malformed input.
    if (Number.isNaN(days)) return value;
    if (days < 0) return formatRelativeDate(value);
    if (days === 0) return i18n.t("common.countdownToday");
    if (days === 1) return i18n.t("common.countdownTomorrow");
    if (days < COUNTDOWN_WEEK_THRESHOLD_DAYS) return i18n.t("common.countdownInDays", { count: days });

    const weeks = Math.max(1, Math.round(days / DAYS_PER_WEEK));
    return i18n.t("common.countdownInWeeks", { count: weeks });
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
// A 30-day month, same approximation used everywhere else this app talks
// about "months" of watch time — not calendar-accurate, but consistent.
const DAYS_PER_MONTH = 30;

/**
 * Long-form breakdown of a watched-duration total in minutes, for headline
 * numbers where a bare hour count doesn't convey scale (the "Time watched"
 * stat card, the Wrapped hero figure) — everywhere else keeps the plain
 * `stats.durationHoursMinutes` hours/minutes label.
 *
 * Each unit (months, days, hours, minutes) is included only if it's
 * non-zero, so a duration never reads as "0 months 3 days" or "10 months 23
 * days 1h 0min" — the breakdown adapts to how large the total actually is
 * instead of always showing every unit down to minutes. Falls back to "0min"
 * for a zero total rather than an empty string.
 */
export const formatWatchDurationBreakdown = (minutes: number): string => {
  const totalMinutes = Math.max(0, Math.floor(minutes));
  const totalDays = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const months = Math.floor(totalDays / DAYS_PER_MONTH);
  const days = totalDays % DAYS_PER_MONTH;
  const hours = Math.floor((totalMinutes % MINUTES_PER_DAY) / 60);
  const mins = totalMinutes % 60;

  const parts: string[] = [];
  if (months > 0) parts.push(i18n.t("stats.watchDurationMonths", { count: months }));
  if (days > 0) parts.push(i18n.t("stats.watchDurationDays", { count: days }));
  if (hours > 0) parts.push(i18n.t("stats.watchDurationHours", { count: hours }));
  if (mins > 0 || parts.length === 0) parts.push(i18n.t("stats.watchDurationMinutes", { count: mins }));

  return parts.join(" ");
};

export const percent = (value: number, total: number) => (total === 0 ? 0 : Math.round((value / total) * 100));

export const pluralize = (value: number, one: string, many: string) => (value > 1 ? many : one);

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * 1024;
const BYTES_PER_GB = BYTES_PER_MB * 1024;

/**
 * Human-readable byte size ("42.3 MB") for the image-cache size shown in
 * Settings. The unit suffix is localized rather than hardcoded to English —
 * same reasoning as tvtimeImport.totalTooLarge, which already renders "MB"
 * in English but "Mo" in French.
 */
export const formatBytes = (bytes: number): string => {
  const value = Math.max(0, bytes);
  if (value < BYTES_PER_KB) return i18n.t("common.sizeBytes", { count: Math.round(value) });
  if (value < BYTES_PER_MB) return i18n.t("common.sizeKB", { value: (value / BYTES_PER_KB).toFixed(1) });
  if (value < BYTES_PER_GB) return i18n.t("common.sizeMB", { value: (value / BYTES_PER_MB).toFixed(1) });
  return i18n.t("common.sizeGB", { value: (value / BYTES_PER_GB).toFixed(1) });
};

/**
 * Placeholder image URL via placehold.co. Centralizes the background/foreground
 * colors so every fallback image shares the same brand-aligned palette.
 */
const PLACEHOLDER_BG = "111827";
const PLACEHOLDER_FG = "374151";
export const placeholderUrl = (width: number, height: number, text = "") =>
  `https://placehold.co/${width}x${height}/${PLACEHOLDER_BG}/${PLACEHOLDER_FG}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
