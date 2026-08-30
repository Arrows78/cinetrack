import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, BarChart3, CalendarDays, CircleCheck, History, LibraryBig, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Tile } from "@/components/ui/tile";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { GridSkeleton, HeroSkeleton } from "@/components/states/loading-skeletons";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { StatCard } from "@/components/media/primitives/stat-card";
import { CatalogueSections, CATALOGUE_SECTIONS } from "@/components/media/discover/catalogue-sections";
import { BrowseByGenre, BrowseByPlatform } from "@/components/media/discover/catalogue-browse";
import { HideWatchedToggle } from "@/components/media/library/hide-watched-toggle";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import { hasTmdbToken } from "@/shared/config/env";
import { useHistory } from "@/features/history/use-history";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useTrackedSeries } from "@/features/progress/use-progress";
import { useLibrary } from "@/features/library/use-library";
import { useHomeFeed } from "@/features/media/use-media";
import { TodayHub } from "@/components/media/home/today-hub";
import { WeeklyAgendaSection } from "@/components/media/tracking/weekly-agenda-section";
import { OnThisDaySection } from "@/components/media/activity/on-this-day-section";

// Home has no single static title to promote (its own visible "hero" title
// is a specific trending movie's name, not the page's identity) — a
// sr-only <h1> is the page's real heading instead, same text as the nav
// label so a screen reader user hears exactly what a sighted user reads on
// the (currently active) sidebar/tab-bar entry. Wrapping rather than
// inlining into every one of HomePageContent's five early returns below.
export function HomePage() {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="sr-only">{t("nav.home")}</h1>
      <HomePageContent />
    </>
  );
}

function HomePageContent() {
  const { t } = useTranslation();
  const [dismissedTokenPrompt, setDismissedTokenPrompt] = useState(false);
  const homeQuery = useHomeFeed();
  const libraryQuery = useLibrary();
  const plannedCount = useMemo(
    () => (libraryQuery.data ?? []).filter((item) => item.status === "planned").length,
    [libraryQuery.data]
  );
  const trackedSeriesQuery = useTrackedSeries();
  const historyQuery = useHistory();
  const preferences = usePreferences();
  const hideWatched = preferences.data?.hideWatchedInDiscovery ?? false;
  const library = libraryQuery.data ?? [];

  if (!hasTmdbToken && !dismissedTokenPrompt) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-foreground/[0.04] text-muted-foreground/60">
          <Sparkles className="h-7 w-7" />
        </div>
        <p className="font-display text-2xl font-bold tracking-tight">{t("home.noTokenTitle")}</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{t("home.noTokenDesc")}</p>

        <div className="mt-8 grid gap-4 text-left sm:grid-cols-2">
          <Panel tone="subtle" className="space-y-3">
            <p className="text-sm font-semibold">{t("home.noTokenWorksTitle")}</p>
            <ul className="space-y-2">
              {[t("home.noTokenWorksItem1"), t("home.noTokenWorksItem2"), t("home.noTokenWorksItem3")].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel tone="highlight" className="space-y-3">
            <p className="text-sm font-semibold">{t("home.noTokenUnlocksTitle")}</p>
            <ul className="space-y-2">
              {[t("home.noTokenUnlocksItem1"), t("home.noTokenUnlocksItem2"), t("home.noTokenUnlocksItem3")].map(
                (item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {item}
                  </li>
                )
              )}
            </ul>
          </Panel>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link to="/settings">{t("home.noTokenAddCta")}</Link>
          </Button>
          <Button type="button" variant="outline" onClick={() => setDismissedTokenPrompt(true)}>
            {t("home.noTokenContinueCta")}
          </Button>
        </div>
      </div>
    );
  }

  if (!hasTmdbToken && dismissedTokenPrompt) {
    return (
      <div className="space-y-10">
        <Panel tone="highlight" className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold">{t("home.noTokenBannerTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("home.noTokenBannerDesc")}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings">{t("home.noTokenAddCta")}</Link>
          </Button>
        </Panel>

        <section>
          <SectionHeader title={t("home.offlineSummaryTitle")} subtitle={t("home.offlineSummarySubtitle")} index={1} />
          <div className="flex flex-wrap items-center gap-6">
            <StatCard
              label={t("home.followedSeries")}
              value={String(trackedSeriesQuery.data?.length ?? 0)}
              helper={t("home.trackedHelper")}
            />
            <StatCard
              label={t("library.statuses.planned")}
              value={String(plannedCount)}
              helper={t("home.plannedHelper")}
            />
            <StatCard
              label={t("nav.history")}
              value={String(historyQuery.data?.pages[0]?.length ?? 0)}
              helper={t("home.activityHelper")}
            />
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              { to: "/library", icon: LibraryBig, label: t("nav.library"), desc: t("home.offlineLinksLibraryDesc") },
              {
                to: "/tracking",
                icon: CalendarDays,
                label: t("nav.tracking"),
                desc: t("home.offlineLinksTrackingDesc"),
              },
              { to: "/history", icon: History, label: t("nav.history"), desc: t("home.offlineLinksHistoryDesc") },
              { to: "/stats", icon: BarChart3, label: t("nav.stats"), desc: t("home.offlineLinksStatsDesc") },
            ] as const
          ).map(({ to, icon: Icon, label, desc }) => (
            <Tile asChild key={to} className="bg-foreground/[0.03] p-4 transition-colors hover:bg-foreground/[0.06]">
              <Link to={to}>
                <Icon className="h-5 w-5 text-primary" />
                <p className="mt-3 font-semibold">{label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </Link>
            </Tile>
          ))}
        </section>
      </div>
    );
  }

  if (homeQuery.isLoading) {
    return (
      <div className="space-y-10">
        <HeroSkeleton />
        <GridSkeleton />
      </div>
    );
  }

  if (homeQuery.isError) {
    return <RemoteErrorState error={homeQuery.error} onRetry={() => void homeQuery.refetch()} />;
  }

  const hero = homeQuery.data?.trendingMovies[0];

  let sectionIndex = 0;

  return (
    <div className="space-y-12">
      {/* Cinematic hero */}
      {hero ? (
        <section className="relative overflow-hidden rounded-hero border border-border animate-in-up">
          {/* Backdrop */}
          <img
            src={buildTmdbImageUrl(hero.backdropPath, "original")}
            alt={hero.title}
            className="absolute inset-0 h-full w-full object-cover scale-105"
          />
          {/* Cinematic overlay */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(108deg, hsl(var(--background)) 0%, hsl(var(--background)/0.93) 38%, hsl(var(--background)/0.55) 68%, hsl(var(--background)/0.15) 100%)",
            }}
          />
          {/* Bottom fade */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/60 to-transparent" />

          <div className="relative px-6 py-8 lg:px-8 lg:py-10">
            {/* Trending badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-overline font-semibold text-primary uppercase animate-in delay-200">
              <Sparkles className="h-3 w-3" />
              {t("home.premiumSelection")}
            </div>

            {/* Title */}
            <h2 className="mt-5 max-w-2xl font-display text-display-title text-balance text-card-foreground md:text-display-hero delay-300 hero-title-reveal">
              {hero.title}
            </h2>

            {/* Overview */}
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground animate-in delay-500">
              {hero.overview}
            </p>

            {/* Stats row */}
            <div className="mt-6 flex flex-wrap items-center gap-6 pt-5 animate-in delay-600">
              <StatCard
                label={t("home.followedSeries")}
                value={String(trackedSeriesQuery.data?.length ?? 0)}
                helper={t("home.trackedHelper")}
              />
              <StatCard
                label={t("library.statuses.planned")}
                value={String(plannedCount)}
                helper={t("home.plannedHelper")}
              />
              <StatCard
                label={t("nav.history")}
                value={String(historyQuery.data?.pages[0]?.length ?? 0)}
                helper={t("home.activityHelper")}
              />
            </div>

            {/* Actions */}
            <div className="mt-7 flex flex-wrap gap-3 animate-in delay-700">
              <Button
                asChild
                size="lg"
                className="group gap-2 transition-all duration-base hover:shadow-glow-lg hover:scale-[1.02]"
              >
                <Link to="/movies/$movieId" params={{ movieId: String(hero.id) }}>
                  {t("home.viewDetails")}
                  <ArrowRight className="h-4 w-4 transition-transform duration-base group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="transition-all duration-base hover:bg-primary/10 hover:border-primary/40"
              >
                <Link to="/search">{t("home.exploreCatalog")}</Link>
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {/* Opt-in "On this day" delight card (see UserPreferences.onThisDayEnabled,
          toggled in Settings) — not a numbered rail like the sections below,
          same treatment as the hero above it. Self-contained: renders
          nothing at all when disabled or when there's no match for today. */}
      <OnThisDaySection />

      {/* Today Hub — the daily cockpit: continue watching, up next, new
          episodes, availability, alerts, a Watch Tonight teaser, a
          personalized recommendation, and items needing action. Generalizes
          the page's former "For You" panel (see git history) to the full
          set of daily-relevant capabilities; self-contained, renders
          nothing when every card is empty. */}
      <TodayHub index={++sectionIndex} />

      {/* Compact "this week" personal agenda — releases, new episodes, and
          availability changes for the active profile (see
          src/features/tracking/use-weekly-agenda.ts). Renders nothing when
          there's nothing to show, same as the rails above. */}
      <WeeklyAgendaSection index={++sectionIndex} />

      {/* Series and movies catalogue sections */}
      <div className="flex justify-end">
        <HideWatchedToggle />
      </div>
      <CatalogueSections
        feed={homeQuery.data}
        startIndex={sectionIndex + 1}
        hideWatched={hideWatched}
        library={library}
      />

      <BrowseByGenre startIndex={sectionIndex + 1 + CATALOGUE_SECTIONS.length} />
      <BrowseByPlatform startIndex={sectionIndex + 2 + CATALOGUE_SECTIONS.length} />
    </div>
  );
}
