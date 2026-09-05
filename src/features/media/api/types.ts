export interface TmdbListResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbGenreDto {
  id: number;
  name: string;
}

export interface TmdbReleaseDateDto {
  certification: string;
  // TMDB's TheatricalLimited/Theatrical/Digital/Physical/TV release-type
  // enum — unused today (resolveCertification in mapper.ts just takes the
  // first non-empty certification for the region) but kept typed since it's
  // part of the real response shape.
  type: number;
  release_date: string;
}
export interface TmdbReleaseDatesDto {
  results: Array<{ iso_3166_1: string; release_dates: TmdbReleaseDateDto[] }>;
}

export interface TmdbContentRatingsDto {
  results: Array<{ iso_3166_1: string; rating: string }>;
}

export interface TmdbCastDto {
  id: number;
  name: string;
  character?: string;
  profile_path?: string | null;
  order?: number;
}

export interface TmdbCrewDto {
  id: number;
  name: string;
  job?: string;
  department?: string;
  profile_path?: string | null;
}

export interface TmdbCreditsDto {
  cast: TmdbCastDto[];
  crew?: TmdbCrewDto[];
}

// The `belongs_to_collection` field embedded in `/movie/{id}` — null when
// the movie isn't part of a TMDB collection.
export interface TmdbCollectionSummaryDto {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

// The full `/collection/{id}` response.
export interface TmdbCollectionDto {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: TmdbMovieDto[];
}

export interface TmdbExternalIdsDto {
  imdb_id?: string | null;
}

export interface TmdbMovieDto {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  runtime?: number | null;
  status?: string;
  genres?: TmdbGenreDto[];
  genre_ids?: number[];
  spoken_languages?: Array<{ english_name: string; name: string }>;
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  credits?: TmdbCreditsDto;
  belongs_to_collection?: TmdbCollectionSummaryDto | null;
  external_ids?: TmdbExternalIdsDto;
  release_dates?: TmdbReleaseDatesDto;
}

export interface TmdbSeasonPreviewDto {
  id: number;
  air_date: string | null;
  episode_count: number;
  name: string;
  overview: string;
  poster_path: string | null;
  season_number: number;
}

export interface TmdbTvDto {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  genres?: TmdbGenreDto[];
  genre_ids?: number[];
  episode_run_time?: number[];
  origin_country?: string[];
  languages?: string[];
  status?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: TmdbSeasonPreviewDto[];
  credits?: TmdbCreditsDto;
  external_ids?: TmdbExternalIdsDto;
  content_ratings?: TmdbContentRatingsDto;
}

export interface TmdbEpisodeDto {
  id: number;
  air_date: string | null;
  episode_number: number;
  name: string;
  overview: string;
  runtime: number | null;
  season_number: number;
  still_path: string | null;
  vote_average: number;
}

export interface TmdbSeasonDetailsDto {
  id: number;
  air_date: string | null;
  episodes: TmdbEpisodeDto[];
  name: string;
  overview: string;
  poster_path: string | null;
  season_number: number;
}

export interface TmdbWatchProviderDto {
  display_priority: number;
  logo_path: string | null;
  provider_id: number;
  provider_name: string;
  display_priorities?: Record<string, number>;
}

export interface TmdbWatchProviderListResponse {
  results: TmdbWatchProviderDto[];
}

export type TmdbMultiSearchResultDto =
  (TmdbMovieDto & { media_type: "movie" }) | (TmdbTvDto & { media_type: "tv" }) | { media_type: "person" };

export interface TmdbVideoDto {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}
export interface TmdbVideoResponse {
  results: TmdbVideoDto[];
}

export type TmdbPersonCreditDto = (TmdbMovieDto | TmdbTvDto) & {
  media_type: "movie" | "tv";
  character?: string;
  job?: string;
  episode_count?: number;
};

export interface TmdbPersonDto {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department?: string;
  biography?: string;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  also_known_as?: string[];
  known_for?: TmdbPersonCreditDto[];
  combined_credits?: { cast?: TmdbPersonCreditDto[]; crew?: TmdbPersonCreditDto[] };
  external_ids?: TmdbExternalIdsDto;
}

export interface TmdbProviderRegionDto {
  link?: string;
  flatrate?: TmdbWatchProviderDto[];
  rent?: TmdbWatchProviderDto[];
  buy?: TmdbWatchProviderDto[];
  free?: TmdbWatchProviderDto[];
}
export interface TmdbProviderResultsResponse {
  results: Record<string, TmdbProviderRegionDto>;
}
