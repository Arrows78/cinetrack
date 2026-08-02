import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Check, LoaderCircle } from "lucide-react";
import { SectionHeader } from "@/components/media/section-header";
import { useMarkWatchNext, type WatchNextEntry } from "@/features/progress/use-watch-next";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import { cn } from "@/shared/lib/cn";
import fallbackPoster from "@/assets/poster-placeholder.svg";

const episodeCode = (seasonNumber: number, episodeNumber: number) =>
  `S${seasonNumber.toString().padStart(2, "0")} | E${episodeNumber.toString().padStart(2, "0")}`;

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
        className="h-20 w-14 shrink-0 overflow-hidden rounded-lg"
      >
        <img src={poster} alt={entry.series.title} loading="lazy" className="h-full w-full object-cover" />
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          to="/series/$seriesId"
          params={{ seriesId: String(entry.series.seriesId) }}
          className="inline-flex max-w-full items-center rounded-full border border-border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <span className="truncate">{entry.series.title}</span>
        </Link>
        <p className="mt-1.5 font-display text-lg font-bold leading-tight">
          {episodeCode(entry.nextEpisode.seasonNumber, entry.nextEpisode.episodeNumber)}
          {entry.remaining > 1 ? (
            <span className="ml-2 align-middle text-xs font-semibold text-muted-foreground">
              +{entry.remaining - 1}
            </span>
          ) : null}
        </p>
        <p className="truncate text-sm text-muted-foreground">{entry.nextEpisode.title}</p>
      </div>

      <button
        type="button"
        disabled={isSaving}
        onClick={() => void handleCheck()}
        aria-label={t("media.markAsSeen")}
        title={t("media.markAsSeen")}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all",
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

export function WatchNextSection({ entries, index }: { entries: WatchNextEntry[]; index: number }) {
  const { t } = useTranslation();
  if (!entries.length) return null;

  return (
    <section>
      <SectionHeader title={t("home.watchNext")} subtitle={t("home.watchNextSubtitle")} index={index} />
      <div className="grid gap-3 lg:grid-cols-2">
        {entries.map((entry) => (
          <WatchNextRow key={entry.series.seriesId} entry={entry} />
        ))}
      </div>
    </section>
  );
}
