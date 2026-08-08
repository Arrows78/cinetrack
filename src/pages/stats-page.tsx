import { useTranslation } from "react-i18next";
import { BarChart3, CalendarCheck, Clock, Film, Flame, Gauge, Hourglass, Star, Tv } from "lucide-react";
import { useStats, useWatchForecast, useWrapped } from "@/features/stats/use-stats";
import { Panel } from "@/components/ui/panel";
import { Tile } from "@/components/ui/tile";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { StatsSkeleton } from "@/components/states/loading-skeletons";
import { formatDate } from "@/shared/utils/format";
import { staggerDelayMs } from "@/shared/utils/animation";

export function StatsPage() {
  const { t } = useTranslation();
  const hours = (minutes: number) =>
    t("stats.durationHoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  const stats = useStats();
  const wrapped = useWrapped();
  const forecast = useWatchForecast();
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
    { label: t("stats.libraryCompleted"), value: `${stats.data.watchlistCompletionPercent}%`, icon: BarChart3 },
  ];
  const maxMonth = Math.max(1, ...stats.data.monthlyActivity.map((month) => month.count));
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
      {forecast.data && forecast.data.backlogEpisodes > 0 ? (
        <section className="animate-in" style={{ animationDelay: `${staggerDelayMs(2)}ms` }}>
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

      <Panel className="animate-in" style={{ animationDelay: `${staggerDelayMs(3)}ms` }}>
        <h2 className="font-semibold">{t("stats.activity12Months")}</h2>
        <div className="mt-5 flex h-44 items-end gap-2">
          {stats.data.monthlyActivity.map((month) => (
            <div key={month.month} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div
                className="w-full rounded-t-lg bg-primary/80"
                style={{ height: `${Math.max(4, (month.count / maxMonth) * 140)}px` }}
                title={`${month.count} ${t("stats.watches")}`}
              />
              <span className="text-caption text-muted-foreground">{month.month.slice(5)}</span>
            </div>
          ))}
        </div>
      </Panel>
      <section className="grid gap-4 lg:grid-cols-2 animate-in" style={{ animationDelay: `${staggerDelayMs(4)}ms` }}>
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
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              {t("stats.wrapped", { year: wrapped.data.year })}
            </p>
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
