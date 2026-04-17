import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { cn } from '@/shared/lib/cn'
import { buildTmdbImageUrl, formatRating } from '@/shared/utils/format'
import type { MediaSummary } from '@/types/media'

const fallbackPoster =
  'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=80'

function MediaCardInner({ media }: { media: MediaSummary }) {
  const { t } = useTranslation()
  const image = buildTmdbImageUrl(media.posterPath, 'w500') ?? fallbackPoster

  return (
    <div className="group relative overflow-hidden rounded-[24px]">
      {/* Poster image */}
      <div className="relative aspect-[2/3] overflow-hidden">
        <img
          src={image}
          alt={media.title}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.07]"
        />

        {/* Cinematic gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0.1) 70%, transparent 100%)',
          }}
        />

        {/* Top: rating badge */}
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
          <span className="text-amber-400">★</span>
          {formatRating(media.rating)}
        </div>

        {/* Type chip */}
        <div className="absolute left-3 top-3">
          <div
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
              media.mediaType === 'movie'
                ? 'bg-primary/80 text-primary-foreground'
                : 'bg-accent/80 text-foreground'
            )}
          >
            {media.mediaType === 'movie' ? t('nav.movies') : t('nav.series')}
          </div>
        </div>

        {/* Bottom: title + year */}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="font-display line-clamp-2 text-base font-bold leading-tight text-card-foreground md:text-lg">
            {media.title}
          </p>
          <p className="mt-1 text-[11px] font-medium tracking-wide text-muted-foreground">
            {media.year ?? t('media.unknownYear')}
          </p>
        </div>

        {/* Hover shimmer */}
        <div
          className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: 'linear-gradient(135deg, rgba(102,126,234,0.08) 0%, transparent 60%)',
          }}
        />
      </div>
    </div>
  )
}

export function MediaCard({ media }: { media: MediaSummary }) {
  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
    >
      {media.mediaType === 'movie' ? (
        <Link to="/movies/$movieId" params={{ movieId: String(media.id) }}>
          <MediaCardInner media={media} />
        </Link>
      ) : (
        <Link to="/series/$seriesId" params={{ seriesId: String(media.id) }}>
          <MediaCardInner media={media} />
        </Link>
      )}
    </motion.div>
  )
}
