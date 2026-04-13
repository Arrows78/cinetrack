import { useParams } from '@tanstack/react-router';
import { CastList } from '@/components/media/cast-list';
import { MediaDetailsHero } from '@/components/media/media-details-hero';
import { SectionHeader } from '@/components/media/section-header';
import { SeenToggle } from '@/components/media/seen-toggle';
import { WatchlistButton } from '@/components/media/watchlist-button';
import { HeroSkeleton } from '@/components/states/loading-skeletons';
import { Card } from '@/components/ui/card';
import { useMovieSeen } from '@/hooks/use-local-media';
import { useMovieDetails } from '@/hooks/use-media';

export function MovieDetailPage() {
  const { movieId } = useParams({ from: '/movies/$movieId' });
  const id = Number(movieId);
  const movieQuery = useMovieDetails(id);
  const seenQuery = useMovieSeen(id);

  if (movieQuery.isLoading) return <HeroSkeleton />;
  if (!movieQuery.data) return null;

  const movie = movieQuery.data;

  return (
    <div className="space-y-8">
      <MediaDetailsHero
        media={movie}
        actions={<WatchlistButton media={movie} />}
        extra={
          <SeenToggle
            seen={Boolean(seenQuery.data)}
            disabled={seenQuery.isSaving}
            onToggle={() => seenQuery.toggleMovieSeen({ movie, watched: !seenQuery.data })}
            labelSeen="Déjà vu"
            labelUnseen="Marquer comme vu"
          />
        }
      />

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <SectionHeader title="Synopsis" />
          <p className="text-sm leading-7 text-muted-foreground md:text-base">{movie.overview}</p>
        </Card>
        <Card>
          <SectionHeader title="Fiche technique" />
          <div className="grid gap-3 text-sm text-muted-foreground">
            <div><span className="text-foreground">Pays :</span> {movie.country?.join(', ') || '—'}</div>
            <div><span className="text-foreground">Langue :</span> {movie.language || '—'}</div>
            <div><span className="text-foreground">Genres :</span> {movie.genres.join(', ') || '—'}</div>
            <div><span className="text-foreground">Statut :</span> {movie.status || '—'}</div>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="Casting principal" subtitle="Les visages les plus visibles de la fiche TMDB." />
        <CastList cast={movie.cast} />
      </section>
    </div>
  );
}
