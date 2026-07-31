import { useTranslation } from "react-i18next";
import { BarChart3, CalendarCheck, Clock, Film, Flame, Gauge, Hourglass, Star, Tv } from "lucide-react";
import { useStats, useWatchForecast, useWrapped } from "@/features/stats/use-stats";
import { formatDate } from "@/shared/utils/format";

const hours = (minutes: number) => `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
export function StatsPage() {
  const { t } = useTranslation();
  const stats = useStats();
  const wrapped = useWrapped();
  const forecast = useWatchForecast();
  if (!stats.data || !wrapped.data) return <p className="text-muted-foreground">{t("stats.loading")}</p>;
  const cards = [
    { label: t("stats.moviesWatched"), value: stats.data.moviesWatched, icon: Film },
    { label: t("stats.episodesWatched"), value: stats.data.episodesWatched, icon: Tv },
    { label: t("stats.timeWatched"), value: hours(stats.data.minutesWatched), icon: Clock },
    { label: t("stats.currentStreak"), value: `${stats.data.currentStreakDays} j`, icon: Flame },
    { label: t("stats.averageRating"), value: stats.data.averageUserRating?.toFixed(1) ?? "—", icon: Star },
    { label: t("stats.libraryCompleted"), value: `${stats.data.watchlistCompletionPercent}%`, icon: BarChart3 },
  ];
  const maxMonth = Math.max(1, ...stats.data.monthlyActivity.map((month) => month.count));
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold">{t("stats.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("stats.description")}</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <article key={label} className="rounded-3xl border border-border bg-card/60 p-5">
            <Icon className="size-5 text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-3xl font-bold">{value}</p>
          </article>
        ))}
      </section>
      {forecast.data && forecast.data.backlogEpisodes > 0 ? (
        <section>
          <h2 className="mb-3 font-semibold">{t("stats.forecast")}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-3xl border border-border bg-card/60 p-5">
              <Hourglass className="size-5 text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">{t("stats.timeToWatch")}</p>
              <p className="mt-1 font-display text-3xl font-bold">{hours(forecast.data.backlogMinutes)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("stats.backlogEpisodes", { count: forecast.data.backlogEpisodes })}
              </p>
            </article>
            <article className="rounded-3xl border border-border bg-card/60 p-5">
              <Gauge className="size-5 text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">{t("stats.pacePerWeek")}</p>
              <p className="mt-1 font-display text-3xl font-bold">{forecast.data.episodesPerWeek}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("stats.paceBasis")}</p>
            </article>
            <article className="rounded-3xl border border-primary/30 bg-primary/5 p-5">
              <CalendarCheck className="size-5 text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">{t("stats.catchUpBy")}</p>
              <p className="mt-1 font-display text-3xl font-bold">
                {forecast.data.catchUpDate ? formatDate(forecast.data.catchUpDate) : "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t("stats.paceBasis")}</p>
            </article>
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-border bg-card/60 p-5">
        <h2 className="font-semibold">{t("stats.activity12Months")}</h2>
        <div className="mt-5 flex h-44 items-end gap-2">
          {stats.data.monthlyActivity.map((month) => (
            <div key={month.month} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div
                className="w-full rounded-t-lg bg-primary/80"
                style={{ height: `${Math.max(4, (month.count / maxMonth) * 140)}px` }}
                title={`${month.count} ${t("stats.watches")}`}
              />
              <span className="text-[10px] text-muted-foreground">{month.month.slice(5)}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-border bg-card/60 p-5">
          <h2 className="font-semibold">{t("stats.favouriteGenres")}</h2>
          <div className="mt-4 grid gap-2">
            {stats.data.favouriteGenres.map((genre) => (
              <div key={genre.name} className="flex justify-between rounded-xl border border-border px-3 py-2 text-sm">
                <span>{genre.name}</span>
                <strong>{genre.count}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-3xl border border-primary/30 bg-primary/5 p-5">
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
      </section>
    </div>
  );
}
