export const GENRES = {
  movies: [
    { id: 28, label: "Action", icon: "💥" },
    { id: 12, label: "Adventure", icon: "🗺️" },
    { id: 16, label: "Animation", icon: "🎨" },
    { id: 35, label: "Comedy", icon: "😄" },
    { id: 80, label: "Crime", icon: "🔪" },
    { id: 99, label: "Documentary", icon: "🎥" },
    { id: 18, label: "Drama", icon: "🎭" },
    { id: 10751, label: "Family", icon: "🏡" },
    { id: 14, label: "Fantasy", icon: "✨" },
    { id: 36, label: "History", icon: "⚔️" },
    { id: 27, label: "Horror", icon: "👻" },
    { id: 10402, label: "Music", icon: "🎵" },
    { id: 9648, label: "Mystery", icon: "🕵️" },
    { id: 10749, label: "Romance", icon: "❤️" },
    { id: 878, label: "Science Fiction", icon: "🚀" },
    { id: 10770, label: "TV Movie", icon: "📽️" },
    { id: 53, label: "Thriller", icon: "⚡" },
    { id: 10752, label: "War", icon: "🎖️" },
    { id: 37, label: "Western", icon: "🤠" },
  ],
  series: [
    { id: 10759, label: "Action & Adventure", icon: "💥" },
    { id: 16, label: "Animation", icon: "🎨" },
    { id: 35, label: "Comedy", icon: "😄" },
    { id: 80, label: "Crime", icon: "🔪" },
    { id: 99, label: "Documentary", icon: "🎥" },
    { id: 18, label: "Drama", icon: "🎭" },
    { id: 10751, label: "Family", icon: "🏡" },
    { id: 14, label: "Fantasy", icon: "✨" },
    { id: 10762, label: "Kids", icon: "🧸" },
    { id: 9648, label: "Mystery", icon: "🕵️" },
    { id: 10763, label: "News", icon: "📰" },
    { id: 10764, label: "Reality", icon: "📺" },
    { id: 10765, label: "Sci-Fi & Fantasy", icon: "🛸" },
    { id: 10766, label: "Soap", icon: "💬" },
    { id: 10767, label: "Talk", icon: "🎤" },
    { id: 10768, label: "War & Politics", icon: "🏛️" },
    { id: 37, label: "Western", icon: "🤠" },
  ],
} as const;

export const PLATFORMS = [
  { id: 8, label: "Netflix", color: "#E50914", initial: "N" },
  { id: 119, label: "Prime Video", color: "#00A8E0", initial: "P" },
  { id: 337, label: "Disney+", color: "#0063E5", initial: "D+" },
  { id: 384, label: "Max", color: "#5822BF", initial: "M" },
  { id: 15, label: "Hulu", color: "#1CE783", initial: "H" },
  { id: 350, label: "Apple TV+", color: "#444444", initial: "A" },
] as const;

export const GENRE_IDS_MOVIES = GENRES.movies.map((g) => g.id);
export const PLATFORM_IDS = PLATFORMS.map((p) => p.id);
