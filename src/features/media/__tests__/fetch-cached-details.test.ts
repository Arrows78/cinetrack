import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/app/query-client";
import { mediaRepository } from "@/features/media/media-repository";
import {
  fetchMediaDetailsCached,
  fetchMovieDetailsCached,
  fetchSeriesDetailsCached,
  mapDetailsWithConcurrency,
} from "@/features/media/fetch-cached-details";
import { queryKeys } from "@/shared/constants/query-keys";

vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: { getMovieDetails: vi.fn(), getSeriesDetails: vi.fn() },
}));

const movie = { id: 1, title: "M" };
const series = { id: 2, name: "S" };

describe("fetch-cached-details", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
    vi.mocked(mediaRepository.getMovieDetails).mockResolvedValue(movie as never);
    vi.mocked(mediaRepository.getSeriesDetails).mockResolvedValue(series as never);
  });

  it("reads through the shared remote.* keys and serves a second read from cache", async () => {
    await expect(fetchMovieDetailsCached(1)).resolves.toBe(movie);
    await fetchMovieDetailsCached(1);
    expect(mediaRepository.getMovieDetails).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(queryKeys.remote.movieDetails(1))).toBe(movie);

    await expect(fetchSeriesDetailsCached(2)).resolves.toBe(series);
    expect(queryClient.getQueryData(queryKeys.remote.seriesDetails(2))).toBe(series);
  });

  it("does not retry when asked not to, and dispatches on media type", async () => {
    vi.mocked(mediaRepository.getMovieDetails).mockRejectedValue(new Error("boom"));
    await expect(fetchMovieDetailsCached(9, { retry: false })).rejects.toThrow("boom");
    expect(mediaRepository.getMovieDetails).toHaveBeenCalledTimes(1);

    vi.mocked(mediaRepository.getMovieDetails).mockResolvedValue(movie as never);
    await expect(fetchMediaDetailsCached("series", 2)).resolves.toBe(series);
    await expect(fetchMediaDetailsCached("movie", 1, { staleTime: 10 })).resolves.toBeDefined();
  });

  it("maps with a cap, keeps input order and nulls out failures after reporting them", async () => {
    let inFlight = 0;
    let peak = 0;
    const onError = vi.fn();
    const results = await mapDetailsWithConcurrency(
      [1, 2, 3, 4, 5],
      async (n) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        if (n === 3) throw new Error("bad");
        return n * 10;
      },
      onError,
      2
    );
    expect(results).toEqual([10, 20, null, 40, 50]);
    expect(peak).toBeLessThanOrEqual(2);
    expect(onError).toHaveBeenCalledWith(3, expect.any(Error));
  });
});
