import { EmptyState } from '@/components/states/empty-state';
import { GridSkeleton } from '@/components/states/loading-skeletons';
import { MediaGrid } from '@/components/media/media-grid';
import { SectionHeader } from '@/components/media/section-header';
import { useSeries } from '@/hooks/use-media';

export function SeriesPage() {
  const query = useSeries();

  if (query.isLoading) return <GridSkeleton />;
  if (!query.data?.length) {
    return (
      <EmptyState
        title="Aucune série disponible"
        description="Le catalogue séries n’a pas été récupéré. Vérifie l’accès API ou réessaie plus tard."
      />
    );
  }

  return (
    <section>
      <SectionHeader
        title="Séries"
        subtitle="Parcours les séries, ouvre les saisons et marque tes épisodes vus/non vus."
      />
      <MediaGrid items={query.data} />
    </section>
  );
}
