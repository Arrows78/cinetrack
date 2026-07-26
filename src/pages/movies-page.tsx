import { Film } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LoadMoreButton } from "@/components/media/load-more-button";
import { MediaGrid } from "@/components/media/media-grid";
import { SectionHeader } from "@/components/media/section-header";
import { EmptyState } from "@/components/states/empty-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { useMovies } from "@/hooks/use-media";

export function MoviesPage() {
  const { t } = useTranslation();
  const query = useMovies();
  if (query.isLoading) return <GridSkeleton />;
  if (query.isError) return <RemoteErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.items.length) {
    return <EmptyState icon={Film} title={t("movies.noMoviesAvailable")} description={t("movies.noMoviesAvailableDesc")} />;
  }

  return (
    <section>
      <SectionHeader title={t("nav.movies")} subtitle={t("movies.subtitle")} index={1} />
      <MediaGrid items={query.items} />
      <LoadMoreButton
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        onClick={() => void query.fetchNextPage()}
      />
    </section>
  );
}
