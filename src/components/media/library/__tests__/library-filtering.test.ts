import { describe, expect, it } from "vitest";
import { filterAndSortLibrary, libraryMediaKey, type LibraryFilterCriteria } from "../library-filtering";
import type { CustomListItem, LibraryItem } from "@/types/media";

function libraryItem(overrides: Partial<LibraryItem> & Pick<LibraryItem, "id" | "mediaId" | "title">): LibraryItem {
  return {
    profileId: "profile-1",
    mediaType: "movie",
    posterPath: null,
    backdropPath: null,
    year: 2020,
    rating: null,
    genres: [],
    status: "planned",
    favourite: false,
    userRating: null,
    notes: null,
    tags: [],
    startedAt: null,
    completedAt: null,
    rewatchCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function listItem(
  overrides: Partial<CustomListItem> & Pick<CustomListItem, "id" | "mediaId" | "title">
): CustomListItem {
  return {
    listId: "list-1",
    mediaType: "movie",
    posterPath: null,
    position: 0,
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const BASE_CRITERIA: LibraryFilterCriteria = {
  typeFilter: "all",
  statusFilter: "all",
  favouritesOnly: false,
  search: "",
  sort: "recent",
  genreFilter: "all",
  listMediaKeys: null,
  smartListMediaKeys: null,
};

const NO_PROGRESS = new Map<number, { watched: number; total: number; seriesStatus: string | null }>();

function titlesOf(items: ReturnType<typeof filterAndSortLibrary>): string[] {
  return items.map((item) => item.title);
}

describe("libraryMediaKey", () => {
  it("joins media type and id with a dash", () => {
    expect(libraryMediaKey("movie", 42)).toBe("movie-42");
  });
});

describe("filterAndSortLibrary", () => {
  it("returns every library item when no filter is active", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "Dune" }),
      libraryItem({ id: "2", mediaId: 2, title: "Severance", mediaType: "series" }),
    ];

    expect(titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, BASE_CRITERIA))).toEqual(["Dune", "Severance"]);
  });

  it("filters by media type", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "Dune", mediaType: "movie" }),
      libraryItem({ id: "2", mediaId: 2, title: "Severance", mediaType: "series" }),
    ];

    expect(titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, { ...BASE_CRITERIA, typeFilter: "series" }))).toEqual([
      "Severance",
    ]);
  });

  it("filters by status", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "Planned", status: "planned" }),
      libraryItem({ id: "2", mediaId: 2, title: "Watching", status: "watching" }),
    ];

    expect(
      titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, { ...BASE_CRITERIA, statusFilter: "watching" }))
    ).toEqual(["Watching"]);
  });

  it("filters to favourites only", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "Fave", favourite: true }),
      libraryItem({ id: "2", mediaId: 2, title: "NotFave", favourite: false }),
    ];

    expect(titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, { ...BASE_CRITERIA, favouritesOnly: true }))).toEqual([
      "Fave",
    ]);
  });

  it("matches search case-insensitively as a title substring", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "Dune" }),
      libraryItem({ id: "2", mediaId: 2, title: "Severance" }),
    ];

    expect(titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, { ...BASE_CRITERIA, search: "DUN" }))).toEqual([
      "Dune",
    ]);
  });

  it("also matches search against private notes and tags, not just the title", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "Dune", notes: "Great cinematography" }),
      libraryItem({ id: "2", mediaId: 2, title: "Severance", tags: ["mind-bending"] }),
      libraryItem({ id: "3", mediaId: 3, title: "Arrival" }),
    ];

    expect(
      titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, { ...BASE_CRITERIA, search: "cinematography" }))
    ).toEqual(["Dune"]);
    expect(
      titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, { ...BASE_CRITERIA, search: "mind-bending" }))
    ).toEqual(["Severance"]);
  });

  it("does not match a custom-list-only item (no notes/tags of its own) against unrelated search text", () => {
    const listMediaKeys = new Set([libraryMediaKey("movie", 9)]);
    const listOnlyItems = [listItem({ id: "l1", mediaId: 9, title: "Only In List" })];

    expect(
      titlesOf(
        filterAndSortLibrary([], listOnlyItems, NO_PROGRESS, { ...BASE_CRITERIA, search: "notes", listMediaKeys })
      )
    ).toEqual([]);
  });

  it("combines search and status with AND semantics", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "Dune", status: "planned" }),
      libraryItem({ id: "2", mediaId: 2, title: "Dune Two", status: "watching" }),
    ];

    const result = filterAndSortLibrary(items, [], NO_PROGRESS, {
      ...BASE_CRITERIA,
      search: "dune",
      statusFilter: "watching",
    });

    expect(titlesOf(result)).toEqual(["Dune Two"]);
  });

  it("restricts to the media keys of the active custom list", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "InList" }),
      libraryItem({ id: "2", mediaId: 2, title: "NotInList" }),
    ];
    const listMediaKeys = new Set([libraryMediaKey("movie", 1)]);

    expect(titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, { ...BASE_CRITERIA, listMediaKeys }))).toEqual([
      "InList",
    ]);
  });

  it("restricts to the media keys the active smart list matched", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "Matches" }),
      libraryItem({ id: "2", mediaId: 2, title: "DoesNotMatch" }),
    ];
    const smartListMediaKeys = new Set([libraryMediaKey("movie", 1)]);

    expect(titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, { ...BASE_CRITERIA, smartListMediaKeys }))).toEqual([
      "Matches",
    ]);
  });

  it("sorts by title ascending", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "Cherry" }),
      libraryItem({ id: "2", mediaId: 2, title: "Apple" }),
      libraryItem({ id: "3", mediaId: 3, title: "Banana" }),
    ];

    expect(titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, { ...BASE_CRITERIA, sort: "title" }))).toEqual([
      "Apple",
      "Banana",
      "Cherry",
    ]);
  });

  it("sorts by rating descending, treating a null rating as 0", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "NoRating", rating: null }),
      libraryItem({ id: "2", mediaId: 2, title: "HighRating", rating: 9 }),
      libraryItem({ id: "3", mediaId: 3, title: "MidRating", rating: 5 }),
    ];

    expect(titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, { ...BASE_CRITERIA, sort: "rating" }))).toEqual([
      "HighRating",
      "MidRating",
      "NoRating",
    ]);
  });

  it("prefers the user's own rating over the catalogue rating when sorting by rating", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "UserLoved", rating: 4, userRating: 10 }),
      libraryItem({ id: "2", mediaId: 2, title: "CatalogueOnly", rating: 8, userRating: null }),
    ];

    expect(titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, { ...BASE_CRITERIA, sort: "rating" }))).toEqual([
      "UserLoved",
      "CatalogueOnly",
    ]);
  });

  it("sorts by most recently updated by default", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "Oldest", updatedAt: "2026-01-01T00:00:00.000Z" }),
      libraryItem({ id: "2", mediaId: 2, title: "Newest", updatedAt: "2026-01-03T00:00:00.000Z" }),
      libraryItem({ id: "3", mediaId: 3, title: "Middle", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ];

    expect(titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, BASE_CRITERIA))).toEqual([
      "Newest",
      "Middle",
      "Oldest",
    ]);
  });

  it("sorts by date added descending", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "AddedFirst", createdAt: "2026-01-01T00:00:00.000Z" }),
      libraryItem({ id: "2", mediaId: 2, title: "AddedLast", createdAt: "2026-01-03T00:00:00.000Z" }),
      libraryItem({ id: "3", mediaId: 3, title: "AddedMiddle", createdAt: "2026-01-02T00:00:00.000Z" }),
    ];

    expect(titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, { ...BASE_CRITERIA, sort: "dateAdded" }))).toEqual([
      "AddedLast",
      "AddedMiddle",
      "AddedFirst",
    ]);
  });

  it("sorts by date completed descending, with never-completed items last", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "NeverCompleted", completedAt: null }),
      libraryItem({ id: "2", mediaId: 2, title: "CompletedRecently", completedAt: "2026-01-03T00:00:00.000Z" }),
      libraryItem({ id: "3", mediaId: 3, title: "CompletedEarlier", completedAt: "2026-01-01T00:00:00.000Z" }),
    ];

    expect(titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, { ...BASE_CRITERIA, sort: "dateCompleted" }))).toEqual(
      ["CompletedRecently", "CompletedEarlier", "NeverCompleted"]
    );
  });

  it("sorts by soonest next episode, with unknown-next series last", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "NoUpcomingEpisode", mediaType: "series" }),
      libraryItem({ id: "2", mediaId: 2, title: "AiringLater", mediaType: "series" }),
      libraryItem({ id: "3", mediaId: 3, title: "AiringSoon", mediaType: "series" }),
    ];
    const nextEpisodeDateBySeriesId = new Map([
      [2, "2026-02-15"],
      [3, "2026-01-20"],
    ]);

    const result = titlesOf(
      filterAndSortLibrary(items, [], NO_PROGRESS, {
        ...BASE_CRITERIA,
        sort: "nextEpisode",
        nextEpisodeDateBySeriesId,
      })
    );

    expect(result).toEqual(["AiringSoon", "AiringLater", "NoUpcomingEpisode"]);
  });

  it("sorts list-only items by next episode too, when the series is known", () => {
    const items: LibraryItem[] = [];
    const listOnly = [listItem({ id: "l1", mediaId: 5, title: "ListOnlySeries", mediaType: "series" })];
    const nextEpisodeDateBySeriesId = new Map([[5, "2026-03-01"]]);

    const result = titlesOf(
      filterAndSortLibrary(items, listOnly, NO_PROGRESS, {
        ...BASE_CRITERIA,
        sort: "nextEpisode",
        nextEpisodeDateBySeriesId,
      })
    );

    expect(result).toEqual(["ListOnlySeries"]);
  });

  it("filters by genre, matching any item whose genres include the selected one", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "Funny", genres: ["Comedy"] }),
      libraryItem({ id: "2", mediaId: 2, title: "FunnyDrama", genres: ["Drama", "Comedy"] }),
      libraryItem({ id: "3", mediaId: 3, title: "Scary", genres: ["Horror"] }),
    ];

    expect(titlesOf(filterAndSortLibrary(items, [], NO_PROGRESS, { ...BASE_CRITERIA, genreFilter: "Comedy" }))).toEqual(
      ["Funny", "FunnyDrama"]
    );
  });

  it("attaches series progress only to series items, from the progressBySeries map", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "AMovie", mediaType: "movie" }),
      libraryItem({ id: "2", mediaId: 2, title: "ASeries", mediaType: "series" }),
    ];
    const progress = new Map([[2, { watched: 3, total: 10, seriesStatus: "watching" }]]);

    const result = filterAndSortLibrary(items, [], progress, BASE_CRITERIA);

    expect(result.find((item) => item.title === "AMovie")?.progress).toBeUndefined();
    expect(result.find((item) => item.title === "ASeries")?.progress).toEqual({
      watched: 3,
      total: 10,
      seriesStatus: "watching",
    });
  });

  it("marks a completed movie as alreadySeen, but never a series", () => {
    const items = [
      libraryItem({ id: "1", mediaId: 1, title: "SeenMovie", mediaType: "movie", status: "completed" }),
      libraryItem({ id: "2", mediaId: 2, title: "CompletedSeries", mediaType: "series", status: "completed" }),
    ];

    const result = filterAndSortLibrary(items, [], NO_PROGRESS, BASE_CRITERIA);

    expect(result.find((item) => item.title === "SeenMovie")?.alreadySeen).toBe(true);
    expect(result.find((item) => item.title === "CompletedSeries")?.alreadySeen).toBe(false);
  });

  describe("custom-list-only items (never added to the library)", () => {
    it("includes a list item not in the library when a list filter is active", () => {
      const libraryItems = [libraryItem({ id: "1", mediaId: 1, title: "InLibrary" })];
      const listItems = [
        listItem({ id: "li-1", mediaId: 1, title: "InLibrary" }),
        listItem({ id: "li-2", mediaId: 2, title: "OnlyInList" }),
      ];
      const listMediaKeys = new Set([libraryMediaKey("movie", 1), libraryMediaKey("movie", 2)]);

      const result = filterAndSortLibrary(libraryItems, listItems, NO_PROGRESS, { ...BASE_CRITERIA, listMediaKeys });

      // "InLibrary" isn't duplicated even though it's also a list row.
      expect(titlesOf(result)).toEqual(["InLibrary", "OnlyInList"]);
    });

    it("filters list-only items by media type too", () => {
      const listItems = [
        listItem({ id: "li-1", mediaId: 9, title: "OnlyMovie", mediaType: "movie" }),
        listItem({ id: "li-2", mediaId: 10, title: "OnlySeries", mediaType: "series" }),
      ];
      const listMediaKeys = new Set([libraryMediaKey("movie", 9), libraryMediaKey("series", 10)]);

      const result = filterAndSortLibrary([], listItems, NO_PROGRESS, {
        ...BASE_CRITERIA,
        listMediaKeys,
        typeFilter: "series",
      });

      expect(titlesOf(result)).toEqual(["OnlySeries"]);
    });

    it("sorts a list-only item (no rating field) alongside a rated library item without crashing", () => {
      const libraryItems = [libraryItem({ id: "1", mediaId: 1, title: "Rated", rating: 8 })];
      const listItems = [listItem({ id: "li-1", mediaId: 2, title: "Unrated" })];
      const listMediaKeys = new Set([libraryMediaKey("movie", 1), libraryMediaKey("movie", 2)]);

      const result = filterAndSortLibrary(libraryItems, listItems, NO_PROGRESS, {
        ...BASE_CRITERIA,
        listMediaKeys,
        sort: "rating",
      });

      expect(titlesOf(result)).toEqual(["Rated", "Unrated"]);
    });

    it("hides list-only items once a status, favourites or genre filter is active, since they carry neither", () => {
      const listItems = [listItem({ id: "li-1", mediaId: 9, title: "OnlyInList" })];
      const listMediaKeys = new Set([libraryMediaKey("movie", 9)]);

      const byStatus = filterAndSortLibrary([], listItems, NO_PROGRESS, {
        ...BASE_CRITERIA,
        listMediaKeys,
        statusFilter: "watching",
      });
      const byFavourites = filterAndSortLibrary([], listItems, NO_PROGRESS, {
        ...BASE_CRITERIA,
        listMediaKeys,
        favouritesOnly: true,
      });
      const byGenre = filterAndSortLibrary([], listItems, NO_PROGRESS, {
        ...BASE_CRITERIA,
        listMediaKeys,
        genreFilter: "Comedy",
      });

      expect(byStatus).toHaveLength(0);
      expect(byFavourites).toHaveLength(0);
      expect(byGenre).toHaveLength(0);
    });

    it("does not surface list-only items when a smart list filter is also active", () => {
      const listItems = [listItem({ id: "li-1", mediaId: 9, title: "OnlyInList" })];
      const listMediaKeys = new Set([libraryMediaKey("movie", 9)]);
      const smartListMediaKeys = new Set<string>();

      const result = filterAndSortLibrary([], listItems, NO_PROGRESS, {
        ...BASE_CRITERIA,
        listMediaKeys,
        smartListMediaKeys,
      });

      expect(result).toHaveLength(0);
    });

    it("surfaces a list-only item when no list filter is active — the caller passes every list's items in that case", () => {
      const listItems = [listItem({ id: "li-1", mediaId: 9, title: "OnlyInList" })];

      const result = filterAndSortLibrary([], listItems, NO_PROGRESS, BASE_CRITERIA);

      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe("OnlyInList");
    });

    it("shows a title added to more than one list only once", () => {
      const listItems = [
        listItem({ id: "li-1", listId: "list-a", mediaId: 9, title: "OnlyInList" }),
        listItem({ id: "li-2", listId: "list-b", mediaId: 9, title: "OnlyInList" }),
      ];

      const result = filterAndSortLibrary([], listItems, NO_PROGRESS, BASE_CRITERIA);

      expect(result).toHaveLength(1);
    });
  });
});
