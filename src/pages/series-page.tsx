import { Tv } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MediaListPage } from "@/pages/media-list-page";
import { useSeries } from "@/features/media/use-media";

export function SeriesPage() {
  const { t } = useTranslation();
  const query = useSeries();

  return (
    <MediaListPage
      query={query}
      icon={Tv}
      title={t("nav.series")}
      subtitle={t("series.subtitle")}
      emptyTitle={t("series.noSeriesAvailable")}
      emptyDescription={t("series.noSeriesAvailableDesc")}
    />
  );
}
