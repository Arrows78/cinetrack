import { beforeEach, describe, expect, it } from "vitest";
import { browserStore } from "../browser-store";

const STORAGE_KEY = "cinetrack.browser-store.v2";
const LEGACY_STORAGE_KEY = "cinetrack.browser-store";

const validWatchlistItem = {
  profileId: "default",
  mediaId: 550,
  mediaType: "movie",
  title: "Fight Club",
  posterPath: null,
  backdropPath: null,
  year: 1999,
  rating: 8.4,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("browserStore.read", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns defaults when the payload is not valid JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "{corrupted");
    expect(browserStore.read().watchlist).toEqual([]);
  });

  it("keeps valid sections and resets only the corrupted one", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        watchlist: [validWatchlistItem],
        seenMovies: [{ movieId: "not-a-number" }],
      })
    );

    const store = browserStore.read();
    expect(store.watchlist).toHaveLength(1);
    expect(store.watchlist[0]?.title).toBe("Fight Club");
    expect(store.seenMovies).toEqual([]);
  });

  it("serves defaults instead of misreading data from a newer app version", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 999, watchlist: [validWatchlistItem] }));
    expect(browserStore.read().watchlist).toEqual([]);
  });

  it("falls back to the legacy storage key", () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ watchlist: [validWatchlistItem] }));
    expect(browserStore.read().watchlist).toHaveLength(1);
  });

  it("stamps the current schema version on write", () => {
    browserStore.write({ ...browserStore.read(), schemaVersion: 0 });
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as { schemaVersion?: number };
    expect(raw.schemaVersion).toBe(1);
  });
});
