import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

export const buildTmdbImageUrl = (
  path: string | null | undefined,
  size: "w92" | "w185" | "w342" | "w500" | "w780" | "original" = "w780"
) => (path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined);

export const formatDate = (value?: string | null) => {
  if (!value) return "Date inconnue";

  try {
    return format(new Date(value), "dd MMM yyyy", { locale: fr });
  } catch {
    return value;
  }
};

export const formatRelativeDate = (value?: string | null) => {
  if (!value) return "date inconnue";

  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true, locale: fr });
  } catch {
    return value;
  }
};

export const formatRuntime = (runtime?: number | null) => {
  if (!runtime) return "—";
  const hours = Math.floor(runtime / 60);
  const minutes = runtime % 60;
  return hours > 0 ? `${hours}h ${minutes.toString().padStart(2, "0")}` : `${minutes} min`;
};

export const formatRating = (rating?: number | null) => (rating ? rating.toFixed(1).replace(".", ",") : "—");

export const yearFromDate = (value?: string | null) => (value ? Number.parseInt(value.slice(0, 4), 10) : null);

export const percent = (value: number, total: number) => (total === 0 ? 0 : Math.round((value / total) * 100));

export const pluralize = (value: number, one: string, many: string) => (value > 1 ? many : one);
