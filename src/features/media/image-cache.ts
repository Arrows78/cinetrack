import { logger } from "@/features/diagnostics/logger";

const CACHE_NAME = "cinetrack-images-v1";
const META_KEY = "cinetrack.image-cache.meta.v1";
const LIMIT = 250;
export const imageCache = {
  async prefetch(urls: Array<string | null | undefined>) {
    if (!("caches" in window)) return;
    const cache = await caches.open(CACHE_NAME);
    const meta = JSON.parse(localStorage.getItem(META_KEY) ?? "{}") as Record<string, number>;
    for (const url of [...new Set(urls.filter((url): url is string => Boolean(url)))]) {
      if (!(await cache.match(url)))
        await cache.add(url).catch((error) => {
          logger.warn(`Failed to cache image ${url}: ${error}`);
        });
      meta[url] = Date.now();
    }
    const sorted = Object.entries(meta).sort((a, b) => b[1] - a[1]);
    for (const [url] of sorted.slice(LIMIT)) {
      await cache.delete(url);
      delete meta[url];
    }
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  },
  async clear() {
    if ("caches" in window) await caches.delete(CACHE_NAME);
    localStorage.removeItem(META_KEY);
  },
  /**
   * Aggregate size (in bytes) of everything currently in the cache — powers
   * the "image cache" card in Settings. There's no cheaper way to get a
   * total from the Cache API than opening every matched response and
   * summing its `Blob.size`. Like `prefetch`/`clear`, this only reports
   * what's actually cached right now and returns 0 when the Cache API isn't
   * available (shouldn't happen in the real app, but mirrors their guard).
   */
  async size(): Promise<number> {
    if (!("caches" in window)) return 0;
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    let total = 0;
    for (const key of keys) {
      const response = await cache.match(key);
      if (response) total += (await response.blob()).size;
    }
    return total;
  },
};
