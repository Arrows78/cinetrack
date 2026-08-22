import { describe, expect, it } from "vitest";
import {
  mapCollectionDto,
  mapMovieDto,
  mapPage,
  mapPerson,
  mapSeasonDetailsDto,
  mapSeriesDto,
  mapWatchProvider,
} from "../mapper";
import type {
  TmdbCastDto,
  TmdbCollectionDto,
  TmdbCrewDto,
  TmdbEpisodeDto,
  TmdbMovieDto,
  TmdbPersonDto,
  TmdbTvDto,
} from "../types";

const movieDto = (overrides: Partial<TmdbMovieDto> = {}): TmdbMovieDto => ({
  id: 550,
  title: "Fight Club",
  original_title: "Fight Club",
  overview: "…",
  poster_path: "/poster.jpg",
  backdrop_path: "/backdrop.jpg",
  release_date: "1999-10-15",
  vote_average: 8.4,
  ...overrides,
});

const tvDto = (overrides: Partial<TmdbTvDto> = {}): TmdbTvDto => ({
  id: 1399,
  name: "Game of Thrones",
  original_name: "Game of Thrones",
  overview: "…",
  poster_path: "/poster.jpg",
  backdrop_path: "/backdrop.jpg",
  first_air_date: "2011-04-17",
  vote_average: 8.4,
  ...overrides,
});

const episodeDto = (overrides: Partial<TmdbEpisodeDto> = {}): TmdbEpisodeDto => ({
  id: 1,
  air_date: "2011-04-17",
  episode_number: 1,
  name: "Winter Is Coming",
  overview: "…",
  runtime: 62,
  season_number: 1,
  still_path: null,
  vote_average: 8.9,
  ...overrides,
});

describe("mapMovieDto", () => {
  it("maps the core fields and derives the year", () => {
    const movie = mapMovieDto(movieDto());

    expect(movie).toMatchObject({ id: 550, mediaType: "movie", title: "Fight Club", year: 1999, rating: 8.4 });
  });

  it("derives genreIds from genre_ids or from full genres", () => {
    expect(mapMovieDto(movieDto({ genre_ids: [18, 53] })).genreIds).toEqual([18, 53]);
    expect(mapMovieDto(movieDto({ genres: [{ id: 18, name: "Drame" }] })).genreIds).toEqual([18]);
    expect(mapMovieDto(movieDto()).genreIds).toEqual([]);
  });

  it("resolves genre names from genre_ids when TMDB only returned ids (list/discover/trending endpoints)", () => {
    expect(mapMovieDto(movieDto({ genre_ids: [18, 53] })).genres).toEqual(["Drama", "Thriller"]);
  });

  it("prefers the full genres array over genre_ids when both are present", () => {
    expect(mapMovieDto(movieDto({ genres: [{ id: 18, name: "Drame" }], genre_ids: [53] })).genres).toEqual(["Drame"]);
  });

  it("drops unknown genre ids instead of producing an empty label", () => {
    expect(mapMovieDto(movieDto({ genre_ids: [999999] })).genres).toEqual([]);
  });

  it("sorts cast by billing order and caps it at 12", () => {
    const cast: TmdbCastDto[] = Array.from({ length: 15 }, (_, index) => ({
      id: index,
      name: `Acteur ${index}`,
      order: 14 - index,
    }));

    const movie = mapMovieDto(movieDto({ credits: { cast } }));

    expect(movie.cast).toHaveLength(12);
    expect(movie.cast[0]!.id).toBe(14);
    expect(movie.cast.map((member) => member.order)).toEqual([...Array(12).keys()]);
  });

  it("puts cast without an order at the end", () => {
    const cast: TmdbCastDto[] = [
      { id: 1, name: "Sans ordre" },
      { id: 2, name: "Premier", order: 0 },
    ];

    expect(mapMovieDto(movieDto({ credits: { cast } })).cast.map((member) => member.id)).toEqual([2, 1]);
  });

  it("maps only 'Director' crew credits into directors, dropping every other job", () => {
    const crew: TmdbCrewDto[] = [
      { id: 1, name: "David Fincher", job: "Director" },
      { id: 2, name: "Someone Else", job: "Producer" },
    ];

    const movie = mapMovieDto(movieDto({ credits: { cast: [], crew } }));

    expect(movie.directors).toEqual([{ id: 1, name: "David Fincher", job: "Director", profilePath: undefined }]);
  });

  it("keeps every co-director when a title credits more than one", () => {
    const crew: TmdbCrewDto[] = [
      { id: 1, name: "Directrice Une", job: "Director" },
      { id: 2, name: "Directeur Deux", job: "Director" },
    ];

    expect(mapMovieDto(movieDto({ credits: { cast: [], crew } })).directors?.map((d) => d.id)).toEqual([1, 2]);
  });

  it("defaults directors to [] when there's no crew data at all", () => {
    expect(mapMovieDto(movieDto()).directors).toEqual([]);
  });

  it("maps belongs_to_collection into collection, and null/absent into null", () => {
    const withCollection = mapMovieDto(
      movieDto({
        belongs_to_collection: { id: 10, name: "Alien Collection", poster_path: "/p.jpg", backdrop_path: "/b.jpg" },
      })
    );
    expect(withCollection.collection).toEqual({
      id: 10,
      name: "Alien Collection",
      posterPath: "/p.jpg",
      backdropPath: "/b.jpg",
    });

    expect(mapMovieDto(movieDto({ belongs_to_collection: null })).collection).toBeNull();
    expect(mapMovieDto(movieDto()).collection).toBeNull();
  });
});

describe("mapCollectionDto", () => {
  it("maps the collection's own fields and maps every part as a movie", () => {
    const dto: TmdbCollectionDto = {
      id: 10,
      name: "Alien Collection",
      overview: "A saga.",
      poster_path: "/p.jpg",
      backdrop_path: "/b.jpg",
      parts: [movieDto({ id: 1, title: "Alien" }), movieDto({ id: 2, title: "Aliens" })],
    };

    const collection = mapCollectionDto(dto);

    expect(collection).toMatchObject({ id: 10, name: "Alien Collection", overview: "A saga." });
    expect(collection.parts.map((part) => part.title)).toEqual(["Alien", "Aliens"]);
    expect(collection.parts.every((part) => part.mediaType === "movie")).toBe(true);
  });

  it("maps an empty parts list to an empty array, not an error", () => {
    const dto: TmdbCollectionDto = {
      id: 10,
      name: "Empty Collection",
      overview: "",
      poster_path: null,
      backdrop_path: null,
      parts: [],
    };

    expect(mapCollectionDto(dto).parts).toEqual([]);
  });
});

describe("mapSeriesDto", () => {
  it("maps runtime from episode_run_time and counts seasons", () => {
    const series = mapSeriesDto(
      tvDto({
        episode_run_time: [55, 60],
        number_of_seasons: 8,
        seasons: [
          {
            id: 1,
            air_date: "2011-04-17",
            episode_count: 10,
            name: "Saison 1",
            overview: "",
            poster_path: null,
            season_number: 1,
          },
        ],
      })
    );

    expect(series).toMatchObject({ mediaType: "series", runtime: 55, numberOfSeasons: 8, year: 2011 });
    expect(series.seasons[0]).toMatchObject({ seasonNumber: 1, episodeCount: 10, episodes: [] });
  });

  it("falls back to the seasons array length when number_of_seasons is absent", () => {
    const preview = {
      id: 1,
      air_date: null,
      episode_count: 0,
      name: "Saison 1",
      overview: "",
      poster_path: null,
      season_number: 1,
    };

    expect(mapSeriesDto(tvDto({ seasons: [preview, { ...preview, id: 2, season_number: 2 }] })).numberOfSeasons).toBe(
      2
    );
    expect(mapSeriesDto(tvDto()).numberOfSeasons).toBe(0);
    expect(mapSeriesDto(tvDto()).runtime).toBeNull();
  });

  it("resolves genre names from genre_ids via the series genre list, not the movie one", () => {
    expect(mapSeriesDto(tvDto({ genre_ids: [10759, 35] })).genres).toEqual(["Action & Adventure", "Comedy"]);
  });
});

describe("mapSeasonDetailsDto", () => {
  it("derives the episode count from the actual episode list", () => {
    const season = mapSeasonDetailsDto({
      id: 3624,
      air_date: "2011-04-17",
      episodes: [episodeDto(), episodeDto({ id: 2, episode_number: 2 })],
      name: "Saison 1",
      overview: "",
      poster_path: null,
      season_number: 1,
    });

    expect(season.episodeCount).toBe(2);
    expect(season.episodes[1]).toMatchObject({ id: 2, episodeNumber: 2, title: "Winter Is Coming" });
  });
});

describe("mapPage", () => {
  it("maps pagination metadata and every result", () => {
    const page = mapPage({ page: 2, total_pages: 10, total_results: 200, results: [movieDto()] }, mapMovieDto);

    expect(page).toMatchObject({ page: 2, totalPages: 10, totalResults: 200 });
    expect(page.results[0]!.id).toBe(550);
  });
});

describe("mapWatchProvider", () => {
  it("maps the provider fields", () => {
    expect(
      mapWatchProvider({ provider_id: 8, provider_name: "Netflix", logo_path: "/n.png", display_priority: 1 })
    ).toEqual({ id: 8, name: "Netflix", logoPath: "/n.png", displayPriority: 1 });
  });
});

describe("mapPerson", () => {
  it("keeps only movie and tv credits, capped at 20", () => {
    const knownFor = [
      ...Array.from({ length: 25 }, (_, index) => ({
        ...movieDto({ id: index + 1 }),
        media_type: "movie" as const,
      })),
      { ...tvDto({ id: 999 }), media_type: "tv" as const },
    ];

    const person = mapPerson({
      id: 287,
      name: "Brad Pitt",
      profile_path: "/brad.jpg",
      known_for_department: "Acting",
      known_for: knownFor,
    } as TmdbPersonDto);

    expect(person.knownFor).toHaveLength(20);
    expect(person.knownFor.every((item) => item.mediaType === "movie")).toBe(true);
  });

  it("falls back to combined_credits when known_for is absent", () => {
    const person = mapPerson({
      id: 287,
      name: "Brad Pitt",
      profile_path: null,
      combined_credits: { cast: [{ ...tvDto(), media_type: "tv" as const }] },
    } as TmdbPersonDto);

    expect(person.knownFor).toHaveLength(1);
    expect(person.knownFor[0]!.mediaType).toBe("series");
  });
});
