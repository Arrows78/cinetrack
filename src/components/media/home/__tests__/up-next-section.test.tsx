import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { UpNextSection } from "../up-next-section";
import type { WatchNextEntry } from "@/features/progress/use-watch-next";

// WatchNextRow's own rendering (poster, episode code, seen toggle, ...) is
// already fully covered by watch-next-section.test.tsx — shallow-mocked
// here so this suite stays about UpNextSection's own header/empty logic.
vi.mock("@/components/media/tracking/watch-next-section", () => ({
  WatchNextRow: ({ entry }: { entry: WatchNextEntry }) => <div data-testid="row">{entry.series.title}</div>,
}));

function makeEntry(overrides: Partial<WatchNextEntry> = {}): WatchNextEntry {
  return {
    series: {
      id: "t1",
      profileId: null,
      seriesId: 1,
      title: "The Wire",
      posterPath: null,
      backdropPath: null,
      totalEpisodes: 10,
      watchedEpisodes: 0,
      status: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    nextEpisode: { id: 1, seasonNumber: 1, episodeNumber: 1, title: "Pilot", overview: "" },
    remaining: 10,
    ...overrides,
  };
}

describe("UpNextSection", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders nothing for an empty entries array", () => {
    const { container } = render(<UpNextSection entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the section header and one row per entry", () => {
    const entries = [makeEntry(), makeEntry({ series: { ...makeEntry().series, seriesId: 2, title: "Fargo" } })];
    render(<UpNextSection entries={entries} />);

    expect(screen.getByRole("heading", { name: i18n.t("home.upNext") })).toBeInTheDocument();
    expect(screen.getByText(i18n.t("home.upNextSubtitle"))).toBeInTheDocument();
    expect(screen.getAllByTestId("row")).toHaveLength(2);
  });
});
