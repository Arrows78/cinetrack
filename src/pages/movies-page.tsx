import { EmptyState } from '@/components/states/empty-state';
import { GridSkeleton } from '@/components/states/loading-skeletons';
import { MediaGrid } from '@/components/media/media-grid';
import { SectionHeader } from '@/components/media/section-header';
import { useMovies } from '@/hooks/use-media';

export function MoviesPage() {
  const query = useMovies();

  if (query.isLoading) return <GridSkeleton />;
  if (!query.data?.length) {
    return (
      <EmptyState
        title="Aucun film disponible"
        description="Le catalogue n’a pas pu être chargé pour le moment. Vérifie ta connexion ou ta configuration TMDB."
      />
    );
  }

  return (
    <section>
      <SectionHeader
        title="Films"
        subtitle="Affichage premium, posters immersifs et accès direct aux fiches détaillées."
      />
      <MediaGrid items={query.data} />
    </section>
  );
}
