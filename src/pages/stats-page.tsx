import { BarChart3, Clock, Film, Flame, Star, Tv } from "lucide-react";
import { useStats, useWrapped } from "@/hooks/use-stats";

const hours = (minutes: number) => `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
export function StatsPage() {
  const stats = useStats();
  const wrapped = useWrapped();
  if (!stats.data || !wrapped.data) return <p className="text-muted-foreground">Calcul des statistiques…</p>;
  const cards = [
    { label: "Films vus", value: stats.data.moviesWatched, icon: Film },
    { label: "Épisodes vus", value: stats.data.episodesWatched, icon: Tv },
    { label: "Temps regardé", value: hours(stats.data.minutesWatched), icon: Clock },
    { label: "Série actuelle", value: `${stats.data.currentStreakDays} j`, icon: Flame },
    { label: "Note moyenne", value: stats.data.averageUserRating?.toFixed(1) ?? "—", icon: Star },
    { label: "Bibliothèque terminée", value: `${stats.data.watchlistCompletionPercent}%`, icon: BarChart3 },
  ];
  const maxMonth = Math.max(1, ...stats.data.monthlyActivity.map((month) => month.count));
  return (
    <div className="space-y-8">
      <header><h1 className="font-display text-3xl font-bold">Statistiques</h1><p className="mt-1 text-muted-foreground">Votre activité locale, sans envoyer votre historique vers un serveur.</p></header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(({label,value,icon:Icon}) => <article key={label} className="rounded-3xl border border-border bg-card/60 p-5"><Icon className="size-5 text-primary"/><p className="mt-4 text-sm text-muted-foreground">{label}</p><p className="mt-1 font-display text-3xl font-bold">{value}</p></article>)}</section>
      <section className="rounded-3xl border border-border bg-card/60 p-5"><h2 className="font-semibold">Activité sur 12 mois</h2><div className="mt-5 flex h-44 items-end gap-2">{stats.data.monthlyActivity.map((month) => <div key={month.month} className="flex min-w-0 flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-lg bg-primary/80" style={{height:`${Math.max(4,(month.count/maxMonth)*140)}px`}} title={`${month.count} visionnages`} /><span className="text-[10px] text-muted-foreground">{month.month.slice(5)}</span></div>)}</div></section>
      <section className="grid gap-4 lg:grid-cols-2"><article className="rounded-3xl border border-border bg-card/60 p-5"><h2 className="font-semibold">Genres favoris</h2><div className="mt-4 grid gap-2">{stats.data.favouriteGenres.map((genre) => <div key={genre.name} className="flex justify-between rounded-xl border border-border px-3 py-2 text-sm"><span>{genre.name}</span><strong>{genre.count}</strong></div>)}</div></article><article className="rounded-3xl border border-primary/30 bg-primary/5 p-5"><p className="text-xs font-semibold uppercase tracking-widest text-primary">CineTrack Wrapped {wrapped.data.year}</p><p className="mt-3 font-display text-4xl font-bold">{hours(wrapped.data.minutes)}</p><p className="text-sm text-muted-foreground">sur {wrapped.data.activeDays} jours actifs</p><div className="mt-4 grid gap-2 text-sm"><p>{wrapped.data.movies} films · {wrapped.data.episodes} épisodes</p><p>Genre phare : <strong>{wrapped.data.favouriteGenre ?? "—"}</strong></p>{wrapped.data.topTitles.map((item,index) => <p key={item.title}>{index+1}. {item.title} · {item.count}</p>)}</div></article></section>
    </div>
  );
}
