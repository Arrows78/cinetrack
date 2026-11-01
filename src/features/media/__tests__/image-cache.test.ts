import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("imageCache.prefetch", () => {
  it("loads the exact URL through the browser image pipeline and deduplicates one batch", async () => {
    const requested: string[] = [];
    class FakeImage {
      decoding = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        requested.push(value);
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);

    const { imageCache } = await import("../image-cache");
    await imageCache.prefetch(["https://img/a.jpg", "https://img/a.jpg", null, "https://img/b.jpg"]);

    expect(requested).toEqual(["https://img/a.jpg", "https://img/b.jpg"]);
  });

  it("shares one in-flight image request between overlapping prefetch calls", async () => {
    const requested: string[] = [];
    const releases: Array<() => void> = [];
    class FakeImage {
      decoding = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        requested.push(value);
        releases.push(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);

    const { imageCache } = await import("../image-cache");
    const first = imageCache.prefetch(["https://img/shared.jpg"]);
    const second = imageCache.prefetch(["https://img/shared.jpg"]);

    expect(requested).toEqual(["https://img/shared.jpg"]);
    releases[0]?.();
    await Promise.all([first, second]);
  });

  it("does not request an image again in the same session after it loaded successfully", async () => {
    const requested: string[] = [];
    class FakeImage {
      decoding = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        requested.push(value);
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);

    const { imageCache } = await import("../image-cache");
    await imageCache.prefetch(["https://img/cached.jpg"]);
    await imageCache.prefetch(["https://img/cached.jpg"]);

    expect(requested).toEqual(["https://img/cached.jpg"]);
  });

  it("allows a later retry after a speculative image load fails", async () => {
    const requested: string[] = [];
    let attempt = 0;
    class FakeImage {
      decoding = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        requested.push(value);
        attempt += 1;
        queueMicrotask(() => (attempt === 1 ? this.onerror?.() : this.onload?.()));
      }
    }
    vi.stubGlobal("Image", FakeImage);

    const { imageCache } = await import("../image-cache");
    await imageCache.prefetch(["https://img/retry.jpg"]);
    await imageCache.prefetch(["https://img/retry.jpg"]);

    expect(requested).toEqual(["https://img/retry.jpg", "https://img/retry.jpg"]);
  });
});
