import { useEffect, useState } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { formatRuntime } from "@/shared/utils/format";
import type { Movie, Series, UserPreferences } from "@/types/media";
import { WatchTonightPage } from "../watch-tonight-page";

// Same fake router as search-page.test.tsx/history-page.test.tsx: `mockNavigate`
// mutates a shared "current URL search string" and `useSearch` polls it.
const { getRouterSearch, setRouterSearch, mockNavigate } = vi.hoisted(() => {
  let search = "";
  const getRouterSearch = () => search;
  const setRouterSearch = (next: string) => {
    search = next;
  };
  const mockNavigate = vi.fn(
    (opts: { search: (prev: Record<string, string | undefined>) => Record<string, string | undefined> }) => {
      const prevParams = new URLSearchParams(search);
      const prevObj: Record<string, string | undefined> = {};
      prevParams.forEach((value, key) => {
        prevObj[key] = value;
      });
      const nextObj = opts.search(prevObj);
      const nextParams = new URLSearchParams();
      Object.entries(nextObj).forEach(([key, value]) => {
        if (value !== undefined && value !== "") nextParams.set(key, String(value));
      });
      const nextSearch = nextParams.toString();
      setRouterSearch(nextSearch ? `?${nextSearch}` : "");
    }
  );
  return { getRouterSearch, setRouterSearch, mockNavigate };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => (
    <a href={params ? `${to}::${JSON.stringify(params)}` : to}>{children}</a>
  ),
  useNavigate: () => mockNavigate,
  useSearch: () => {
    const [, forceRender] = useState(0);
    useEffect(() => {
      let search = getRouterSearch();
      const interval = window.setInterval(() => {
        const current = getRouterSearch();
        if (current !== search) {
          search = current;
          forceRender((tick) => tick + 1);
        }
      }, 10);
      return () => window.clearInterval(interval);
    }, []);
    const params = new URLSearchParams(getRouterSearch());
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  },
}));

// MediaGrid pulls in its own library/progress hooks (add-to-library toggle,
// seen toggle, ...) that would need a much wider invoke() mock than this
// page's own filter/query logic is about — stub it down to the titles so
// assertions can target what WatchTonightPage itself passed through.
vi.mock("@/components/media/primitives/media-grid", () => ({
  MediaGrid: ({ items }: { items: Array<{ id: number; mediaType: string; title: string }> }) => (
    <div data-testid="grid">
      {items.map((item) => (
        <div key={`${item.mediaType}-${item.id}`}>{item.title}</div>
      ))}
    </div>
  ),
  MEDIA_GRID_CLASS_NAME: "grid",
}));

// AddToLibraryButton (rendered directly by the hero pick, not just inside
// MediaGrid's cards) pulls in the same library-hook chain — mocked at the
// hook boundary so the real button/label still renders.
vi.mock("@/features/library/use-add-to-library-toggle", () => ({
  useAddToLibraryToggle: () => ({
    isInLibrary: false,
    toggle: vi.fn(),
    isSaving: false,
    confirmingForceRemove: false,
    setConfirmingForceRemove: vi.fn(),
    confirmForceRemove: vi.fn(),
  }),
}));

let preferencesData: Partial<UserPreferences> = {};
vi.mock("@/features/preferences/use-preferences", () => ({
  useActiveProfileId: () => "profile-1",
  usePreferences: () => ({ data: preferencesData }),
}));

const pickMock = vi.fn();
vi.mock("@/features/watch-tonight/watch-tonight-service", () => ({
  watchTonightService: {
    pick: (...args: unknown[]) => pickMock(...args),
  },
}));

function movie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 1,
    mediaType: "movie",
    title: "Dune",
    overview: "",
    genres: [],
    cast: [],
    ...overrides,
  };
}

function series(overrides: Partial<Series> = {}): Series {
  return {
    id: 2,
    mediaType: "series",
    title: "Severance",
    overview: "",
    genres: [],
    cast: [],
    numberOfSeasons: 1,
    seasons: [],
    ...overrides,
  };
}

function renderPage(initialSearch = "") {
  setRouterSearch(initialSearch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<WatchTonightPage />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("WatchTonightPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    mockNavigate.mockClear();
    setRouterSearch("");
    pickMock.mockReset().mockResolvedValue({ movies: [], series: [] });
    preferencesData = { preferredProviderIds: [] };
  });

  it("shows the grid skeleton while the pick is loading", async () => {
    let resolve: (value: { movies: Movie[]; series: Series[] }) => void = () => undefined;
    pickMock.mockReset().mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );

    const { container } = renderPage();

    expect(screen.queryByTestId("grid")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-shimmer")).toBeInTheDocument();

    resolve({ movies: [], series: [] });
    await screen.findByText("No match for these filters");
  });

  it("shows a remote error state on failure, and retrying re-invokes pick", async () => {
    pickMock.mockReset().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ movies: [], series: [] });

    renderPage();

    await screen.findByText("Unable to load the catalogue");
    expect(pickMock).toHaveBeenCalledTimes(1);

    screen.getByRole("button", { name: "Try again" }).click();

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(2));
    await screen.findByText("No match for these filters");
  });

  it("shows the empty state when both movies and series are empty", async () => {
    pickMock.mockResolvedValue({ movies: [], series: [] });

    renderPage();

    expect(await screen.findByText("No match for these filters")).toBeInTheDocument();
    expect(
      screen.getByText('Try a wider genre, platform or duration — or add more titles to your "to watch" library.')
    ).toBeInTheDocument();
  });

  it("features the first pick prominently as a hero, with the rest as alternates below it", async () => {
    pickMock.mockResolvedValue({ movies: [movie(), movie({ id: 3, title: "Arrival" })], series: [series()] });

    renderPage();

    // The hero (first of the combined batch) renders through MediaDetailsHero
    // — its own title heading, not the mocked MediaGrid stub.
    expect(await screen.findByRole("heading", { name: "Dune" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to library" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute(
      "href",
      expect.stringContaining("/movies/$movieId")
    );

    // The remaining two picks show up as alternates, via the (mocked) grid.
    expect(await screen.findByText("Or try one of these")).toBeInTheDocument();
    const grid = screen.getByTestId("grid");
    expect(grid).toHaveTextContent("Arrival");
    expect(grid).toHaveTextContent("Severance");
    expect(grid).not.toHaveTextContent("Dune");
  });

  it("shows the hero pick's own overview — MediaDetailsHero itself no longer renders one", async () => {
    pickMock.mockResolvedValue({ movies: [movie({ overview: "A boy rises to fulfil a great destiny." })], series: [] });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Dune" })).toBeInTheDocument();
    expect(screen.getByText("A boy rises to fulfil a great destiny.")).toBeInTheDocument();
  });

  it("falls back to the no-overview message when the hero pick has none", async () => {
    pickMock.mockResolvedValue({ movies: [movie({ overview: "" })], series: [] });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Dune" })).toBeInTheDocument();
    expect(screen.getByText("No overview available for this content.")).toBeInTheDocument();
  });

  it("shows only the hero, with no alternates section, when the batch has a single item", async () => {
    pickMock.mockResolvedValue({ movies: [movie()], series: [] });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Dune" })).toBeInTheDocument();
    expect(screen.queryByText("Or try one of these")).not.toBeInTheDocument();
    expect(screen.queryByTestId("grid")).not.toBeInTheDocument();
  });

  it("re-fetches with the selected genre's movie/series ids when the genre filter changes", async () => {
    renderPage();

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));
    expect(pickMock).toHaveBeenLastCalledWith({
      genreMovie: undefined,
      genreSeries: undefined,
      provider: undefined,
      maxRuntime: 120,
      hideWatched: false,
      originCountry: undefined,
    });

    const genreSelect = screen.getByLabelText("Genre");
    fireEvent.change(genreSelect, { target: { value: "28" } }); // Action

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(2));
    expect(pickMock).toHaveBeenLastCalledWith({
      genreMovie: 28,
      genreSeries: 10759,
      provider: undefined,
      maxRuntime: 120,
      hideWatched: false,
      originCountry: undefined,
    });
  });

  it("re-fetches with the selected provider id when the platform filter changes", async () => {
    renderPage();

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));

    const platformSelect = screen.getByLabelText("Platform");
    fireEvent.change(platformSelect, { target: { value: "8" } }); // Netflix

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(2));
    expect(pickMock).toHaveBeenLastCalledWith({
      genreMovie: undefined,
      genreSeries: undefined,
      provider: 8,
      maxRuntime: 120,
      hideWatched: false,
      originCountry: undefined,
    });
  });

  it("re-fetches with the selected origin country when the origin filter changes", async () => {
    renderPage();

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));

    const originSelect = screen.getByLabelText("Origin");
    fireEvent.change(originSelect, { target: { value: "KR" } });

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(2));
    expect(pickMock).toHaveBeenLastCalledWith({
      genreMovie: undefined,
      genreSeries: undefined,
      provider: undefined,
      maxRuntime: 120,
      hideWatched: false,
      originCountry: "KR",
    });
  });

  it("does not offer the 'My services' option when the user has no preferred providers", async () => {
    renderPage();
    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole("option", { name: "My services" })).not.toBeInTheDocument();
  });

  it("re-fetches with every preferred provider id when 'My services' is selected", async () => {
    preferencesData = { preferredProviderIds: [8, 337] };
    renderPage();

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));

    const platformSelect = screen.getByLabelText("Platform");
    expect(screen.getByRole("option", { name: "My services" })).toBeInTheDocument();
    fireEvent.change(platformSelect, { target: { value: "mine" } });

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(2));
    expect(pickMock).toHaveBeenLastCalledWith({
      genreMovie: undefined,
      genreSeries: undefined,
      provider: [8, 337],
      maxRuntime: 120,
      hideWatched: false,
      originCountry: undefined,
    });
  });

  it("re-fetches with the new numeric maxRuntime when the duration filter changes", async () => {
    renderPage();

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));

    const runtimeInput = screen.getByLabelText("Max duration");
    fireEvent.change(runtimeInput, { target: { value: "45" } });

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(2));
    expect(pickMock).toHaveBeenLastCalledWith({
      genreMovie: undefined,
      genreSeries: undefined,
      provider: undefined,
      maxRuntime: 45,
      hideWatched: false,
      originCountry: undefined,
    });
  });

  it("passes the persistent hideWatchedInDiscovery preference through to pick(), reflected in the toggle's pressed state", async () => {
    preferencesData = { preferredProviderIds: [], hideWatchedInDiscovery: true };
    renderPage();

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));
    expect(pickMock).toHaveBeenLastCalledWith({
      genreMovie: undefined,
      genreSeries: undefined,
      provider: undefined,
      maxRuntime: 120,
      hideWatched: true,
      originCountry: undefined,
    });
    expect(screen.getByRole("button", { name: "Hide watched" })).toHaveAttribute("aria-pressed", "true");
  });

  it("re-invokes pick when the retry (dices) button is clicked, even with unchanged filters", async () => {
    renderPage();

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));

    screen.getByRole("button", { name: "Pick again" }).click();

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(2));
  });

  it("pushes genre/platform/origin filter changes into the URL, but never the reroll seed", async () => {
    renderPage();
    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Genre"), { target: { value: "28" } });
    await waitFor(() => expect(getRouterSearch()).toContain("genreId=28"));

    fireEvent.change(screen.getByLabelText("Platform"), { target: { value: "8" } });
    await waitFor(() => expect(getRouterSearch()).toContain("provider=8"));

    fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "KR" } });
    await waitFor(() => expect(getRouterSearch()).toContain("originCountry=KR"));

    screen.getByRole("button", { name: "Pick again" }).click();
    expect(getRouterSearch()).not.toContain("seed");
  });

  it("restores genre/platform/origin/runtime from the URL on a deep link", async () => {
    renderPage("?genreId=28&provider=8&originCountry=KR&runtime=45");

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));
    expect(pickMock).toHaveBeenLastCalledWith({
      genreMovie: 28,
      genreSeries: 10759,
      provider: 8,
      maxRuntime: 45,
      hideWatched: false,
      originCountry: "KR",
    });
    expect(screen.getByLabelText("Max duration")).toHaveValue(45);
  });

  it("debounces the runtime filter's push to the URL, without delaying the pick() re-fetch itself", async () => {
    renderPage();
    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Max duration"), { target: { value: "45" } });

    // Same-tick re-fetch, unlike the URL push (see the assertion below).
    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(getRouterSearch()).toContain("runtime=45"));
  });

  it("clears every active filter at once from the chips row's own clear-all action", async () => {
    renderPage("?genreId=28&provider=8&originCountry=KR&runtime=45");
    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.clearAll") }));

    await waitFor(() => {
      const search = getRouterSearch();
      expect(search).not.toContain("genreId");
      expect(search).not.toContain("provider");
      expect(search).not.toContain("originCountry");
      // runtime=0 is "no cap", not a leftover filter: clearing has to remove
      // the 120-minute default outright, and an absent param would mean
      // exactly that default (see watchTonightRoute's schema comment).
      expect(search).toContain("runtime=0");
    });
    await waitFor(() => expect(pickMock).toHaveBeenLastCalledWith(expect.objectContaining({ maxRuntime: undefined })));
  });

  it("shows the default 120-minute cap as a removable chip, and removing it lifts the cap", async () => {
    renderPage();
    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));
    // The default is a real, results-shrinking filter — it has to be visible
    // rather than silently applied.
    expect(pickMock).toHaveBeenLastCalledWith(expect.objectContaining({ maxRuntime: 120 }));

    const chipLabel = i18n.t("filters.chips.duration", { value: formatRuntime(120) });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.removeFilter", { filter: chipLabel }) }));

    await waitFor(() => expect(pickMock).toHaveBeenLastCalledWith(expect.objectContaining({ maxRuntime: undefined })));
    await waitFor(() => expect(getRouterSearch()).toContain("runtime=0"));
  });

  it("restores an explicitly-lifted cap from the URL rather than snapping back to 120", async () => {
    renderPage("?runtime=0");

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));
    expect(pickMock).toHaveBeenLastCalledWith(expect.objectContaining({ maxRuntime: undefined }));
  });
});
