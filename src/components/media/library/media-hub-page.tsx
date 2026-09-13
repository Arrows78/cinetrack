import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, type LucideIcon } from "lucide-react";
import { FilterBar } from "@/components/media/library/filter-bar";
import { LibraryExplorer } from "@/components/media/library/library-explorer";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { TrackingList } from "@/components/media/tracking/tracking-list";
import type { MediaTab } from "@/components/media/library/media-hub-tab";
import type { MediaType } from "@/types/media";

/**
 * Series and Movies pages were near-identical (title/icon/i18n keys aside) —
 * this is the one component both now render, so the two views can't drift
 * apart from each other over time the way two hand-maintained copies would.
 * The "Upcoming" tab carries its own icon (not just text) so it reads as a
 * distinct view rather than a plain subset of "My list".
 */
export function MediaHubPage({
  mediaType,
  icon,
  title,
  subtitle,
  browseAllLabel,
}: {
  mediaType: MediaType;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  browseAllLabel: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<MediaTab>("list");

  const browseAll = () => void navigate({ to: "/search", search: { scope: mediaType } });

  return (
    <div className="space-y-8">
      <SectionHeader title={title} subtitle={subtitle} icon={icon} isPageTitle />

      <FilterBar
        value={tab}
        onChange={setTab}
        as="tabs"
        groupLabel={t("mediaHub.viewTabs")}
        options={[
          { value: "list", label: t("mediaHub.myList") },
          {
            value: "upcoming",
            label: (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {t("mediaHub.upcoming")}
              </span>
            ),
          },
        ]}
      />

      {tab === "list" ? (
        <LibraryExplorer lockedMediaType={mediaType} onBrowseAll={browseAll} browseAllLabel={browseAllLabel} />
      ) : null}
      {tab === "upcoming" ? (
        <TrackingList lockedMediaType={mediaType} onBrowseAll={browseAll} browseAllLabel={browseAllLabel} />
      ) : null}
    </div>
  );
}
