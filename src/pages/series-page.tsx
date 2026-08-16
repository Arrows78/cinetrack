import { useState } from "react";
import { Tv } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FilterBar } from "@/components/media/filter-bar";
import { LibraryExplorer } from "@/pages/library-page";
import { MediaListPage } from "@/pages/media-list-page";
import { TrackingList } from "@/pages/tracking-page";
import { useSeries } from "@/features/media/use-media";

type SeriesTab = "list" | "upcoming" | "discover";

export function SeriesPage() {
  const { t } = useTranslation();
  const query = useSeries();
  const [tab, setTab] = useState<SeriesTab>("list");

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Tv className="size-7 text-primary" />
        <h1 className="font-display text-3xl font-bold">{t("nav.series")}</h1>
      </header>

      <FilterBar
        value={tab}
        onChange={setTab}
        groupLabel={t("nav.series")}
        options={[
          { value: "list", label: t("mediaHub.myList") },
          { value: "upcoming", label: t("mediaHub.upcoming") },
          { value: "discover", label: t("mediaHub.discover") },
        ]}
      />

      {tab === "list" ? (
        <LibraryExplorer
          lockedMediaType="series"
          onBrowseAll={() => setTab("discover")}
          browseAllLabel={t("mediaHub.browseAllSeries")}
        />
      ) : null}
      {tab === "upcoming" ? (
        <TrackingList
          lockedMediaType="series"
          onBrowseAll={() => setTab("discover")}
          browseAllLabel={t("mediaHub.browseAllSeries")}
        />
      ) : null}
      {tab === "discover" ? (
        <MediaListPage
          query={query}
          icon={Tv}
          title={t("mediaHub.discover")}
          subtitle={t("series.subtitle")}
          emptyTitle={t("series.noSeriesAvailable")}
          emptyDescription={t("series.noSeriesAvailableDesc")}
        />
      ) : null}
    </div>
  );
}
