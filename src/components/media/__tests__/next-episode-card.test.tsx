import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import i18n from "@/i18n";
import type { Episode } from "@/types/media";
import { NextEpisodeCard } from "../next-episode-card";

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 100,
    seasonNumber: 1,
    episodeNumber: 3,
    title: "The Buys",
    overview: "A tense stakeout goes sideways.",
    ...overrides,
  };
}

describe("NextEpisodeCard", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders the up-to-date panel when episode is null", () => {
    render(<NextEpisodeCard episode={null} isSaving={false} onWatched={vi.fn()} />);

    expect(screen.getByText("All up to date")).toBeInTheDocument();
    expect(screen.getByText("No aired episode left to watch.")).toBeInTheDocument();
    expect(screen.queryByText("Next episode")).not.toBeInTheDocument();
  });

  it("renders the padded episode code, title, and overview when an episode is present", () => {
    const episode = makeEpisode({ seasonNumber: 1, episodeNumber: 3, title: "The Buys" });
    render(<NextEpisodeCard episode={episode} isSaving={false} onWatched={vi.fn()} />);

    expect(screen.getByText("Next episode")).toBeInTheDocument();
    // formatEpisodeCode(1, 3, { padded: true }) -> "S01E03"
    expect(screen.getByText("S01E03 · The Buys")).toBeInTheDocument();
    expect(screen.getByText("A tense stakeout goes sideways.")).toBeInTheDocument();
  });

  it("calls onWatched with the exact episode object when the mark-seen button is clicked", () => {
    const episode = makeEpisode({ id: 555 });
    const onWatched = vi.fn();
    render(<NextEpisodeCard episode={episode} isSaving={false} onWatched={onWatched} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark as watched" }));

    expect(onWatched).toHaveBeenCalledTimes(1);
    expect(onWatched).toHaveBeenCalledWith(episode);
  });

  it("enables the mark-seen button when isSaving is false", () => {
    render(<NextEpisodeCard episode={makeEpisode()} isSaving={false} onWatched={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Mark as watched" })).toBeEnabled();
  });

  it("disables the mark-seen button and blocks interaction when isSaving is true", () => {
    const onWatched = vi.fn();
    render(<NextEpisodeCard episode={makeEpisode()} isSaving={true} onWatched={onWatched} />);

    const button = screen.getByRole("button", { name: "Mark as watched" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onWatched).not.toHaveBeenCalled();
  });
});
