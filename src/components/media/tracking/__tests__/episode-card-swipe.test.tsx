import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import type { Episode } from "@/types/media";
import { EpisodeCard } from "../episode-card";

vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({ data: {} }),
}));

const useIsTouchDeviceMock = vi.fn();
vi.mock("@/hooks/use-is-touch-device", () => ({
  useIsTouchDevice: () => useIsTouchDeviceMock(),
}));

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 1,
    seasonNumber: 1,
    episodeNumber: 1,
    title: "Pilot",
    overview: "",
    airDate: "2020-01-01",
    watched: false,
    ...overrides,
  };
}

describe("EpisodeCard swipe-to-mark-seen", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("does not render a swipe reveal affordance on non-touch devices", () => {
    useIsTouchDeviceMock.mockReturnValue(false);
    render(<EpisodeCard episode={makeEpisode()} onToggleSeen={vi.fn()} />);

    expect(screen.queryByText("Mark watched")).not.toBeInTheDocument();
  });

  it("reveals a 'mark as watched' affordance on touch devices for an unwatched episode", () => {
    useIsTouchDeviceMock.mockReturnValue(true);
    render(<EpisodeCard episode={makeEpisode({ watched: false })} onToggleSeen={vi.fn()} />);

    expect(screen.getByText("Mark watched")).toBeInTheDocument();
  });

  it("reveals a 'mark as unseen' affordance on touch devices for a watched episode", () => {
    useIsTouchDeviceMock.mockReturnValue(true);
    render(<EpisodeCard episode={makeEpisode({ watched: true })} onToggleSeen={vi.fn()} />);

    expect(screen.getByText("Mark unwatched")).toBeInTheDocument();
  });

  it("does not enable the swipe affordance for an unreleased episode even on a touch device", () => {
    useIsTouchDeviceMock.mockReturnValue(true);
    render(<EpisodeCard episode={makeEpisode({ watched: false, airDate: "2999-01-01" })} onToggleSeen={vi.fn()} />);

    expect(screen.queryByText("Mark watched")).not.toBeInTheDocument();
  });
});
