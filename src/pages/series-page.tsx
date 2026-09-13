import { Tv } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MediaHubPage } from "@/components/media/library/media-hub-page";

export function SeriesPage() {
  const { t } = useTranslation();
  return (
    <MediaHubPage
      mediaType="series"
      icon={Tv}
      title={t("nav.series")}
      subtitle={t("series.subtitle")}
      browseAllLabel={t("mediaHub.browseAllSeries")}
    />
  );
}
