import { Tv } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LoadMoreButton } from "@/components/media/load-more-button";
import { MediaGrid } from "@/components/media/media-grid";
import { SectionHeader } from "@/components/media/section-header";
import { EmptyState } from "@/components/states/empty-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { useSeries } from "@/features/media/use-media";

export function SeriesPage() {
  const { t } = useTranslation();
  const query = useSeries();
  if (query.isLoading) return <GridSkeleton />;
  if (query.isError) return <RemoteErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.items.length) {
    return (
      <EmptyState icon={Tv} title={t("series.noSeriesAvailable")} description={t("series.noSeriesAvailableDesc")} />
    );
  }

  return (
    <section>
      <SectionHeader title={t("nav.series")} subtitle={t("series.subtitle")} index={1} />
      <MediaGrid items={query.items} />
      <LoadMoreButton
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        onClick={() => void query.fetchNextPage()}
      />
    </section>
  );
}
