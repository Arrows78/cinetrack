import type { BrowserStore } from "@/db/client";

export const emptyData = (): BrowserStore => ({
  schemaVersion: 1,
  watchlist: [],
  seenMovies: [],
  episodeProgress: [],
  trackedSeries: [],
  history: [],
  preferences: {},
  library: [],
  viewingEvents: [],
  profiles: [],
  customLists: [],
  customListItems: [],
  availabilitySnapshots: [],
  availabilityAlerts: [],
});

export const mediaType = (value: unknown) => (value === "movie" ? ("movie" as const) : ("series" as const));
