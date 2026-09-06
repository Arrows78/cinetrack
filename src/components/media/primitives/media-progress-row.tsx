import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/shared/lib/cn";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import fallbackPoster from "@/assets/poster-placeholder.svg";

/**
 * Shared poster+content row for a single tracked title — the home page's
 * Watch Next rail (series and movie alike) and the library's "recently
 * watched" look-back row. Was three near-identical components before this,
 * copy-pasted with small drifts in padding and hover treatment.
 */
export function MediaProgressRow({
  mediaType,
  mediaId,
  posterPath,
  dimmed = false,
  action,
  meta,
  children,
}: {
  mediaType: "movie" | "series";
  mediaId: number;
  posterPath: string | null | undefined;
  /** RecentlyWatchedRow's dimmed "look back" hover treatment — only meaningful without `action` (a whole-row link, nothing else to hover independently). */
  dimmed?: boolean;
  /** A control outside the link, e.g. SeenToggleButton — breaks the row into a "surface" div wrapping a separate Link. Omit for a single whole-row Link (RecentlyWatchedRow). */
  action?: ReactNode;
  /** A shrink-0 element after the content column, still inside the link — RecentlyWatchedRow's relative timestamp. */
  meta?: ReactNode;
  children: ReactNode;
}) {
  const poster = buildTmdbImageUrl(posterPath, "w185") ?? fallbackPoster;
  const linkContent = (
    <>
      <img src={poster} alt="" loading="lazy" className="h-20 w-14 shrink-0 rounded-lg object-cover" />
      <div className="min-w-0 flex-1">{children}</div>
      {meta}
    </>
  );

  if (action) {
    const linkClassName =
      "flex min-w-0 flex-1 items-center gap-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
    return (
      <div className="surface flex items-center gap-4 overflow-hidden rounded-card p-3 pr-4">
        {mediaType === "movie" ? (
          <Link to="/movies/$movieId" params={{ movieId: String(mediaId) }} className={linkClassName}>
            {linkContent}
          </Link>
        ) : (
          <Link to="/series/$seriesId" params={{ seriesId: String(mediaId) }} className={linkClassName}>
            {linkContent}
          </Link>
        )}
        {action}
      </div>
    );
  }

  const wholeRowClassName = cn(
    "surface flex items-center gap-4 overflow-hidden rounded-card p-3 pr-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    dimmed && "opacity-60 transition-opacity duration-base hover:opacity-100"
  );
  return mediaType === "movie" ? (
    <Link to="/movies/$movieId" params={{ movieId: String(mediaId) }} className={wholeRowClassName}>
      {linkContent}
    </Link>
  ) : (
    <Link to="/series/$seriesId" params={{ seriesId: String(mediaId) }} className={wholeRowClassName}>
      {linkContent}
    </Link>
  );
}
