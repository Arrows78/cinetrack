import { PLATFORM_BRAND_COLORS } from "@/shared/constants/colors";

// English/international default — used wherever a stored region preference
// hasn't loaded yet, rather than defaulting to a French-specific value.
export const DEFAULT_TMDB_REGION = "US";

// Matches i18n's own fallbackLng (see src/i18n/index.ts) — used wherever a
// stored language preference hasn't loaded yet.
export const DEFAULT_LANGUAGE = "en";

// Applied to every discover call unless the caller overrides it — without
// it, a title with a handful of votes and a fluke high rating can surface
// in Watch Tonight's random catalogue fallback ahead of well-established
// titles. Deliberately modest (not a "well-known titles only" filter).
export const DEFAULT_DISCOVER_VOTE_COUNT_FLOOR = 20;

// The regions Settings lets a user pick as their own (see settings-page.tsx)
// — the only origin countries a "titles from this country" filter needs to
// offer without a much larger searchable country list.
export const ORIGIN_COUNTRIES = [
  { code: "FR", labelKey: "watchTonight.originCountryOptions.france" },
  { code: "GB", labelKey: "watchTonight.originCountryOptions.uk" },
  { code: "US", labelKey: "watchTonight.originCountryOptions.us" },
  { code: "KR", labelKey: "watchTonight.originCountryOptions.southKorea" },
  { code: "JP", labelKey: "watchTonight.originCountryOptions.japan" },
  { code: "DE", labelKey: "watchTonight.originCountryOptions.germany" },
  { code: "IT", labelKey: "watchTonight.originCountryOptions.italy" },
  { code: "ES", labelKey: "watchTonight.originCountryOptions.spain" },
  { code: "IN", labelKey: "watchTonight.originCountryOptions.india" },
] as const;

// `label` is TMDB's own English genre name — kept as a stable identity used
// internally (matching a movie genre to its series equivalent in
// use-merged-genres.ts, sorting, deduping), not for display. `labelKey` is
// the i18n key actually rendered; see src/i18n/locales/{en,fr}.json's
// "genres" namespace.
export const GENRES = {
  movies: [
    { id: 28, label: "Action", labelKey: "genres.action", icon: "💥" },
    { id: 12, label: "Adventure", labelKey: "genres.adventure", icon: "🗺️" },
    { id: 16, label: "Animation", labelKey: "genres.animation", icon: "🎨" },
    { id: 35, label: "Comedy", labelKey: "genres.comedy", icon: "😄" },
    { id: 80, label: "Crime", labelKey: "genres.crime", icon: "🔪" },
    { id: 99, label: "Documentary", labelKey: "genres.documentary", icon: "🎥" },
    { id: 18, label: "Drama", labelKey: "genres.drama", icon: "🎭" },
    { id: 10751, label: "Family", labelKey: "genres.family", icon: "🏡" },
    { id: 14, label: "Fantasy", labelKey: "genres.fantasy", icon: "✨" },
    { id: 36, label: "History", labelKey: "genres.history", icon: "⚔️" },
    { id: 27, label: "Horror", labelKey: "genres.horror", icon: "👻" },
    { id: 10402, label: "Music", labelKey: "genres.music", icon: "🎵" },
    { id: 9648, label: "Mystery", labelKey: "genres.mystery", icon: "🕵️" },
    { id: 10749, label: "Romance", labelKey: "genres.romance", icon: "❤️" },
    { id: 878, label: "Science Fiction", labelKey: "genres.scienceFiction", icon: "🚀" },
    { id: 10770, label: "TV Movie", labelKey: "genres.tvMovie", icon: "📽️" },
    { id: 53, label: "Thriller", labelKey: "genres.thriller", icon: "⚡" },
    { id: 10752, label: "War", labelKey: "genres.war", icon: "🎖️" },
    { id: 37, label: "Western", labelKey: "genres.western", icon: "🤠" },
  ],
  series: [
    { id: 10759, label: "Action & Adventure", labelKey: "genres.actionAdventure", icon: "💥" },
    { id: 16, label: "Animation", labelKey: "genres.animation", icon: "🎨" },
    { id: 35, label: "Comedy", labelKey: "genres.comedy", icon: "😄" },
    { id: 80, label: "Crime", labelKey: "genres.crime", icon: "🔪" },
    { id: 99, label: "Documentary", labelKey: "genres.documentary", icon: "🎥" },
    { id: 18, label: "Drama", labelKey: "genres.drama", icon: "🎭" },
    { id: 10751, label: "Family", labelKey: "genres.family", icon: "🏡" },
    { id: 14, label: "Fantasy", labelKey: "genres.fantasy", icon: "✨" },
    { id: 10762, label: "Kids", labelKey: "genres.kids", icon: "🧸" },
    { id: 9648, label: "Mystery", labelKey: "genres.mystery", icon: "🕵️" },
    { id: 10763, label: "News", labelKey: "genres.news", icon: "📰" },
    { id: 10764, label: "Reality", labelKey: "genres.reality", icon: "📺" },
    { id: 10765, label: "Sci-Fi & Fantasy", labelKey: "genres.sciFiFantasy", icon: "🛸" },
    { id: 10766, label: "Soap", labelKey: "genres.soap", icon: "💬" },
    { id: 10767, label: "Talk", labelKey: "genres.talk", icon: "🎤" },
    { id: 10768, label: "War & Politics", labelKey: "genres.warPolitics", icon: "🏛️" },
    { id: 37, label: "Western", labelKey: "genres.western", icon: "🤠" },
  ],
} as const;

// Brand colors live in shared/constants/colors.ts (PLATFORM_BRAND_COLORS),
// alongside the other externally-fixed brand palettes (OAUTH_BRAND_COLORS) —
// not duplicated here as raw hex literals.
export const PLATFORMS = [
  { id: 8, label: "Netflix", color: PLATFORM_BRAND_COLORS[8], initial: "N" },
  { id: 119, label: "Prime Video", color: PLATFORM_BRAND_COLORS[119], initial: "P" },
  { id: 337, label: "Disney+", color: PLATFORM_BRAND_COLORS[337], initial: "D+" },
  { id: 384, label: "Max", color: PLATFORM_BRAND_COLORS[384], initial: "M" },
  { id: 15, label: "Hulu", color: PLATFORM_BRAND_COLORS[15], initial: "H" },
  { id: 350, label: "Apple TV+", color: PLATFORM_BRAND_COLORS[350], initial: "A" },
] as const;

// TMDB production-company ids — unlike PLATFORMS (where you can *stream*
// something), this is about who *made* it, a distinct browse facet with no
// brand colors on hand, so tiles use a plain semantic token instead.
export const STUDIOS = [
  { id: 3, label: "Pixar" },
  { id: 420, label: "Marvel Studios" },
  { id: 10342, label: "Studio Ghibli" },
  { id: 41077, label: "A24" },
  { id: 521, label: "DreamWorks Animation" },
  { id: 6704, label: "Illumination" },
  { id: 3172, label: "Blumhouse Productions" },
  { id: 174, label: "Warner Bros. Pictures" },
] as const;
