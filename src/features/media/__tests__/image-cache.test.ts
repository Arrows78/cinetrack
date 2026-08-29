import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { imageCache } from "../image-cache";

// Mirrors the module-private constants in image-cache.ts (not exported).
const CACHE_NAME = "cinetrack-images-v1";
const META_KEY = "cinetrack.image-cache.meta.v1";
const LIMIT = 250;

const loggerWarnMock = vi.fn();
vi.mock("@/shared/lib/logger", () => ({
  logger: { info: vi.fn(), warn: (...args: unknown[]) => loggerWarnMock(...args), error: vi.fn() },
}));

interface FakeCache {
  match: ReturnType<typeof vi.fn<(url: string) => Promise<Response | undefined>>>;
  add: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

function createFakeCache(): FakeCache {
  return {
    match: vi.fn<(url: string) => Promise<Response | undefined>>().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
  };
}

function stubCaches(cache: FakeCache, cachesDelete = vi.fn().mockResolvedValue(true)) {
  const cachesOpen = vi.fn().mockResolvedValue(cache);
  vi.stubGlobal("caches", { open: cachesOpen, delete: cachesDelete });
  return { cachesOpen, cachesDelete };
}

function readMeta(): Record<string, number> {
  return JSON.parse(localStorage.getItem(META_KEY) ?? "{}") as Record<string, number>;
}

describe("imageCache", () => {
  beforeEach(() => {
    loggerWarnMock.mockReset();
    localStorage.clear();
    // Ensure no stray global from a previous test (or the jsdom environment
    // itself) makes "caches" in window true unless a test opts in.
    vi.unstubAllGlobals();
    if ("caches" in globalThis) {
      delete (globalThis as { caches?: unknown }).caches;
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("prefetch", () => {
    it("returns immediately without touching localStorage when the Cache API is unavailable", async () => {
      expect("caches" in window).toBe(false);
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

      await imageCache.prefetch(["https://example.com/a.jpg"]);

      expect(setItemSpy).not.toHaveBeenCalled();
      expect(localStorage.getItem(META_KEY)).toBeNull();
      setItemSpy.mockRestore();
    });

    it("dedupes and filters out null/undefined urls before touching the cache", async () => {
      const cache = createFakeCache();
      stubCaches(cache);

      await imageCache.prefetch(["https://a.jpg", null, "https://a.jpg", undefined, "https://b.jpg"]);

      expect(cache.match).toHaveBeenCalledTimes(2);
      expect(cache.match).toHaveBeenCalledWith("https://a.jpg");
      expect(cache.match).toHaveBeenCalledWith("https://b.jpg");
      expect(cache.add).toHaveBeenCalledTimes(2);
    });

    it("does not re-add a url already matched in the cache", async () => {
      const cache = createFakeCache();
      cache.match.mockImplementation((url: string) =>
        Promise.resolve(url === "https://cached.jpg" ? new Response() : undefined)
      );
      stubCaches(cache);

      await imageCache.prefetch(["https://cached.jpg", "https://new.jpg"]);

      expect(cache.add).toHaveBeenCalledTimes(1);
      expect(cache.add).toHaveBeenCalledWith("https://new.jpg");
    });

    it("adds a url that is not yet cached", async () => {
      const cache = createFakeCache();
      stubCaches(cache);

      await imageCache.prefetch(["https://new.jpg"]);

      expect(cache.add).toHaveBeenCalledWith("https://new.jpg");
    });

    it("catches a cache.add rejection and logs it via logger.warn instead of throwing", async () => {
      const cache = createFakeCache();
      cache.add.mockRejectedValueOnce(new Error("network failure"));
      stubCaches(cache);

      await expect(imageCache.prefetch(["https://fails.jpg"])).resolves.toBeUndefined();

      expect(loggerWarnMock).toHaveBeenCalledTimes(1);
      expect(loggerWarnMock.mock.calls[0]![0]).toContain("https://fails.jpg");
    });

    it("persists a timestamp for every prefetched url in the META_KEY localStorage entry", async () => {
      const cache = createFakeCache();
      stubCaches(cache);
      const before = Date.now();

      await imageCache.prefetch(["https://a.jpg", "https://b.jpg"]);

      const meta = readMeta();
      expect(Object.keys(meta).sort()).toEqual(["https://a.jpg", "https://b.jpg"]);
      expect(meta["https://a.jpg"]).toBeGreaterThanOrEqual(before);
      expect(meta["https://b.jpg"]).toBeGreaterThanOrEqual(before);
    });

    it("evicts the oldest entries beyond LIMIT after prefetching pushes the meta map over it", async () => {
      const cache = createFakeCache();
      stubCaches(cache);

      // Pre-populate localStorage with 249 old entries (oldest first, by
      // ascending timestamp) so that adding 3 new (much newer) urls pushes
      // the total to 252 — 2 over LIMIT — without needing 250 real prefetch
      // calls to build the fixture.
      const existingCount = LIMIT - 1;
      const existingMeta: Record<string, number> = {};
      for (let i = 0; i < existingCount; i++) {
        existingMeta[`https://old-${i}.jpg`] = i;
      }
      localStorage.setItem(META_KEY, JSON.stringify(existingMeta));

      await imageCache.prefetch(["https://new-1.jpg", "https://new-2.jpg", "https://new-3.jpg"]);

      // 249 old + 3 new = 252 total, 2 over LIMIT -> the 2 lowest-timestamp
      // old entries (old-0, old-1) get evicted.
      expect(cache.delete).toHaveBeenCalledTimes(2);
      expect(cache.delete).toHaveBeenCalledWith("https://old-0.jpg");
      expect(cache.delete).toHaveBeenCalledWith("https://old-1.jpg");

      const meta = readMeta();
      expect(Object.keys(meta)).toHaveLength(LIMIT);
      expect(meta["https://old-0.jpg"]).toBeUndefined();
      expect(meta["https://old-1.jpg"]).toBeUndefined();
      expect(meta["https://old-2.jpg"]).toBe(2);
      expect(meta["https://new-1.jpg"]).toBeDefined();
    });
  });

  describe("clear", () => {
    it("calls caches.delete when the Cache API is available", async () => {
      const cache = createFakeCache();
      const { cachesDelete } = stubCaches(cache);
      localStorage.setItem(META_KEY, "{}");

      await imageCache.clear();

      expect(cachesDelete).toHaveBeenCalledWith(CACHE_NAME);
      expect(localStorage.getItem(META_KEY)).toBeNull();
    });

    it("always removes the META_KEY entry, even when the Cache API is unavailable", async () => {
      expect("caches" in window).toBe(false);
      localStorage.setItem(META_KEY, "{}");

      await imageCache.clear();

      expect(localStorage.getItem(META_KEY)).toBeNull();
    });
  });
});
