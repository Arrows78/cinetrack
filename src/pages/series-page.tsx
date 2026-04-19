import { useTranslation } from "react-i18next";
import { Tv } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { MediaGrid } from "@/components/media/media-grid";
import { SectionHeader } from "@/components/media/section-header";
import { useSeries } from "@/hooks/use-media";

export function SeriesPage() {
  const { t } = useTranslation();
  const query = useSeries();

  if (query.isLoading) return <GridSkeleton />;
  if (!query.data?.length) {
    return (
      <EmptyState icon={Tv} title={t("series.noSeriesAvailable")} description={t("series.noSeriesAvailableDesc")} />
    );
  }

  return (
    <section>
      <SectionHeader title={t("nav.series")} subtitle={t("series.subtitle")} index={1} />
      <MediaGrid items={query.data} />
    </section>
  );
}
