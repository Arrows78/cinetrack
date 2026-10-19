import { logger } from "@/shared/lib/logger";
import { IMAGE_CACHE_META_KEY } from "@/shared/constants/local-storage-keys";

const CACHE_NAME = "cinetrack-images-v1";
const LIMIT = 250;
const PREFETCH_CONCURRENCY = 6;
// The metadata key is read, merged and rewritten by every prefetch; two
// overlapping prefetches (two screens mounting together) used to each start
// from the same snapshot and the last write dropped the other's entries.
// Running them one after the other keeps the read-modify-write atomic.
let prefetchQueue: Promise<void> = Promise.resolve();

async function prefetchNow(urls: Array<string | null | undefined>): Promise<void> {
  if (!("caches" in window)) return;
  const cache = await caches.open(CACHE_NAME);
  let meta: Record<string, number> = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(IMAGE_CACHE_META_KEY) ?? "{}");
    if (parsed && typeof parsed === "object") {
      meta = Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number")
      );
    }
  } catch {
    logger.warn("Image cache metadata was invalid and has been reset");
  }
  const uniqueUrls = [...new Set(urls.filter((url): url is string => Boolean(url)))];
  for (let index = 0; index < uniqueUrls.length; index += PREFETCH_CONCURRENCY) {
    const batch = uniqueUrls.slice(index, index + PREFETCH_CONCURRENCY);
    await Promise.all(
      batch.map(async (url) => {
        if (!(await cache.match(url))) {
          try {
            await cache.add(url);
          } catch (error) {
            logger.warn(`Failed to cache image ${url}: ${error}`);
            return;
          }
        }
        meta[url] = Date.now();
      })
    );
  }
  const sorted = Object.entries(meta).sort((a, b) => b[1] - a[1]);
  for (const [url] of sorted.slice(LIMIT)) {
    await cache.delete(url);
    delete meta[url];
  }
  try {
    localStorage.setItem(IMAGE_CACHE_META_KEY, JSON.stringify(meta));
  } catch (error) {
    // Quota exceeded or storage blocked: the cache still works, only the
    // eviction bookkeeping is stale until the next successful write.
    logger.warn(`Image cache metadata could not be saved: ${error}`);
  }
}

export const imageCache = {
  prefetch(urls: Array<string | null | undefined>): Promise<void> {
    const run = prefetchQueue.then(() => prefetchNow(urls));
    prefetchQueue = run.catch(() => undefined);
    return run;
  },
  async clear() {
    if ("caches" in window) await caches.delete(CACHE_NAME);
    localStorage.removeItem(IMAGE_CACHE_META_KEY);
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
