import { getDatabase } from "@/db/client";
import { newUuid } from "@/shared/lib/id";
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

    const rows = await db.select<Array<{ episode_id: number }>>(
      "SELECT episode_id FROM episode_progress WHERE profile_id=$1 AND series_id=$2 AND watched=1",
      [profile, series.id]
    );
    const watchedIds = new Set(rows.map((row) => Number(row.episode_id)));
    const fresh = episodes.filter((episode) => !watchedIds.has(episode.episodeId));
    if (!fresh.length) return 0;

    await db.execute("BEGIN IMMEDIATE");
    try {
      for (const episode of fresh) {
        await db.execute(
          `INSERT INTO episode_progress (uuid,profile_id,series_id,episode_id,season_number,episode_number,watched,watched_at,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,1,$7,$7,$7)
           ON CONFLICT (profile_id, series_id, episode_id) DO UPDATE SET
             watched = 1,
             watched_at = excluded.watched_at,
             updated_at = excluded.updated_at`,
          [
            newUuid(),
            profile,
            series.id,
            episode.episodeId,
            episode.seasonNumber,
            episode.episodeNumber,
            episode.watchedAt,
          ]
        );
        await db.execute(
          `INSERT INTO viewing_events (uuid,profile_id,media_id,media_type,title,event_type,watched_at,duration_minutes,episode_id,season_number,episode_number,created_at)
           VALUES ($1,$2,$3,'series',$4,'watched',$5,$6,$7,$8,$9,$5)`,
          [
            newUuid(),
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
        "SELECT COUNT(*) count FROM episode_progress WHERE profile_id=$1 AND series_id=$2 AND watched=1",
        [profile, series.id]
      );
      await db.execute(
        `INSERT INTO tracked_series (uuid,profile_id,series_id,title,poster_path,backdrop_path,total_episodes,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
         ON CONFLICT (profile_id, series_id) DO UPDATE SET
           title = excluded.title,
           poster_path = excluded.poster_path,
           backdrop_path = excluded.backdrop_path,
           total_episodes = excluded.total_episodes,
           updated_at = excluded.updated_at`,
        [
          newUuid(),
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

    const rows = await db.select<Array<{ count: number }>>(
      "SELECT COUNT(*) count FROM seen_movies WHERE profile_id=$1 AND movie_id=$2",
      [profile, movie.movieId]
    );
    if (Number(rows[0]?.count ?? 0) > 0) return false;

    await db.execute("BEGIN IMMEDIATE");
    try {
      await db.execute(
        `INSERT INTO seen_movies (uuid,profile_id,movie_id,title,poster_path,backdrop_path,watched_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7)`,
        [
          newUuid(),
          profile,
          movie.movieId,
          movie.title,
          movie.posterPath ?? null,
          movie.backdropPath ?? null,
          movie.watchedAt,
        ]
      );
      await db.execute(
        `INSERT INTO viewing_events (uuid,profile_id,media_id,media_type,title,event_type,watched_at,duration_minutes,episode_id,season_number,episode_number,created_at)
         VALUES ($1,$2,$3,'movie',$4,'watched',$5,$6,NULL,NULL,NULL,$5)`,
        [newUuid(), profile, movie.movieId, movie.title, movie.watchedAt, movie.runtime ?? null]
      );
      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
    return true;
  },
};
