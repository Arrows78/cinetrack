import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Check, LoaderCircle } from "lucide-react";
import { SectionHeader } from "@/components/media/section-header";
import { useMarkWatchNext, type WatchNextEntry } from "@/features/progress/use-watch-next";
import { buildTmdbImageUrl, formatEpisodeCode } from "@/shared/utils/format";
import { cn } from "@/shared/lib/cn";
import fallbackPoster from "@/assets/poster-placeholder.svg";

function WatchNextRow({ entry }: { entry: WatchNextEntry }) {
  const { t } = useTranslation();
  const { markWatched, isSaving } = useMarkWatchNext();
  const [justChecked, setJustChecked] = useState(false);
  const poster = buildTmdbImageUrl(entry.series.posterPath, "w185") ?? fallbackPoster;

  const handleCheck = async () => {
    setJustChecked(true);
    try {
      await markWatched({ series: entry.series, episode: entry.nextEpisode });
    } finally {
      setJustChecked(false);
    }
  };

  return (
    <div className="surface flex items-center gap-4 overflow-hidden rounded-card p-3 pr-4">
      <Link
        to="/series/$seriesId"
        params={{ seriesId: String(entry.series.seriesId) }}
        className="flex min-w-0 flex-1 items-center gap-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img src={poster} alt="" loading="lazy" className="h-20 w-14 shrink-0 rounded-lg object-cover" />

        <div className="min-w-0 flex-1">
          <span className="inline-flex max-w-full items-center rounded-full border border-border px-2.5 py-0.5 text-overline font-semibold uppercase text-muted-foreground">
            <span className="truncate">{entry.series.title}</span>
          </span>
          <p className="mt-1.5 font-display text-lg font-bold leading-tight">
            {formatEpisodeCode(entry.nextEpisode.seasonNumber, entry.nextEpisode.episodeNumber, { padded: true })}
            {entry.remaining > 1 ? (
              <span className="ml-2 align-middle text-xs font-semibold text-muted-foreground">
                +{entry.remaining - 1}
              </span>
            ) : null}
          </p>
          <p className="truncate text-sm text-muted-foreground">{entry.nextEpisode.title}</p>
        </div>
      </Link>

      <button
        type="button"
        disabled={isSaving}
        onClick={() => void handleCheck()}
        aria-label={t("media.markAsSeen")}
        title={t("media.markAsSeen")}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          justChecked
            ? "border-success bg-success text-success-foreground"
            : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
        )}
      >
        {isSaving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
      </button>
    </div>
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
