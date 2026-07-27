import { useEffect } from "react";

import { imageCache } from "@/features/media/image-cache";
import { buildTmdbImageUrl } from "@/shared/utils/format";

export function useImageCache(paths: Array<string | null | undefined>): void {
  const serializedPaths = JSON.stringify(paths.filter((path): path is string => Boolean(path)));

  useEffect(() => {
    const validPaths = JSON.parse(serializedPaths) as string[];

    const urls = validPaths.flatMap((path) => [buildTmdbImageUrl(path, "w500"), buildTmdbImageUrl(path, "original")]);

    void imageCache.prefetch(urls);
  }, [serializedPaths]);
}
