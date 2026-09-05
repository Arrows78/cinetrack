import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { makeMedia } from "@/shared/test-utils";
import { CONFETTI_DELAY_MS, CONFETTI_SEASON_COMPLETE_DELAY_MS } from "@/shared/constants/query";
import type { Episode, EpisodeProgress, Season } from "@/types/media";
import { EpisodeDots, SeasonAccordion } from "../season-accordion";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params = {} }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => {
    const href = Object.entries(params).reduce((acc, [key, value]) => acc.replace(`$${key}`, String(value)), to);
    return <a href={href}>{children}</a>;
  },
}));

vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({ data: {} }),
}));

const celebrateMock = vi.fn();
vi.mock("@/hooks/use-confetti", () => ({
  useConfetti: () => ({ celebrate: celebrateMock, burst: vi.fn(), burstFromRef: vi.fn() }),
}));

function makeEpisode(id: number, seasonNumber: number, episodeNumber: number, title: string): Episode {
  return {
    id,
    seasonNumber,
    episodeNumber,
    title,
    overview: "",
    airDate: "2024-01-01",
  };
}

function makeSeason(seasonNumber: number, name: string, episodes: Episode[]): Season {
  return {
    id: seasonNumber,
    seasonNumber,
    name,
    overview: "",
    episodeCount: episodes.length,
    episodes,
  };
}

function makeProgress(episodeId: number, seasonNumber: number, episodeNumber: number): EpisodeProgress {
  return {
    id: `progress-${episodeId}`,
    profileId: null,
    seriesId: 42,
    episodeId,
    seasonNumber,
    episodeNumber,
    watched: true,
    watchedAt: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
}

// Season 1: 2/3 watched (67%) — episode 103 is the last unwatched one.
const episode101 = makeEpisode(101, 1, 1, "S1E1");
const episode102 = makeEpisode(102, 1, 2, "S1E2");
const episode103 = makeEpisode(103, 1, 3, "S1E3");
const season1 = makeSeason(1, "Season One", [episode101, episode102, episode103]);

// Season 2: 2/2 watched (100%, complete) — empty name to exercise the season-number fallback.
const episode201 = makeEpisode(201, 2, 1, "S2E1");
const episode202 = makeEpisode(202, 2, 2, "S2E2");
const season2 = makeSeason(2, "", [episode201, episode202]);

// Season 3: 1/3 watched (33%) — two unwatched episodes, so toggling one never completes the season.
const episode301 = makeEpisode(301, 3, 1, "S3E1");
const episode302 = makeEpisode(302, 3, 2, "S3E2");
const episode303 = makeEpisode(303, 3, 3, "S3E3");
const season3 = makeSeason(3, "Season Three", [episode301, episode302, episode303]);

const seasons = [season1, season2, season3];
const watchedEpisodes = [
  makeProgress(101, 1, 1),
  makeProgress(102, 1, 2),
  makeProgress(201, 2, 1),
  makeProgress(202, 2, 2),
  makeProgress(301, 3, 1),
];

const series = makeMedia({ id: 42, mediaType: "series", title: "Test Series" });

function renderAccordion(overrides: Partial<Parameters<typeof SeasonAccordion>[0]> = {}) {
  const onToggleEpisode = vi.fn().mockResolvedValue(undefined);
  const onToggleEpisodes = vi.fn().mockResolvedValue(undefined);
  const onToggleSeason = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <SeasonAccordion
      series={series}
      seasons={seasons}
      watchedEpisodes={watchedEpisodes}
      onToggleEpisode={onToggleEpisode}
      onToggleEpisodes={onToggleEpisodes}
      onToggleSeason={onToggleSeason}
      {...overrides}
    />
  );
  return { ...utils, onToggleEpisode, onToggleEpisodes, onToggleSeason };
}

function openSeason(seasonLabel: string) {
  fireEvent.click(screen.getByText(seasonLabel));
}

describe("SeasonAccordion", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    celebrateMock.mockClear();
  });

  it("renders each season with its own watched/total counts and progress computed via calculateSeriesProgress", () => {
    renderAccordion();

    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();

    const bars = screen.getAllByRole("progressbar");
    expect(bars.map((bar) => bar.getAttribute("aria-valuenow"))).toEqual(["67", "100", "33"]);
  });

  it("falls back to '<season label> <number>' when the season has no name", () => {
    renderAccordion();
    expect(screen.getByText("Season 2")).toBeInTheDocument();
  });

  it("shows the completed checkmark and text-primary title only for a season at 100%", () => {
    renderAccordion();

    const incompleteTitle = screen.getByText("Season One");
    expect(incompleteTitle.className).not.toContain("text-primary");
    expect(incompleteTitle.closest("div")?.querySelector("svg")).not.toBeInTheDocument();

    const completeTitle = screen.getByText("Season 2");
    expect(completeTitle.className).toContain("text-primary");
    expect(completeTitle.closest("div")?.querySelector("svg")).toBeInTheDocument();
  });

  it("renders EpisodeDots per season reflecting the real watchedSet", () => {
    const { container } = renderAccordion();

    const dotStrips = container.querySelectorAll('[class*="rounded-full bg-foreground/[0.06] px-2.5"]');
    expect(dotStrips).toHaveLength(3);

    const dotsWatched = (strip: Element) =>
      Array.from(strip.children)
        .filter((child) => child.tagName === "DIV")
        .map((child) => child.className.includes("bg-primary"));

    expect(dotsWatched(dotStrips[0]!)).toEqual([true, true, false]);
    expect(dotsWatched(dotStrips[1]!)).toEqual([true, true]);
    expect(dotsWatched(dotStrips[2]!)).toEqual([true, false, false]);
  });

  it("calls celebrate after CONFETTI_SEASON_COMPLETE_DELAY_MS when toggling the last unwatched episode", () => {
    vi.useFakeTimers();
    try {
      const { onToggleEpisode } = renderAccordion();
      openSeason("Season One");

      fireEvent.click(screen.getByRole("button", { name: "Mark watched" }));

      expect(onToggleEpisode).toHaveBeenCalledWith(expect.objectContaining({ id: 103 }), true, undefined);
      expect(celebrateMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(CONFETTI_SEASON_COMPLETE_DELAY_MS);
      expect(celebrateMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not call celebrate when toggling an episode that is not the last unwatched one", () => {
    vi.useFakeTimers();
    try {
      const { onToggleEpisode } = renderAccordion();
      openSeason("Season Three");

      const markWatchedButtons = screen.getAllByRole("button", { name: "Mark watched" });
      expect(markWatchedButtons).toHaveLength(2);
      fireEvent.click(markWatchedButtons[0]!);

      expect(onToggleEpisode).toHaveBeenCalledWith(expect.objectContaining({ id: 302 }), true, undefined);

      vi.advanceTimersByTime(CONFETTI_SEASON_COMPLETE_DELAY_MS);
      expect(celebrateMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not run the completion check at all when toggling an episode to unwatched", () => {
    vi.useFakeTimers();
    try {
      const { onToggleEpisode } = renderAccordion();
      openSeason("Season One");

      fireEvent.click(screen.getAllByRole("button", { name: "Mark unwatched" })[0]!);

      expect(onToggleEpisode).toHaveBeenCalledWith(expect.objectContaining({ id: 101 }), false, undefined);
      vi.advanceTimersByTime(CONFETTI_SEASON_COMPLETE_DELAY_MS);
      expect(celebrateMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks a season below 100% as watched and schedules celebrate after CONFETTI_DELAY_MS", () => {
    vi.useFakeTimers();
    try {
      const { onToggleSeason } = renderAccordion();
      openSeason("Season Three");

      fireEvent.click(screen.getByRole("button", { name: "Mark season as watched" }));

      expect(onToggleSeason).toHaveBeenCalledWith(expect.objectContaining({ seasonNumber: 3 }), true);
      expect(celebrateMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(CONFETTI_DELAY_MS);
      expect(celebrateMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks a completed season as unwatched with no confetti", () => {
    vi.useFakeTimers();
    try {
      const { onToggleSeason } = renderAccordion();
      openSeason("Season 2");

      fireEvent.click(screen.getByRole("button", { name: "Mark season as unwatched" }));

      expect(onToggleSeason).toHaveBeenCalledWith(expect.objectContaining({ seasonNumber: 2 }), false);

      vi.advanceTimersByTime(CONFETTI_DELAY_MS);
      expect(celebrateMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("disables both the season toggle button and every per-episode toggle while isSaving", () => {
    renderAccordion({ isSaving: true });
    openSeason("Season One");

    expect(screen.getByRole("button", { name: "Mark season as watched" })).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: "Mark unwatched" })) {
      expect(button).toBeDisabled();
    }
    for (const button of screen.getAllByRole("button", { name: "Mark watched" })) {
      expect(button).toBeDisabled();
    }
  });

  it("links the 'open season page' action to the season route with the right params", () => {
    renderAccordion();
    openSeason("Season One");

    expect(screen.getByRole("link", { name: /Open season page/i })).toHaveAttribute("href", "/series/42/season/1");
  });
});

describe("EpisodeDots", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows a '+N' overflow badge once episodes exceed the 40-dot max", () => {
    const episodes = Array.from({ length: 45 }, (_, index) => makeEpisode(index + 1, 1, index + 1, `E${index + 1}`));
    render(<EpisodeDots episodes={episodes} watchedSet={new Set()} />);

    expect(screen.getByText("+5")).toBeInTheDocument();
  });

  it("does not show an overflow badge when episodes are within the max", () => {
    const episodes = Array.from({ length: 10 }, (_, index) => makeEpisode(index + 1, 1, index + 1, `E${index + 1}`));
    render(<EpisodeDots episodes={episodes} watchedSet={new Set()} />);

    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });
});
