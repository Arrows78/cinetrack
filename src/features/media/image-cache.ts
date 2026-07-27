const CACHE_NAME = "cinetrack-images-v1";
const META_KEY = "cinetrack.image-cache.meta.v1";
const LIMIT = 250;
export const imageCache = {
  async prefetch(urls: Array<string | null | undefined>) {
    if (!("caches" in window)) return;
    const cache = await caches.open(CACHE_NAME);
    const meta = JSON.parse(localStorage.getItem(META_KEY) ?? "{}") as Record<string, number>;
    for (const url of [...new Set(urls.filter((url): url is string => Boolean(url)))]) {
      if (!(await cache.match(url))) await cache.add(url).catch(() => undefined);
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
};
