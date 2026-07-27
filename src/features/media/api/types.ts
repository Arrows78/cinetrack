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

export interface TmdbCastDto {
  id: number;
  name: string;
  character?: string;
  profile_path?: string | null;
  order?: number;
}

export interface TmdbCreditsDto {
  cast: TmdbCastDto[];
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
  | (TmdbMovieDto & { media_type: "movie" })
  | (TmdbTvDto & { media_type: "tv" })
  | { media_type: "person" };

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

export interface TmdbPersonDto {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department?: string;
  known_for?: Array<(TmdbMovieDto | TmdbTvDto) & { media_type: "movie" | "tv" }>;
  combined_credits?: { cast: Array<(TmdbMovieDto | TmdbTvDto) & { media_type: "movie" | "tv" }> };
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
