import { percent } from "@/shared/utils/format";
import type { Episode, EpisodeProgress, MediaSummary, SeriesProgress, Season, TrackedSeriesItem, ViewingEvent } from "@/types/media";
import { browserStore, getDatabase } from "./db";
import { historyRepository } from "./history-repository";
import { preferencesRepository } from "./preferences-repository";

const nowIso = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const storedProfile = (item: { profileId?: string }) => item.profileId ?? "default";
async function profileId() { return (await preferencesRepository.getPreferences()).activeProfileId; }

async function recordEvent(event: ViewingEvent) {
  const db = await getDatabase();
  if (!db) {
    const store = browserStore.read();
    store.viewingEvents.unshift(event);
    browserStore.write(store);
    return;
  }
  await db.execute(
    `INSERT INTO viewing_events (id, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [event.id,event.profileId,event.mediaId,event.mediaType,event.title,event.eventType,event.watchedAt,event.durationMinutes ?? null,event.episodeId ?? null,event.seasonNumber ?? null,event.episodeNumber ?? null]
  );
}

export const progressRepository = {
  async isMovieSeen(movieId: number) {
    const profile = await profileId();
    const db = await getDatabase();
    if (!db) return browserStore.read().seenMovies.some((item) => storedProfile(item) === profile && item.movieId === movieId);
    const rows = await db.select<Array<{ count: number }>>("SELECT COUNT(*) count FROM profile_seen_movies WHERE profile_id=$1 AND movie_id=$2", [profile,movieId]);
    return Number(rows[0]?.count ?? 0) > 0;
  },

  async listSeenMovies() {
    const profile = await profileId();
    const db = await getDatabase();
    return db
      ? db.select<Array<Record<string, unknown>>>("SELECT * FROM profile_seen_movies WHERE profile_id=$1 ORDER BY watched_at DESC", [profile])
      : browserStore.read().seenMovies.filter((item) => storedProfile(item) === profile);
  },

  async toggleMovieSeen(movie: MediaSummary, watched: boolean, watchedAt = nowIso()) {
    const profile = await profileId();
    const db = await getDatabase();
    if (!db) {
      const store = browserStore.read();
      const keep = store.seenMovies.filter((item) => !(storedProfile(item) === profile && item.movieId === movie.id));
      store.seenMovies = watched
        ? [{ profileId: profile, movieId: movie.id, title: movie.title, posterPath: movie.posterPath, backdropPath: movie.backdropPath, watchedAt }, ...keep]
        : keep;
      browserStore.write(store);
    } else if (watched) {
      await db.execute("INSERT OR REPLACE INTO profile_seen_movies (profile_id,movie_id,title,poster_path,backdrop_path,watched_at) VALUES ($1,$2,$3,$4,$5,$6)", [profile,movie.id,movie.title,movie.posterPath ?? null,movie.backdropPath ?? null,watchedAt]);
    } else {
      await db.execute("DELETE FROM profile_seen_movies WHERE profile_id=$1 AND movie_id=$2", [profile,movie.id]);
    }

    await recordEvent({ id: uid(), profileId: profile, mediaId: movie.id, mediaType: "movie", title: movie.title, eventType: watched ? "watched" : "unwatched", watchedAt, durationMinutes: movie.runtime ?? null });
    await historyRepository.add({ id: uid(), mediaId: movie.id, mediaType: "movie", title: movie.title, action: watched ? "movie:watched" : "movie:unwatched", timestamp: watchedAt, metadata: { profileId: profile } });
  },

  async getEpisodeProgress(seriesId: number): Promise<EpisodeProgress[]> {
    const profile = await profileId();
    const db = await getDatabase();
    if (!db) return browserStore.read().episodeProgress.filter((item) => storedProfile(item) === profile && item.seriesId === seriesId && item.watched);
    const rows = await db.select<Array<Record<string, unknown>>>("SELECT * FROM profile_episode_progress WHERE profile_id=$1 AND series_id=$2 AND watched=1", [profile,seriesId]);
    return rows.map((row) => ({ profileId: profile, seriesId: Number(row.series_id), episodeId: Number(row.episode_id), seasonNumber: Number(row.season_number), episodeNumber: Number(row.episode_number), watched: Boolean(row.watched), watchedAt: row.watched_at ? String(row.watched_at) : null }));
  },

  async toggleEpisodeSeen(series: MediaSummary & { numberOfEpisodes?: number }, episode: Episode, watched: boolean) {
    const watchedAt = nowIso();
    const profile = await profileId();
    const changed = await this.applyEpisodes(series, [episode], watched, watchedAt, profile);
    if (changed > 0) {
      await historyRepository.add({ id: uid(), mediaId: series.id, mediaType: "series", title: series.title, action: watched ? "episode:watched" : "episode:unwatched", timestamp: watchedAt, seasonNumber: episode.seasonNumber, episodeNumber: episode.episodeNumber, episodeTitle: episode.title, metadata: { profileId: profile } });
    }
  },

  async applyEpisodes(series: MediaSummary & { numberOfEpisodes?: number }, episodes: Episode[], watched: boolean, watchedAt = nowIso(), suppliedProfile?: string): Promise<number> {
    const profile = suppliedProfile ?? await profileId();
    const db = await getDatabase();
    if (!db) {
      const store = browserStore.read();
      const watchedIds = new Set(store.episodeProgress
        .filter((item) => storedProfile(item) === profile && item.seriesId === series.id && item.watched)
        .map((item) => item.episodeId));
      const changedEpisodes = episodes.filter((episode) => watched ? !watchedIds.has(episode.id) : watchedIds.has(episode.id));
      if (!changedEpisodes.length) return 0;
      const ids = new Set(changedEpisodes.map((episode) => episode.id));
      store.episodeProgress = store.episodeProgress.filter((item) => !(storedProfile(item) === profile && item.seriesId === series.id && ids.has(item.episodeId)));
      if (watched) store.episodeProgress.push(...changedEpisodes.map((episode) => ({ profileId: profile, seriesId: series.id, episodeId: episode.id, seasonNumber: episode.seasonNumber, episodeNumber: episode.episodeNumber, watched: true, watchedAt })));
      const watchedEpisodes = store.episodeProgress.filter((item) => storedProfile(item) === profile && item.seriesId === series.id && item.watched).length;
      store.trackedSeries = [{ profileId: profile, seriesId: series.id, title: series.title, posterPath: series.posterPath, backdropPath: series.backdropPath, totalEpisodes: series.numberOfEpisodes ?? watchedEpisodes, watchedEpisodes, updatedAt: watchedAt }, ...store.trackedSeries.filter((item) => !(storedProfile(item) === profile && item.seriesId === series.id))];
      store.viewingEvents.unshift(...changedEpisodes.map((episode) => ({ id: uid(), profileId: profile, mediaId: series.id, mediaType: "series" as const, title: series.title, eventType: watched ? "watched" as const : "unwatched" as const, watchedAt, durationMinutes: episode.runtime ?? series.runtime ?? null, episodeId: episode.id, seasonNumber: episode.seasonNumber, episodeNumber: episode.episodeNumber })));
      browserStore.write(store);
      return changedEpisodes.length;
    }

    const rows = await db.select<Array<{ episode_id: number }>>(
      "SELECT episode_id FROM profile_episode_progress WHERE profile_id=$1 AND series_id=$2 AND watched=1",
      [profile, series.id],
    );
    const watchedIds = new Set(rows.map((row) => Number(row.episode_id)));
    const changedEpisodes = episodes.filter((episode) => watched ? !watchedIds.has(episode.id) : watchedIds.has(episode.id));
    if (!changedEpisodes.length) return 0;

    await db.execute("BEGIN IMMEDIATE");
    try {
      for (const episode of changedEpisodes) {
        if (watched) await db.execute("INSERT OR REPLACE INTO profile_episode_progress (profile_id,series_id,episode_id,season_number,episode_number,watched,watched_at) VALUES ($1,$2,$3,$4,$5,1,$6)", [profile,series.id,episode.id,episode.seasonNumber,episode.episodeNumber,watchedAt]);
        else await db.execute("DELETE FROM profile_episode_progress WHERE profile_id=$1 AND series_id=$2 AND episode_id=$3", [profile,series.id,episode.id]);
        await db.execute("INSERT INTO viewing_events (id,profile_id,media_id,media_type,title,event_type,watched_at,duration_minutes,episode_id,season_number,episode_number) VALUES ($1,$2,$3,'series',$4,$5,$6,$7,$8,$9,$10)", [uid(),profile,series.id,series.title,watched ? "watched" : "unwatched",watchedAt,episode.runtime ?? series.runtime ?? null,episode.id,episode.seasonNumber,episode.episodeNumber]);
      }
      const counts = await db.select<Array<{ count: number }>>("SELECT COUNT(*) count FROM profile_episode_progress WHERE profile_id=$1 AND series_id=$2 AND watched=1", [profile,series.id]);
      await db.execute("INSERT OR REPLACE INTO profile_tracked_series (profile_id,series_id,title,poster_path,backdrop_path,total_episodes,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [profile,series.id,series.title,series.posterPath ?? null,series.backdropPath ?? null,series.numberOfEpisodes ?? Number(counts[0]?.count ?? 0),watchedAt]);
      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
    return changedEpisodes.length;
  },

  async markSeason(series: MediaSummary & { numberOfEpisodes?: number }, season: Season, watched: boolean) {
    const timestamp = nowIso();
    const profile = await profileId();
    const changed = await this.applyEpisodes(series, season.episodes, watched, timestamp, profile);
    if (changed > 0) {
      await historyRepository.add({ id: uid(), mediaId: series.id, mediaType: "series", title: series.title, action: watched ? "season:watched" : "season:unwatched", timestamp, seasonNumber: season.seasonNumber, metadata: { episodeCount: changed, profileId: profile } });
    }
  },

  async markSeries(series: MediaSummary & { numberOfEpisodes?: number }, seasons: Season[], watched: boolean) {
    const timestamp = nowIso();
    const profile = await profileId();
    const episodes = seasons.flatMap((season) => season.episodes);
    const changed = await this.applyEpisodes(series, episodes, watched, timestamp, profile);
    if (changed > 0) {
      await historyRepository.add({ id: uid(), mediaId: series.id, mediaType: "series", title: series.title, action: watched ? "series:watched" : "series:unwatched", timestamp, metadata: { episodeCount: changed, profileId: profile } });
    }
  },

  async listTrackedSeries(): Promise<TrackedSeriesItem[]> {
    const profile = await profileId();
    const db = await getDatabase();
    if (!db) return browserStore.read().trackedSeries.filter((item) => storedProfile(item) === profile).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
    const rows = await db.select<Array<Record<string, unknown>>>(`SELECT ts.series_id,ts.title,ts.poster_path,ts.backdrop_path,ts.total_episodes,ts.updated_at,COUNT(ep.episode_id) watched_episodes FROM profile_tracked_series ts LEFT JOIN profile_episode_progress ep ON ep.profile_id=ts.profile_id AND ep.series_id=ts.series_id AND ep.watched=1 WHERE ts.profile_id=$1 GROUP BY ts.profile_id,ts.series_id,ts.title,ts.poster_path,ts.backdrop_path,ts.total_episodes,ts.updated_at ORDER BY ts.updated_at DESC`, [profile]);
    return rows.map((row) => ({ profileId: profile, seriesId: Number(row.series_id), title: String(row.title), posterPath: row.poster_path ? String(row.poster_path) : null, backdropPath: row.backdrop_path ? String(row.backdrop_path) : null, totalEpisodes: Number(row.total_episodes), watchedEpisodes: Number(row.watched_episodes), updatedAt: String(row.updated_at) }));
  },

  getNextEpisode(seasons: Season[], watched: EpisodeProgress[]): Episode | null {
    const watchedIds = new Set(watched.filter((item) => item.watched).map((item) => item.episodeId));
    return seasons.slice().sort((a,b) => a.seasonNumber-b.seasonNumber).flatMap((season) => season.episodes.slice().sort((a,b) => a.episodeNumber-b.episodeNumber)).find((episode) => !watchedIds.has(episode.id) && (!episode.airDate || new Date(episode.airDate) <= new Date())) ?? null;
  },

  calculateSeriesProgress(seriesId: number, seasons: Season[], watched: EpisodeProgress[]): SeriesProgress {
    const watchedSet = new Set(watched.filter((item) => item.watched).map((item) => item.episodeId));
    const progressBySeason = seasons.map((season) => {
      const watchedEpisodes = season.episodes.filter((episode) => watchedSet.has(episode.id)).length;
      return { seasonNumber: season.seasonNumber, totalEpisodes: season.episodes.length, watchedEpisodes, progressPercent: percent(watchedEpisodes, season.episodes.length) };
    });
    const totalEpisodes = seasons.reduce((sum, season) => sum + season.episodes.length, 0);
    const watchedEpisodes = seasons.flatMap((season) => season.episodes).filter((episode) => watchedSet.has(episode.id)).length;
    return { seriesId, totalEpisodes, watchedEpisodes, seasons: progressBySeason, progressPercent: percent(watchedEpisodes,totalEpisodes), completed: totalEpisodes > 0 && watchedEpisodes === totalEpisodes };
  },
};
