import { useTranslation } from "react-i18next";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { WatchNextRow } from "@/components/media/tracking/watch-next-section";
import type { WatchNextEntry } from "@/features/progress/use-watch-next";

/** Today Hub's "Nouveaux épisodes" card — a fresh drop for a show you're otherwise caught up on. */
export function NewEpisodesSection({ entries }: { entries: WatchNextEntry[] }) {
  const { t } = useTranslation();
  if (!entries.length) return null;

  return (
    <div>
      <SectionHeader title={t("home.newEpisodes")} subtitle={t("home.newEpisodesSubtitle")} size="sub" />
      <div className="grid gap-3 lg:grid-cols-2">
        {entries.map((entry) => (
          <WatchNextRow key={entry.series.seriesId} entry={entry} />
        ))}
      </div>
    </div>
  );
}
