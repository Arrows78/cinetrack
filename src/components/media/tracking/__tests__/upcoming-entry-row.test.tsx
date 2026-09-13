import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import { UpcomingEntryRow } from "../upcoming-entry-row";
import type { Episode, EpisodeProgress, TrackingEntry } from "@/types/media";

const useSeasonDetailsMock = vi.fn();
const useEpisodeProgressMock = vi.fn();

vi.mock("@/features/media/use-media", () => ({
  useSeasonDetails: () => useSeasonDetailsMock(),
}));

vi.mock("@/features/progress/use-progress", () => ({
  useEpisodeProgress: () => useEpisodeProgressMock(),
}));

// Same fake Link as tracking-list.test.tsx's own mock — no RouterProvider
// exists in this render.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...rest }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => (
    <a href={params ? to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? "") : to} {...rest}>
      {children}
    </a>
  ),
}));

function makeEntry(overrides: Partial<TrackingEntry>): TrackingEntry {
  return {
    id: "entry-1",
    mediaId: 1,
    mediaType: "series",
    title: "Severance",
    type: "episode",
    scope: "mine",
    date: "2026-09-01",
    seasonNumber: 2,
    episodeNumber: 5,
    episodeTitle: "The Return",
    ...overrides,
  };
}

const toggleEpisodeSeenMock = vi.fn();

function episode(overrides: Partial<Episode> = {}): Episode {
  return { id: 500, seasonNumber: 2, episodeNumber: 5, title: "The Return", overview: "", ...overrides };
}

describe("UpcomingEntryRow", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useSeasonDetailsMock.mockReturnValue({ data: { episodes: [episode()] } });
    useEpisodeProgressMock.mockReturnValue({
      data: [] as EpisodeProgress[],
      isSaving: false,
      toggleEpisodeSeen: toggleEpisodeSeenMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("links an episode row to its season page", () => {
    render(<UpcomingEntryRow entry={makeEntry({ date: "2099-01-01" })} />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/series/1/season/2");
    expect(screen.getByText("Severance")).toBeInTheDocument();
    expect(screen.getByText("S2E5 · The Return")).toBeInTheDocument();
  });

  it("shows a countdown badge (not New/Aired) for a not-yet-aired episode, and no quick-check", () => {
    render(<UpcomingEntryRow entry={makeEntry({ date: "2099-01-01" })} />);

    expect(screen.getByText(/^(Today|Tomorrow|In \d+ (day|days|week|weeks))$/)).toBeInTheDocument();
    expect(screen.queryByText("New")).not.toBeInTheDocument();
    expect(screen.queryByText("Aired")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a New badge and an unwatched quick-check for an aired, unwatched episode", () => {
    render(<UpcomingEntryRow entry={makeEntry({ date: "2020-01-01" })} />);

    expect(screen.getByText("New")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Mark watched" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("shows an Aired badge and a checked quick-check for an aired, watched episode", () => {
    useEpisodeProgressMock.mockReturnValue({
      data: [{ episodeId: 500 } as EpisodeProgress],
      isSaving: false,
      toggleEpisodeSeen: toggleEpisodeSeenMock,
    });
    render(<UpcomingEntryRow entry={makeEntry({ date: "2020-01-01" })} />);

    expect(screen.getByText("Aired")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Mark unwatched" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking the quick-check calls toggleEpisodeSeen with the resolved episode", () => {
    render(<UpcomingEntryRow entry={makeEntry({ date: "2020-01-01" })} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark watched" }));

    expect(toggleEpisodeSeenMock).toHaveBeenCalledWith({
      series: { id: 1, mediaType: "series", title: "Severance", overview: "", genres: [], cast: [] },
      episode: episode(),
      watched: true,
    });
  });

  it("renders nothing extra for an episode row while the season is still loading", () => {
    useSeasonDetailsMock.mockReturnValue({ data: undefined });
    render(<UpcomingEntryRow entry={makeEntry({ date: "2020-01-01" })} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  it("links a movie release row to the movie detail page and shows a countdown badge", () => {
    render(
      <UpcomingEntryRow
        entry={makeEntry({
          id: "release-1",
          mediaType: "movie",
          type: "release",
          title: "Dune: Part Three",
          date: "2099-01-01",
          seasonNumber: undefined,
          episodeNumber: undefined,
        })}
      />
    );

    expect(screen.getByRole("link")).toHaveAttribute("href", "/movies/1");
    expect(screen.getByText("Dune: Part Three")).toBeInTheDocument();
  });

  it("shows an Aired badge (no quick-check) for a released movie", () => {
    render(
      <UpcomingEntryRow
        entry={makeEntry({
          id: "release-1",
          mediaType: "movie",
          type: "release",
          title: "Dune: Part Three",
          date: "2020-01-01",
          seasonNumber: undefined,
          episodeNumber: undefined,
        })}
      />
    );

    expect(screen.getByText("Aired")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
