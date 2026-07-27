export const queryKeys = {
  remote: {
    movies: ["remote", "movies"] as const,
    movieDetails: (movieId: number) => ["remote", "movie", movieId] as const,
    series: ["remote", "series"] as const,
    seriesDetails: (seriesId: number) => ["remote", "series", seriesId] as const,
    seasonDetails: (seriesId: number, seasonNumber: number) =>
      ["remote", "series", seriesId, "season", seasonNumber] as const,
    search: (query: string, scope: string) => ["remote", "search", scope, query] as const,
    discover: (genreMovie?: string, genreSeries?: string, provider?: string, scope?: string, region?: string) =>
      ["remote", "discover", scope, genreMovie, genreSeries, provider, region] as const,
    providers: (mediaType: string, region: string) => ["remote", "providers", mediaType, region] as const,
    home: ["remote", "home"] as const,
    recommendations: (mediaType: string, mediaId: number) => ["remote", "recommendations", mediaType, mediaId] as const,
    videos: (mediaType: string, mediaId: number) => ["remote", "videos", mediaType, mediaId] as const,
    person: (personId: number) => ["remote", "person", personId] as const,
    availability: (mediaType: string, mediaId: number, region: string) =>
      ["remote", "availability", mediaType, mediaId, region] as const,
  },
  local: {
    watchlist: ["local", "watchlist"] as const,
    history: ["local", "history"] as const,
    preferences: ["local", "preferences"] as const,
    movieSeen: (movieId: number) => ["local", "movieSeen", movieId] as const,
    episodeProgress: (seriesId: number) => ["local", "episodeProgress", seriesId] as const,
    trackedSeries: ["local", "trackedSeries"] as const,
    stats: ["local", "stats"] as const,
    library: ["local", "library"] as const,
    libraryItem: (mediaType: string, mediaId: number) => ["local", "library", mediaType, mediaId] as const,
    profiles: ["local", "profiles"] as const,
    customLists: ["local", "customLists"] as const,
    customList: (listId: string) => ["local", "customLists", listId] as const,
    calendar: ["local", "calendar"] as const,
    availabilityAlerts: ["local", "availabilityAlerts"] as const,
    watchTonight: ["watch-tonight"] as const,
  },
};
