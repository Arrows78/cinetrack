import type {
  CastMember,
  CollectionSummary,
  CrewMember,
  Episode,
  MediaSummary,
  MediaType,
  Movie,
  MovieCollection,
  PageResult,
  Season,
  Series,
  WatchProvider,
  MediaVideo,
  PersonSummary,
} from "@/types/media";
import { yearFromDate } from "@/shared/utils/format";
import { GENRES } from "@/shared/constants/discover";
import type {
  TmdbCastDto,
  TmdbCollectionDto,
  TmdbCollectionSummaryDto,
  TmdbCrewDto,
  TmdbEpisodeDto,
  TmdbListResponse,
  TmdbMovieDto,
  TmdbSeasonDetailsDto,
  TmdbSeasonPreviewDto,
  TmdbTvDto,
  TmdbWatchProviderDto,
  TmdbVideoDto,
  TmdbPersonDto,
} from "./types";

// TMDB's list/discover/trending/search endpoints only return `genre_ids`
// (no genre names) — only the single-title detail endpoint returns the
// full `genres` array. Without this fallback, any title added to the
// library from a grid card (rather than its detail page) is stored with
// no genres at all, which silently breaks anything that reads
// LibraryItem.genres (favourite-genre stats, the personalized home rail).
const resolveGenreNames = (ids: number[] | undefined, list: ReadonlyArray<{ id: number; label: string }>): string[] =>
  (ids ?? [])
    .map((id) => list.find((genre) => genre.id === id)?.label)
    .filter((label): label is string => Boolean(label));

const mapCast = (cast?: TmdbCastDto[]): CastMember[] =>
  (cast ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 12)
    .map((member) => ({
      id: member.id,
      name: member.name,
      character: member.character,
      profilePath: member.profile_path,
      order: member.order,
    }));

// Only "Director" jobs — that's all the people-based discovery rail and
// collection features need for v1 (see CrewMember's doc comment in
// types/media.ts). A title can have more than one credited director
// (co-directed films), so this keeps all of them rather than just the first.
const mapCrew = (crew?: TmdbCrewDto[]): CrewMember[] =>
  (crew ?? [])
    .filter((member) => member.job === "Director")
    .map((member) => ({
      id: member.id,
      name: member.name,
      job: member.job,
      profilePath: member.profile_path,
    }));

export const mapCollectionSummary = (dto: TmdbCollectionSummaryDto): CollectionSummary => ({
  id: dto.id,
  name: dto.name,
  posterPath: dto.poster_path,
  backdropPath: dto.backdrop_path,
});

export const mapMovieDto = (dto: TmdbMovieDto): Movie => ({
  id: dto.id,
  mediaType: "movie",
  title: dto.title,
  originalTitle: dto.original_title,
  overview: dto.overview,
  posterPath: dto.poster_path,
  backdropPath: dto.backdrop_path,
  releaseDate: dto.release_date,
  year: yearFromDate(dto.release_date),
  rating: dto.vote_average,
  genres: dto.genres?.map((genre) => genre.name) ?? resolveGenreNames(dto.genre_ids, GENRES.movies),
  genreIds: dto.genre_ids ?? dto.genres?.map((genre) => genre.id) ?? [],
  country: dto.production_countries?.map((country) => country.name) ?? [],
  language: dto.spoken_languages?.[0]?.english_name,
  status: dto.status,
  runtime: dto.runtime,
  duration: dto.runtime,
  cast: mapCast(dto.credits?.cast),
  directors: mapCrew(dto.credits?.crew),
  collection: dto.belongs_to_collection ? mapCollectionSummary(dto.belongs_to_collection) : null,
});

export const mapCollectionDto = (dto: TmdbCollectionDto): MovieCollection => ({
  id: dto.id,
  name: dto.name,
  overview: dto.overview,
  posterPath: dto.poster_path,
  backdropPath: dto.backdrop_path,
  parts: dto.parts.map(mapMovieDto),
});

const mapSeasonPreviewDto = (dto: TmdbSeasonPreviewDto): Season => ({
  id: dto.id,
  seasonNumber: dto.season_number,
  name: dto.name,
  overview: dto.overview,
  posterPath: dto.poster_path,
  airDate: dto.air_date,
  episodeCount: dto.episode_count,
  episodes: [],
});

export const mapSeriesDto = (dto: TmdbTvDto): Series => ({
  id: dto.id,
  mediaType: "series",
  title: dto.name,
  originalTitle: dto.original_name,
  overview: dto.overview,
  posterPath: dto.poster_path,
  backdropPath: dto.backdrop_path,
  releaseDate: dto.first_air_date,
  year: yearFromDate(dto.first_air_date),
  rating: dto.vote_average,
  genres: dto.genres?.map((genre) => genre.name) ?? resolveGenreNames(dto.genre_ids, GENRES.series),
  genreIds: dto.genre_ids ?? dto.genres?.map((genre) => genre.id) ?? [],
  country: dto.origin_country ?? [],
  language: dto.languages?.[0],
  status: dto.status,
  runtime: dto.episode_run_time?.[0] ?? null,
  cast: mapCast(dto.credits?.cast),
  directors: mapCrew(dto.credits?.crew),
  numberOfSeasons: dto.number_of_seasons ?? dto.seasons?.length ?? 0,
  numberOfEpisodes: dto.number_of_episodes,
  seasons: dto.seasons?.map(mapSeasonPreviewDto) ?? [],
});

export const mapEpisodeDto = (dto: TmdbEpisodeDto): Episode => ({
  id: dto.id,
  seasonNumber: dto.season_number,
  episodeNumber: dto.episode_number,
  title: dto.name,
  overview: dto.overview,
  airDate: dto.air_date,
  runtime: dto.runtime,
  stillPath: dto.still_path,
  rating: dto.vote_average,
});

export const mapSeasonDetailsDto = (dto: TmdbSeasonDetailsDto): Season => ({
  id: dto.id,
  seasonNumber: dto.season_number,
  name: dto.name,
  overview: dto.overview,
  posterPath: dto.poster_path,
  airDate: dto.air_date,
  episodeCount: dto.episodes.length,
  episodes: dto.episodes.map(mapEpisodeDto),
});

export const mapSearchResult = (dto: TmdbMovieDto | TmdbTvDto, mediaType: MediaType): MediaSummary =>
  mediaType === "movie" ? mapMovieDto(dto as TmdbMovieDto) : mapSeriesDto(dto as TmdbTvDto);

export const mapPage = <Dto, Item>(response: TmdbListResponse<Dto>, mapper: (dto: Dto) => Item): PageResult<Item> => ({
  page: response.page,
  totalPages: response.total_pages,
  totalResults: response.total_results,
  results: response.results.map(mapper),
});

export const mapWatchProvider = (dto: TmdbWatchProviderDto): WatchProvider => ({
  id: dto.provider_id,
  name: dto.provider_name,
  logoPath: dto.logo_path,
  displayPriority: dto.display_priority,
});

export const mapVideo = (dto: TmdbVideoDto): MediaVideo => ({
  id: dto.id,
  key: dto.key,
  name: dto.name,
  site: dto.site,
  type: dto.type,
  official: dto.official,
});

export const mapPerson = (dto: TmdbPersonDto): PersonSummary => ({
  id: dto.id,
  name: dto.name,
  profilePath: dto.profile_path,
  knownForDepartment: dto.known_for_department,
  knownFor: (dto.known_for ?? dto.combined_credits?.cast ?? [])
    .filter((item) => item.media_type === "movie" || item.media_type === "tv")
    .slice(0, 20)
    .map((item) => mapSearchResult(item, item.media_type === "movie" ? "movie" : "series")),
});
