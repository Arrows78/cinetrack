import { useState } from "react";
import { Film } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FilterBar } from "@/components/media/filter-bar";
import { LibraryExplorer } from "@/pages/library-page";
import { MediaListPage } from "@/pages/media-list-page";
import { TrackingList } from "@/pages/tracking-page";
import { useMovies } from "@/features/media/use-media";

type MoviesTab = "list" | "upcoming" | "discover";

export function MoviesPage() {
  const { t } = useTranslation();
  const query = useMovies();
  const [tab, setTab] = useState<MoviesTab>("list");

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Film className="size-7 text-primary" />
        <h1 className="font-display text-3xl font-bold">{t("nav.movies")}</h1>
      </header>

      <FilterBar
        value={tab}
        onChange={setTab}
        groupLabel={t("nav.movies")}
        options={[
          { value: "list", label: t("mediaHub.myList") },
          { value: "upcoming", label: t("mediaHub.upcoming") },
          { value: "discover", label: t("mediaHub.discover") },
        ]}
      />

      {tab === "list" ? <LibraryExplorer lockedMediaType="movie" /> : null}
      {tab === "upcoming" ? <TrackingList lockedMediaType="movie" /> : null}
      {tab === "discover" ? (
        <MediaListPage
          query={query}
          icon={Film}
          title={t("mediaHub.discover")}
          subtitle={t("movies.subtitle")}
          emptyTitle={t("movies.noMoviesAvailable")}
          emptyDescription={t("movies.noMoviesAvailableDesc")}
        />
      ) : null}
    </div>
  );
}
