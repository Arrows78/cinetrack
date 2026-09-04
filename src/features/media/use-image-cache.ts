import { useEffect } from "react";

import { imageCache } from "@/features/media/image-cache";
import { buildTmdbImageUrl } from "@/shared/utils/format";

export function useImageCache(paths: Array<string | null | undefined>, sizes: Array<"w500" | "original"> = []): void {
  const serializedPaths = JSON.stringify(paths.flatMap((path, index) => (path ? [{ path, index }] : [])));
  const serializedSizes = JSON.stringify(sizes);

  useEffect(() => {
    const validPaths = JSON.parse(serializedPaths) as Array<{ path: string; index: number }>;

    // Cache only the variants rendered by the current surfaces: posters use
    // w500 and detail backdrops use original. Prefetching both for every path
    // doubled network/storage work without improving hit rate.
    const validSizes = JSON.parse(serializedSizes) as Array<"w500" | "original">;
    const urls = validPaths.map(({ path, index }) => buildTmdbImageUrl(path, validSizes[index] ?? "w500"));

    void imageCache.prefetch(urls);
  }, [serializedPaths, serializedSizes]);
}
