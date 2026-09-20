import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import type { EpisodeProgress, MediaSummary } from "@/types/media";
import { ExportSeriesButton } from "../export-series-button";

function buildMedia(overrides: Partial<MediaSummary> = {}): MediaSummary {
  return {
    id: 42,
    mediaType: "series",
    title: "Severance",
    overview: "",
    genres: [],
    cast: [],
    posterPath: "/poster.jpg",
    ...overrides,
  };
}

function buildProgress(overrides: Partial<EpisodeProgress> = {}): EpisodeProgress {
  return {
    id: "ep-1",
    profileId: "default",
    seriesId: 42,
    episodeId: 1,
    seasonNumber: 1,
    episodeNumber: 1,
    watched: true,
    watchedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    rating: null,
    ...overrides,
  };
}

describe("ExportSeriesButton", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    // jsdom doesn't implement these; partialExport calls them directly.
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
    URL.revokeObjectURL = vi.fn();
  });

  it("downloads a series-export payload built from the given media and episode progress", () => {
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const blobSpy = vi.spyOn(global, "Blob");

    render(<ExportSeriesButton media={buildMedia()} episodeProgress={[buildProgress()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Export this series" }));

    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    const anchor = anchorClickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^cinetrack-series-42-.+\.json$/);

    const parts = blobSpy.mock.calls[0]?.[0] as string[] | undefined;
    const payload = JSON.parse(parts![0]!) as {
      kind: string;
      series: { id: number; title: string; posterPath: string | null };
      episodeProgress: Array<{ episodeId: number }>;
    };
    expect(payload.kind).toBe("series-export");
    expect(payload.series).toEqual({ id: 42, title: "Severance", posterPath: "/poster.jpg" });
    expect(payload.episodeProgress).toHaveLength(1);

    blobSpy.mockRestore();
  });
});
