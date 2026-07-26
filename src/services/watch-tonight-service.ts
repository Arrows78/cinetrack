import { libraryRepository } from "@/services/local/library-repository";
import { mediaRepository } from "@/services/repositories/media-repository";
import type { Movie } from "@/types/media";
export interface WatchTonightFilters { genre?: number; provider?: number; maxRuntime?: number; }
export const watchTonightService = {
  async pick(filters: WatchTonightFilters): Promise<Movie[]> {
    const planned = (await libraryRepository.list()).filter((item) => item.mediaType === "movie" && item.status === "planned");
    const detailed = await Promise.all(planned.slice(0, 20).map((item) => mediaRepository.getMovieDetails(item.mediaId).catch(() => null)));
    let candidates = detailed.filter((item): item is Movie => Boolean(item)).filter((movie) => !filters.maxRuntime || !movie.runtime || movie.runtime <= filters.maxRuntime);
    const genre = filters.genre;
    if (genre !== undefined) {
      candidates = candidates.filter((movie) => movie.genreIds?.includes(genre));
    }
    if (!candidates.length && genre !== undefined) {
      candidates = (await mediaRepository.discoverMovies({ genre: genre, provider: filters.provider, maxRuntime: filters.maxRuntime })).results;
    }
    return candidates.map((item) => ({ item, key: crypto.getRandomValues(new Uint32Array(1))[0] })).sort((a,b) => a.key-b.key).slice(0,3).map(({item}) => item);
  },
};
