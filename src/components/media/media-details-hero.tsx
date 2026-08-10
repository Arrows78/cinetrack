import { useTranslation } from "react-i18next";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { buildTmdbImageUrl, buildTmdbPosterSrcSet, formatRating, formatRuntime } from "@/shared/utils/format";
import type { MediaSummary } from "@/types/media";

export function MediaDetailsHero({
  media,
  actions,
  extra,
}: {
  media: MediaSummary;
  actions?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const backdrop = buildTmdbImageUrl(media.backdropPath, "original");
  const poster = buildTmdbImageUrl(media.posterPath, "w500");

  return (
    <section className="relative overflow-hidden rounded-shell border border-border">
      {backdrop ? (
        <>
          <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(108deg, hsl(var(--background)) 0%, hsl(var(--background)/0.93) 40%, hsl(var(--background)/0.6) 100%)",
            }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-card/70" />
      )}

      <div className="relative grid gap-6 p-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:p-8">
        {/* Poster */}
        <div className="hidden lg:block">
          <img
            src={poster ?? "https://placehold.co/500x750/111827/374151?text=Poster"}
            srcSet={buildTmdbPosterSrcSet(media.posterPath)}
            sizes="220px"
            alt=""
            className="w-full rounded-card border border-border object-cover shadow-2xl"
          />
        </div>

        {/* Content */}
        <div className="flex flex-col justify-between gap-5">
          <div>
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={media.mediaType === "movie" ? "movie" : "series"}
                className="px-2.5 py-0.5 text-overline font-bold uppercase"
              >
                {media.mediaType === "movie" ? t("media.movie") : t("media.series")}
              </Badge>
              {media.status ? <span className="text-xs text-muted-foreground">{media.status}</span> : null}
            </div>

            {/* Title */}
            <h2 className="mt-3 line-clamp-3 font-display text-4xl font-bold leading-tight text-balance md:text-5xl">
              {media.title}
            </h2>
            {media.originalTitle && media.originalTitle !== media.title ? (
              <p className="mt-1.5 text-sm text-muted-foreground">{media.originalTitle}</p>
            ) : null}

            {/* Meta */}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span
                aria-label={t("media.ratingLabel", { rating: formatRating(media.rating) })}
                className="flex items-center gap-1 text-rating"
              >
                <span aria-hidden="true">★</span>
                <span className="font-semibold text-foreground">{formatRating(media.rating)}</span>
              </span>
              {media.year && <span className="text-muted-foreground">{media.year}</span>}
              {media.runtime ? <span className="text-muted-foreground">{formatRuntime(media.runtime)}</span> : null}
              {media.language ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground uppercase">
                  {media.language}
                </span>
              ) : null}
            </div>

            {/* Overview */}
            <p className="mt-4 max-w-2xl font-serif text-base leading-7 text-muted-foreground">
              {media.overview || t("media.noOverview")}
            </p>

            {/* Genres */}
            {media.genres.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {media.genres.map((genre) => (
                  <span
                    key={genre}
                    className="rounded-full border border-border bg-foreground/5 px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {actions}
            {extra}
          </div>
        </div>
      </div>
    </section>
  );
}
