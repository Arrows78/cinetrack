import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import fallbackPoster from "@/assets/poster-placeholder.svg";
import { WatchNextRow, WatchNextSection } from "../watch-next-section";
import type { WatchNextEntry } from "@/features/progress/use-watch-next";
import type { Episode, TrackedSeriesItem } from "@/types/media";

const { markWatchedMock, useMarkWatchNextMock } = vi.hoisted(() => ({
  markWatchedMock: vi.fn(),
  useMarkWatchNextMock: vi.fn(),
}));

vi.mock("@/features/progress/use-watch-next", () => ({
  useMarkWatchNext: () => useMarkWatchNextMock(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => (
    <a href={to} data-params={params ? JSON.stringify(params) : undefined}>
      {children}
    </a>
  ),
}));

function makeSeries(overrides: Partial<TrackedSeriesItem> = {}): TrackedSeriesItem {
  return {
    id: "tracked-1",
    seriesId: 42,
    title: "The Wire",
    posterPath: "/wire.jpg",
    backdropPath: null,
    totalEpisodes: 60,
    watchedEpisodes: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 100,
    seasonNumber: 1,
    episodeNumber: 3,
    title: "The Buys",
    overview: "",
    ...overrides,
  };
}

function makeEntry(overrides: Partial<WatchNextEntry> = {}): WatchNextEntry {
  return {
    series: makeSeries(),
    nextEpisode: makeEpisode(),
    remaining: 5,
    ...overrides,
  };
}

describe("WatchNextRow / WatchNextSection", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    markWatchedMock.mockReset().mockResolvedValue(undefined);
    useMarkWatchNextMock.mockReset().mockReturnValue({ markWatched: markWatchedMock, isSaving: false });
  });

  describe("WatchNextSection", () => {
    it("renders nothing for an empty entries array", () => {
      const { container } = render(<WatchNextSection entries={[]} index={0} />);
      expect(container).toBeEmptyDOMElement();
    });

    it("renders a SectionHeader (with index/size passed through) and one row per entry", () => {
      const entries = [
        makeEntry({ series: makeSeries({ seriesId: 1, title: "The Wire" }) }),
        makeEntry({ series: makeSeries({ seriesId: 2, title: "Fargo" }) }),
      ];
      render(<WatchNextSection entries={entries} index={2} />);

      const heading = screen.getByRole("heading", { level: 2, name: "Watch next" });
      expect(heading).toBeInTheDocument();
      expect(screen.getByText("Pick up right where you left off")).toBeInTheDocument();

      // index !== undefined + default size renders the eyebrow "section-rule"
      // bar in SectionHeader — its presence confirms `index` actually reached
      // the header rather than just being accepted and ignored.
      expect(document.querySelector(".section-rule")).toBeInTheDocument();

      expect(screen.getByText("The Wire")).toBeInTheDocument();
      expect(screen.getByText("Fargo")).toBeInTheDocument();
      expect(screen.getAllByRole("link")).toHaveLength(2);
    });

    it("passes size='sub' through to SectionHeader (h3, no eyebrow rule)", () => {
      render(<WatchNextSection entries={[makeEntry()]} index={0} size="sub" />);

      expect(screen.getByRole("heading", { level: 3, name: "Watch next" })).toBeInTheDocument();
      expect(document.querySelector(".section-rule")).not.toBeInTheDocument();
    });
  });

  describe("WatchNextRow", () => {
    it("renders series title, padded episode code, and episode title", () => {
      const entry = makeEntry({
        series: makeSeries({ title: "The Wire" }),
        nextEpisode: makeEpisode({ seasonNumber: 1, episodeNumber: 3, title: "The Buys" }),
      });
      render(<WatchNextRow entry={entry} />);

      expect(screen.getByText("The Wire")).toBeInTheDocument();
      // formatEpisodeCode(1, 3, { padded: true }) -> "S01E03"
      expect(screen.getByText("S01E03")).toBeInTheDocument();
      expect(screen.getByText("The Buys")).toBeInTheDocument();
    });

    it("falls back to the bundled placeholder poster when posterPath is null", () => {
      const entry = makeEntry({ series: makeSeries({ posterPath: null }) });
      const { container } = render(<WatchNextRow entry={entry} />);

      const image = container.querySelector("img");
      expect(image).toHaveAttribute("src", fallbackPoster);
    });

    it("builds a TMDB poster URL when posterPath is set", () => {
      const entry = makeEntry({ series: makeSeries({ posterPath: "/wire.jpg" }) });
      const { container } = render(<WatchNextRow entry={entry} />);

      const image = container.querySelector("img");
      expect(image).toHaveAttribute("src", "https://image.tmdb.org/t/p/w185/wire.jpg");
    });

    it("shows a +N-1 badge when remaining > 1", () => {
      const entry = makeEntry({ remaining: 5 });
      render(<WatchNextRow entry={entry} />);

      expect(screen.getByText("+4")).toBeInTheDocument();
    });

    it.each([1, 0])("shows no badge when remaining is %i (<= 1)", (remaining) => {
      const entry = makeEntry({ remaining });
      render(<WatchNextRow entry={entry} />);

      expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
    });

    it("links to the series detail route with the right seriesId param", () => {
      const entry = makeEntry({ series: makeSeries({ seriesId: 99 }) });
      render(<WatchNextRow entry={entry} />);

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "/series/$seriesId");
      expect(link).toHaveAttribute("data-params", JSON.stringify({ seriesId: "99" }));
    });

    it("calls markWatched with the series and next episode when the seen toggle is clicked", () => {
      const series = makeSeries({ seriesId: 7 });
      const nextEpisode = makeEpisode({ id: 555 });
      render(<WatchNextRow entry={makeEntry({ series, nextEpisode })} />);

      fireEvent.click(screen.getByRole("button", { name: "Mark as watched" }));

      expect(markWatchedMock).toHaveBeenCalledWith({ series, episode: nextEpisode });
    });

    it("disables the seen toggle while isSaving is true", () => {
      useMarkWatchNextMock.mockReturnValue({ markWatched: markWatchedMock, isSaving: true });
      render(<WatchNextRow entry={makeEntry()} />);

      expect(screen.getByRole("button", { name: "Mark as watched" })).toBeDisabled();
    });

    it("keeps the seen toggle enabled while isSaving is false", () => {
      render(<WatchNextRow entry={makeEntry()} />);

      expect(screen.getByRole("button", { name: "Mark as watched" })).toBeEnabled();
    });
  });
});
