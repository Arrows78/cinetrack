import { describe, expect, it } from "vitest";
import type { Query } from "@tanstack/react-query";
import { shouldDehydrateQuery } from "@/app/query-client";
import { queryKeys } from "@/shared/constants/query-keys";

// shouldDehydrateQuery (and the defaultShouldDehydrateQuery it composes
// with) only ever reads query.queryKey and query.state.status, so a plain
// object shaped like those two fields is enough — no need to spin up a
// real QueryClient/QueryCache just to get a Query instance.
function makeQuery(queryKey: readonly unknown[], status: "success" | "error" | "pending"): Query {
  return { queryKey, state: { status } } as unknown as Query;
}

describe("shouldDehydrateQuery", () => {
  it("persists successful remote.* queries", () => {
    const remoteKeys: (readonly unknown[])[] = [
      queryKeys.remote.movies,
      queryKeys.remote.movieDetails(42),
      queryKeys.remote.series,
      queryKeys.remote.seriesDetails(7),
      queryKeys.remote.seasonDetails(7, 1),
      queryKeys.remote.search("dune", "movie"),
      queryKeys.remote.discover("28", "18", "netflix", "movie", "FR"),
      queryKeys.remote.providers("movie", "FR"),
      queryKeys.remote.home,
      queryKeys.remote.recommendations("movie", 42),
      queryKeys.remote.videos("movie", 42),
      queryKeys.remote.person(1),
      queryKeys.remote.people("denis"),
      queryKeys.remote.popularPeople,
      queryKeys.remote.availability("movie", 42, "FR"),
    ];

    for (const key of remoteKeys) {
      expect(shouldDehydrateQuery(makeQuery(key, "success"))).toBe(true);
    }
  });

  it("never persists any local.* query, regardless of status", () => {
    const localKeys: (readonly unknown[])[] = [
      queryKeys.local.history("profile-1"),
      queryKeys.local.preferences,
      queryKeys.local.movieSeen("profile-1", 42),
      queryKeys.local.episodeProgress("profile-1", 7),
      queryKeys.local.trackedSeries("profile-1"),
      queryKeys.local.stats("profile-1"),
      queryKeys.local.library("profile-1"),
      queryKeys.local.libraryItem("profile-1", "movie", 42),
      queryKeys.local.profiles,
      queryKeys.local.customLists("profile-1"),
      queryKeys.local.customList("profile-1", "list-1"),
      queryKeys.local.calendar("profile-1"),
      queryKeys.local.availabilityAlerts("profile-1"),
      queryKeys.local.tracking("profile-1"),
      queryKeys.local.watchTonight("profile-1"),
      queryKeys.local.watchNextEpisode("profile-1", 7),
    ];

    for (const key of localKeys) {
      expect(shouldDehydrateQuery(makeQuery(key, "success"))).toBe(false);
      expect(shouldDehydrateQuery(makeQuery(key, "error"))).toBe(false);
      expect(shouldDehydrateQuery(makeQuery(key, "pending"))).toBe(false);
    }
  });

  it("does not persist a remote.* query that failed or hasn't settled", () => {
    expect(shouldDehydrateQuery(makeQuery(queryKeys.remote.movies, "error"))).toBe(false);
    expect(shouldDehydrateQuery(makeQuery(queryKeys.remote.movies, "pending"))).toBe(false);
  });
});
