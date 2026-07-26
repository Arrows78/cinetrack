import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";
import type { Season } from "@/types/media";
import { LibraryEditor } from "@/components/library/library-editor";
import { CastList } from "@/components/media/cast-list";
import { MediaDetailsHero } from "@/components/media/media-details-hero";
import { ProgressBar } from "@/components/media/progress-bar";
import { SeasonAccordion } from "@/components/media/season-accordion";
import { SectionHeader } from "@/components/media/section-header";
import { SeenToggle } from "@/components/media/seen-toggle";
import { WatchlistButton } from "@/components/media/watchlist-button";
import { HeroSkeleton } from "@/components/states/loading-skeletons";
import { useEpisodeProgress } from "@/hooks/use-local-media";
import { useSeriesDetails, useSeriesSeasons } from "@/hooks/use-media";
import { progressRepository } from "@/services/local/progress-repository";

export function SeriesDetailPage() {
  const { t } = useTranslation();
  const { seriesId } = useParams({ from: "/series/$seriesId" });
  const id = Number(seriesId);
  const seriesQuery = useSeriesDetails(id);
  const progressQuery = useEpisodeProgress(id);
  const seasonNumbers = useMemo(
    () => (seriesQuery.data?.seasons ?? []).map((season) => season.seasonNumber).filter((number) => number > 0),
    [seriesQuery.data?.seasons]
  );
  const seasonQueries = useSeriesSeasons(id, seasonNumbers);
  if (seriesQuery.isLoading) return <HeroSkeleton />;
  if (!seriesQuery.data) return null;
  const series = seriesQuery.data;
  const seasons = seasonQueries.map((query) => query.data).filter((season): season is Season => Boolean(season));
  const progress = progressRepository.calculateSeriesProgress(id, seasons, progressQuery.data ?? []);

  return (
    <div className="space-y-8">
      <MediaDetailsHero
        media={series}
        actions={<WatchlistButton media={series} />}
        extra={<SeenToggle seen={progress.completed} disabled={progressQuery.isSaving || !seasons.length} onToggle={() => progressQuery.markSeriesSeen({ series, seasons, watched: !progress.completed })} celebrateOnSeen />}
      />
      <LibraryEditor media={series} />
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-border bg-black/[0.03] p-6 dark:bg-white/[0.03]">
          <SectionHeader title={t("media.overview")} />
          <p className="text-sm leading-7 text-muted-foreground md:text-base">{series.overview}</p>
        </div>
        <div className="space-y-4">
          <div className="rounded-3xl border border-border bg-black/[0.03] p-5 dark:bg-white/[0.03]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{t("series.currentProgress")}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="font-display text-5xl font-bold leading-none">{progress.progressPercent}<span className="text-xl font-normal text-muted-foreground">%</span></p>
              <p className="text-sm text-muted-foreground">{progress.watchedEpisodes}/{progress.totalEpisodes} ep.</p>
            </div>
            <div className="mt-4"><ProgressBar value={progress.progressPercent} /></div>
          </div>
          <div className="rounded-3xl border border-border bg-black/[0.03] p-5 dark:bg-white/[0.03]">
            <SectionHeader title={t("series.seriesInfo")} />
            <div className="grid gap-2 text-sm">
              {[
                { label: t("media.seasons"), value: series.numberOfSeasons },
                { label: t("media.episodes"), value: series.numberOfEpisodes ?? "—" },
                { label: t("media.status"), value: series.status || "—" },
                { label: t("media.genres"), value: series.genres.join(", ") || "—" },
              ].map(({ label, value }) => <div key={label} className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>)}
            </div>
          </div>
        </div>
      </section>
      <section>
        <SectionHeader title={t("series.seasonsAndEpisodes")} subtitle={t("series.seasonsAndEpisodesDesc")} />
        <SeasonAccordion series={{ ...series, numberOfEpisodes: series.numberOfEpisodes }} seasons={seasons} watchedEpisodes={progressQuery.data ?? []} isSaving={progressQuery.isSaving} onToggleEpisode={(episode, watched) => progressQuery.toggleEpisodeSeen({ series, episode, watched })} onToggleSeason={(season, watched) => progressQuery.markSeasonSeen({ series, season, watched })} />
      </section>
      <section><SectionHeader title={t("media.cast")} /><CastList cast={series.cast} /></section>
    </div>
  );
}
