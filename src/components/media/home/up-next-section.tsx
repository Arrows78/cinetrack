import { useTranslation } from "react-i18next";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { WatchNextRow } from "@/components/media/tracking/watch-next-section";
import type { WatchNextEntry } from "@/features/progress/use-watch-next";

/** Today Hub's "À regarder ensuite" card — tracked series never started, ready to begin. */
export function UpNextSection({ entries }: { entries: WatchNextEntry[] }) {
  const { t } = useTranslation();
  if (!entries.length) return null;

  return (
    <div>
      <SectionHeader title={t("home.upNext")} subtitle={t("home.upNextSubtitle")} size="sub" />
      <div className="grid gap-3 lg:grid-cols-2">
        {entries.map((entry) => (
          <WatchNextRow key={entry.series.seriesId} entry={entry} />
        ))}
      </div>
    </div>
  );
}
