import { useState } from "react";
import { Tv } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { FilterBar } from "@/components/media/filter-bar";
import { LibraryExplorer } from "@/components/media/library-explorer";
import { TrackingList } from "@/components/media/tracking-list";
import type { MediaTab } from "@/components/media/media-hub-tab";

export function SeriesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<MediaTab>("list");

  const browseAllSeries = () => void navigate({ to: "/search", search: { scope: "series" } });

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
        ]}
      />

      {tab === "list" ? (
        <LibraryExplorer
          lockedMediaType="series"
          onBrowseAll={browseAllSeries}
          browseAllLabel={t("mediaHub.browseAllSeries")}
        />
      ) : null}
      {tab === "upcoming" ? (
        <TrackingList
          lockedMediaType="series"
          onBrowseAll={browseAllSeries}
          browseAllLabel={t("mediaHub.browseAllSeries")}
        />
      ) : null}
    </div>
  );
}
