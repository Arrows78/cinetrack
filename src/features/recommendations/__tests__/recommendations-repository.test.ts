import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

// The dismissed_recommendations write/idempotency/profile-scoping behavior
// lives in Rust and is exercised there (see
// src-tauri/src/recommendations/repository.rs's own tests) — this file only
// verifies recommendationsRepository wraps invoke() with the right command
// name/args.
describe("recommendationsRepository", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("listDismissed() invokes list_dismissed_recommendations with no args", async () => {
    invokeMock.mockResolvedValueOnce([]);
    const { recommendationsRepository } = await import("../recommendations-repository");

    await expect(recommendationsRepository.listDismissed()).resolves.toEqual([]);
    expect(invokeMock).toHaveBeenCalledWith("list_dismissed_recommendations", undefined);
  });

  it("dismiss() invokes dismiss_recommendation with the media payload", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { recommendationsRepository } = await import("../recommendations-repository");

    await recommendationsRepository.dismiss({ id: 7, mediaType: "movie", title: "Dune", posterPath: "/p.jpg" });
    expect(invokeMock).toHaveBeenCalledWith("dismiss_recommendation", {
      media: { id: 7, mediaType: "movie", title: "Dune", posterPath: "/p.jpg" },
    });
  });

  it("undismiss() invokes undismiss_recommendation with mediaId/mediaType", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { recommendationsRepository } = await import("../recommendations-repository");

    await recommendationsRepository.undismiss(7, "movie");
    expect(invokeMock).toHaveBeenCalledWith("undismiss_recommendation", { mediaId: 7, mediaType: "movie" });
  });
});
