import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import { DEFAULT_TMDB_REGION } from "@/shared/constants/discover";
import type { MediaSummary, MediaVideo, WatchProvider } from "@/types/media";

const availabilityMock = vi.fn();
const recommendationsMock = vi.fn();
const videosMock = vi.fn();
vi.mock("@/features/media/use-discovery", () => ({
  useAvailability: (...args: unknown[]) => availabilityMock(...args),
  useRecommendations: (...args: unknown[]) => recommendationsMock(...args),
  useVideos: (...args: unknown[]) => videosMock(...args),
}));

const preferencesMock = vi.fn();
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => preferencesMock(),
}));

vi.mock("@/components/media/media-grid", () => ({
  MediaGrid: ({ items }: { items: Array<{ id: number; mediaType: string; title: string }> }) => (
    <div data-testid="grid">
      {items.map((item) => (
        <div key={`${item.mediaType}-${item.id}`}>{item.title}</div>
      ))}
    </div>
  ),
}));

import { ProviderAvailability } from "@/components/media/provider-availability";
import { RecommendationsPanel } from "@/components/media/recommendations-panel";
import { TrailerPanel } from "@/components/media/trailer-panel";

function buildMedia(overrides: Partial<MediaSummary> = {}): MediaSummary {
  return {
    id: 1,
    mediaType: "movie",
    title: "Dune Part Two",
    overview: "Paul Atreides unites with the Fremen.",
    genres: [],
    cast: [],
    ...overrides,
  };
}

function buildProvider(overrides: Partial<WatchProvider> = {}): WatchProvider {
  return {
    id: 8,
    name: "Netflix",
    logoPath: "/netflix-logo.jpg",
    ...overrides,
  };
}

function buildVideo(overrides: Partial<MediaVideo> = {}): MediaVideo {
  return {
    id: "v1",
    key: "abc123",
    name: "Official Trailer",
    site: "YouTube",
    type: "Trailer",
    official: true,
    ...overrides,
  };
}

describe("detail panels", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    availabilityMock.mockReset();
    recommendationsMock.mockReset();
    videosMock.mockReset();
    preferencesMock.mockReset().mockReturnValue({ data: undefined });
  });

  describe("ProviderAvailability", () => {
    it("renders RemoteErrorState on query error, and retry calls refetch", () => {
      const refetch = vi.fn();
      availabilityMock.mockReturnValue({
        isError: true,
        error: new Error("network down"),
        refetch,
        data: undefined,
      });

      render(<ProviderAvailability media={buildMedia()} />);

      expect(screen.getByText(i18n.t("errors.catalogUnavailable"))).toBeInTheDocument();
      screen.getByRole("button", { name: i18n.t("errors.retry") }).click();
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it("renders nothing when there are no flatrate providers", () => {
      availabilityMock.mockReturnValue({
        isError: false,
        error: null,
        refetch: vi.fn(),
        data: { region: "US", flatrate: [], rent: [], buy: [], free: [] },
      });

      const { container } = render(<ProviderAvailability media={buildMedia()} />);

      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when query.data is undefined", () => {
      availabilityMock.mockReturnValue({
        isError: false,
        error: null,
        refetch: vi.fn(),
        data: undefined,
      });

      const { container } = render(<ProviderAvailability media={buildMedia()} />);

      expect(container.firstChild).toBeNull();
    });

    it("renders provider tiles with name and logo, and the preferred region in the heading", () => {
      preferencesMock.mockReturnValue({ data: { region: "FR" } });
      availabilityMock.mockReturnValue({
        isError: false,
        error: null,
        refetch: vi.fn(),
        data: {
          region: "FR",
          flatrate: [buildProvider(), buildProvider({ id: 337, name: "Disney+", logoPath: null })],
          rent: [],
          buy: [],
          free: [],
        },
      });

      render(<ProviderAvailability media={buildMedia()} />);

      expect(screen.getByText(`${i18n.t("media.availableStreaming")} · FR`)).toBeInTheDocument();
      expect(screen.getByText("Netflix")).toBeInTheDocument();
      const netflixLogo = screen.getByAltText("");
      expect(netflixLogo).toHaveAttribute("src", buildTmdbImageUrl("/netflix-logo.jpg", "w92"));

      // Disney+ has no logoPath: its tile still renders (name visible) without an <img>.
      const disneyTile = screen.getByText("Disney+").closest("div");
      expect(disneyTile?.querySelector("img")).toBeNull();
      expect(availabilityMock).toHaveBeenCalledWith("movie", 1, "FR");
    });

    it("falls back to DEFAULT_TMDB_REGION when preferences data is absent", () => {
      preferencesMock.mockReturnValue({ data: undefined });
      availabilityMock.mockReturnValue({
        isError: false,
        error: null,
        refetch: vi.fn(),
        data: { region: DEFAULT_TMDB_REGION, flatrate: [buildProvider()], rent: [], buy: [], free: [] },
      });

      render(<ProviderAvailability media={buildMedia()} />);

      expect(screen.getByText(`${i18n.t("media.availableStreaming")} · ${DEFAULT_TMDB_REGION}`)).toBeInTheDocument();
      expect(availabilityMock).toHaveBeenCalledWith("movie", 1, DEFAULT_TMDB_REGION);
    });
  });

  describe("RecommendationsPanel", () => {
    it("renders nothing when there are no results", () => {
      recommendationsMock.mockReturnValue({ data: { page: 1, totalPages: 1, totalResults: 0, results: [] } });

      const { container } = render(<RecommendationsPanel media={buildMedia()} />);

      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when query.data is undefined", () => {
      recommendationsMock.mockReturnValue({ data: undefined });

      const { container } = render(<RecommendationsPanel media={buildMedia()} />);

      expect(container.firstChild).toBeNull();
    });

    it("interpolates the media title into the subtitle and slices results to the first 10", () => {
      const results = Array.from({ length: 15 }, (_, index) =>
        buildMedia({ id: index + 1, title: `Recommendation ${index + 1}` })
      );
      recommendationsMock.mockReturnValue({
        data: { page: 1, totalPages: 1, totalResults: results.length, results },
      });

      render(<RecommendationsPanel media={buildMedia({ title: "Dune Part Two" })} />);

      expect(screen.getByText(i18n.t("media.similarSuggestions"))).toBeInTheDocument();
      expect(screen.getByText(i18n.t("media.becauseWatching", { title: "Dune Part Two" }))).toBeInTheDocument();

      const grid = screen.getByTestId("grid");
      expect(grid.children).toHaveLength(10);
      expect(screen.getByText("Recommendation 1")).toBeInTheDocument();
      expect(screen.getByText("Recommendation 10")).toBeInTheDocument();
      expect(screen.queryByText("Recommendation 11")).not.toBeInTheDocument();
    });
  });

  describe("TrailerPanel", () => {
    it("renders nothing when there are no videos", () => {
      videosMock.mockReturnValue({ data: [] });

      const { container } = render(<TrailerPanel mediaType="movie" mediaId={1} />);

      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when query.data is undefined", () => {
      videosMock.mockReturnValue({ data: undefined });

      const { container } = render(<TrailerPanel mediaType="movie" mediaId={1} />);

      expect(container.firstChild).toBeNull();
    });

    it("picks the video typed Trailer even when it isn't first", () => {
      const teaser = buildVideo({ id: "v-teaser", key: "teaser-key", type: "Teaser" });
      const trailer = buildVideo({ id: "v-trailer", key: "trailer-key", type: "Trailer" });
      videosMock.mockReturnValue({ data: [teaser, trailer] });

      render(<TrailerPanel mediaType="movie" mediaId={1} />);

      const iframe = screen.getByTitle(trailer.name);
      expect(iframe).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/trailer-key");
      const link = screen.getByRole("link", { name: new RegExp(i18n.t("media.openOnYoutube")) });
      expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=trailer-key");
    });

    it("falls back to data[0] when no video is typed Trailer", () => {
      const teaser = buildVideo({ id: "v-teaser", key: "teaser-key", type: "Teaser", name: "Teaser video" });
      const clip = buildVideo({ id: "v-clip", key: "clip-key", type: "Clip", name: "Clip video" });
      videosMock.mockReturnValue({ data: [teaser, clip] });

      render(<TrailerPanel mediaType="movie" mediaId={1} />);

      const iframe = screen.getByTitle(teaser.name);
      expect(iframe).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/teaser-key");
      const link = screen.getByRole("link", { name: new RegExp(i18n.t("media.openOnYoutube")) });
      expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=teaser-key");
    });
  });
});
