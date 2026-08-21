import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { MediaSummary, Season, Series } from "@/types/media";
import type { TvTimeExport } from "../parse-export";

const searchMock = vi.fn();
const getSeriesDetailsMock = vi.fn();
const getSeasonDetailsMock = vi.fn();
const findSeriesByTvdbIdMock = vi.fn();
vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: {
    search: (...args: unknown[]) => searchMock(...args),
    getSeriesDetails: (...args: unknown[]) => getSeriesDetailsMock(...args),
    getSeasonDetails: (...args: unknown[]) => getSeasonDetailsMock(...args),
    findSeriesByTvdbId: (...args: unknown[]) => findSeriesByTvdbIdMock(...args),
  },
}));

const librarySaveMock = vi.fn();
vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: { save: (...args: unknown[]) => librarySaveMock(...args) },
}));

const importSeriesProgressMock = vi.fn();
const importMovieSeenMock = vi.fn();
vi.mock("../tvtime-import-repository", () => ({
  tvTimeImportRepository: {
    importSeriesProgress: (...args: unknown[]) => importSeriesProgressMock(...args),
    importMovieSeen: (...args: unknown[]) => importMovieSeenMock(...args),
  },
}));

let exportData: TvTimeExport;
vi.mock("../parse-export", () => ({
  emptyExport: () => ({ episodes: [], movies: [], watchlist: [], tvdbIdsByName: new Map() }),
  parseTvTimeFile: vi.fn(),
  normalizeExport: () => exportData,
}));

const { importTvTimeExport, resolveRetryableSeries, resolveRetryableMovie, resolveRetryableWatchlist } =
  await import("../tvtime-import-service");

function media(overrides: Partial<MediaSummary> = {}): MediaSummary {
  return {
    id: 1,
    mediaType: "series",
    title: "Breaking Bad",
    overview: "",
    posterPath: null,
    backdropPath: null,
    year: 2008,
    rating: 9,
    genres: [],
    cast: [],
    ...overrides,
  };
}

function series(overrides: Partial<Series> = {}): Series {
  return { ...media(), mediaType: "series", numberOfSeasons: 1, seasons: [], ...overrides };
}

function season(episodeId: number, seasonNumber: number, episodeNumber: number, runtime: number | null = 47): Season {
  return {
    id: seasonNumber,
    seasonNumber,
    name: `Season ${seasonNumber}`,
    overview: "",
    episodeCount: 1,
    episodes: [{ id: episodeId, seasonNumber, episodeNumber, title: "Pilot", overview: "", runtime }],
  };
}

function emptyExportData(): TvTimeExport {
  return { episodes: [], movies: [], watchlist: [], tvdbIdsByName: new Map(), skippedRows: { episodes: 0, movies: 0 } };
}

describe("importTvTimeExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exportData = emptyExportData();
    librarySaveMock.mockResolvedValue(undefined);
    importSeriesProgressMock.mockResolvedValue(0);
    importMovieSeenMock.mockResolvedValue(false);
  });

  describe("series import", () => {
    it("resolves a series by TVDB id and imports its matched episodes", async () => {
      exportData = {
        ...emptyExportData(),
        episodes: [
          {
            seriesName: "Breaking Bad",
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: "2026-01-01T00:00:00.000Z",
            runtimeMinutes: 45,
          },
        ],
        tvdbIdsByName: new Map([["breaking bad", 81189]]),
      };
      findSeriesByTvdbIdMock.mockResolvedValue(series({ id: 62 }));
      getSeasonDetailsMock.mockResolvedValue(season(100, 1, 1));
      importSeriesProgressMock.mockResolvedValue(1);

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(findSeriesByTvdbIdMock).toHaveBeenCalledWith(81189);
      expect(searchMock).not.toHaveBeenCalled();
      expect(getSeasonDetailsMock).toHaveBeenCalledWith(62, 1);
      expect(importSeriesProgressMock).toHaveBeenCalledWith(expect.objectContaining({ id: 62 }), [
        {
          episodeId: 100,
          seasonNumber: 1,
          episodeNumber: 1,
          watchedAt: "2026-01-01T00:00:00.000Z",
          runtimeMinutes: 45,
        },
      ]);
      expect(summary.seriesImported).toBe(1);
      expect(summary.episodesImported).toBe(1);
      expect(summary.unmatched).toEqual([]);
    });

    it("falls back to a title/year search when there is no TVDB id", async () => {
      exportData = {
        ...emptyExportData(),
        episodes: [
          {
            seriesName: "The Office (2005)",
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: "2026-01-01T00:00:00.000Z",
            runtimeMinutes: null,
          },
        ],
      };
      searchMock.mockResolvedValue({
        page: 1,
        totalPages: 1,
        totalResults: 2,
        results: [media({ id: 1, title: "The Office", year: 2001 }), media({ id: 2, title: "The Office", year: 2005 })],
      });
      getSeriesDetailsMock.mockResolvedValue(series({ id: 2 }));
      getSeasonDetailsMock.mockResolvedValue(season(200, 1, 1, 22));
      importSeriesProgressMock.mockResolvedValue(1);

      await importTvTimeExport(["irrelevant"]);

      expect(searchMock).toHaveBeenCalledWith("The Office", "series");
      expect(getSeriesDetailsMock).toHaveBeenCalledWith(2);
      const [, importedEpisodes] = importSeriesProgressMock.mock.calls[0]!;
      expect((importedEpisodes as Array<{ runtimeMinutes: number | null }>)[0]!.runtimeMinutes).toBe(22);
    });

    it("reports the series as unmatched when nothing resolves", async () => {
      exportData = {
        ...emptyExportData(),
        episodes: [
          {
            seriesName: "Unknown Show",
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: "2026-01-01T00:00:00.000Z",
            runtimeMinutes: null,
          },
        ],
      };
      searchMock.mockResolvedValue({ page: 1, totalPages: 1, totalResults: 0, results: [] });

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(summary.unmatched).toEqual(["Unknown Show"]);
      expect(summary.seriesImported).toBe(0);
      expect(importSeriesProgressMock).not.toHaveBeenCalled();
    });

    it("reports unmatched rather than attaching an unrelated same-year result", async () => {
      exportData = {
        ...emptyExportData(),
        episodes: [
          {
            seriesName: "Bodyguard (2018)",
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: "2026-01-01T00:00:00.000Z",
            runtimeMinutes: null,
          },
        ],
      };
      // No result titled "Bodyguard" — only an unrelated show that happens
      // to share the same release year. Picking it just because the year
      // matches would silently attach the wrong series.
      searchMock.mockResolvedValue({
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [media({ id: 99, title: "Killing Eve", year: 2018 })],
      });

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(summary.unmatched).toEqual(["Bodyguard (2018)"]);
      expect(getSeriesDetailsMock).not.toHaveBeenCalled();
    });

    it("reports unresolved episodes (season not on TMDB) without failing the whole series", async () => {
      exportData = {
        ...emptyExportData(),
        episodes: [
          {
            seriesName: "Breaking Bad",
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: "2026-01-01T00:00:00.000Z",
            runtimeMinutes: null,
          },
          {
            seriesName: "Breaking Bad",
            seasonNumber: 1,
            episodeNumber: 2,
            watchedAt: "2026-01-01T00:00:00.000Z",
            runtimeMinutes: null,
          },
        ],
        tvdbIdsByName: new Map([["breaking bad", 81189]]),
      };
      findSeriesByTvdbIdMock.mockResolvedValue(series({ id: 62 }));
      // Season lookup only returns episode 1 — episode 2 is unresolved.
      getSeasonDetailsMock.mockResolvedValue(season(100, 1, 1));
      importSeriesProgressMock.mockResolvedValue(1);

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(summary.unmatched).toEqual([
        `Breaking Bad (${i18n.t("tvtimeImport.unresolvedEpisodeCount", { count: 1 })})`,
      ]);
    });

    it("treats a season TMDB lookup failure as unresolved episodes rather than aborting the series", async () => {
      exportData = {
        ...emptyExportData(),
        episodes: [
          {
            seriesName: "Breaking Bad",
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: "2026-01-01T00:00:00.000Z",
            runtimeMinutes: null,
          },
        ],
        tvdbIdsByName: new Map([["breaking bad", 81189]]),
      };
      findSeriesByTvdbIdMock.mockResolvedValue(series({ id: 62 }));
      getSeasonDetailsMock.mockRejectedValue(new Error("not found on TMDB"));
      importSeriesProgressMock.mockResolvedValue(0);

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(summary.unmatched).toEqual([
        `Breaking Bad (${i18n.t("tvtimeImport.unresolvedEpisodeCount", { count: 1 })})`,
      ]);
      // Still called with an empty batch — the Rust side reports 0 inserted,
      // which is what keeps it out of seriesImported/episodesImported below.
      expect(importSeriesProgressMock).toHaveBeenCalledWith(expect.objectContaining({ id: 62 }), []);
      expect(summary.seriesImported).toBe(0);
      expect(summary.episodesImported).toBe(0);
    });

    it("does not count the series as imported when the Rust import inserts nothing new", async () => {
      exportData = {
        ...emptyExportData(),
        episodes: [
          {
            seriesName: "Breaking Bad",
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: "2026-01-01T00:00:00.000Z",
            runtimeMinutes: null,
          },
        ],
        tvdbIdsByName: new Map([["breaking bad", 81189]]),
      };
      findSeriesByTvdbIdMock.mockResolvedValue(series({ id: 62 }));
      getSeasonDetailsMock.mockResolvedValue(season(100, 1, 1));
      importSeriesProgressMock.mockResolvedValue(0);

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(summary.seriesImported).toBe(0);
      expect(summary.episodesImported).toBe(0);
    });

    it("catches an unexpected error resolving a series and reports it as unmatched", async () => {
      exportData = {
        ...emptyExportData(),
        episodes: [
          {
            seriesName: "Breaking Bad",
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: "2026-01-01T00:00:00.000Z",
            runtimeMinutes: null,
          },
        ],
      };
      searchMock.mockRejectedValue(new Error("network down"));

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(summary.unmatched).toEqual(["Breaking Bad"]);
    });

    it("does not auto-import an ambiguous series pick — routes it to unmatched/retryable instead", async () => {
      exportData = {
        ...emptyExportData(),
        episodes: [
          {
            seriesName: "Alone",
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: "2026-01-01T00:00:00.000Z",
            runtimeMinutes: null,
          },
        ],
      };
      // Two same-titled series, no year in the export to pick between them —
      // neither should be auto-attached, since a wrong guess here would
      // silently contaminate the imported episode history.
      searchMock.mockResolvedValue({
        page: 1,
        totalPages: 1,
        totalResults: 2,
        results: [media({ id: 1, title: "Alone", year: 2015 }), media({ id: 2, title: "Alone", year: 2020 })],
      });

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(getSeriesDetailsMock).not.toHaveBeenCalled();
      expect(importSeriesProgressMock).not.toHaveBeenCalled();
      expect(summary.seriesImported).toBe(0);
      expect(summary.ambiguous).toEqual(["Alone"]);
      expect(summary.unmatched).toEqual(["Alone"]);
      expect(summary.retryable).toEqual([expect.objectContaining({ kind: "series", label: "Alone" })]);
    });
  });

  describe("movie import", () => {
    it("imports a matched movie and reports it in the summary", async () => {
      exportData = {
        ...emptyExportData(),
        movies: [{ title: "Inception", year: 2010, watchedAt: "2026-01-01T00:00:00.000Z", runtimeMinutes: null }],
      };
      searchMock.mockResolvedValue({
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [media({ id: 5, mediaType: "movie", title: "Inception", year: 2010, runtime: 148 })],
      });
      importMovieSeenMock.mockResolvedValue(true);

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(searchMock).toHaveBeenCalledWith("Inception", "movie");
      expect(importMovieSeenMock).toHaveBeenCalledWith({
        movieId: 5,
        title: "Inception",
        posterPath: null,
        backdropPath: null,
        runtime: 148,
        watchedAt: "2026-01-01T00:00:00.000Z",
        year: 2010,
        rating: 9,
        genres: [],
      });
      expect(summary.moviesImported).toBe(1);
    });

    it("prefers the export's own runtime over TMDB's when both are present", async () => {
      exportData = {
        ...emptyExportData(),
        movies: [{ title: "Inception", year: 2010, watchedAt: "2026-01-01T00:00:00.000Z", runtimeMinutes: 200 }],
      };
      searchMock.mockResolvedValue({
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [media({ id: 5, mediaType: "movie", title: "Inception", year: 2010, runtime: 148 })],
      });
      importMovieSeenMock.mockResolvedValue(true);

      await importTvTimeExport(["irrelevant"]);

      expect(importMovieSeenMock).toHaveBeenCalledWith(expect.objectContaining({ runtime: 200 }));
    });

    it("reports an unmatched movie and does not call the import command", async () => {
      exportData = {
        ...emptyExportData(),
        movies: [{ title: "Unknown Movie", year: null, watchedAt: "2026-01-01T00:00:00.000Z", runtimeMinutes: null }],
      };
      searchMock.mockResolvedValue({ page: 1, totalPages: 1, totalResults: 0, results: [] });

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(summary.unmatched).toEqual(["Unknown Movie"]);
      expect(importMovieSeenMock).not.toHaveBeenCalled();
    });

    it("does not count a reimported (already-seen) movie as newly imported", async () => {
      exportData = {
        ...emptyExportData(),
        movies: [{ title: "Inception", year: 2010, watchedAt: "2026-01-01T00:00:00.000Z", runtimeMinutes: null }],
      };
      searchMock.mockResolvedValue({
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [media({ id: 5, mediaType: "movie", title: "Inception", year: 2010 })],
      });
      importMovieSeenMock.mockResolvedValue(false);

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(summary.moviesImported).toBe(0);
    });

    it("matches past a diacritic/punctuation difference between the export and TMDB's title", async () => {
      exportData = {
        ...emptyExportData(),
        movies: [{ title: "Cafe Society", year: 2016, watchedAt: "2026-01-01T00:00:00.000Z", runtimeMinutes: null }],
      };
      searchMock.mockResolvedValue({
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [media({ id: 5, mediaType: "movie", title: "Café Society", year: 2016 })],
      });
      importMovieSeenMock.mockResolvedValue(true);

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(importMovieSeenMock).toHaveBeenCalledWith(expect.objectContaining({ movieId: 5 }));
      expect(summary.unmatched).toEqual([]);
    });

    it("retries with a simplified title when the exact one returns nothing", async () => {
      exportData = {
        ...emptyExportData(),
        movies: [
          {
            title: "Movie Name: The Subtitle",
            year: null,
            watchedAt: "2026-01-01T00:00:00.000Z",
            runtimeMinutes: null,
          },
        ],
      };
      searchMock.mockResolvedValueOnce({ page: 1, totalPages: 1, totalResults: 0, results: [] }).mockResolvedValueOnce({
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [media({ id: 7, mediaType: "movie", title: "Movie Name" })],
      });
      importMovieSeenMock.mockResolvedValue(true);

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(searchMock).toHaveBeenNthCalledWith(1, "Movie Name: The Subtitle", "movie");
      expect(searchMock).toHaveBeenNthCalledWith(2, "Movie Name", "movie");
      expect(importMovieSeenMock).toHaveBeenCalledWith(expect.objectContaining({ movieId: 7 }));
      expect(summary.unmatched).toEqual([]);
    });

    it("does not auto-import an ambiguous pick — routes it to unmatched/retryable instead, still flagged in ambiguous", async () => {
      exportData = {
        ...emptyExportData(),
        movies: [{ title: "Alone", year: null, watchedAt: "2026-01-01T00:00:00.000Z", runtimeMinutes: null }],
      };
      searchMock.mockResolvedValue({
        page: 1,
        totalPages: 1,
        totalResults: 2,
        results: [
          media({ id: 1, mediaType: "movie", title: "Alone", year: 2020 }),
          media({ id: 2, mediaType: "movie", title: "Alone", year: 2015 }),
        ],
      });
      importMovieSeenMock.mockResolvedValue(true);

      const summary = await importTvTimeExport(["irrelevant"]);

      // Neither of the two same-titled candidates gets auto-imported —
      // picking either one without a year to confirm it would be a guess,
      // not a match.
      expect(importMovieSeenMock).not.toHaveBeenCalled();
      expect(summary.moviesImported).toBe(0);
      expect(summary.ambiguous).toEqual(["Alone"]);
      expect(summary.unmatched).toEqual(["Alone"]);
      expect(summary.retryable).toEqual([expect.objectContaining({ kind: "movie", label: "Alone" })]);
    });

    it("does not flag ambiguity when the year picks out a single confident match", async () => {
      exportData = {
        ...emptyExportData(),
        movies: [{ title: "Alone", year: 2015, watchedAt: "2026-01-01T00:00:00.000Z", runtimeMinutes: null }],
      };
      searchMock.mockResolvedValue({
        page: 1,
        totalPages: 1,
        totalResults: 2,
        results: [
          media({ id: 1, mediaType: "movie", title: "Alone", year: 2020 }),
          media({ id: 2, mediaType: "movie", title: "Alone", year: 2015 }),
        ],
      });
      importMovieSeenMock.mockResolvedValue(true);

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(importMovieSeenMock).toHaveBeenCalledWith(expect.objectContaining({ movieId: 2 }));
      expect(summary.ambiguous).toEqual([]);
    });
  });

  describe("planned (TV Time watchlist) import", () => {
    it("saves a matched entry to the library with a planned status", async () => {
      exportData = { ...emptyExportData(), watchlist: [{ title: "Dune", mediaType: "movie", year: 2021 }] };
      searchMock.mockResolvedValue({
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [media({ id: 9, mediaType: "movie", title: "Dune", year: 2021, rating: 8.1 })],
      });

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(searchMock).toHaveBeenCalledWith("Dune", "movie");
      expect(librarySaveMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 9, mediaType: "movie", title: "Dune", rating: 8.1 }),
        { status: "planned" }
      );
      expect(summary.plannedImported).toBe(1);
    });

    it("reports an unmatched entry without saving anything", async () => {
      exportData = { ...emptyExportData(), watchlist: [{ title: "Unknown Title", mediaType: "series", year: null }] };
      searchMock.mockResolvedValue({ page: 1, totalPages: 1, totalResults: 0, results: [] });

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(summary.unmatched).toEqual(["Unknown Title"]);
      expect(librarySaveMock).not.toHaveBeenCalled();
    });

    it("catches a save failure and reports the entry as unmatched instead of throwing", async () => {
      exportData = { ...emptyExportData(), watchlist: [{ title: "Dune", mediaType: "movie", year: 2021 }] };
      searchMock.mockResolvedValue({
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [media({ id: 9, mediaType: "movie", title: "Dune", year: 2021 })],
      });
      librarySaveMock.mockRejectedValueOnce(new Error("disk full"));

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(summary.unmatched).toEqual(["Dune"]);
      expect(summary.plannedImported).toBe(0);
    });
  });

  describe("retryable unmatched items", () => {
    it("carries the episodes and a searchable title for an unmatched series", async () => {
      exportData = {
        ...emptyExportData(),
        episodes: [
          {
            seriesName: "Bodyguard (2018)",
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: "2026-01-01T00:00:00.000Z",
            runtimeMinutes: null,
          },
        ],
      };
      searchMock.mockResolvedValue({ page: 1, totalPages: 1, totalResults: 0, results: [] });

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(summary.retryable).toEqual([
        {
          kind: "series",
          label: "Bodyguard (2018)",
          searchTitle: "Bodyguard",
          searchYear: 2018,
          episodes: exportData.episodes,
        },
      ]);
    });

    it("carries the original row for an unmatched movie", async () => {
      exportData = {
        ...emptyExportData(),
        movies: [{ title: "Unknown Movie", year: 1999, watchedAt: "2026-01-01T00:00:00.000Z", runtimeMinutes: null }],
      };
      searchMock.mockResolvedValue({ page: 1, totalPages: 1, totalResults: 0, results: [] });

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(summary.retryable).toEqual([
        {
          kind: "movie",
          label: "Unknown Movie",
          searchTitle: "Unknown Movie",
          searchYear: 1999,
          movie: exportData.movies[0],
        },
      ]);
    });

    it("carries the original row for an unmatched watchlist entry", async () => {
      exportData = { ...emptyExportData(), watchlist: [{ title: "Unknown Title", mediaType: "series", year: null }] };
      searchMock.mockResolvedValue({ page: 1, totalPages: 1, totalResults: 0, results: [] });

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(summary.retryable).toEqual([
        {
          kind: "watchlist",
          label: "Unknown Title",
          searchTitle: "Unknown Title",
          searchYear: null,
          entry: exportData.watchlist[0],
        },
      ]);
    });

    it("also records a retryable entry when an unexpected error interrupts a series", async () => {
      exportData = {
        ...emptyExportData(),
        episodes: [
          {
            seriesName: "Breaking Bad",
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: "2026-01-01T00:00:00.000Z",
            runtimeMinutes: null,
          },
        ],
      };
      searchMock.mockRejectedValue(new Error("network down"));

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(summary.retryable).toEqual([
        {
          kind: "series",
          label: "Breaking Bad",
          searchTitle: "Breaking Bad",
          searchYear: null,
          episodes: exportData.episodes,
        },
      ]);
    });

    it("resolveRetryableSeries attaches a manually-picked series to the retryable item's episodes", async () => {
      const item = {
        kind: "series" as const,
        label: "Bodyguard (2018)",
        searchTitle: "Bodyguard",
        searchYear: 2018,
        episodes: [
          {
            seriesName: "Bodyguard (2018)",
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: "2026-01-01T00:00:00.000Z",
            runtimeMinutes: null,
          },
        ],
      };
      getSeasonDetailsMock.mockResolvedValue(season(500, 1, 1));
      importSeriesProgressMock.mockResolvedValue(1);

      const result = await resolveRetryableSeries(item, series({ id: 77 }));

      expect(getSeasonDetailsMock).toHaveBeenCalledWith(77, 1);
      expect(importSeriesProgressMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 77 }),
        expect.arrayContaining([expect.objectContaining({ episodeId: 500 })])
      );
      expect(result).toEqual({ episodesImported: 1 });
    });

    it("resolveRetryableMovie writes a manually-picked movie match", async () => {
      const item = {
        kind: "movie" as const,
        label: "Unknown Movie",
        searchTitle: "Unknown Movie",
        searchYear: 1999,
        movie: { title: "Unknown Movie", year: 1999, watchedAt: "2026-01-01T00:00:00.000Z", runtimeMinutes: 90 },
      };
      importMovieSeenMock.mockResolvedValue(true);

      const inserted = await resolveRetryableMovie(item, media({ id: 42, mediaType: "movie", title: "The Movie" }));

      expect(importMovieSeenMock).toHaveBeenCalledWith(expect.objectContaining({ movieId: 42, runtime: 90 }));
      expect(inserted).toBe(true);
    });

    it("resolveRetryableWatchlist saves a manually-picked match as planned", async () => {
      const item = {
        kind: "watchlist" as const,
        label: "Unknown Title",
        searchTitle: "Unknown Title",
        searchYear: null,
        entry: { title: "Unknown Title", mediaType: "series" as const, year: null },
      };
      const match = media({ id: 8, title: "The Show" });

      await resolveRetryableWatchlist(item, match);

      expect(librarySaveMock).toHaveBeenCalledWith(match, { status: "planned" });
    });
  });

  describe("progress reporting", () => {
    it("reports start (done: 0) and completion (done: total) for each phase", async () => {
      exportData = {
        episodes: [
          {
            seriesName: "Breaking Bad",
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: "2026-01-01T00:00:00.000Z",
            runtimeMinutes: null,
          },
        ],
        movies: [{ title: "Inception", year: 2010, watchedAt: "2026-01-01T00:00:00.000Z", runtimeMinutes: null }],
        watchlist: [{ title: "Dune", mediaType: "movie", year: 2021 }],
        tvdbIdsByName: new Map([["breaking bad", 81189]]),
        skippedRows: { episodes: 0, movies: 0 },
      };
      findSeriesByTvdbIdMock.mockResolvedValue(series({ id: 62 }));
      getSeasonDetailsMock.mockResolvedValue(season(100, 1, 1));
      importSeriesProgressMock.mockResolvedValue(1);
      searchMock.mockResolvedValue({
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [media({ id: 9, title: "match" })],
      });
      importMovieSeenMock.mockResolvedValue(true);

      const onProgress = vi.fn();
      await importTvTimeExport(["irrelevant"], onProgress);

      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: "series", done: 0, total: 1 }));
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: "series", done: 1, total: 1 }));
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: "movies", done: 0, total: 1 }));
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: "movies", done: 1, total: 1 }));
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: "watchlist", done: 0, total: 1 }));
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: "watchlist", done: 1, total: 1 }));
    });
  });

  describe("TMDB rate-limit (429) handling", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("retries a 429 with backoff instead of marking the title unmatched", async () => {
      vi.useFakeTimers();
      const { TmdbRequestError } = await import("@/features/media/api/client");
      exportData = {
        episodes: [],
        movies: [{ title: "Inception", year: 2010, watchedAt: "2026-01-01T00:00:00.000Z", runtimeMinutes: null }],
        watchlist: [],
        tvdbIdsByName: new Map(),
        skippedRows: { episodes: 0, movies: 0 },
      };
      searchMock.mockRejectedValueOnce(new TmdbRequestError("rate limited", 429)).mockResolvedValueOnce({
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [media({ id: 9, title: "Inception", mediaType: "movie" })],
      });
      importMovieSeenMock.mockResolvedValue(true);

      const promise = importTvTimeExport(["irrelevant"]);
      await vi.advanceTimersByTimeAsync(1000);
      const summary = await promise;

      expect(summary.unmatched).toEqual([]);
      expect(summary.moviesImported).toBe(1);
      expect(searchMock).toHaveBeenCalledTimes(2);
    });

    it("gives up and marks unmatched once retries are exhausted on a persistent 429", async () => {
      vi.useFakeTimers();
      const { TmdbRequestError } = await import("@/features/media/api/client");
      exportData = {
        episodes: [],
        movies: [{ title: "Inception", year: 2010, watchedAt: "2026-01-01T00:00:00.000Z", runtimeMinutes: null }],
        watchlist: [],
        tvdbIdsByName: new Map(),
        skippedRows: { episodes: 0, movies: 0 },
      };
      searchMock.mockRejectedValue(new TmdbRequestError("rate limited", 429));

      const promise = importTvTimeExport(["irrelevant"]);
      await vi.advanceTimersByTimeAsync(10_000);
      const summary = await promise;

      expect(summary.unmatched).toEqual(["Inception"]);
      expect(searchMock).toHaveBeenCalledTimes(3);
    });

    it("does not retry a non-429 error", async () => {
      exportData = {
        episodes: [],
        movies: [{ title: "Inception", year: 2010, watchedAt: "2026-01-01T00:00:00.000Z", runtimeMinutes: null }],
        watchlist: [],
        tvdbIdsByName: new Map(),
        skippedRows: { episodes: 0, movies: 0 },
      };
      searchMock.mockRejectedValue(new Error("network down"));

      const summary = await importTvTimeExport(["irrelevant"]);

      expect(summary.unmatched).toEqual(["Inception"]);
      expect(searchMock).toHaveBeenCalledTimes(1);
    });
  });
});
