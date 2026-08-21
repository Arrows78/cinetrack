import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import { useImageCache } from "../use-image-cache";

const prefetchMock = vi.fn();
vi.mock("@/features/media/image-cache", () => ({
  imageCache: { prefetch: (...args: unknown[]) => prefetchMock(...args) },
}));

describe("useImageCache", () => {
  beforeEach(() => {
    prefetchMock.mockReset();
  });

  it("filters out null/undefined paths and builds both w500 and original urls for each", () => {
    renderHook(() => useImageCache(["/poster-a.jpg", null, undefined, "/poster-b.jpg"]));

    expect(prefetchMock).toHaveBeenCalledTimes(1);
    expect(prefetchMock).toHaveBeenCalledWith([
      buildTmdbImageUrl("/poster-a.jpg", "w500"),
      buildTmdbImageUrl("/poster-a.jpg", "original"),
      buildTmdbImageUrl("/poster-b.jpg", "w500"),
      buildTmdbImageUrl("/poster-b.jpg", "original"),
    ]);
  });

  it("does not call prefetch again on rerender with the same set of paths, even as a new array reference", () => {
    const { rerender } = renderHook((paths: Array<string | null | undefined>) => useImageCache(paths), {
      initialProps: ["/poster-a.jpg", "/poster-b.jpg"],
    });
    expect(prefetchMock).toHaveBeenCalledTimes(1);

    // Same contents, brand-new array instance — the JSON.stringify-memoized
    // effect dependency should treat this as unchanged.
    rerender(["/poster-a.jpg", "/poster-b.jpg"]);

    expect(prefetchMock).toHaveBeenCalledTimes(1);
  });

  it("calls prefetch again when the path list genuinely changes", () => {
    const { rerender } = renderHook((paths: Array<string | null | undefined>) => useImageCache(paths), {
      initialProps: ["/poster-a.jpg"],
    });
    expect(prefetchMock).toHaveBeenCalledTimes(1);

    rerender(["/poster-a.jpg", "/poster-c.jpg"]);

    expect(prefetchMock).toHaveBeenCalledTimes(2);
    expect(prefetchMock).toHaveBeenLastCalledWith([
      buildTmdbImageUrl("/poster-a.jpg", "w500"),
      buildTmdbImageUrl("/poster-a.jpg", "original"),
      buildTmdbImageUrl("/poster-c.jpg", "w500"),
      buildTmdbImageUrl("/poster-c.jpg", "original"),
    ]);
  });
});
