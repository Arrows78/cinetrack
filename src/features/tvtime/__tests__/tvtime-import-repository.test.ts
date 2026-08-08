import { describe, expect, it, vi } from "vitest";

const invokeCommandMock = vi.fn();
vi.mock("@/shared/lib/invoke", () => ({ invokeCommand: (...args: unknown[]) => invokeCommandMock(...args) }));

import { tvTimeImportRepository, type ImportableEpisode, type ImportableMovie } from "../tvtime-import-repository";
import type { Series } from "@/types/media";

const series: Series = {
  id: 42,
  mediaType: "series",
  title: "Test Show",
  overview: "",
  posterPath: null,
  backdropPath: null,
  year: 2020,
  rating: null,
  genres: [],
  cast: [],
  numberOfSeasons: 1,
  seasons: [],
};

describe("tvTimeImportRepository", () => {
  it("importSeriesProgress invokes import_series_progress with the series and episodes", async () => {
    invokeCommandMock.mockResolvedValue(3);
    const episodes: ImportableEpisode[] = [
      { episodeId: 1, seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-01-01T00:00:00.000Z", runtimeMinutes: 42 },
    ];

    const result = await tvTimeImportRepository.importSeriesProgress(series, episodes);

    expect(result).toBe(3);
    expect(invokeCommandMock).toHaveBeenCalledWith("import_series_progress", { series, episodes });
  });

  it("importMovieSeen invokes import_movie_seen with the movie and returns whether it was inserted", async () => {
    invokeCommandMock.mockResolvedValue(true);
    const movie: ImportableMovie = { movieId: 7, title: "Test Movie", watchedAt: "2026-01-01T00:00:00.000Z" };

    const result = await tvTimeImportRepository.importMovieSeen(movie);

    expect(result).toBe(true);
    expect(invokeCommandMock).toHaveBeenCalledWith("import_movie_seen", { movie });
  });
});
