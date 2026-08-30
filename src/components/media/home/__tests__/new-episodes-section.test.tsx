import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { NewEpisodesSection } from "../new-episodes-section";
import type { WatchNextEntry } from "@/features/progress/use-watch-next";

vi.mock("@/components/media/tracking/watch-next-section", () => ({
  WatchNextRow: ({ entry }: { entry: WatchNextEntry }) => <div data-testid="row">{entry.series.title}</div>,
}));

function makeEntry(overrides: Partial<WatchNextEntry> = {}): WatchNextEntry {
  return {
    series: {
      id: "t1",
      profileId: null,
      seriesId: 1,
      title: "Severance",
      posterPath: null,
      backdropPath: null,
      totalEpisodes: 9,
      watchedEpisodes: 8,
      status: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    nextEpisode: { id: 9, seasonNumber: 2, episodeNumber: 9, title: "Finale", overview: "" },
    remaining: 1,
    ...overrides,
  };
}

describe("NewEpisodesSection", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders nothing for an empty entries array", () => {
    const { container } = render(<NewEpisodesSection entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the section header and one row per entry", () => {
    render(<NewEpisodesSection entries={[makeEntry()]} />);

    expect(screen.getByRole("heading", { name: i18n.t("home.newEpisodes") })).toBeInTheDocument();
    expect(screen.getByText(i18n.t("home.newEpisodesSubtitle"))).toBeInTheDocument();
    expect(screen.getByTestId("row")).toHaveTextContent("Severance");
  });
});
