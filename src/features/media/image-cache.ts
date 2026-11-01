const PREFETCH_CONCURRENCY = 6;

// Keep duplicate requests out of the image loader within one app session.
// Successfully loaded URLs stay in this set; failed ones are deliberately
// left out so a later screen can retry them after connectivity recovers.
const loaded = new Set<string>();
const inFlight = new Map<string, Promise<void>>();

function preload(url: string): Promise<void> {
  if (loaded.has(url)) return Promise.resolve();
  const existing = inFlight.get(url);
  if (existing) return existing;

  const task = new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      loaded.add(url);
      resolve();
    };
    // Prefetching is only an optimization. A failed speculative load must
    // never fail the page; the real <img> can retry when it renders.
    image.onerror = () => resolve();
    image.src = url;
  }).finally(() => {
    inFlight.delete(url);
  });

  inFlight.set(url, task);
  return task;
}

/**
 * Primes the webview/browser's normal image/HTTP cache by loading the exact
 * URLs the UI will later put in <img src>. The previous implementation wrote
 * responses into Cache Storage, but no service worker or component ever read
 * them back, so it consumed storage without accelerating image rendering.
 */
export const imageCache = {
  async prefetch(urls: Array<string | null | undefined>): Promise<void> {
    const uniqueUrls = [...new Set(urls.filter((url): url is string => Boolean(url)))];
    for (let index = 0; index < uniqueUrls.length; index += PREFETCH_CONCURRENCY) {
      await Promise.all(uniqueUrls.slice(index, index + PREFETCH_CONCURRENCY).map(preload));
    }
  },
};
