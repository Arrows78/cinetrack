import { describe, expect, it } from "vitest";
import { invalidationKeys } from "../invalidation";
import { queryKeys } from "../query-keys";

const P = "profile-1";
const asSet = (keys: readonly unknown[]) => new Set(keys.map((key) => JSON.stringify(key)));
const has = (keys: readonly unknown[], key: unknown) => asSet(keys).has(JSON.stringify(key));

describe("invalidationKeys", () => {
  it("never lists the same key twice in a domain", () => {
    const domains = [
      invalidationKeys.libraryStatus(P),
      invalidationKeys.library(P),
      invalidationKeys.progress(P, 9),
      invalidationKeys.movieWatch(P, 5),
      invalidationKeys.trackedSeries(P),
    ];
    for (const keys of domains) expect(asSet(keys).size).toBe(keys.length);
  });

  it("nests the domains: each wider one contains the narrower one it is built from", () => {
    const library = invalidationKeys.library(P);
    for (const key of invalidationKeys.libraryStatus(P)) expect(has(library, key)).toBe(true);
    for (const domain of [
      invalidationKeys.progress(P, 9),
      invalidationKeys.movieWatch(P, 5),
      invalidationKeys.trackedSeries(P),
    ]) {
      for (const key of library) expect(has(domain, key)).toBe(true);
    }
  });

  it("keeps a status move narrower than a library write", () => {
    const status = invalidationKeys.libraryStatus(P);
    expect(has(status, queryKeys.local.libraryPage(P))).toBe(true);
    expect(has(status, queryKeys.local.stats(P))).toBe(true);
    for (const untouched of [
      queryKeys.local.history(P),
      queryKeys.local.libraryMediaKeys(P),
      queryKeys.local.libraryDistinctTags(P),
      queryKeys.local.tracking(P),
      queryKeys.local.dismissedRecommendations(P),
    ]) {
      expect(has(status, untouched)).toBe(false);
    }
  });

  it("reaches every reader a library write feeds", () => {
    const library = invalidationKeys.library(P);
    for (const key of [
      queryKeys.local.library(P),
      queryKeys.local.libraryPage(P),
      queryKeys.local.history(P),
      queryKeys.local.stats(P),
      queryKeys.local.watchTonight(P),
      queryKeys.local.tracking(P),
      queryKeys.local.libraryMediaKeys(P),
      queryKeys.local.libraryDistinctTags(P),
      queryKeys.local.completedLibraryCandidates(P),
      queryKeys.local.bestRecommendationSeed(P),
      queryKeys.local.dismissedRecommendations(P),
    ]) {
      expect(has(library, key)).toBe(true);
    }
  });

  it("adds a series' own progress, watch-next, diary and the tracked list to a progress write", () => {
    const keys = invalidationKeys.progress(P, 9);
    expect(has(keys, queryKeys.local.episodeProgress(P, 9))).toBe(true);
    expect(has(keys, queryKeys.local.watchNextEpisode(P, 9))).toBe(true);
    expect(has(keys, queryKeys.local.viewingEventsForMedia(P, "series", 9))).toBe(true);
    expect(has(keys, queryKeys.local.trackedSeries(P))).toBe(true);
    expect(has(keys, queryKeys.local.episodeProgress(P, 10))).toBe(false);
  });

  it("adds a movie's own seen state and diary to a movie watch, and scopes every key to the profile", () => {
    const keys = invalidationKeys.movieWatch(P, 5);
    expect(has(keys, queryKeys.local.movieSeen(P, 5))).toBe(true);
    expect(has(keys, queryKeys.local.viewingEventsForMedia(P, "movie", 5))).toBe(true);
    for (const key of invalidationKeys.progress(P, 9)) expect(JSON.stringify(key)).toContain(P);
    for (const key of invalidationKeys.progress("other", 9)) expect(JSON.stringify(key)).not.toContain(P);
  });
});
