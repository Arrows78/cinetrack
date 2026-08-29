import { Link } from "@tanstack/react-router";
import { cn } from "@/shared/lib/cn";

interface PillProps {
  label: string;
  movieId?: number;
  seriesId?: number;
  providerId?: number;
  className?: string;
}

export function Pill({ label, movieId, seriesId, providerId, className }: PillProps) {
  const search =
    providerId !== undefined
      ? { q: label, scope: "all", provider: String(providerId) }
      : {
          q: label,
          scope: "all",
          genreMovie: movieId ? String(movieId) : undefined,
          genreSeries: seriesId ? String(seriesId) : undefined,
        };

  return (
    <Link
      to="/search"
      search={search}
      className={cn(
        "group relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-border bg-card/60 px-4 py-2 text-sm font-medium transition-all",
        "hover:border-primary hover:bg-primary/10 hover:text-primary",
        "active:scale-[0.97]",
        className
      )}
    >
      {label}
    </Link>
  );
}
