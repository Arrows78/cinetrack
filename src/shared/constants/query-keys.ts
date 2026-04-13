export const queryKeys = {
  remote: {
    movies: ['remote', 'movies'] as const,
    movieDetails: (movieId: number) => ['remote', 'movie', movieId] as const,
    series: ['remote', 'series'] as const,
    seriesDetails: (seriesId: number) => ['remote', 'series', seriesId] as const,
    seasonDetails: (seriesId: number, seasonNumber: number) =>
      ['remote', 'series', seriesId, 'season', seasonNumber] as const,
    search: (query: string, scope: string) => ['remote', 'search', scope, query] as const,
    home: ['remote', 'home'] as const,
  },
  local: {
    watchlist: ['local', 'watchlist'] as const,
    history: ['local', 'history'] as const,
    preferences: ['local', 'preferences'] as const,
    movieSeen: (movieId: number) => ['local', 'movieSeen', movieId] as const,
    episodeProgress: (seriesId: number) => ['local', 'episodeProgress', seriesId] as const,
    trackedSeries: ['local', 'trackedSeries'] as const,
    stats: ['local', 'stats'] as const,
  },
};
