import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Film,
  Flame,
  Gauge,
  Hourglass,
  Minus,
  PieChart,
  Repeat,
  Star,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Trophy,
  Tv,
} from "lucide-react";
import { monthOverMonthComparison } from "@/features/stats/stats-repository";
import { useStats, useWatchForecast, useWrapped, useYearlyActivity } from "@/features/stats/use-stats";
import { downloadWrappedCard, renderWrappedCard } from "@/features/stats/wrapped-export";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Tile } from "@/components/ui/tile";
import { toast } from "@/components/ui/use-toast";
import { ActivityBarChart } from "@/components/media/activity-bar-chart";
import { ViewingHeatmap } from "@/components/media/viewing-heatmap";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { StatsSkeleton } from "@/components/states/loading-skeletons";
import { logger } from "@/features/diagnostics/logger";
import { displayMessage } from "@/shared/lib/user-facing-error";
import { formatDate } from "@/shared/utils/format";
import { staggerDelayMs } from "@/shared/utils/animation";

function DeltaBadge({ delta, formatValue }: { delta: number; formatValue: (value: number) => string }) {
  const { t } = useTranslation();
  if (delta === 0) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3.5" />
        {t("stats.deltaFlat")}
      </span>
    );
  }
  const isUp = delta > 0;
  return (
    <span className={`mt-1 inline-flex items-center gap-1 text-xs ${isUp ? "text-success" : "text-destructive"}`}>
      {isUp ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
      {t(isUp ? "stats.deltaUp" : "stats.deltaDown", { value: formatValue(Math.abs(delta)) })}
    </span>
  );
}

export function StatsPage() {
  const { t, i18n } = useTranslation();
  const monthLabel = (month: string) =>
    new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" }).format(new Date(`${month}-01`));
  const hours = (minutes: number) =>
    t("stats.durationHoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [isExportingWrapped, setIsExportingWrapped] = useState(false);
  const stats = useStats();
  const wrapped = useWrapped(selectedYear);
  const forecast = useWatchForecast();
  const yearlyActivity = useYearlyActivity();

  const exportWrapped = async () => {
    if (!wrapped.data) return;
    setIsExportingWrapped(true);
    try {
      const blob = await renderWrappedCard(
        {
          year: wrapped.data.year,
          hoursWatchedLabel: hours(wrapped.data.minutes),
          moviesEpisodesLabel: `${wrapped.data.movies} ${t("stats.films")} · ${wrapped.data.episodes} ${t("stats.episodes")}`,
          favouriteGenre: wrapped.data.favouriteGenre,
          activeDaysLabel: t("stats.activeDays", { count: wrapped.data.activeDays }),
          topTitles: wrapped.data.topTitles,
        },
        {
          brand: t("sidebar.brand.name"),
          tagline: t("sidebar.brand.tagline"),
          wrappedTitle: t("stats.wrapped", { year: wrapped.data.year }),
          favouriteGenreLabel: t("stats.favouriteGenre"),
        }
      );
      downloadWrappedCard(blob, wrapped.data.year);
      toast({ description: t("stats.exportSuccess"), variant: "success" });
    } catch (error) {
      logger.warn(`Wrapped export failed: ${error instanceof Error ? error.message : String(error)}`);
      toast({ description: displayMessage(error, t("stats.exportFailed")), variant: "error" });
    } finally {
      setIsExportingWrapped(false);
    }
  };

  if (stats.isError || wrapped.isError) {
    return (
      <RemoteErrorState
        error={stats.error ?? wrapped.error}
        onRetry={() => {
          void stats.refetch();
          void wrapped.refetch();
        }}
      />
    );
  }
  if (!stats.data || !wrapped.data) return <StatsSkeleton />;

  const cards = [
    { label: t("stats.moviesWatched"), value: stats.data.moviesWatched, icon: Film },
    { label: t("stats.episodesWatched"), value: stats.data.episodesWatched, icon: Tv },
    { label: t("stats.timeWatched"), value: hours(stats.data.minutesWatched), icon: Clock },
    {
      label: t("stats.currentStreak"),
      value: t("stats.streakDays", { count: stats.data.currentStreakDays }),
      icon: Flame,
    },
    { label: t("stats.averageRating"), value: stats.data.averageUserRating?.toFixed(1) ?? "—", icon: Star },
    { label: t("stats.libraryCompleted"), value: `${stats.data.libraryCompletionPercent}%`, icon: BarChart3 },
  ];
  const comparison = monthOverMonthComparison(stats.data.monthlyActivity);
  const watchedMinutesByType = stats.data.movieMinutesWatched + stats.data.episodeMinutesWatched;
  const moviesPercent = watchedMinutesByType
    ? Math.round((stats.data.movieMinutesWatched / watchedMinutesByType) * 100)
    : 0;

  const availableYears = yearlyActivity.data?.map((bucket) => bucket.year) ?? [];
  const minYear = availableYears.length ? Math.min(...availableYears, currentYear) : currentYear;
  const canGoToPreviousYear = selectedYear > minYear;
  const canGoToNextYear = selectedYear < currentYear;

  return (
    <div className="space-y-8">
      <header className="animate-in" style={{ animationDelay: `${staggerDelayMs(0)}ms` }}>
        <h1 className="font-display text-3xl font-bold">{t("stats.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("stats.description")}</p>
      </header>
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 animate-in"
        style={{ animationDelay: `${staggerDelayMs(1)}ms` }}
      >
        {cards.map(({ label, value, icon: Icon }) => (
          <Panel asChild key={label}>
            <article>
              <Icon className="size-5 text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 font-display text-3xl font-bold">{value}</p>
            </article>
          </Panel>
        ))}
      </section>

      <section className="animate-in" style={{ animationDelay: `${staggerDelayMs(2)}ms` }}>
        <h2 className="mb-3 font-semibold">{t("stats.records")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Panel asChild>
            <article>
              <Trophy className="size-5 text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">{t("stats.longestStreak")}</p>
              <p className="mt-1 font-display text-3xl font-bold">
                {t("stats.streakDays", { count: stats.data.longestStreakDays })}
              </p>
            </article>
          </Panel>
          <Panel asChild>
            <article>
              <Repeat className="size-5 text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">{t("stats.mostRewatched")}</p>
              {stats.data.mostRewatchedTitle ? (
                <>
                  <p
                    className="mt-1 truncate font-display text-xl font-bold"
                    title={stats.data.mostRewatchedTitle.title}
                  >
                    {stats.data.mostRewatchedTitle.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("stats.rewatchCount", { count: stats.data.mostRewatchedTitle.count })}
                  </p>
                </>
              ) : (
                <p className="mt-1 font-display text-3xl font-bold">—</p>
              )}
            </article>
          </Panel>
          <Panel asChild>
            <article>
              <ThumbsUp className="size-5 text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">{t("stats.favouriteGenreByRating")}</p>
              <p className="mt-1 truncate font-display text-2xl font-bold">
                {stats.data.favouriteGenreByRating ?? "—"}
              </p>
            </article>
          </Panel>
          <Panel asChild>
            <article>
              <PieChart className="size-5 text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">{t("stats.moviesVsSeries")}</p>
              <div
                className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-foreground/[0.08]"
                aria-hidden="true"
              >
                <div className="h-full bg-primary" style={{ width: `${moviesPercent}%` }} />
                <div className="h-full bg-accent" style={{ width: `${100 - moviesPercent}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>
                  {t("stats.films")} {moviesPercent}%
                </span>
                <span>
                  {t("stats.episodes")} {100 - moviesPercent}%
                </span>
              </div>
            </article>
          </Panel>
        </div>
      </section>

      {comparison ? (
        <section className="animate-in" style={{ animationDelay: `${staggerDelayMs(3)}ms` }}>
          <h2 className="mb-3 font-semibold">{t("stats.thisMonth")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Panel asChild>
              <article>
                <p className="text-sm text-muted-foreground">{t("stats.watchesThisMonth")}</p>
                <p className="mt-1 font-display text-3xl font-bold">{comparison.current.count}</p>
                <DeltaBadge delta={comparison.countDelta} formatValue={(value) => String(value)} />
              </article>
            </Panel>
            <Panel asChild>
              <article>
                <p className="text-sm text-muted-foreground">{t("stats.timeThisMonth")}</p>
                <p className="mt-1 font-display text-3xl font-bold">{hours(comparison.current.minutes)}</p>
                <DeltaBadge delta={comparison.minutesDelta} formatValue={hours} />
              </article>
            </Panel>
          </div>
        </section>
      ) : null}

      {forecast.data && forecast.data.backlogEpisodes > 0 ? (
        <section className="animate-in" style={{ animationDelay: `${staggerDelayMs(4)}ms` }}>
          <h2 className="mb-3 font-semibold">{t("stats.forecast")}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Panel asChild>
              <article>
                <Hourglass className="size-5 text-primary" />
                <p className="mt-4 text-sm text-muted-foreground">{t("stats.timeToWatch")}</p>
                <p className="mt-1 font-display text-3xl font-bold">{hours(forecast.data.backlogMinutes)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("stats.backlogEpisodes", { count: forecast.data.backlogEpisodes })}
                </p>
              </article>
            </Panel>
            <Panel asChild>
              <article>
                <Gauge className="size-5 text-primary" />
                <p className="mt-4 text-sm text-muted-foreground">{t("stats.pacePerWeek")}</p>
                <p className="mt-1 font-display text-3xl font-bold">{forecast.data.episodesPerWeek}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("stats.paceBasis")}</p>
              </article>
            </Panel>
            <Panel asChild tone="highlight">
              <article>
                <CalendarCheck className="size-5 text-primary" />
                <p className="mt-4 text-sm text-muted-foreground">{t("stats.catchUpBy")}</p>
                <p className="mt-1 font-display text-3xl font-bold">
                  {forecast.data.catchUpDate ? formatDate(forecast.data.catchUpDate) : "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("stats.paceBasis")}</p>
              </article>
            </Panel>
          </div>
        </section>
      ) : null}

      <Panel className="animate-in" style={{ animationDelay: `${staggerDelayMs(5)}ms` }}>
        <h2 className="font-semibold">{t("stats.activity12Months")}</h2>
        <ActivityBarChart
          data={stats.data.monthlyActivity.map((month) => ({ label: month.month.slice(5), value: month.count }))}
          tooltipLabel={t("stats.watches")}
        />
        <table className="sr-only">
          <caption>{t("stats.activity12Months")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("stats.month")}</th>
              <th scope="col">{t("stats.watches")}</th>
            </tr>
          </thead>
          <tbody>
            {stats.data.monthlyActivity.map((month) => (
              <tr key={month.month}>
                <td>{monthLabel(month.month)}</td>
                <td>{month.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {yearlyActivity.data && yearlyActivity.data.length ? (
        <Panel className="animate-in" style={{ animationDelay: `${staggerDelayMs(6)}ms` }}>
          <h2 className="font-semibold">{t("stats.activityByYear")}</h2>
          <ActivityBarChart
            data={yearlyActivity.data.map((bucket) => ({
              label: String(bucket.year),
              value: bucket.moviesWatched + bucket.episodesWatched,
            }))}
            tooltipLabel={t("stats.watches")}
          />
          <table className="sr-only">
            <caption>{t("stats.activityByYear")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("stats.year")}</th>
                <th scope="col">{t("stats.watches")}</th>
              </tr>
            </thead>
            <tbody>
              {yearlyActivity.data.map((bucket) => (
                <tr key={bucket.year}>
                  <td>{bucket.year}</td>
                  <td>{bucket.moviesWatched + bucket.episodesWatched}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}

      <Panel className="animate-in" style={{ animationDelay: `${staggerDelayMs(7)}ms` }}>
        <h2 className="font-semibold">{t("stats.heatmap.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("stats.heatmap.description")}</p>
        <ViewingHeatmap data={stats.data.heatmap} />
      </Panel>

      <section className="grid gap-4 lg:grid-cols-2 animate-in" style={{ animationDelay: `${staggerDelayMs(8)}ms` }}>
        <Panel asChild>
          <article>
            <h2 className="font-semibold">{t("stats.favouriteGenres")}</h2>
            <div className="mt-4 grid gap-2">
              {stats.data.favouriteGenres.map((genre) => (
                <Tile key={genre.name} className="flex justify-between px-3 py-2 text-sm">
                  <span>{genre.name}</span>
                  <strong>{genre.count}</strong>
                </Tile>
              ))}
            </div>
          </article>
        </Panel>
        <Panel asChild tone="highlight">
          <article>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                {t("stats.wrapped", { year: wrapped.data.year })}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("stats.exportWrapped")}
                  disabled={isExportingWrapped}
                  onClick={() => void exportWrapped()}
                >
                  <Download className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("stats.previousYear")}
                  disabled={!canGoToPreviousYear}
                  onClick={() => setSelectedYear((year) => year - 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("stats.nextYear")}
                  disabled={!canGoToNextYear}
                  onClick={() => setSelectedYear((year) => year + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
            <p className="mt-3 font-display text-4xl font-bold">{hours(wrapped.data.minutes)}</p>
            <p className="text-sm text-muted-foreground">{t("stats.activeDays", { count: wrapped.data.activeDays })}</p>
            <div className="mt-4 grid gap-2 text-sm">
              <p>
                {wrapped.data.movies} {t("stats.films")} · {wrapped.data.episodes} {t("stats.episodes")}
              </p>
              <p>
                {t("stats.favouriteGenre")} <strong>{wrapped.data.favouriteGenre ?? "—"}</strong>
              </p>
              {wrapped.data.topTitles.map((item, index) => (
                <p key={item.title}>
                  {index + 1}. {item.title} · {item.count}
                </p>
              ))}
            </div>
          </article>
        </Panel>
      </section>
    </div>
  );
}
