import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/states/empty-state';
import { GridSkeleton } from '@/components/states/loading-skeletons';
import { MediaGrid } from '@/components/media/media-grid';
import { SectionHeader } from '@/components/media/section-header';
import { useMovies } from '@/hooks/use-media';

export function MoviesPage() {
  const { t } = useTranslation();
  const query = useMovies();

  if (query.isLoading) return <GridSkeleton />;
  if (!query.data?.length) {
    return (
      <EmptyState
        title={t('movies.noMoviesAvailable')}
        description={t('movies.noMoviesAvailableDesc')}
      />
    );
  }

  return (
    <section>
      <SectionHeader title={t('nav.movies')} subtitle={t('movies.subtitle')} />
      <MediaGrid items={query.data} />
    </section>
  );
}
