import type {
  CastMember,
  Episode,
  MediaSummary,
  MediaType,
  Movie,
  PageResult,
  Season,
  Series,
  WatchProvider,
} from "@/types/media";
import { yearFromDate } from "@/shared/utils/format";
import type {
  TmdbCastDto,
  TmdbEpisodeDto,
  TmdbListResponse,
  TmdbMovieDto,
  TmdbSeasonDetailsDto,
  TmdbSeasonPreviewDto,
  TmdbTvDto,
  TmdbWatchProviderDto,
} from "./types";

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
  genres: dto.genres?.map((genre) => genre.name) ?? [],
  genreIds: dto.genre_ids ?? dto.genres?.map((genre) => genre.id) ?? [],
  country: dto.production_countries?.map((country) => country.name) ?? [],
  language: dto.spoken_languages?.[0]?.english_name,
  status: dto.status,
  runtime: dto.runtime,
  duration: dto.runtime,
  cast: mapCast(dto.credits?.cast),
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
  genres: dto.genres?.map((genre) => genre.name) ?? [],
  genreIds: dto.genre_ids ?? dto.genres?.map((genre) => genre.id) ?? [],
  country: dto.origin_country ?? [],
  language: dto.languages?.[0],
  status: dto.status,
  runtime: dto.episode_run_time?.[0] ?? null,
  cast: mapCast(dto.credits?.cast),
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
