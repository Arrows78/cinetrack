import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { WatchNextSection } from "@/components/media/tracking/watch-next-section";
import { UpNextSection } from "@/components/media/home/up-next-section";
import { NewEpisodesSection } from "@/components/media/home/new-episodes-section";
import { AvailableNowSection } from "@/components/media/home/available-now-section";
import { AlertsSection } from "@/components/media/home/alerts-section";
import { WatchTonightTeaserSection } from "@/components/media/home/watch-tonight-teaser-section";
import { PersonalizedRecommendationSection } from "@/components/media/home/personalized-recommendation-section";
import { NeedsAttentionSection, selectBacklogSeries } from "@/components/media/home/needs-attention-section";
import { useTrackedSeries } from "@/features/progress/use-progress";
import { useTodayHubEpisodes } from "@/features/progress/use-watch-next";
import { useAvailabilityStatus } from "@/features/availability/use-availability-alerts";
import { useWatchTonightPicks } from "@/features/watch-tonight/use-watch-tonight";
import { useLibrary } from "@/features/library/use-library";
import { selectStalePlannedItems } from "@/features/library/use-library-health-selectors";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useBecauseYouLiked } from "@/features/media/use-because-you-liked";
import { useFavouriteGenreRail } from "@/components/media/detail/use-favourite-genre-rail";
import { usePeopleYouWatch } from "@/features/media/use-people-you-watch";
import { logger } from "@/shared/lib/logger";
import { errorMessage } from "@/shared/lib/errors";
import type { Movie, Series } from "@/types/media";

// Dashboard cards stay compact — a handful of rows each, with the full
// underlying page (Library, Tracking, Watch Tonight) one click away for
// anything past this cap. Mirrors PICKS_PER_TYPE's reasoning in
// watch-tonight-service.ts.
const CARD_ROW_LIMIT = 4;
const WATCH_TONIGHT_TEASER_LIMIT = 3;

/**
 * The Today Hub — "what does CineTrack want to show me today?" Generalizes
 * the page's former "For You" panel (see home-page.tsx's git history) from
 * 4 personalized rails to the full set of daily-relevant capabilities,
 * each already backed by an existing feature; this component is the one
 * place that composes all of their hooks so every card below stays a plain,
 * prop-driven presentational component (same split WatchNextSection/
 * PeopleYouWatchRails already used).
 */
export function TodayHub({ index }: { index: number }) {
  const { t } = useTranslation();
  const trackedSeriesQuery = useTrackedSeries();
  const trackedSeries = useMemo(() => trackedSeriesQuery.data ?? [], [trackedSeriesQuery.data]);
  const episodes = useTodayHubEpisodes(trackedSeries);
  const availability = useAvailabilityStatus();
  const preferences = usePreferences();
  const hideWatched = preferences.data?.hideWatchedInDiscovery ?? false;
  const watchTonight = useWatchTonightPicks({ hideWatched });
  const libraryQuery = useLibrary();
  const becauseYouLiked = useBecauseYouLiked();
  const favouriteGenreRail = useFavouriteGenreRail();
  const peopleYouWatch = usePeopleYouWatch();

  const backlog = useMemo(() => selectBacklogSeries(trackedSeries), [trackedSeries]);
  const stale = useMemo(() => selectStalePlannedItems(libraryQuery.data ?? [], new Date()), [libraryQuery.data]);

  const teaserItems = useMemo<Array<Movie | Series>>(
    () =>
      [...(watchTonight.data?.movies ?? []), ...(watchTonight.data?.series ?? [])].slice(0, WATCH_TONIGHT_TEASER_LIMIT),
    [watchTonight.data]
  );

  // Best-effort dashboard cards, same convention as WeeklyAgendaSection:
  // a failed secondary fetch hides that one card rather than the whole
  // page, but the failure is still logged, never swallowed outright.
  useEffect(() => {
    if (episodes.isError) logger.warn("[today-hub] Episode resolution failed for one or more tracked series");
  }, [episodes.isError]);
  useEffect(() => {
    if (availability.isError) logger.warn("[today-hub] Availability status failed to load");
  }, [availability.isError]);
  useEffect(() => {
    if (watchTonight.isError)
      logger.warn(`[today-hub] Watch Tonight teaser failed: ${errorMessage(watchTonight.error)}`);
  }, [watchTonight.isError, watchTonight.error]);

  const hasRecommendationContent =
    (Boolean(becauseYouLiked.seedTitle) && becauseYouLiked.items.length > 0) ||
    (Boolean(favouriteGenreRail.genre) && favouriteGenreRail.items.length > 0) ||
    (Boolean(peopleYouWatch.topDirector) && peopleYouWatch.directorItems.length > 0) ||
    (Boolean(peopleYouWatch.topActor) && peopleYouWatch.actorItems.length > 0);

  const hasHubContent =
    episodes.continueWatching.length > 0 ||
    episodes.upNext.length > 0 ||
    episodes.newEpisodes.length > 0 ||
    availability.availableNow.length > 0 ||
    availability.pending.length > 0 ||
    teaserItems.length > 0 ||
    hasRecommendationContent ||
    backlog.length > 0 ||
    stale.length > 0;

  if (!hasHubContent) return null;

  return (
    <section>
      <SectionHeader title={t("home.todayHubTitle")} subtitle={t("home.todayHubSubtitle")} index={index} />
      <Panel tone="highlight" className="space-y-8">
        {episodes.continueWatching.length > 0 ? (
          <WatchNextSection entries={episodes.continueWatching.slice(0, CARD_ROW_LIMIT)} index={0} size="sub" />
        ) : null}
        <UpNextSection entries={episodes.upNext.slice(0, CARD_ROW_LIMIT)} />
        <NewEpisodesSection entries={episodes.newEpisodes.slice(0, CARD_ROW_LIMIT)} />
        <AvailableNowSection statuses={availability.availableNow.slice(0, CARD_ROW_LIMIT)} />
        <AlertsSection statuses={availability.pending.slice(0, CARD_ROW_LIMIT)} />
        <WatchTonightTeaserSection items={teaserItems} />
        <PersonalizedRecommendationSection
          becauseYouLiked={becauseYouLiked}
          favouriteGenreRail={favouriteGenreRail}
          peopleYouWatch={peopleYouWatch}
        />
        <NeedsAttentionSection backlog={backlog.slice(0, CARD_ROW_LIMIT)} stale={stale.slice(0, CARD_ROW_LIMIT)} />
      </Panel>
    </section>
  );
}
