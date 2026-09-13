import { Film } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MediaHubPage } from "@/components/media/library/media-hub-page";

export function MoviesPage() {
  const { t } = useTranslation();
  return (
    <MediaHubPage
      mediaType="movie"
      icon={Film}
      title={t("nav.movies")}
      subtitle={t("movies.subtitle")}
      browseAllLabel={t("mediaHub.browseAllMovies")}
    />
  );
}
