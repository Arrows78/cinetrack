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
  MediaReview,
  PersonSummary,
  PersonCreditItem,
  PersonDetail,
} from "@/types/media";
import { yearFromDate } from "@/shared/utils/format";
import { DEFAULT_TMDB_REGION, GENRES } from "@/shared/constants/discover";
import type {
  TmdbCastDto,
  TmdbCollectionDto,
  TmdbCollectionSummaryDto,
  TmdbContentRatingsDto,
  TmdbCrewDto,
  TmdbEpisodeDto,
  TmdbImagesDto,
  TmdbListResponse,
  TmdbMovieDto,
  TmdbReleaseDatesDto,
  TmdbReviewsDto,
  TmdbSeasonDetailsDto,
  TmdbSeasonPreviewDto,
  TmdbTvDto,
  TmdbWatchProviderDto,
  TmdbVideoDto,
  TmdbPersonDto,
  TmdbPersonCreditDto,
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

// TMDB's per-region certifications: a movie's release_dates can list the
// same region more than once (one entry per release type — theatrical,
// digital, ...), each with its own possibly-empty certification string, so
// this takes the first non-empty one rather than just the first entry.
// Falls back to the US rating (the one certification most likely to exist)
// when the user's own region has no rated release at all.
const resolveMovieCertification = (dto: TmdbReleaseDatesDto | undefined, region: string): string | null => {
  const results = dto?.results ?? [];
  const forRegion = (iso: string) =>
    results.find((entry) => entry.iso_3166_1 === iso)?.release_dates.find((entry) => entry.certification)
      ?.certification;
  return forRegion(region) ?? forRegion(DEFAULT_TMDB_REGION) ?? null;
};

const resolveSeriesCertification = (dto: TmdbContentRatingsDto | undefined, region: string): string | null => {
  const results = dto?.results ?? [];
  const forRegion = (iso: string) => results.find((entry) => entry.iso_3166_1 === iso)?.rating;
  return forRegion(region) || forRegion(DEFAULT_TMDB_REGION) || null;
};

// Capped at 12 — TMDB already returns images best-rated first, and a detail
// page's gallery has no use for the long tail of barely-voted-on backdrops.
const MAX_GALLERY_BACKDROPS = 12;
const mapBackdropPaths = (images?: TmdbImagesDto): string[] =>
  (images?.backdrops ?? []).slice(0, MAX_GALLERY_BACKDROPS).map((image) => image.file_path);

// TMDB's author_details.avatar_path is either a TMDB-hosted image path
// ("/abc.jpg") or an absolute Gravatar URL stored with a leading slash
// ("/https://secure.gravatar.com/..."), never plain "https://..." — resolved
// to one ready-to-use URL here instead of leaking that quirk to the UI.
const resolveAvatarUrl = (avatarPath?: string | null): string | null => {
  if (!avatarPath) return null;
  return avatarPath.startsWith("/http") ? avatarPath.slice(1) : `https://image.tmdb.org/t/p/w92${avatarPath}`;
};

// Capped at 5 — a detail page section, not a paginated review browser.
const MAX_REVIEWS = 5;
const mapReviews = (reviews?: TmdbReviewsDto): MediaReview[] =>
  (reviews?.results ?? []).slice(0, MAX_REVIEWS).map((review) => ({
    id: review.id,
    author: review.author_details.username || review.author,
    avatarUrl: resolveAvatarUrl(review.author_details.avatar_path),
    rating: review.author_details.rating,
    content: review.content,
    createdAt: review.created_at,
    url: review.url,
  }));

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

export const mapMovieDto = (dto: TmdbMovieDto, region: string = DEFAULT_TMDB_REGION): Movie => ({
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
  imdbId: dto.external_ids?.imdb_id ?? null,
  certification: resolveMovieCertification(dto.release_dates, region),
  keywords: (dto.keywords?.keywords ?? []).map((keyword) => keyword.name),
  backdropPaths: mapBackdropPaths(dto.images),
  reviews: mapReviews(dto.reviews),
});

export const mapCollectionDto = (dto: TmdbCollectionDto): MovieCollection => ({
  id: dto.id,
  name: dto.name,
  overview: dto.overview,
  posterPath: dto.poster_path,
  backdropPath: dto.backdrop_path,
  parts: dto.parts.map((part) => mapMovieDto(part)),
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

export const mapSeriesDto = (dto: TmdbTvDto, region: string = DEFAULT_TMDB_REGION): Series => ({
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
  imdbId: dto.external_ids?.imdb_id ?? null,
  certification: resolveSeriesCertification(dto.content_ratings, region),
  keywords: (dto.keywords?.results ?? []).map((keyword) => keyword.name),
  backdropPaths: mapBackdropPaths(dto.images),
  reviews: mapReviews(dto.reviews),
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

const mapPersonCredit = (item: TmdbPersonCreditDto, department: "cast" | "crew"): PersonCreditItem => ({
  ...mapSearchResult(item, item.media_type === "movie" ? "movie" : "series"),
  role: (department === "cast" ? item.character : item.job) ?? "",
  department,
  episodeCount: item.episode_count,
});

// The full body of work (unlike PersonSummary.knownFor, which is a curated,
// cast-only strip): cast and crew credits merged into one list, most recent
// release/air date first, so the person's detail page can show everything
// they've worked on rather than just what they're best known for.
export const mapPersonDetail = (dto: TmdbPersonDto): PersonDetail => {
  const isPlayable = (item: TmdbPersonCreditDto) => item.media_type === "movie" || item.media_type === "tv";
  const credits = [
    ...(dto.combined_credits?.cast ?? []).filter(isPlayable).map((item) => mapPersonCredit(item, "cast")),
    ...(dto.combined_credits?.crew ?? []).filter(isPlayable).map((item) => mapPersonCredit(item, "crew")),
  ];
  const filmography = credits.sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));

  return {
    ...mapPerson(dto),
    biography: dto.biography ?? "",
    birthday: dto.birthday ?? null,
    deathday: dto.deathday ?? null,
    placeOfBirth: dto.place_of_birth ?? null,
    alsoKnownAs: dto.also_known_as ?? [],
    imdbId: dto.external_ids?.imdb_id ?? null,
    filmography,
  };
};
