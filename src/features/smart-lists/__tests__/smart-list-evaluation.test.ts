import { describe, expect, it } from "vitest";
import { makeLibraryItem } from "@/shared/test-utils";
import type { AvailabilitySnapshot, SmartListRules, TrackedSeriesItem } from "@/types/media";
import {
  DEFAULT_SMART_LIST_RULES,
  SMART_LIST_PROVIDER_ANY,
  SMART_LIST_PROVIDER_MINE,
  buildSmartListEvalContext,
  matchesSmartListRules,
} from "../smart-list-evaluation";

const trackedSeries = (overrides: Partial<TrackedSeriesItem> = {}): TrackedSeriesItem => ({
  id: "ts-1",
  profileId: "default",
  seriesId: 42,
  title: "Test Show",
  posterPath: null,
  backdropPath: null,
  totalEpisodes: 10,
  watchedEpisodes: 3,
  status: "Returning Series",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const snapshot = (overrides: Partial<AvailabilitySnapshot> = {}): AvailabilitySnapshot => ({
  mediaId: 550,
  mediaType: "movie",
  region: "FR",
  providerIds: [8],
  checkedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

function context({
  trackedSeriesList = [],
  preferredProviderIds = [],
  snapshots = [],
}: {
  trackedSeriesList?: TrackedSeriesItem[];
  preferredProviderIds?: number[];
  snapshots?: AvailabilitySnapshot[];
} = {}) {
  return buildSmartListEvalContext(trackedSeriesList, preferredProviderIds, snapshots);
}

const emptyContext = context();

describe("matchesSmartListRules", () => {
  it("matches everything under the default (all-any) rules", () => {
    const item = makeLibraryItem();
    expect(matchesSmartListRules(item, DEFAULT_SMART_LIST_RULES, emptyContext, null)).toBe(true);
  });

  describe("status", () => {
    it("matches only the exact status when set", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, status: "planned" };
      expect(matchesSmartListRules(makeLibraryItem({ status: "planned" }), rules, emptyContext, null)).toBe(true);
      expect(matchesSmartListRules(makeLibraryItem({ status: "watching" }), rules, emptyContext, null)).toBe(false);
    });

    it("'any' never filters on status", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, status: "any" };
      expect(matchesSmartListRules(makeLibraryItem({ status: "dropped" }), rules, emptyContext, null)).toBe(true);
    });
  });

  describe("mediaType", () => {
    it("matches only the exact media type when set", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, mediaType: "series" };
      expect(matchesSmartListRules(makeLibraryItem({ mediaType: "series" }), rules, emptyContext, null)).toBe(true);
      expect(matchesSmartListRules(makeLibraryItem({ mediaType: "movie" }), rules, emptyContext, null)).toBe(false);
    });
  });

  describe("genre", () => {
    it("matches an item that includes the requested genre label", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, genre: "Horror" };
      expect(matchesSmartListRules(makeLibraryItem({ genres: ["Drama", "Horror"] }), rules, emptyContext, null)).toBe(
        true
      );
      expect(matchesSmartListRules(makeLibraryItem({ genres: ["Drama"] }), rules, emptyContext, null)).toBe(false);
    });

    it("null genre never filters", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, genre: null };
      expect(matchesSmartListRules(makeLibraryItem({ genres: [] }), rules, emptyContext, null)).toBe(true);
    });
  });

  describe("minRating", () => {
    it("uses the user rating over the catalogue rating when both are set", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, minRating: 8 };
      expect(matchesSmartListRules(makeLibraryItem({ rating: 5, userRating: 9 }), rules, emptyContext, null)).toBe(
        true
      );
      expect(matchesSmartListRules(makeLibraryItem({ rating: 9, userRating: 5 }), rules, emptyContext, null)).toBe(
        false
      );
    });

    it("falls back to the catalogue rating when there is no user rating", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, minRating: 8 };
      expect(matchesSmartListRules(makeLibraryItem({ rating: 8.5, userRating: null }), rules, emptyContext, null)).toBe(
        true
      );
    });

    it("excludes an item with no rating at all", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, minRating: 1 };
      expect(
        matchesSmartListRules(makeLibraryItem({ rating: null, userRating: null }), rules, emptyContext, null)
      ).toBe(false);
    });
  });

  describe("maxRuntimeMinutes", () => {
    it("excludes a movie whose known runtime is over the limit", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, maxRuntimeMinutes: 100 };
      expect(matchesSmartListRules(makeLibraryItem({ mediaType: "movie" }), rules, emptyContext, 130)).toBe(false);
      expect(matchesSmartListRules(makeLibraryItem({ mediaType: "movie" }), rules, emptyContext, 90)).toBe(true);
    });

    it("excludes a movie whose runtime isn't known yet", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, maxRuntimeMinutes: 100 };
      expect(matchesSmartListRules(makeLibraryItem({ mediaType: "movie" }), rules, emptyContext, undefined)).toBe(
        false
      );
      expect(matchesSmartListRules(makeLibraryItem({ mediaType: "movie" }), rules, emptyContext, null)).toBe(false);
    });

    it("never excludes a series, regardless of the runtime value passed in", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, maxRuntimeMinutes: 30 };
      expect(matchesSmartListRules(makeLibraryItem({ mediaType: "series" }), rules, emptyContext, null)).toBe(true);
    });
  });

  describe("provider", () => {
    it("'any' never filters on provider", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, provider: SMART_LIST_PROVIDER_ANY };
      expect(matchesSmartListRules(makeLibraryItem(), rules, emptyContext, null)).toBe(true);
    });

    it("excludes an item with no cached availability snapshot", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, provider: 8 };
      expect(
        matchesSmartListRules(makeLibraryItem({ mediaId: 550, mediaType: "movie" }), rules, emptyContext, null)
      ).toBe(false);
    });

    it("matches a specific provider id against the cached snapshot", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, provider: 8 };
      const ctx = context({ snapshots: [snapshot({ mediaId: 550, mediaType: "movie", providerIds: [8, 119] })] });
      expect(matchesSmartListRules(makeLibraryItem({ mediaId: 550, mediaType: "movie" }), rules, ctx, null)).toBe(true);

      const otherRules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, provider: 337 };
      expect(matchesSmartListRules(makeLibraryItem({ mediaId: 550, mediaType: "movie" }), otherRules, ctx, null)).toBe(
        false
      );
    });

    it("'mine' resolves to the profile's preferred provider ids", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, provider: SMART_LIST_PROVIDER_MINE };
      const ctx = context({
        preferredProviderIds: [119],
        snapshots: [snapshot({ mediaId: 550, mediaType: "movie", providerIds: [119] })],
      });
      expect(matchesSmartListRules(makeLibraryItem({ mediaId: 550, mediaType: "movie" }), rules, ctx, null)).toBe(true);
    });

    it("'mine' excludes everything when the profile has no preferred providers", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, provider: SMART_LIST_PROVIDER_MINE };
      const ctx = context({
        preferredProviderIds: [],
        snapshots: [snapshot({ mediaId: 550, mediaType: "movie", providerIds: [8] })],
      });
      expect(matchesSmartListRules(makeLibraryItem({ mediaId: 550, mediaType: "movie" }), rules, ctx, null)).toBe(
        false
      );
    });
  });

  describe("hasEpisodeWaiting", () => {
    it("is always false for a movie, regardless of tracked series data", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, hasEpisodeWaiting: true };
      expect(matchesSmartListRules(makeLibraryItem({ mediaType: "movie" }), rules, emptyContext, null)).toBe(false);
    });

    it("excludes an untracked series", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, hasEpisodeWaiting: true };
      expect(
        matchesSmartListRules(makeLibraryItem({ mediaType: "series", mediaId: 42 }), rules, emptyContext, null)
      ).toBe(false);
    });

    it("matches a series with unwatched episodes remaining", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, hasEpisodeWaiting: true };
      const ctx = context({
        trackedSeriesList: [trackedSeries({ seriesId: 42, watchedEpisodes: 3, totalEpisodes: 10 })],
      });
      expect(matchesSmartListRules(makeLibraryItem({ mediaType: "series", mediaId: 42 }), rules, ctx, null)).toBe(true);
    });

    it("excludes a series that's fully caught up", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, hasEpisodeWaiting: true };
      const ctx = context({
        trackedSeriesList: [trackedSeries({ seriesId: 42, watchedEpisodes: 10, totalEpisodes: 10 })],
      });
      expect(matchesSmartListRules(makeLibraryItem({ mediaType: "series", mediaId: 42 }), rules, ctx, null)).toBe(
        false
      );
    });
  });

  // The three literal scenarios from the README's smart-lists roadmap item.
  describe("README examples", () => {
    it("Unwatched + Horror + under 100 min", () => {
      const rules: SmartListRules = {
        ...DEFAULT_SMART_LIST_RULES,
        status: "planned",
        genre: "Horror",
        maxRuntimeMinutes: 100,
      };
      const matching = makeLibraryItem({ status: "planned", genres: ["Horror"], mediaType: "movie" });
      const tooLong = makeLibraryItem({ status: "planned", genres: ["Horror"], mediaType: "movie", mediaId: 2 });
      const wrongGenre = makeLibraryItem({ status: "planned", genres: ["Comedy"], mediaType: "movie", mediaId: 3 });
      const alreadyWatched = makeLibraryItem({
        status: "completed",
        genres: ["Horror"],
        mediaType: "movie",
        mediaId: 4,
      });

      expect(matchesSmartListRules(matching, rules, emptyContext, 95)).toBe(true);
      expect(matchesSmartListRules(tooLong, rules, emptyContext, 130)).toBe(false);
      expect(matchesSmartListRules(wrongGenre, rules, emptyContext, 95)).toBe(false);
      expect(matchesSmartListRules(alreadyWatched, rules, emptyContext, 95)).toBe(false);
    });

    it("My Services + rating >= 8", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, provider: SMART_LIST_PROVIDER_MINE, minRating: 8 };
      const ctx = context({
        preferredProviderIds: [8, 337],
        snapshots: [
          snapshot({ mediaId: 550, mediaType: "movie", providerIds: [337] }),
          snapshot({ mediaId: 551, mediaType: "movie", providerIds: [337] }),
        ],
      });
      const matching = makeLibraryItem({ mediaId: 550, mediaType: "movie", rating: 8.2, userRating: null });
      const lowRated = makeLibraryItem({ mediaId: 551, mediaType: "movie", rating: 6, userRating: null });
      const notOnMyServices = makeLibraryItem({ mediaId: 999, mediaType: "movie", rating: 9, userRating: null });

      expect(matchesSmartListRules(matching, rules, ctx, null)).toBe(true);
      expect(matchesSmartListRules(lowRated, rules, ctx, null)).toBe(false);
      expect(matchesSmartListRules(notOnMyServices, rules, ctx, null)).toBe(false);
    });

    it("Series with episodes waiting", () => {
      const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, mediaType: "series", hasEpisodeWaiting: true };
      const ctx = context({
        trackedSeriesList: [
          trackedSeries({ seriesId: 42, watchedEpisodes: 4, totalEpisodes: 10 }),
          trackedSeries({ seriesId: 43, watchedEpisodes: 10, totalEpisodes: 10 }),
        ],
      });
      const waiting = makeLibraryItem({ mediaType: "series", mediaId: 42 });
      const caughtUp = makeLibraryItem({ mediaType: "series", mediaId: 43 });
      const aMovie = makeLibraryItem({ mediaType: "movie", mediaId: 44 });

      expect(matchesSmartListRules(waiting, rules, ctx, null)).toBe(true);
      expect(matchesSmartListRules(caughtUp, rules, ctx, null)).toBe(false);
      expect(matchesSmartListRules(aMovie, rules, ctx, null)).toBe(false);
    });
  });
});

describe("buildSmartListEvalContext", () => {
  it("keys tracked series by seriesId and snapshots by mediaType-mediaId", () => {
    const ctx = buildSmartListEvalContext(
      [trackedSeries({ seriesId: 7 })],
      [8],
      [snapshot({ mediaId: 550, mediaType: "movie" })]
    );
    expect(ctx.trackedSeriesBySeriesId.get(7)).toBeDefined();
    expect(ctx.snapshotsByMediaKey.get("movie-550")).toBeDefined();
    expect(ctx.preferredProviderIds).toEqual([8]);
  });
});
