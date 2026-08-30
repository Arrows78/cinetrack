import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { CheckCheck, Maximize2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/media/primitives/progress-bar";
import { EpisodeCard } from "@/components/media/tracking/episode-card";
import { useConfetti } from "@/hooks/use-confetti";
import { CONFETTI_DELAY_MS, CONFETTI_SEASON_COMPLETE_DELAY_MS } from "@/shared/constants/query";
import { cn } from "@/shared/lib/cn";
import type { EpisodeProgress, MediaSummary, Season } from "@/types/media";
import { calculateSeriesProgress } from "@/features/progress/progress-utils";

/* Episode filmstrip — each episode is a sprocket-hole perforation; watched
   ones are "lit up" in the accent color, like exposed frames. Shows watch
   progress at a glance, the way a strip of actual film would give. Exported
   for the design-system catalog's Signature section. */
export function EpisodeDots({ episodes, watchedSet }: { episodes: Season["episodes"]; watchedSet: Set<number> }) {
  const max = 40;
  const shown = episodes.slice(0, max);
  return (
    // Purely decorative: the adjacent ProgressBar already states the same
    // watched/total count accessibly, so this doesn't need its own
    // announcement. Watched vs. unwatched isn't color alone either — a
    // "lit up" dot is also taller, not just a different hue, so the
    // distinction survives a color-vision deficiency.
    <div
      aria-hidden="true"
      className="inline-flex flex-wrap items-end gap-[0.1875rem] rounded-full bg-foreground/[0.06] px-2.5 py-1.5"
    >
      {shown.map((ep) => (
        <motion.div
          key={ep.id}
          layout
          className={cn(
            "w-1 rounded-[0.0625rem] transition-all duration-base",
            watchedSet.has(ep.id) ? "h-2.5 bg-primary" : "h-1.5 bg-foreground/20"
          )}
        />
      ))}
      {episodes.length > max && (
        <span className="ml-1 text-caption text-muted-foreground">+{episodes.length - max}</span>
      )}
    </div>
  );
}

export function SeasonAccordion({
  series,
  seasons,
  watchedEpisodes,
  onToggleEpisode,
  onToggleSeason,
  isSaving,
}: {
  series: MediaSummary & { numberOfEpisodes?: number };
  seasons: Season[];
  watchedEpisodes: EpisodeProgress[];
  onToggleEpisode: (episode: Season["episodes"][number], watched: boolean, note?: string) => Promise<void>;
  onToggleSeason: (season: Season, watched: boolean) => Promise<void>;
  isSaving?: boolean;
}) {
  const { t } = useTranslation();
  const { celebrate } = useConfetti();
  const watchedSet = useMemo(() => new Set(watchedEpisodes.map((item) => item.episodeId)), [watchedEpisodes]);
  const progress = calculateSeriesProgress(series.id, seasons, watchedEpisodes);

  /* Handler that detects season completion and fires confetti */
  const handleToggleEpisode = async (
    season: Season,
    episode: Season["episodes"][number],
    watched: boolean,
    note?: string
  ) => {
    if (watched) {
      const seasonWatched = season.episodes.filter((ep) => watchedSet.has(ep.id)).length;
      const willComplete = seasonWatched + 1 === season.episodes.length;
      if (willComplete) setTimeout(celebrate, CONFETTI_SEASON_COMPLETE_DELAY_MS);
    }
    await onToggleEpisode(episode, watched, note);
  };

  return (
    <div className="space-y-4">
      {/* Seasons */}
      <Accordion type="multiple" className="space-y-3">
        {seasons.map((season) => {
          const seasonProgress = progress.seasons.find((item) => item.seasonNumber === season.seasonNumber);
          const pct = seasonProgress?.progressPercent ?? 0;
          const isComplete = pct >= 100;

          return (
            <AccordionItem key={season.seasonNumber} value={`season-${season.seasonNumber}`}>
              <AccordionTrigger className="group rounded-2xl border border-border bg-foreground/[0.03] px-5 py-4 hover:bg-foreground/[0.06] data-[state=open]:rounded-b-none data-[state=open]:border-b-0">
                <div className="w-full space-y-3 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {isComplete && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-primary"
                        >
                          <CheckCheck className="h-3 w-3 text-primary-foreground" />
                        </motion.div>
                      )}
                      <p className={cn("font-semibold", isComplete && "text-primary")}>
                        {season.name || `${t("media.season")} ${season.seasonNumber}`}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {seasonProgress?.watchedEpisodes ?? 0}/{season.episodes.length}
                    </span>
                  </div>

                  {/* Dots strip */}
                  <EpisodeDots episodes={season.episodes} watchedSet={watchedSet} />

                  {/* Progress bar */}
                  <ProgressBar value={pct} size="sm" />
                </div>
              </AccordionTrigger>

              <AccordionContent className="rounded-b-2xl border border-t-0 border-border bg-foreground/[0.02] px-4 pb-4">
                {/* Season actions */}
                <div className="flex flex-wrap items-center gap-2 py-3">
                  <Button
                    variant={pct === 100 ? "outline" : "secondary"}
                    size="sm"
                    onClick={() => {
                      const newWatched = pct !== 100;
                      void onToggleSeason(season, newWatched);
                      if (newWatched && pct < 100) setTimeout(celebrate, CONFETTI_DELAY_MS);
                    }}
                    disabled={isSaving}
                  >
                    <CheckCheck className="h-4 w-4" />
                    {pct === 100 ? t("series.markSeasonUnseen") : t("series.markSeasonSeen")}
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link
                      to="/series/$seriesId/season/$seasonNumber"
                      params={{ seriesId: String(series.id), seasonNumber: String(season.seasonNumber) }}
                    >
                      <Maximize2 className="h-4 w-4" />
                      {t("series.openSeasonPage")}
                    </Link>
                  </Button>
                </div>

                {/* Episode list */}
                <div className="space-y-0.5">
                  {season.episodes.map((episode) => {
                    const isWatched = watchedSet.has(episode.id);
                    const unwatchedCount = season.episodes.filter((ep) => !watchedSet.has(ep.id)).length;
                    const isLastUnwatched = !isWatched && unwatchedCount === 1;

                    return (
                      <EpisodeCard
                        key={episode.id}
                        episode={{ ...episode, watched: isWatched }}
                        disabled={isSaving}
                        isLastUnwatched={isLastUnwatched}
                        onToggleSeen={(note) => void handleToggleEpisode(season, episode, !isWatched, note)}
                      />
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
