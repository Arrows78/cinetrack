import { libraryRepository } from "@/features/library/library-repository";
import { mediaRepository } from "@/features/media/media-repository";
import type { Movie } from "@/types/media";

export interface WatchTonightFilters {
  genre?: number;
  provider?: number;
  maxRuntime?: number;
}

function matchesRuntime(movie: Movie, maxRuntime?: number): boolean {
  return !maxRuntime || !movie.runtime || movie.runtime <= maxRuntime;
}

function matchesGenre(movie: Movie, genre?: number): boolean {
  return genre === undefined || Boolean(movie.genreIds?.includes(genre));
}

async function matchesProvider(movie: Movie, provider?: number): Promise<boolean> {
  if (provider === undefined) return true;
  const availability = await mediaRepository.getWatchAvailability("movie", movie.id).catch(() => null);
  if (!availability) return false;
  return [...availability.flatrate, ...availability.free].some((item) => item.id === provider);
}

function shuffle<T>(items: T[]): T[] {
  return items
    .map((item) => ({ item, key: crypto.getRandomValues(new Uint32Array(1))[0] ?? 0 }))
    .sort((left, right) => left.key - right.key)
    .map(({ item }) => item);
}

export const watchTonightService = {
  async pick(filters: WatchTonightFilters): Promise<Movie[]> {
    const planned = (await libraryRepository.list()).filter(
      (item) => item.mediaType === "movie" && item.status === "planned"
    );
    const detailed = await Promise.all(
      planned.slice(0, 20).map((item) => mediaRepository.getMovieDetails(item.mediaId).catch(() => null))
    );
    let candidates = detailed
      .filter((item): item is Movie => Boolean(item))
      .filter((movie) => matchesRuntime(movie, filters.maxRuntime) && matchesGenre(movie, filters.genre));

    if (filters.provider !== undefined && candidates.length) {
      const providerMatches = await Promise.all(candidates.map((movie) => matchesProvider(movie, filters.provider)));
      candidates = candidates.filter((_movie, index) => providerMatches[index]);
    }

    if (!candidates.length) {
      candidates = (
        await mediaRepository.discoverMovies({
          genre: filters.genre,
          provider: filters.provider,
          maxRuntime: filters.maxRuntime,
        })
      ).results;
    }

    return shuffle(candidates).slice(0, 3);
  },
};
