import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import { CatalogueSections } from "@/components/media/discover/catalogue-sections";
import { CATALOGUE_SECTIONS } from "@/components/media/discover/catalogue-sections-data";
import { BrowseByGenre, BrowseByPlatform } from "@/components/media/discover/catalogue-browse";
import { PLATFORMS } from "@/shared/constants/discover";
import { staggerDelayMs } from "@/shared/utils/animation";
import type { HomeFeed, Movie, Series } from "@/types/media";

// Controlled fixture (rather than the real GENRES table) so we get exact
// control over the truthy/falsy movieId/seriesId combinations BrowseByGenre's
// `search` prop branches on: one genre with both ids, one with only a movie
// id, one with only a series id.
const { GENRES_FIXTURE } = vi.hoisted(() => ({
  GENRES_FIXTURE: [
    { id: 1, label: "Action", labelKey: "genres.action", icon: "💥", movieId: 28, seriesId: 10759 },
    { id: 2, label: "TV Movie", labelKey: "genres.tvMovie", icon: "📽️", movieId: 10770, seriesId: 0 },
    { id: 3, label: "Kids", labelKey: "genres.kids", icon: "🧸", movieId: 0, seriesId: 10762 },
  ],
}));

vi.mock("@/features/media/use-merged-genres", () => ({
  useMergedGenres: () => GENRES_FIXTURE,
}));

// Same pattern as design-system-page.test.tsx's Link mock, extended to also
// expose the `search` prop (which design-system-page's Link usage doesn't
// pass) as a stringified `data-search` attribute so tests can assert on it.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
    className,
  }: PropsWithChildren<{ to: string; search?: Record<string, unknown>; className?: string }>) => (
    <a href={to} data-search={JSON.stringify(search)} className={className}>
      {children}
    </a>
  ),
}));

// Same shallow pattern as library-page.test.tsx: stub MediaGrid down to the
// item titles so assertions can target what CatalogueSections itself passed
// through, without pulling in MediaCard's own library/progress hooks.
vi.mock("@/components/media/primitives/media-grid", () => ({
  MediaGrid: ({ items }: { items: Array<{ id: number; mediaType: string; title: string }> }) => (
    <div data-testid="grid">
      {items.map((item) => (
        <div key={`${item.mediaType}-${item.id}`}>{item.title}</div>
      ))}
    </div>
  ),
}));

function makeMovie(id: number, title: string): Movie {
  return { id, mediaType: "movie", title, overview: "", genres: [], cast: [] };
}

function makeSeries(id: number, title: string): Series {
  return { id, mediaType: "series", title, overview: "", genres: [], cast: [], numberOfSeasons: 1, seasons: [] };
}

describe("CatalogueSections", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders one section per CATALOGUE_SECTIONS entry with headers at startIndex + i, and passes feed[key] through to MediaGrid", () => {
    const feed: HomeFeed = {
      trendingSeries: [makeSeries(1, "Severance")],
      topRatedSeries: [],
      onTheAirSeries: [],
      trendingMovies: [],
      topRatedMovies: [makeMovie(2, "Dune")],
      nowPlayingMovies: [],
      upcomingMovies: [],
    };
    const startIndex = 2;

    const { container } = render(<CatalogueSections feed={feed} startIndex={startIndex} />);

    const sections = container.querySelectorAll("section");
    expect(sections).toHaveLength(CATALOGUE_SECTIONS.length);

    CATALOGUE_SECTIONS.forEach((section, i) => {
      const sectionEl = sections[i] as HTMLElement;
      const heading = within(sectionEl).getByRole("heading", { level: 2 });
      expect(heading).toHaveTextContent(i18n.t(section.titleKey));
      expect(sectionEl).toHaveTextContent(i18n.t(section.subtitleKey));

      // SectionHeader stamps `index` as an entrance-animation delay
      // (staggerDelayMs) on the wrapper — the only observable trace of
      // `startIndex + i` actually reaching it.
      const animatedWrapper = heading.closest(".animate-in") as HTMLElement;
      expect(animatedWrapper.style.animationDelay).toBe(`${staggerDelayMs(startIndex + i)}ms`);
    });

    expect(within(sections[0] as HTMLElement).getByTestId("grid")).toHaveTextContent("Severance");
    expect(within(sections[4] as HTMLElement).getByTestId("grid")).toHaveTextContent("Dune");

    // Every other section's array was empty — confirm MediaGrid got an empty
    // list rather than nothing rendering at all.
    [1, 2, 3, 5, 6].forEach((idx) => {
      expect(within(sections[idx] as HTMLElement).getByTestId("grid")).toBeEmptyDOMElement();
    });
  });

  it("falls back to an empty array — not a crash — for every section when feed is undefined", () => {
    const { container } = render(<CatalogueSections feed={undefined} startIndex={0} />);

    const sections = container.querySelectorAll("section");
    expect(sections).toHaveLength(CATALOGUE_SECTIONS.length);

    sections.forEach((sectionEl) => {
      expect(within(sectionEl as HTMLElement).getByTestId("grid")).toBeEmptyDOMElement();
    });
  });

  it("keeps every title when hideWatched is left at its default (off)", () => {
    const feed: HomeFeed = {
      trendingSeries: [],
      topRatedSeries: [],
      onTheAirSeries: [],
      trendingMovies: [makeMovie(2, "Dune")],
      topRatedMovies: [],
      nowPlayingMovies: [],
      upcomingMovies: [],
    };

    const { container } = render(<CatalogueSections feed={feed} startIndex={0} />);
    const sections = container.querySelectorAll("section");

    expect(within(sections[3] as HTMLElement).getByTestId("grid")).toHaveTextContent("Dune");
  });

  it("drops a completed title from its section when hideWatched is on", () => {
    const feed: HomeFeed = {
      trendingSeries: [],
      topRatedSeries: [],
      onTheAirSeries: [],
      trendingMovies: [makeMovie(2, "Dune"), makeMovie(3, "Arrival")],
      topRatedMovies: [],
      nowPlayingMovies: [],
      upcomingMovies: [],
    };
    const library = [
      {
        id: "item-1",
        profileId: "p1",
        mediaId: 2,
        mediaType: "movie" as const,
        title: "Dune",
        posterPath: null,
        backdropPath: null,
        year: null,
        rating: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        genres: [],
        status: "completed" as const,
        favourite: false,
        userRating: null,
        notes: null,
        tags: [],
        startedAt: null,
        completedAt: null,
        rewatchCount: 0,
      },
    ];

    const { container } = render(<CatalogueSections feed={feed} startIndex={0} hideWatched library={library} />);
    const sections = container.querySelectorAll("section");
    const trendingMoviesGrid = within(sections[3] as HTMLElement).getByTestId("grid");

    expect(trendingMoviesGrid).not.toHaveTextContent("Dune");
    expect(trendingMoviesGrid).toHaveTextContent("Arrival");
  });
});

describe("BrowseByGenre", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders one tile per merged genre with its icon/label, including genreMovie/genreSeries in search only when that id is truthy", () => {
    render(<BrowseByGenre startIndex={3} />);

    expect(screen.getByRole("heading", { level: 2, name: i18n.t("home.browseByGenre") })).toBeInTheDocument();
    expect(screen.getByText(i18n.t("home.browseByGenreSubtitle"))).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(GENRES_FIXTURE.length);

    // Both movieId and seriesId are truthy.
    const actionLink = screen.getByText(i18n.t("genres.action")).closest("a") as HTMLAnchorElement;
    expect(actionLink).toHaveAttribute("href", "/search");
    expect(within(actionLink).getByText("💥")).toBeInTheDocument();
    expect(JSON.parse(actionLink.dataset.search ?? "{}")).toEqual({
      q: i18n.t("genres.action"),
      scope: "all",
      genreMovie: "28",
      genreSeries: "10759",
    });

    // movieId truthy, seriesId is 0 — genreSeries must be omitted, not "0".
    const tvMovieLink = screen.getByText(i18n.t("genres.tvMovie")).closest("a") as HTMLAnchorElement;
    const tvMovieSearch = JSON.parse(tvMovieLink.dataset.search ?? "{}");
    expect(tvMovieSearch).toEqual({ q: i18n.t("genres.tvMovie"), scope: "all", genreMovie: "10770" });
    expect(tvMovieSearch).not.toHaveProperty("genreSeries");

    // seriesId truthy, movieId is 0 — genreMovie must be omitted.
    const kidsLink = screen.getByText(i18n.t("genres.kids")).closest("a") as HTMLAnchorElement;
    const kidsSearch = JSON.parse(kidsLink.dataset.search ?? "{}");
    expect(kidsSearch).toEqual({ q: i18n.t("genres.kids"), scope: "all", genreSeries: "10762" });
    expect(kidsSearch).not.toHaveProperty("genreMovie");
  });
});

describe("BrowseByPlatform", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders one tile per PLATFORMS entry with its label/initial and a search of {q: label, scope: 'all', provider}", () => {
    render(<BrowseByPlatform startIndex={5} />);

    expect(screen.getByRole("heading", { level: 2, name: i18n.t("home.browseByPlatform") })).toBeInTheDocument();
    expect(screen.getByText(i18n.t("home.browseByPlatformSubtitle"))).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(PLATFORMS.length);

    PLATFORMS.forEach((platform) => {
      const link = screen.getByText(platform.label).closest("a") as HTMLAnchorElement;
      expect(link).toHaveAttribute("href", "/search");
      expect(within(link).getByText(platform.initial)).toBeInTheDocument();
      expect(JSON.parse(link.dataset.search ?? "{}")).toEqual({
        q: platform.label,
        scope: "all",
        provider: String(platform.id),
      });
    });
  });
});
