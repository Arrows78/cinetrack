import { percent } from '@/shared/utils/format';
import type {
  Episode,
  EpisodeProgress,
  MediaSummary,
  SeriesProgress,
  Season,
  TrackedSeriesItem,
} from '@/types/media';
import { browserStore, getDatabase } from './db';
import { historyRepository } from './history-repository';

const nowIso = () => new Date().toISOString();
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const progressRepository = {
  async isMovieSeen(movieId: number) {
    const db = await getDatabase();

    if (!db) {
      return browserStore.read().seenMovies.some((item) => item.movieId === movieId);
    }

    const rows = await db.select<Array<{ count: number }>>(
      'SELECT COUNT(*) as count FROM seen_movies WHERE movie_id = $1',
      [movieId],
    );

    return Number(rows[0]?.count ?? 0) > 0;
  },

  async listSeenMovies() {
    const db = await getDatabase();

    if (!db) {
      return browserStore.read().seenMovies;
    }

    return db.select<Array<Record<string, unknown>>>(
      'SELECT * FROM seen_movies ORDER BY watched_at DESC',
    );
  },

  async toggleMovieSeen(movie: MediaSummary, watched: boolean, watchedAt = nowIso()) {
    const db = await getDatabase();

    if (!db) {
      const store = browserStore.read();
      store.seenMovies = watched
        ? [
            {
              movieId: movie.id,
              title: movie.title,
              posterPath: movie.posterPath,
              backdropPath: movie.backdropPath,
              watchedAt,
            },
            ...store.seenMovies.filter((item) => item.movieId !== movie.id),
          ]
        : store.seenMovies.filter((item) => item.movieId !== movie.id);
      browserStore.write(store);
    } else if (watched) {
      await db.execute(
        `INSERT OR REPLACE INTO seen_movies (movie_id, title, poster_path, backdrop_path, watched_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [movie.id, movie.title, movie.posterPath ?? null, movie.backdropPath ?? null, watchedAt],
      );
    } else {
      await db.execute('DELETE FROM seen_movies WHERE movie_id = $1', [movie.id]);
    }

    await historyRepository.add({
      id: uid(),
      mediaId: movie.id,
      mediaType: 'movie',
      title: movie.title,
      action: watched ? 'movie:watched' : 'movie:unwatched',
      timestamp: watchedAt,
    });
  },

  async getEpisodeProgress(seriesId: number): Promise<EpisodeProgress[]> {
    const db = await getDatabase();

    if (!db) {
      return browserStore
        .read()
        .episodeProgress.filter((item) => item.seriesId === seriesId && item.watched);
    }

    const rows = await db.select<Array<Record<string, unknown>>>(
      'SELECT * FROM episode_progress WHERE series_id = $1 AND watched = 1',
      [seriesId],
    );

    return rows.map((row) => ({
      seriesId: Number(row.series_id),
      episodeId: Number(row.episode_id),
      seasonNumber: Number(row.season_number),
      episodeNumber: Number(row.episode_number),
      watched: Boolean(row.watched),
      watchedAt: row.watched_at ? String(row.watched_at) : null,
    }));
  },

  async toggleEpisodeSeen(
    series: MediaSummary & { numberOfEpisodes?: number },
    episode: Episode,
    watched: boolean,
  ) {
    const db = await getDatabase();
    const watchedAt = nowIso();

    if (!db) {
      const store = browserStore.read();
      store.episodeProgress = watched
        ? [
            {
              seriesId: series.id,
              episodeId: episode.id,
              seasonNumber: episode.seasonNumber,
              episodeNumber: episode.episodeNumber,
              watched: true,
              watchedAt,
            },
            ...store.episodeProgress.filter((item) => item.episodeId !== episode.id),
          ]
        : store.episodeProgress.filter((item) => item.episodeId !== episode.id);

      const watchedEpisodes = store.episodeProgress.filter(
        (item) => item.seriesId === series.id && item.watched,
      ).length;
      store.trackedSeries = [
        {
          seriesId: series.id,
          title: series.title,
          posterPath: series.posterPath,
          backdropPath: series.backdropPath,
          totalEpisodes: series.numberOfEpisodes ?? watchedEpisodes,
          watchedEpisodes,
          updatedAt: watchedAt,
        },
        ...store.trackedSeries.filter((item) => item.seriesId !== series.id),
      ];
      browserStore.write(store);
    } else {
      if (watched) {
        await db.execute(
          `INSERT OR REPLACE INTO episode_progress
            (series_id, episode_id, season_number, episode_number, watched, watched_at)
           VALUES ($1, $2, $3, $4, 1, $5)`,
          [series.id, episode.id, episode.seasonNumber, episode.episodeNumber, watchedAt],
        );
      } else {
        await db.execute('DELETE FROM episode_progress WHERE series_id = $1 AND episode_id = $2', [
          series.id,
          episode.id,
        ]);
      }

      const countRows = await db.select<Array<{ watchedEpisodes: number }>>(
        'SELECT COUNT(*) as watchedEpisodes FROM episode_progress WHERE series_id = $1 AND watched = 1',
        [series.id],
      );

      await db.execute(
        `INSERT OR REPLACE INTO tracked_series
          (series_id, title, poster_path, backdrop_path, total_episodes, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          series.id,
          series.title,
          series.posterPath ?? null,
          series.backdropPath ?? null,
          series.numberOfEpisodes ?? Number(countRows[0]?.watchedEpisodes ?? 0),
          watchedAt,
        ],
      );
    }

    await historyRepository.add({
      id: uid(),
      mediaId: series.id,
      mediaType: 'series',
      title: series.title,
      action: watched ? 'episode:watched' : 'episode:unwatched',
      timestamp: watchedAt,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.title,
    });
  },

  async markSeason(
    series: MediaSummary & { numberOfEpisodes?: number },
    season: Season,
    watched: boolean,
  ) {
    for (const episode of season.episodes) {
      await this.toggleEpisodeSeen(series, episode, watched);
    }
  },

  async markSeries(
    series: MediaSummary & { numberOfEpisodes?: number },
    seasons: Season[],
    watched: boolean,
  ) {
    for (const season of seasons) {
      await this.markSeason(series, season, watched);
    }
  },

  async listTrackedSeries(): Promise<TrackedSeriesItem[]> {
    const db = await getDatabase();

    if (!db) {
      return browserStore
        .read()
        .trackedSeries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }

    const rows = await db.select<Array<Record<string, unknown>>>(
      `SELECT ts.series_id,
              ts.title,
              ts.poster_path,
              ts.backdrop_path,
              ts.total_episodes,
              ts.updated_at,
              COUNT(ep.episode_id) as watched_episodes
         FROM tracked_series ts
         LEFT JOIN episode_progress ep ON ep.series_id = ts.series_id AND ep.watched = 1
        GROUP BY ts.series_id, ts.title, ts.poster_path, ts.backdrop_path, ts.total_episodes, ts.updated_at
        ORDER BY ts.updated_at DESC`,
    );

    return rows.map((row) => ({
      seriesId: Number(row.series_id),
      title: String(row.title),
      posterPath: row.poster_path ? String(row.poster_path) : null,
      backdropPath: row.backdrop_path ? String(row.backdrop_path) : null,
      totalEpisodes: Number(row.total_episodes),
      watchedEpisodes: Number(row.watched_episodes),
      updatedAt: String(row.updated_at),
    }));
  },

  calculateSeriesProgress(
    seriesId: number,
    seasons: Season[],
    watched: EpisodeProgress[],
  ): SeriesProgress {
    const watchedSet = new Set(
      watched.filter((item) => item.watched).map((item) => item.episodeId),
    );
    const progressBySeason = seasons.map((season) => {
      const watchedEpisodes = season.episodes.filter((episode) =>
        watchedSet.has(episode.id),
      ).length;
      return {
        seasonNumber: season.seasonNumber,
        totalEpisodes: season.episodes.length,
        watchedEpisodes,
        progressPercent: percent(watchedEpisodes, season.episodes.length),
      };
    });

    const totalEpisodes = seasons.reduce((sum, season) => sum + season.episodes.length, 0);
    const watchedEpisodes = watched.filter((item) => item.watched).length;

    return {
      seriesId,
      totalEpisodes,
      watchedEpisodes,
      seasons: progressBySeason,
      progressPercent: percent(watchedEpisodes, totalEpisodes),
      completed: totalEpisodes > 0 && watchedEpisodes === totalEpisodes,
    };
  },
};
