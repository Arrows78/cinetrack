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
    people: (query: string) => ["remote", "people", query] as const,
    popularPeople: ["remote", "people", "popular"] as const,
    availability: (mediaType: string, mediaId: number, region: string) =>
      ["remote", "availability", mediaType, mediaId, region] as const,
    collection: (collectionId: number) => ["remote", "collection", collectionId] as const,
    // "cast"/"crew" here mirrors DiscoverArgs' withCast/withCrew — a movie
    // discover query filtered to one person's credits, used by the
    // "people you watch most" home rail.
    discoverByPerson: (role: "cast" | "crew", personId: number) =>
      ["remote", "discoverByPerson", role, personId] as const,
  },
  // Every entry below except `preferences`, `profiles` and
  // `availabilitySnapshots` takes the active profile id as its first
  // argument (see useActiveProfileId in use-preferences.ts) — the
  // underlying data is scoped to one local profile, so two profiles must
  // never share a cache entry. `preferences` and `profiles` are exceptions:
  // preferences is a single global key/value store (it's literally what
  // stores which profile is active), and `profiles` lists every profile,
  // not one profile's data. `availabilitySnapshots` is a third exception —
  // the underlying `availability_snapshots` table is a shared TTL cache with
  // no `profile_id` column at all (see database::PROFILE_SCOPED_TABLES's own
  // doc comment on the Rust side).
  local: {
    history: (profileId: string) => ["local", "history", profileId] as const,
    preferences: ["local", "preferences"] as const,
    movieSeen: (profileId: string, movieId: number) => ["local", "movieSeen", profileId, movieId] as const,
    episodeProgress: (profileId: string, seriesId: number) =>
      ["local", "episodeProgress", profileId, seriesId] as const,
    trackedSeries: (profileId: string) => ["local", "trackedSeries", profileId] as const,
    stats: (profileId: string) => ["local", "stats", profileId] as const,
    library: (profileId: string) => ["local", "library", profileId] as const,
    // Prefix only (no filters) — invalidating this key invalidates every
    // filter/sort variant useLibraryPage caches underneath it, since
    // TanStack Query invalidates by key prefix, not exact match. The hook
    // itself appends its filters to build the actual per-query key.
    libraryPage: (profileId: string) => ["local", "libraryPage", profileId] as const,
    libraryItem: (profileId: string, mediaType: string, mediaId: number) =>
      ["local", "library", profileId, mediaType, mediaId] as const,
    profiles: ["local", "profiles"] as const,
    customLists: (profileId: string) => ["local", "customLists", profileId] as const,
    customList: (profileId: string, listId: string) => ["local", "customLists", profileId, listId] as const,
    smartLists: (profileId: string) => ["local", "smartLists", profileId] as const,
    savedFilters: (profileId: string, page: string) => ["local", "savedFilters", profileId, page] as const,
    calendar: (profileId: string) => ["local", "calendar", profileId] as const,
    availabilityAlerts: (profileId: string) => ["local", "availabilityAlerts", profileId] as const,
    availabilitySnapshots: ["local", "availabilitySnapshots"] as const,
    tracking: (profileId: string) => ["local", "tracking", profileId] as const,
    watchTonight: (profileId: string) => ["local", "watchTonight", profileId] as const,
    watchNextEpisode: (profileId: string, seriesId: number) => ["local", "watchNext", profileId, seriesId] as const,
    viewingEventsForMedia: (profileId: string, mediaType: string, mediaId: number) =>
      ["local", "viewingEventsForMedia", profileId, mediaType, mediaId] as const,
    // `signature` is a joined "mediaType:mediaId" list of the completed
    // library items currently feeding the "people you watch most" rail —
    // this fetches remote credits, but is keyed under `local` (with the
    // profile id) because *which* titles it fetches for is entirely
    // profile-scoped library data, not a global catalogue query.
    peopleYouWatchCredits: (profileId: string, signature: string) =>
      ["local", "peopleYouWatchCredits", profileId, signature] as const,
  },
};
