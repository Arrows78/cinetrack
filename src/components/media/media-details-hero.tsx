import { useTranslation } from 'react-i18next';
import type * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { buildTmdbImageUrl, formatRating, formatRuntime } from '@/shared/utils/format';
import type { MediaSummary } from '@/types/media';

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
  const backdrop = buildTmdbImageUrl(media.backdropPath, 'original');
  const poster = buildTmdbImageUrl(media.posterPath, 'w500');

  return (
    <section className="relative overflow-hidden rounded-[32px] border border-white/5 bg-card/70">
      {backdrop ? (
        <>
          <img
            src={backdrop}
            alt={media.title}
            className="absolute inset-0 h-full w-full object-cover opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/88 to-background/70" />
        </>
      ) : null}

      <div className="relative grid gap-6 p-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:p-8">
        <div>
          <img
            src={poster ?? 'https://placehold.co/500x750/111827/e5e7eb?text=Poster'}
            alt={media.title}
            className="w-full rounded-[28px] border border-white/10 object-cover shadow-2xl"
          />
        </div>

        <div className="flex flex-col justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{media.mediaType === 'movie' ? t('nav.movies') : t('nav.series')}</Badge>
              {media.status ? <Badge variant="secondary">{media.status}</Badge> : null}
            </div>
            <h2 className="mt-4 text-3xl font-bold text-balance md:text-5xl">{media.title}</h2>
            {media.originalTitle && media.originalTitle !== media.title ? (
              <p className="mt-2 text-base text-muted-foreground">
                {t('media.originalTitle')}: {media.originalTitle}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>★ {formatRating(media.rating)}</span>
              <span>{media.year ?? t('media.unknownYear')}</span>
              {media.runtime ? <span>{formatRuntime(media.runtime)}</span> : null}
              {media.language ? <span>{media.language}</span> : null}
            </div>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
              {media.overview || t('media.noOverview')}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {media.genres.map((genre) => (
                <Badge key={genre} variant="outline">
                  {genre}
                </Badge>
              ))}
            </div>
            <Separator />
            <div className="flex flex-wrap gap-3">
              {actions}
              {extra}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
