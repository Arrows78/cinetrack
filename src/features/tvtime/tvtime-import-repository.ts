import { browserStore, getDatabase } from "@/db/client";
import type { Series } from "@/types/media";

export interface ImportableEpisode {
  episodeId: number;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: string;
  runtimeMinutes: number | null;
}

export interface ImportableMovie {
  movieId: number;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  runtime?: number | null;
  watchedAt: string;
}

const uid = () => crypto.randomUUID();
const storedProfile = (item: { profileId?: string }) => item.profileId ?? "default";

/**
 * Batch writes for the TV Time import. Unlike the interactive progress
 * repository this preserves the original watch date of every episode and
 * does not spam the activity log — viewing_events carry the history.
 * Returns the number of episodes actually inserted (already-watched ones
 * are skipped so a re-import is idempotent).
 */
export const tvTimeImportRepository = {
  async importSeriesProgress(profile: string, series: Series, episodes: ImportableEpisode[]): Promise<number> {
    if (!episodes.length) return 0;
    const latestWatchedAt = episodes.reduce(
      (max, e) => (e.watchedAt > max ? e.watchedAt : max),
      episodes[0]!.watchedAt
    );
    const db = await getDatabase();

    if (!db) {
      const store = browserStore.read();
      const watchedIds = new Set(
        store.episodeProgress
          .filter((item) => storedProfile(item) === profile && item.seriesId === series.id && item.watched)
          .map((item) => item.episodeId)
      );
      const fresh = episodes.filter((episode) => !watchedIds.has(episode.episodeId));
      if (!fresh.length) return 0;
      store.episodeProgress.push(
        ...fresh.map((episode) => ({
          profileId: profile,
          seriesId: series.id,
          episodeId: episode.episodeId,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          watched: true,
          watchedAt: episode.watchedAt,
        }))
      );
      store.viewingEvents.unshift(
        ...fresh.map((episode) => ({
          id: uid(),
          profileId: profile,
          mediaId: series.id,
          mediaType: "series" as const,
          title: series.title,
          eventType: "watched" as const,
          watchedAt: episode.watchedAt,
          durationMinutes: episode.runtimeMinutes,
          episodeId: episode.episodeId,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
        }))
      );
      const watchedCount = store.episodeProgress.filter(
        (item) => storedProfile(item) === profile && item.seriesId === series.id && item.watched
      ).length;
      store.trackedSeries = [
        {
          profileId: profile,
          seriesId: series.id,
          title: series.title,
          posterPath: series.posterPath,
          backdropPath: series.backdropPath,
          totalEpisodes: series.numberOfEpisodes ?? watchedCount,
          watchedEpisodes: watchedCount,
          updatedAt: latestWatchedAt,
        },
        ...store.trackedSeries.filter((item) => !(storedProfile(item) === profile && item.seriesId === series.id)),
      ];
      browserStore.write(store);
      return fresh.length;
    }

    const rows = await db.select<Array<{ episode_id: number }>>(
      "SELECT episode_id FROM profile_episode_progress WHERE profile_id=$1 AND series_id=$2 AND watched=1",
      [profile, series.id]
    );
    const watchedIds = new Set(rows.map((row) => Number(row.episode_id)));
    const fresh = episodes.filter((episode) => !watchedIds.has(episode.episodeId));
    if (!fresh.length) return 0;

    await db.execute("BEGIN IMMEDIATE");
    try {
      for (const episode of fresh) {
        await db.execute(
          "INSERT OR REPLACE INTO profile_episode_progress (profile_id,series_id,episode_id,season_number,episode_number,watched,watched_at) VALUES ($1,$2,$3,$4,$5,1,$6)",
          [profile, series.id, episode.episodeId, episode.seasonNumber, episode.episodeNumber, episode.watchedAt]
        );
        await db.execute(
          "INSERT INTO viewing_events (id,profile_id,media_id,media_type,title,event_type,watched_at,duration_minutes,episode_id,season_number,episode_number) VALUES ($1,$2,$3,'series',$4,'watched',$5,$6,$7,$8,$9)",
          [
            uid(),
            profile,
            series.id,
            series.title,
            episode.watchedAt,
            episode.runtimeMinutes,
            episode.episodeId,
            episode.seasonNumber,
            episode.episodeNumber,
          ]
        );
      }
      const counts = await db.select<Array<{ count: number }>>(
        "SELECT COUNT(*) count FROM profile_episode_progress WHERE profile_id=$1 AND series_id=$2 AND watched=1",
        [profile, series.id]
      );
      await db.execute(
        "INSERT OR REPLACE INTO profile_tracked_series (profile_id,series_id,title,poster_path,backdrop_path,total_episodes,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [
          profile,
          series.id,
          series.title,
          series.posterPath ?? null,
          series.backdropPath ?? null,
          series.numberOfEpisodes ?? Number(counts[0]?.count ?? 0),
          latestWatchedAt,
        ]
      );
      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
    return fresh.length;
  },

  async importMovieSeen(profile: string, movie: ImportableMovie): Promise<boolean> {
    const db = await getDatabase();

    if (!db) {
      const store = browserStore.read();
      const alreadySeen = store.seenMovies.some(
        (item) => storedProfile(item) === profile && item.movieId === movie.movieId
      );
      if (alreadySeen) return false;
      store.seenMovies.unshift({
        profileId: profile,
        movieId: movie.movieId,
        title: movie.title,
        posterPath: movie.posterPath ?? null,
        backdropPath: movie.backdropPath ?? null,
        watchedAt: movie.watchedAt,
      });
      store.viewingEvents.unshift({
        id: uid(),
        profileId: profile,
        mediaId: movie.movieId,
        mediaType: "movie",
        title: movie.title,
        eventType: "watched",
        watchedAt: movie.watchedAt,
        durationMinutes: movie.runtime ?? null,
      });
      browserStore.write(store);
      return true;
    }

    const rows = await db.select<Array<{ count: number }>>(
      "SELECT COUNT(*) count FROM profile_seen_movies WHERE profile_id=$1 AND movie_id=$2",
      [profile, movie.movieId]
    );
    if (Number(rows[0]?.count ?? 0) > 0) return false;

    await db.execute("BEGIN IMMEDIATE");
    try {
      await db.execute(
        "INSERT OR REPLACE INTO profile_seen_movies (profile_id,movie_id,title,poster_path,backdrop_path,watched_at) VALUES ($1,$2,$3,$4,$5,$6)",
        [profile, movie.movieId, movie.title, movie.posterPath ?? null, movie.backdropPath ?? null, movie.watchedAt]
      );
      await db.execute(
        "INSERT INTO viewing_events (id,profile_id,media_id,media_type,title,event_type,watched_at,duration_minutes,episode_id,season_number,episode_number) VALUES ($1,$2,$3,'movie',$4,'watched',$5,$6,NULL,NULL,NULL)",
        [uid(), profile, movie.movieId, movie.title, movie.watchedAt, movie.runtime ?? null]
      );
      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
    return true;
  },
};
