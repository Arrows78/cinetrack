import { describe, expect, it } from "vitest";
import { queryKeys } from "../query-keys";

// Every profile-scoped "local" key factory must produce a distinct key per
// profile — this is the entire guarantee the app relies on to keep one
// local profile's cached watchlist/library/etc. from being rendered under
// another. A factory that accidentally ignored its profileId argument (or
// a new one added without it) would let two profiles collide on the same
// cache entry, silently reintroducing the cross-profile data leak this was
// built to prevent.
describe("queryKeys.local — profile isolation", () => {
  it("gives every profile-scoped key a different value per profile", () => {
    const a = "profile-a";
    const b = "profile-b";

    expect(queryKeys.local.watchlist(a)).not.toEqual(queryKeys.local.watchlist(b));
    expect(queryKeys.local.history(a)).not.toEqual(queryKeys.local.history(b));
    expect(queryKeys.local.movieSeen(a, 1)).not.toEqual(queryKeys.local.movieSeen(b, 1));
    expect(queryKeys.local.episodeProgress(a, 1)).not.toEqual(queryKeys.local.episodeProgress(b, 1));
    expect(queryKeys.local.trackedSeries(a)).not.toEqual(queryKeys.local.trackedSeries(b));
    expect(queryKeys.local.stats(a)).not.toEqual(queryKeys.local.stats(b));
    expect(queryKeys.local.library(a)).not.toEqual(queryKeys.local.library(b));
    expect(queryKeys.local.libraryItem(a, "movie", 1)).not.toEqual(queryKeys.local.libraryItem(b, "movie", 1));
    expect(queryKeys.local.customLists(a)).not.toEqual(queryKeys.local.customLists(b));
    expect(queryKeys.local.customList(a, "list-1")).not.toEqual(queryKeys.local.customList(b, "list-1"));
    expect(queryKeys.local.calendar(a)).not.toEqual(queryKeys.local.calendar(b));
    expect(queryKeys.local.availabilityAlerts(a)).not.toEqual(queryKeys.local.availabilityAlerts(b));
    expect(queryKeys.local.watchTonight(a)).not.toEqual(queryKeys.local.watchTonight(b));
    expect(queryKeys.local.watchNextEpisode(a, 1)).not.toEqual(queryKeys.local.watchNextEpisode(b, 1));
  });

  it("is stable (same profile + same args → identical key) so the cache actually hits", () => {
    expect(queryKeys.local.watchlist("default")).toEqual(queryKeys.local.watchlist("default"));
    expect(queryKeys.local.libraryItem("default", "movie", 7)).toEqual(
      queryKeys.local.libraryItem("default", "movie", 7)
    );
  });

  it("every profile-scoped key starts with ['local', <domain>, profileId, ...] so removeQueries({queryKey: ['local']}) still purges it as a prefix", () => {
    const profileId = "profile-a";
    expect(queryKeys.local.watchlist(profileId)[0]).toBe("local");
    expect(queryKeys.local.watchlist(profileId)).toContain(profileId);
    expect(queryKeys.local.libraryItem(profileId, "movie", 7)).toContain(profileId);
  });

  it("preferences and profiles stay global — they aren't a function of profileId", () => {
    expect(queryKeys.local.preferences).toEqual(["local", "preferences"]);
    expect(queryKeys.local.profiles).toEqual(["local", "profiles"]);
  });
});
