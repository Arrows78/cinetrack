import { useState } from "react";
import { Film } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { FilterBar } from "@/components/media/filter-bar";
import { LibraryExplorer } from "@/components/media/library-explorer";
import { TrackingList } from "@/components/media/tracking-list";
import type { MediaTab } from "@/components/media/media-hub-tab";

export function MoviesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<MediaTab>("list");

  const browseAllMovies = () => void navigate({ to: "/search", search: { scope: "movie" } });

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
        ]}
      />

      {tab === "list" ? (
        <LibraryExplorer
          lockedMediaType="movie"
          onBrowseAll={browseAllMovies}
          browseAllLabel={t("mediaHub.browseAllMovies")}
        />
      ) : null}
      {tab === "upcoming" ? (
        <TrackingList
          lockedMediaType="movie"
          onBrowseAll={browseAllMovies}
          browseAllLabel={t("mediaHub.browseAllMovies")}
        />
      ) : null}
    </div>
  );
}
