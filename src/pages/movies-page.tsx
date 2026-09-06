import { useState } from "react";
import { Film } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { FilterBar } from "@/components/media/library/filter-bar";
import { LibraryExplorer } from "@/components/media/library/library-explorer";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { TrackingList } from "@/components/media/tracking/tracking-list";
import type { MediaTab } from "@/components/media/library/media-hub-tab";

export function MoviesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<MediaTab>("list");

  const browseAllMovies = () => void navigate({ to: "/search", search: { scope: "movie" } });

  return (
    <div className="space-y-8">
      <SectionHeader title={t("nav.movies")} subtitle={t("movies.subtitle")} icon={Film} isPageTitle />

      <FilterBar
        value={tab}
        onChange={setTab}
        as="tabs"
        groupLabel={t("mediaHub.viewTabs")}
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
