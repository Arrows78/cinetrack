import { eachMonthOfInterval, endOfMonth, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { browserStore, getDatabase } from "@/db/client";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import type { LibraryItem, LibraryStats, ViewingEvent } from "@/types/media";

interface YearSummary {
  year: number;
  movies: number;
  episodes: number;
  minutes: number;
  topTitles: Array<{ title: string; count: number }>;
  favouriteGenre: string | null;
  activeDays: number;
}

const localDay = (timestamp: string) => format(parseISO(timestamp), "yyyy-MM-dd");

function currentStreak(events: ViewingEvent[]): number {
  const days = new Set(events.filter((event) => event.eventType !== "unwatched").map((event) => localDay(event.watchedAt)));
  const cursor = new Date();
  if (!days.has(format(cursor, "yyyy-MM-dd"))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(format(cursor, "yyyy-MM-dd"))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

function compute(library: LibraryItem[], events: ViewingEvent[]): LibraryStats {
  const watched = events.filter((event) => event.eventType === "watched" || event.eventType === "rewatched");
  const genres = new Map<string, number>();
  for (const item of library) for (const genre of item.genres) genres.set(genre, (genres.get(genre) ?? 0) + 1);
  const ratings = library.map((item) => item.userRating).filter((rating): rating is number => rating !== null && rating !== undefined);
  const interval = { start: startOfMonth(subMonths(new Date(), 11)), end: endOfMonth(new Date()) };
  const months = eachMonthOfInterval(interval).map((date) => format(date, "yyyy-MM"));
  return {
    moviesWatched: watched.filter((event) => event.mediaType === "movie").length,
    episodesWatched: watched.filter((event) => event.episodeId !== null && event.episodeId !== undefined).length,
    minutesWatched: watched.reduce((sum, event) => sum + (event.durationMinutes ?? 0), 0),
    completedSeries: library.filter((item) => item.mediaType === "series" && item.status === "completed").length,
    averageUserRating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    favouriteGenres: [...genres.entries()].sort((a,b) => b[1]-a[1]).slice(0, 8).map(([name,count]) => ({ name, count })),
    monthlyActivity: months.map((month) => {
      const monthEvents = watched.filter((event) => event.watchedAt.startsWith(month));
      return { month, count: monthEvents.length, minutes: monthEvents.reduce((sum,event) => sum + (event.durationMinutes ?? 0), 0) };
    }),
    currentStreakDays: currentStreak(watched),
    watchlistCompletionPercent: library.length ? Math.round((library.filter((item) => item.status === "completed").length / library.length) * 100) : 0,
  };
}

async function loadData(): Promise<{ library: LibraryItem[]; events: ViewingEvent[] }> {
  const profileId = (await preferencesRepository.getPreferences()).activeProfileId;
  const db = await getDatabase();
  if (!db) {
    const store = browserStore.read();
    return { library: store.library.filter((item) => item.profileId === profileId), events: store.viewingEvents.filter((event) => event.profileId === profileId) };
  }
  const [libraryRows, eventRows] = await Promise.all([
    db.select<Array<Record<string, unknown>>>("SELECT * FROM library_items WHERE profile_id = $1", [profileId]),
    db.select<Array<Record<string, unknown>>>("SELECT * FROM viewing_events WHERE profile_id = $1", [profileId]),
  ]);
  const library: LibraryItem[] = libraryRows.map((row) => ({ profileId, mediaId: Number(row.media_id), mediaType: row.media_type === "movie" ? "movie" : "series", title: String(row.title), posterPath: row.poster_path ? String(row.poster_path) : null, backdropPath: row.backdrop_path ? String(row.backdrop_path) : null, year: row.year ? Number(row.year) : null, rating: row.rating ? Number(row.rating) : null, genres: JSON.parse(String(row.genres ?? "[]")), status: String(row.status) as LibraryItem["status"], favourite: Boolean(row.favourite), userRating: row.user_rating === null ? null : Number(row.user_rating), notes: row.notes ? String(row.notes) : null, tags: JSON.parse(String(row.tags ?? "[]")), startedAt: row.started_at ? String(row.started_at) : null, completedAt: row.completed_at ? String(row.completed_at) : null, rewatchCount: Number(row.rewatch_count), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }));
  const events: ViewingEvent[] = eventRows.map((row) => ({ id: String(row.id), profileId, mediaId: Number(row.media_id), mediaType: row.media_type === "movie" ? "movie" : "series", title: String(row.title), eventType: String(row.event_type) as ViewingEvent["eventType"], watchedAt: String(row.watched_at), durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes), episodeId: row.episode_id === null ? null : Number(row.episode_id), seasonNumber: row.season_number === null ? null : Number(row.season_number), episodeNumber: row.episode_number === null ? null : Number(row.episode_number) }));
  return { library, events };
}

export const statsRepository = {
  async getStats(): Promise<LibraryStats> { const data = await loadData(); return compute(data.library, data.events); },
  async getYearSummary(year = new Date().getFullYear()): Promise<YearSummary> {
    const { library, events } = await loadData();
    const selected = events.filter((event) => event.eventType !== "unwatched" && event.watchedAt.startsWith(String(year)));
    const titleCounts = new Map<string, number>();
    for (const event of selected) titleCounts.set(event.title, (titleCounts.get(event.title) ?? 0) + 1);
    const genreCounts = new Map<string, number>();
    for (const item of library) if (selected.some((event) => event.mediaId === item.mediaId && event.mediaType === item.mediaType)) for (const genre of item.genres) genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    return { year, movies: selected.filter((event) => event.mediaType === "movie").length, episodes: selected.filter((event) => event.episodeId !== null && event.episodeId !== undefined).length, minutes: selected.reduce((sum,event) => sum + (event.durationMinutes ?? 0), 0), topTitles: [...titleCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0,5).map(([title,count]) => ({ title,count })), favouriteGenre: [...genreCounts.entries()].sort((a,b) => b[1]-a[1])[0]?.[0] ?? null, activeDays: new Set(selected.map((event) => localDay(event.watchedAt))).size };
  },
  _compute: compute,
};
