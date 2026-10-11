import { describe, expect, it } from "vitest";
import {
  mapCollectionDto,
  mapEpisodeDto,
  mapMovieDto,
  mapPage,
  mapPerson,
  mapPersonDetail,
  mapSeasonDetailsDto,
  mapSeriesDto,
} from "../mapper";
import type { TmdbMovieDto, TmdbPersonCreditDto, TmdbPersonDto, TmdbTvDto } from "../types";

// Shapes below are what TMDB really answers for sparse or untranslated
// titles, not what its documentation promises: unknown values come back as
// "", 0, [] or are simply absent.

const sparseMovie = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 900001,
    title: "Untitled Project",
    original_title: "Untitled Project",
    overview: "",
    poster_path: null,
    backdrop_path: null,
    release_date: "",
    vote_average: 0,
    runtime: 0,
    genres: [],
    ...overrides,
  }) as unknown as TmdbMovieDto;

const sparseSeries = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 900002,
    name: "Announced Show",
    original_name: "Announced Show",
    overview: "",
    poster_path: null,
    backdrop_path: null,
    first_air_date: "",
    vote_average: 0,
    episode_run_time: [],
    number_of_seasons: 0,
    number_of_episodes: 0,
    seasons: [],
    ...overrides,
  }) as unknown as TmdbTvDto;

describe("movies with unknown values", () => {
  it("never reports 0 minutes: TMDB's 0 means the runtime is unknown", () => {
    const movie = mapMovieDto(sparseMovie());
    expect(movie.runtime).toBeNull();
    expect(movie.duration).toBeNull();
  });

  it("maps an empty release_date to null, not an empty string", () => {
    const movie = mapMovieDto(sparseMovie());
    expect(movie.releaseDate).toBeNull();
    expect(movie.year).toBeNull();
  });

  it("never produces NaN for a missing or null vote_average", () => {
    expect(mapMovieDto(sparseMovie({ vote_average: undefined })).rating).toBe(0);
    expect(mapMovieDto(sparseMovie({ vote_average: null })).rating).toBe(0);
  });

  it("copes with release_dates entries that carry no release_dates array", () => {
    const movie = mapMovieDto(sparseMovie({ release_dates: { results: [{ iso_3166_1: "FR" }] } }), "FR");
    expect(movie.certification).toBeNull();
  });

  it("copes with a review that has no author_details", () => {
    const movie = mapMovieDto(
      sparseMovie({
        reviews: { results: [{ id: "r1", author: "jane", content: "ok", created_at: "2024-01-01", url: "https://x" }] },
      })
    );
    expect(movie.reviews?.[0]).toMatchObject({ author: "jane", avatarUrl: null });
  });

  it("lists a person credited twice (two roles) once in the cast", () => {
    const movie = mapMovieDto(
      sparseMovie({
        credits: {
          cast: [
            { id: 7, name: "Same Actor", character: "Hero", order: 0, profile_path: null },
            { id: 8, name: "Other", character: "Friend", order: 1, profile_path: null },
            { id: 7, name: "Same Actor", character: "Voice", order: 2, profile_path: null },
          ],
        },
      })
    );
    expect(movie.cast.map((member) => member.id)).toEqual([7, 8]);
    expect(movie.cast[0]?.character).toBe("Hero / Voice");
  });

  it("maps an empty character to undefined so the UI falls back instead of an empty badge", () => {
    const movie = mapMovieDto(
      sparseMovie({ credits: { cast: [{ id: 7, name: "A", character: "", order: 0, profile_path: null }] } })
    );
    expect(movie.cast[0]?.character).toBeUndefined();
  });
});

describe("series with unknown values", () => {
  it("treats an episode_run_time of [] or [0] as an unknown runtime", () => {
    expect(mapSeriesDto(sparseSeries()).runtime).toBeNull();
    expect(mapSeriesDto(sparseSeries({ episode_run_time: [0] })).runtime).toBeNull();
  });

  it("treats number_of_episodes 0 as unknown, not as a series with no episodes", () => {
    expect(mapSeriesDto(sparseSeries()).numberOfEpisodes).toBeUndefined();
    expect(mapSeriesDto(sparseSeries({ number_of_episodes: 24 })).numberOfEpisodes).toBe(24);
  });

  it("counts regular seasons when number_of_seasons is 0 but seasons are listed", () => {
    const series = mapSeriesDto(
      sparseSeries({
        seasons: [
          {
            id: 1,
            season_number: 0,
            name: "Specials",
            overview: "",
            poster_path: null,
            air_date: null,
            episode_count: 2,
          },
          { id: 2, season_number: 1, name: "S1", overview: "", poster_path: null, air_date: "", episode_count: 8 },
        ],
      })
    );
    expect(series.numberOfSeasons).toBe(1);
    expect(series.releaseDate).toBeNull();
    expect(series.seasons[1]?.airDate).toBeNull();
  });

  it("copes with a series that has no seasons array at all", () => {
    const series = mapSeriesDto(sparseSeries({ seasons: undefined, number_of_seasons: undefined }));
    expect(series.seasons).toEqual([]);
    expect(series.numberOfSeasons).toBe(0);
  });

  it("copes with a genre-less title and with an unknown language", () => {
    const series = mapSeriesDto(sparseSeries({ genres: [], languages: [] }));
    expect(series.genres).toEqual([]);
    expect(series.language).toBeUndefined();
  });
});

describe("episodes and seasons with unknown values", () => {
  const episode = (overrides: Record<string, unknown> = {}) => ({
    id: 11,
    air_date: "",
    episode_number: 3,
    name: "",
    overview: "",
    runtime: 0,
    season_number: 1,
    still_path: null,
    vote_average: 0,
    ...overrides,
  });

  it("maps an empty air_date to null and a 0 runtime to null", () => {
    const mapped = mapEpisodeDto(episode() as never);
    expect(mapped.airDate).toBeNull();
    expect(mapped.runtime).toBeNull();
  });

  it("keeps a date-only air date untouched (no time zone shift at mapping time)", () => {
    expect(mapEpisodeDto(episode({ air_date: "2026-07-14" }) as never).airDate).toBe("2026-07-14");
  });

  it("keeps an untitled episode untitled (the UI owns the fallback label)", () => {
    expect(mapEpisodeDto(episode() as never).title).toBe("");
  });

  it("maps a season answered without an episodes array to an empty season", () => {
    const season = mapSeasonDetailsDto({
      id: 5,
      air_date: null,
      name: "",
      overview: "",
      poster_path: null,
      season_number: 2,
    } as never);
    expect(season.episodes).toEqual([]);
    expect(season.episodeCount).toBe(0);
  });
});

describe("pages and collections with missing lists", () => {
  it("maps a page without results to an empty page", () => {
    expect(mapPage({ page: 1, total_pages: 0, total_results: 0 } as never, (value: number) => value)).toEqual({
      page: 1,
      totalPages: 0,
      totalResults: 0,
      results: [],
    });
  });

  it("maps a collection without parts to an empty collection", () => {
    const collection = mapCollectionDto({
      id: 1,
      name: "C",
      overview: "",
      poster_path: null,
      backdrop_path: null,
    } as never);
    expect(collection.parts).toEqual([]);
  });
});

describe("people", () => {
  const credit = (overrides: Record<string, unknown>) =>
    ({
      id: 1,
      media_type: "movie",
      title: "A Film",
      original_title: "A Film",
      overview: "",
      poster_path: null,
      backdrop_path: null,
      release_date: "2020-01-01",
      vote_average: 7,
      ...overrides,
    }) as unknown as TmdbPersonCreditDto;

  const person = (overrides: Record<string, unknown> = {}) =>
    ({ id: 3, name: "No Photo", profile_path: null, ...overrides }) as unknown as TmdbPersonDto;

  it("lists a title once in 'known for' even when the person has several credits on it", () => {
    const mapped = mapPerson(
      person({
        combined_credits: { cast: [credit({ character: "A" }), credit({ character: "B" }), credit({ id: 2 })] },
      })
    );
    expect(mapped.knownFor.map((item) => item.id)).toEqual([1, 2]);
  });

  it("keeps a movie and a series that share a numeric id apart", () => {
    const mapped = mapPerson(
      person({
        known_for: [credit({ id: 5 }), credit({ id: 5, media_type: "tv", name: "S", first_air_date: "2019-01-01" })],
      })
    );
    expect(mapped.knownFor).toHaveLength(2);
  });

  it("merges several credits on the same title in one department into one filmography entry", () => {
    const detail = mapPersonDetail(
      person({
        combined_credits: {
          cast: [credit({ character: "Hero" }), credit({ character: "Hero" }), credit({ character: "Voice" })],
          crew: [credit({ job: "Writer" }), credit({ job: "Screenplay" })],
        },
      })
    );
    const cast = detail.filmography.filter((item) => item.department === "cast");
    const crew = detail.filmography.filter((item) => item.department === "crew");
    expect(cast).toHaveLength(1);
    expect(cast[0]?.role).toBe("Hero / Voice");
    expect(crew).toHaveLength(1);
    expect(crew[0]?.role).toBe("Writer / Screenplay");
  });

  it("puts credits without a date after dated ones", () => {
    const detail = mapPersonDetail(
      person({
        combined_credits: {
          cast: [credit({ id: 1, release_date: "" }), credit({ id: 2, release_date: "2001-05-05" })],
        },
      })
    );
    expect(detail.filmography.map((item) => item.id)).toEqual([2, 1]);
    expect(detail.filmography[1]?.releaseDate).toBeNull();
  });

  it("maps a person with no photo, no biography and no credits without failing", () => {
    const detail = mapPersonDetail(person());
    expect(detail.profilePath).toBeNull();
    expect(detail.biography).toBe("");
    expect(detail.filmography).toEqual([]);
    expect(detail.knownFor).toEqual([]);
  });
});
