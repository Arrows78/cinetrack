import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { buildTmdbImageUrl, formatRating } from '@/shared/utils/format'
import type { MediaSummary } from '@/types/media'

const fallbackPoster =
  'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=80'

function MediaCardInner({ media }: { media: MediaSummary }) {
  const { t } = useTranslation()
  const image = buildTmdbImageUrl(media.posterPath, 'w500') ?? fallbackPoster

  return (
    <Card className="group overflow-hidden p-0">
      <div className="relative aspect-[2/3] overflow-hidden rounded-[28px]">
        <img
          src={image}
          alt={media.title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
          <Badge variant={media.mediaType}>
            {media.mediaType === 'movie' ? t('nav.movies') : t('nav.series')}
          </Badge>
          <Badge variant="secondary">★ {formatRating(media.rating)}</Badge>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="line-clamp-2 text-lg font-semibold text-white">{media.title}</p>
          <p className="mt-1 text-sm text-white/70">{media.year ?? t('media.unknownYear')}</p>
        </div>
      </div>
    </Card>
  )
}

export function MediaCard({ media }: { media: MediaSummary }) {
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
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
