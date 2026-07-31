import { Film } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MediaListPage } from "@/pages/media-list-page";
import { useMovies } from "@/features/media/use-media";

export function MoviesPage() {
  const { t } = useTranslation();
  const query = useMovies();

  return (
    <MediaListPage
      query={query}
      icon={Film}
      title={t("nav.movies")}
      subtitle={t("movies.subtitle")}
      emptyTitle={t("movies.noMoviesAvailable")}
      emptyDescription={t("movies.noMoviesAvailableDesc")}
    />
  );
}
