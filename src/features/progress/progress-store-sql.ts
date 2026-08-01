import type Database from "@tauri-apps/plugin-sql";
import { newUuid } from "@/shared/lib/id";
import { historyRepository } from "@/features/history/history-repository";
import type { ProgressStore, SeriesInput } from "./progress-store";
import type { Episode, EpisodeProgress, MediaSummary, TrackedSeriesItem } from "@/types/media";

export function createSqlProgressStore(db: Database): ProgressStore {
  return {
    async isMovieSeen(profile: string, movieId: number): Promise<boolean> {
      const rows = await db.select<Array<{ count: number }>>(
        "SELECT COUNT(*) count FROM seen_movies WHERE profile_id=$1 AND movie_id=$2",
        [profile, movieId]
      );
      return Number(rows[0]?.count ?? 0) > 0;
    },

    async toggleMovieSeen(profile: string, movie: MediaSummary, watched: boolean, watchedAt: string): Promise<void> {
      await db.execute("BEGIN IMMEDIATE");
      try {
        if (watched) {
          await db.execute(
            `INSERT INTO seen_movies (uuid,profile_id,movie_id,title,poster_path,backdrop_path,watched_at,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7)
             ON CONFLICT (profile_id, movie_id) DO UPDATE SET
               title = excluded.title,
               poster_path = excluded.poster_path,
               backdrop_path = excluded.backdrop_path,
               watched_at = excluded.watched_at,
               updated_at = excluded.updated_at`,
            [newUuid(), profile, movie.id, movie.title, movie.posterPath ?? null, movie.backdropPath ?? null, watchedAt]
          );
        } else {
          await db.execute("DELETE FROM seen_movies WHERE profile_id=$1 AND movie_id=$2", [profile, movie.id]);
        }
        await db.execute(
          `INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$7)`,
          [
            newUuid(),
            profile,
            movie.id,
            "movie",
            movie.title,
            watched ? "watched" : "unwatched",
            watchedAt,
            movie.runtime ?? null,
            null,
            null,
            null,
          ]
        );
        await historyRepository.add({
          id: newUuid(),
          mediaId: movie.id,
          mediaType: "movie",
          title: movie.title,
          action: watched ? "movie:watched" : "movie:unwatched",
          timestamp: watchedAt,
          metadata: { profileId: profile },
        });
        await db.execute("COMMIT");
      } catch (error) {
        await db.execute("ROLLBACK");
        throw error;
      }
    },

    async getEpisodeProgress(profile: string, seriesId: number): Promise<EpisodeProgress[]> {
      const rows = await db.select<Array<Record<string, unknown>>>(
        "SELECT * FROM episode_progress WHERE profile_id=$1 AND series_id=$2 AND watched=1",
        [profile, seriesId]
      );
      return rows.map((row) => ({
        profileId: profile,
        seriesId: Number(row.series_id),
        episodeId: Number(row.episode_id),
        seasonNumber: Number(row.season_number),
        episodeNumber: Number(row.episode_number),
        watched: Boolean(row.watched),
        watchedAt: row.watched_at ? String(row.watched_at) : null,
      }));
    },

    async applyEpisodes(
      profile: string,
      series: SeriesInput,
      episodes: Episode[],
      watched: boolean,
      watchedAt: string
    ): Promise<number> {
      const rows = await db.select<Array<{ episode_id: number }>>(
        "SELECT episode_id FROM episode_progress WHERE profile_id=$1 AND series_id=$2 AND watched=1",
        [profile, series.id]
      );
      const watchedIds = new Set(rows.map((row) => Number(row.episode_id)));
      const changedEpisodes = episodes.filter((episode) =>
        watched ? !watchedIds.has(episode.id) : watchedIds.has(episode.id)
      );
      if (!changedEpisodes.length) return 0;

      await db.execute("BEGIN IMMEDIATE");
      try {
        for (const episode of changedEpisodes) {
          if (watched)
            await db.execute(
              `INSERT INTO episode_progress (uuid,profile_id,series_id,episode_id,season_number,episode_number,watched,watched_at,created_at,updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,1,$7,$7,$7)
               ON CONFLICT (profile_id, series_id, episode_id) DO UPDATE SET
                 watched = 1,
                 watched_at = excluded.watched_at,
                 updated_at = excluded.updated_at`,
              [newUuid(), profile, series.id, episode.id, episode.seasonNumber, episode.episodeNumber, watchedAt]
            );
          else
            await db.execute("DELETE FROM episode_progress WHERE profile_id=$1 AND series_id=$2 AND episode_id=$3", [
              profile,
              series.id,
              episode.id,
            ]);
          await db.execute(
            `INSERT INTO viewing_events (uuid,profile_id,media_id,media_type,title,event_type,watched_at,duration_minutes,episode_id,season_number,episode_number,created_at)
             VALUES ($1,$2,$3,'series',$4,$5,$6,$7,$8,$9,$10,$6)`,
            [
              newUuid(),
              profile,
              series.id,
              series.title,
              watched ? "watched" : "unwatched",
              watchedAt,
              episode.runtime ?? series.runtime ?? null,
              episode.id,
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
            watchedAt,
          ]
        );
        await db.execute("COMMIT");
      } catch (error) {
        await db.execute("ROLLBACK");
        throw error;
      }
      return changedEpisodes.length;
    },

    async listTrackedSeries(profile: string): Promise<TrackedSeriesItem[]> {
      const rows = await db.select<Array<Record<string, unknown>>>(
        `SELECT ts.series_id,ts.title,ts.poster_path,ts.backdrop_path,ts.total_episodes,ts.updated_at,COUNT(ep.episode_id) watched_episodes FROM tracked_series ts LEFT JOIN episode_progress ep ON ep.profile_id=ts.profile_id AND ep.series_id=ts.series_id AND ep.watched=1 WHERE ts.profile_id=$1 GROUP BY ts.profile_id,ts.series_id,ts.title,ts.poster_path,ts.backdrop_path,ts.total_episodes,ts.updated_at ORDER BY ts.updated_at DESC`,
        [profile]
      );
      return rows.map((row) => ({
        profileId: profile,
        seriesId: Number(row.series_id),
        title: String(row.title),
        posterPath: row.poster_path ? String(row.poster_path) : null,
        backdropPath: row.backdrop_path ? String(row.backdrop_path) : null,
        totalEpisodes: Number(row.total_episodes),
        watchedEpisodes: Number(row.watched_episodes),
        updatedAt: String(row.updated_at),
      }));
    },
  };
}
