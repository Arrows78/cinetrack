import { useTranslation } from "react-i18next";
import { MediaProgressRow } from "@/components/media/primitives/media-progress-row";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { SeenToggleButton } from "@/components/media/tracking/seen-toggle-button";
import { useMarkWatchNext, type WatchNextEntry } from "@/features/progress/use-watch-next";
import { formatEpisodeCode } from "@/shared/utils/format";

export function WatchNextRow({ entry }: { entry: WatchNextEntry }) {
  const { markWatched, isSaving } = useMarkWatchNext();

  return (
    <MediaProgressRow
      mediaType="series"
      mediaId={entry.series.seriesId}
      posterPath={entry.series.posterPath}
      action={
        <SeenToggleButton
          isSaving={isSaving}
          onToggle={() => markWatched({ series: entry.series, episode: entry.nextEpisode })}
        />
      }
    >
      <span className="inline-flex max-w-full items-center rounded-full border border-border px-2.5 py-0.5 text-overline font-semibold uppercase text-muted-foreground">
        <span className="truncate">{entry.series.title}</span>
      </span>
      <p className="mt-1.5 font-display text-lg font-bold leading-tight">
        {formatEpisodeCode(entry.nextEpisode.seasonNumber, entry.nextEpisode.episodeNumber, { padded: true })}
        {entry.remaining > 1 ? (
          <span className="ml-2 align-middle text-xs font-semibold text-muted-foreground">+{entry.remaining - 1}</span>
        ) : null}
      </p>
      <p className="truncate text-sm text-muted-foreground">{entry.nextEpisode.title}</p>
    </MediaProgressRow>
  );
}

export function WatchNextSection({
  entries,
  index,
  size = "default",
}: {
  entries: WatchNextEntry[];
  index: number;
  size?: "default" | "sub";
}) {
  const { t } = useTranslation();
  if (!entries.length) return null;

  return (
    <section>
      <SectionHeader title={t("home.watchNext")} subtitle={t("home.watchNextSubtitle")} index={index} size={size} />
      <div className="grid gap-3 lg:grid-cols-2">
        {entries.map((entry) => (
          <WatchNextRow key={entry.series.seriesId} entry={entry} />
        ))}
      </div>
    </section>
  );
}
