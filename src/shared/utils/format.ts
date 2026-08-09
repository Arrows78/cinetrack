import { format, formatDistanceToNow, parseISO } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import i18n from "@/i18n";

const isFrench = () => (i18n.language ?? "").toLowerCase().startsWith("fr");
const dateLocale = () => (isFrench() ? fr : enUS);

export const buildTmdbImageUrl = (
  path: string | null | undefined,
  size: "w92" | "w185" | "w342" | "w500" | "w780" | "original" = "w780"
) => (path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined);

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

export const percent = (value: number, total: number) => (total === 0 ? 0 : Math.round((value / total) * 100));

export const pluralize = (value: number, one: string, many: string) => (value > 1 ? many : one);
