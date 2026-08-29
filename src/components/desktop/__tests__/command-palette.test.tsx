import { act } from "react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { queryKeys } from "@/shared/constants/query-keys";
import { DEFAULT_TMDB_REGION } from "@/shared/constants/discover";
import { CommandPalette } from "../command-palette";
import type { MediaSummary, Movie, Series } from "@/types/media";

const navigateMock = vi.fn();
const routerState = { pathname: "/" };
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: (options: unknown) => navigateMock(options) }),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: routerState.pathname } }),
}));

const updatePreferenceMock = vi.fn();
let theme: "dark" | "light" = "dark";
// Lets a single test simulate the preferences query not having resolved yet,
// so the palette's own `?? "dark"` / `?? DEFAULT_TMDB_REGION` / `?? []`
// fallbacks actually run instead of always reading the seeded data below.
let preferencesDataMissing = false;
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({
    data: preferencesDataMissing ? undefined : { theme, region: "US", preferredProviderIds: [] },
    updatePreference: updatePreferenceMock,
  }),
  useActiveProfileId: () => "default",
}));

let searchItems: MediaSummary[] = [];
let searchIsLoading = false;
const useSearchMock = vi.fn((query: string) => ({
  items: query.trim().length >= 2 ? searchItems : [],
  isLoading: searchIsLoading,
}));
vi.mock("@/features/media/use-search", () => ({
  useSearch: (query: string) => useSearchMock(query),
}));

vi.mock("@/hooks/use-debounced-value", () => ({
  // No debounce delay in tests — the palette's own logic (query length,
  // section grouping) is what's under test, not the debounce timing.
  useDebouncedValue: <T,>(value: T) => value,
}));

const isMovieSeenMock = vi.fn<(id: number) => Promise<boolean>>(async () => false);
const toggleMovieSeenMock = vi.fn<(movie: MediaSummary, watched: boolean) => Promise<undefined>>(async () => undefined);
vi.mock("@/features/progress/progress-repository", () => ({
  progressRepository: {
    isMovieSeen: (id: number) => isMovieSeenMock(id),
    toggleMovieSeen: (movie: MediaSummary, watched: boolean) => toggleMovieSeenMock(movie, watched),
  },
}));

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

const getAlertMock = vi.fn<(mediaId: number, mediaType: string) => Promise<{ id: string } | null>>(async () => null);
const toggleAlertMock = vi.fn<(media: MediaSummary, region: string, providerIds: number[]) => Promise<{ id: string }>>(
  async () => ({ id: "alert-1" })
);
vi.mock("@/features/availability/availability-repository", () => ({
  availabilityRepository: {
    getAlert: (mediaId: number, mediaType: string) => getAlertMock(mediaId, mediaType),
    toggle: (media: MediaSummary, region: string, providerIds: number[]) => toggleAlertMock(media, region, providerIds),
  },
}));

const requestPermissionMock = vi.fn(async () => true);
vi.mock("@/features/desktop/notification-service", () => ({
  notificationService: { requestPermission: () => requestPermissionMock() },
}));

const libraryHasMock = vi.fn<() => Promise<boolean>>(async () => false);
const librarySaveMock = vi.fn<(media: MediaSummary, patch: unknown) => Promise<undefined>>(async () => undefined);
const libraryRemoveIfPlannedMock = vi.fn<(mediaId: number, mediaType: string) => Promise<boolean>>(async () => true);
const libraryRemoveMock = vi.fn<(mediaId: number, mediaType: string) => Promise<undefined>>(async () => undefined);
vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: {
    has: () => libraryHasMock(),
    save: (media: MediaSummary, patch: unknown) => librarySaveMock(media, patch),
    removeIfPlanned: (mediaId: number, mediaType: string) => libraryRemoveIfPlannedMock(mediaId, mediaType),
    remove: (mediaId: number, mediaType: string) => libraryRemoveMock(mediaId, mediaType),
  },
}));

const movie = (overrides: Partial<MediaSummary> = {}): MediaSummary => ({
  id: 1,
  mediaType: "movie",
  title: "Dune",
  overview: "",
  genres: [],
  cast: [],
  year: 2021,
  ...overrides,
});

function getSearchInput() {
  return screen.getByPlaceholderText(/search for a page/i);
}

function typeQuery(value: string) {
  fireEvent.change(getSearchInput(), { target: { value } });
}

// The palette only ever opens in response to this custom event (or Cmd+K,
// which the real keyboard listener also owns) — dispatched after the
// component has mounted so its own effect is already listening, and
// wrapped in act() since it's a raw DOM event outside React's own
// synthetic event system.
function openPalette() {
  act(() => {
    window.dispatchEvent(new Event("cinetrack:command-palette"));
  });
}

function renderPalette(seedCache?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seedCache?.(client);
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<CommandPalette />, { wrapper: Wrapper });
}

describe("CommandPalette", () => {
  beforeEach(async () => {
    // jsdom has no scrollIntoView implementation; the palette calls it on
    // every selection change (see the "scroll the selected row into view"
    // effect), which only actually runs once a test moves the selection.
    HTMLElement.prototype.scrollIntoView ??= vi.fn();
    await i18n.changeLanguage("en");
    navigateMock.mockClear();
    updatePreferenceMock.mockClear();
    useSearchMock.mockClear();
    isMovieSeenMock.mockClear().mockResolvedValue(false);
    toggleMovieSeenMock.mockClear().mockResolvedValue(undefined);
    toastMock.mockClear();
    getAlertMock.mockClear();
    toggleAlertMock.mockClear();
    requestPermissionMock.mockClear();
    requestPermissionMock.mockResolvedValue(true);
    libraryHasMock.mockClear().mockResolvedValue(false);
    librarySaveMock.mockClear();
    libraryRemoveIfPlannedMock.mockClear().mockResolvedValue(true);
    libraryRemoveMock.mockClear();
    theme = "dark";
    preferencesDataMissing = false;
    searchItems = [];
    searchIsLoading = false;
    routerState.pathname = "/";
  });

  it("renders nothing until opened, then lists every page plus a theme action", () => {
    const { container } = renderPalette();
    expect(container).toBeEmptyDOMElement();

    openPalette();

    expect(screen.getByRole("option", { name: /switch to light theme/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Tracking" })).toBeInTheDocument();
  });

  it("offers the opposite theme depending on the current one", () => {
    theme = "light";
    renderPalette();
    openPalette();

    expect(screen.getByRole("option", { name: /switch to dark theme/i })).toBeInTheDocument();
  });

  it("running the theme action closes the palette and flips the preference", () => {
    renderPalette();
    openPalette();

    fireEvent.click(screen.getByRole("option", { name: /switch to light theme/i }));

    expect(updatePreferenceMock).toHaveBeenCalledWith({ key: "theme", value: "light" });
    expect(screen.queryByRole("option", { name: "Home" })).not.toBeInTheDocument();
  });

  it("filters pages by the typed query", () => {
    renderPalette();
    openPalette();

    typeQuery("stat");

    expect(screen.getByRole("option", { name: "Stats" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Home" })).not.toBeInTheDocument();
  });

  it("searches titles once the query reaches two characters, under a Titles heading", async () => {
    searchItems = [
      movie({ id: 42, title: "Dune", year: 2021 }),
      movie({ id: 43, mediaType: "series", title: "Dune: Prophecy", year: undefined }),
    ];
    renderPalette();
    openPalette();

    typeQuery("du");

    await waitFor(() => expect(screen.getByText("Titles")).toBeInTheDocument());
    expect(screen.getByRole("option", { name: /Dune 2021/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Dune: Prophecy" })).toBeInTheDocument();
  });

  it("does not search titles for a single-character query", () => {
    renderPalette();
    openPalette();

    typeQuery("d");

    expect(screen.queryByText("Titles")).not.toBeInTheDocument();
  });

  it("navigates to a movie result's own route, not a page route", async () => {
    searchItems = [movie({ id: 42, mediaType: "movie" })];
    renderPalette();
    openPalette();

    typeQuery("du");
    await waitFor(() => screen.getByText("Titles"));
    fireEvent.click(screen.getByRole("option", { name: /Dune 2021/ }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/movies/42" });
  });

  it("navigates to a series result's own route", async () => {
    searchItems = [movie({ id: 43, mediaType: "series", title: "Dune: Prophecy", year: undefined })];
    renderPalette();
    openPalette();

    typeQuery("du");
    await waitFor(() => screen.getByText("Titles"));
    fireEvent.click(screen.getByRole("option", { name: "Dune: Prophecy" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/series/43" });
  });

  describe("quick log on a movie search result", () => {
    it("offers a quick-log action on a movie result but not on a series result", async () => {
      searchItems = [
        movie({ id: 42, mediaType: "movie", title: "Dune", year: 2021 }),
        movie({ id: 43, mediaType: "series", title: "Dune: Prophecy", year: undefined }),
      ];
      renderPalette();
      openPalette();

      typeQuery("du");
      await waitFor(() => screen.getByText("Titles"));

      expect(screen.getAllByRole("button", { name: "Mark as watched" })).toHaveLength(1);
    });

    it("marks a movie watched from the palette without navigating away or closing it", async () => {
      searchItems = [movie({ id: 42, mediaType: "movie", title: "Dune", year: 2021 })];
      renderPalette();
      openPalette();

      typeQuery("du");
      await waitFor(() => screen.getByText("Titles"));
      fireEvent.click(screen.getByRole("button", { name: "Mark as watched" }));

      await waitFor(() =>
        expect(toggleMovieSeenMock).toHaveBeenCalledWith(expect.objectContaining({ id: 42, title: "Dune" }), true)
      );
      expect(navigateMock).not.toHaveBeenCalled();
      expect(screen.getByText("Titles")).toBeInTheDocument();
    });

    it("shows a success toast after quick-logging a movie", async () => {
      searchItems = [movie({ id: 42, mediaType: "movie", title: "Dune", year: 2021 })];
      renderPalette();
      openPalette();

      typeQuery("du");
      await waitFor(() => screen.getByText("Titles"));
      fireEvent.click(screen.getByRole("button", { name: "Mark as watched" }));

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({ description: 'Marked "Dune" as watched.', variant: "success" })
      );
    });

    it("shows a translated error toast, not the raw error, when the quick-log mutation fails", async () => {
      toggleMovieSeenMock.mockRejectedValueOnce(new Error("boom"));
      searchItems = [movie({ id: 42, mediaType: "movie", title: "Dune", year: 2021 })];
      renderPalette();
      openPalette();

      typeQuery("du");
      await waitFor(() => screen.getByText("Titles"));
      fireEvent.click(screen.getByRole("button", { name: "Mark as watched" }));

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({
          description: "Couldn't mark this as watched. Please try again.",
          variant: "error",
        })
      );
    });

    it("disables the quick-log action once the movie is already watched, and it's a no-op if clicked", async () => {
      isMovieSeenMock.mockResolvedValue(true);
      searchItems = [movie({ id: 42, mediaType: "movie", title: "Dune", year: 2021 })];
      renderPalette();
      openPalette();

      typeQuery("du");
      await waitFor(() => screen.getByText("Titles"));

      const button = await screen.findByRole("button", { name: "Already watched" });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(toggleMovieSeenMock).not.toHaveBeenCalled();
    });
  });

  it("toggles open/closed with the Ctrl+K and Cmd+K shortcuts", () => {
    renderPalette();
    expect(screen.queryByRole("option", { name: "Home" })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("option", { name: "Home" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.queryByRole("option", { name: "Home" })).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    renderPalette();
    openPalette();
    expect(screen.getByRole("option", { name: "Home" })).toBeInTheDocument();

    fireEvent.keyDown(getSearchInput(), { key: "Escape" });

    expect(screen.queryByRole("option", { name: "Home" })).not.toBeInTheDocument();
  });

  it("exposes the palette as a modal dialog with an accessible name", () => {
    renderPalette();
    openPalette();

    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
  });

  it("returns focus to the previously focused element once closed", () => {
    renderPalette();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    openPalette();
    fireEvent.keyDown(getSearchInput(), { key: "Escape" });

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("traps Tab focus within the dialog instead of leaking to the page behind it", async () => {
    searchItems = [movie({ id: 42, mediaType: "movie", title: "Dune", year: 2021 })];
    renderPalette();
    openPalette();
    typeQuery("du");
    await waitFor(() => screen.getByText("Titles"));

    const input = getSearchInput();
    const quickLog = screen.getByRole("button", { name: "Mark as watched" });
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "Tab" });
    expect(document.activeElement).toBe(quickLog);

    fireEvent.keyDown(quickLog, { key: "Tab" });
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(quickLog);
  });

  it("has no detectable accessibility violations while open", async () => {
    const { container } = renderPalette();
    openPalette();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("ignores an unrelated key press while open", () => {
    renderPalette();
    openPalette();

    fireEvent.keyDown(getSearchInput(), { key: "a" });

    expect(screen.getByRole("option", { name: "Home" })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("ignores navigation/selection keys while closed", () => {
    renderPalette();

    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("option", { name: "Home" })).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows a 'searching' label while a title search is in flight", async () => {
    searchIsLoading = true;
    renderPalette();
    openPalette();

    typeQuery("du");

    await waitFor(() => expect(screen.getByText("Searching titles…")).toBeInTheDocument());
    expect(screen.queryByText("Titles")).not.toBeInTheDocument();
  });

  it("shows a no-results message when nothing matches and no title search is pending", async () => {
    renderPalette();
    openPalette();

    typeQuery("zzz");

    await waitFor(() => expect(screen.getByText(/no results found/i)).toBeInTheDocument());
  });

  it("clamps arrow-key navigation at both ends and runs the selected item on Enter", () => {
    renderPalette();
    openPalette();

    const rows = () => screen.getAllByRole("option");
    // Selection starts at the top result (the theme action).
    expect(rows()[0]).toHaveAttribute("aria-selected", "true");

    // Pressing Up while already at the top is a clamp, not a wrap.
    fireEvent.keyDown(getSearchInput(), { key: "ArrowUp" });
    expect(rows()[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(getSearchInput(), { key: "ArrowDown" });
    expect(rows()[1]).toHaveAttribute("aria-selected", "true");
    expect(rows()[0]).toHaveAttribute("aria-selected", "false");

    fireEvent.keyDown(getSearchInput(), { key: "ArrowUp" });
    expect(rows()[0]).toHaveAttribute("aria-selected", "true");

    // Pressing Down far past the last row is also a clamp, not a wrap.
    const lastIndex = rows().length - 1;
    for (let i = 0; i < rows().length + 2; i += 1) {
      fireEvent.keyDown(getSearchInput(), { key: "ArrowDown" });
    }
    expect(rows()[lastIndex]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(getSearchInput(), { key: "Enter" });

    // The last page in navigationConfig is Settings.
    expect(navigateMock).toHaveBeenCalledWith({ to: "/settings" });
  });

  it("pressing Enter with no results is a no-op", () => {
    renderPalette();
    openPalette();

    typeQuery("zzz");
    fireEvent.keyDown(getSearchInput(), { key: "Enter" });

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("hovering a row selects it without needing arrow keys", () => {
    renderPalette();
    openPalette();

    const rows = screen.getAllByRole("option");
    fireEvent.mouseEnter(rows[2]!);

    expect(rows[2]).toHaveAttribute("aria-selected", "true");
    expect(rows[0]).toHaveAttribute("aria-selected", "false");
  });

  it("closes when clicking the backdrop, but not when clicking inside the panel", () => {
    const { container } = renderPalette();
    openPalette();
    expect(screen.getByRole("option", { name: "Home" })).toBeInTheDocument();

    const panel = screen.getByRole("listbox").parentElement as HTMLElement;
    fireEvent.mouseDown(panel);
    expect(screen.getByRole("option", { name: "Home" })).toBeInTheDocument();

    const backdrop = container.querySelector(".fixed.inset-0") as HTMLElement;
    fireEvent.mouseDown(backdrop);
    expect(screen.queryByRole("option", { name: "Home" })).not.toBeInTheDocument();
  });

  describe("contextual actions on a detail page", () => {
    const cachedMovie: Movie = {
      id: 7,
      mediaType: "movie",
      title: "Arrival",
      overview: "",
      genres: [],
      cast: [],
    };
    const cachedSeries: Series = {
      id: 9,
      mediaType: "series",
      title: "Severance",
      overview: "",
      genres: [],
      cast: [],
      numberOfSeasons: 1,
      seasons: [],
    };

    it("offers no contextual actions off a detail page", () => {
      renderPalette();
      openPalette();

      expect(screen.queryByRole("option", { name: "Mark watched" })).not.toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Availability alert" })).not.toBeInTheDocument();
    });

    it("offers mark-watched and availability-alert on a cached movie page", async () => {
      routerState.pathname = "/movies/7";
      renderPalette((client) => client.setQueryData(queryKeys.remote.movieDetails(7), cachedMovie));
      openPalette();

      await waitFor(() => expect(screen.getByRole("option", { name: "Mark watched" })).toBeInTheDocument());
      expect(screen.getByRole("option", { name: "Availability alert" })).toBeInTheDocument();
    });

    it("groups contextual actions under an 'On this page' heading, separate from the menu", async () => {
      routerState.pathname = "/movies/7";
      renderPalette((client) => client.setQueryData(queryKeys.remote.movieDetails(7), cachedMovie));
      openPalette();

      await waitFor(() => expect(screen.getByRole("option", { name: "Mark watched" })).toBeInTheDocument());
      const heading = screen.getByText("On this page");
      const markWatched = screen.getByRole("option", { name: "Mark watched" });
      const addToLibrary = screen.getByRole("option", { name: "Add to library" });
      const homePage = screen.getByRole("option", { name: "Home" });

      const position = (node: Element) => Array.from(document.querySelectorAll("p, [role='option']")).indexOf(node);
      expect(position(heading)).toBeLessThan(position(addToLibrary));
      expect(position(addToLibrary)).toBeLessThan(position(markWatched));
      expect(position(markWatched)).toBeLessThan(position(homePage));
    });

    it("offers no 'On this page' heading off a detail page", () => {
      renderPalette();
      openPalette();

      expect(screen.queryByText("On this page")).not.toBeInTheDocument();
    });

    it("adds a title that isn't in the library yet", async () => {
      routerState.pathname = "/movies/7";
      renderPalette((client) => client.setQueryData(queryKeys.remote.movieDetails(7), cachedMovie));
      openPalette();

      await waitFor(() => screen.getByRole("option", { name: "Add to library" }));
      fireEvent.click(screen.getByRole("option", { name: "Add to library" }));

      await waitFor(() => expect(librarySaveMock).toHaveBeenCalledWith(cachedMovie, { status: "planned" }));
    });

    it("removes a still-planned title directly, with no confirmation needed", async () => {
      libraryHasMock.mockResolvedValue(true);
      libraryRemoveIfPlannedMock.mockResolvedValue(true);
      routerState.pathname = "/movies/7";
      renderPalette((client) => client.setQueryData(queryKeys.remote.movieDetails(7), cachedMovie));
      openPalette();

      await waitFor(() => screen.getByRole("option", { name: "Remove from library" }));
      fireEvent.click(screen.getByRole("option", { name: "Remove from library" }));

      await waitFor(() => expect(libraryRemoveIfPlannedMock).toHaveBeenCalledWith(7, "movie"));
      expect(libraryRemoveMock).not.toHaveBeenCalled();
      expect(screen.queryByText("Remove this title from your library?")).not.toBeInTheDocument();
    });

    it("falls back to a confirmation once removeIfPlanned reports real progress", async () => {
      libraryHasMock.mockResolvedValue(true);
      libraryRemoveIfPlannedMock.mockResolvedValue(false);
      routerState.pathname = "/movies/7";
      renderPalette((client) => client.setQueryData(queryKeys.remote.movieDetails(7), cachedMovie));
      openPalette();

      await waitFor(() => screen.getByRole("option", { name: "Remove from library" }));
      fireEvent.click(screen.getByRole("option", { name: "Remove from library" }));

      await waitFor(() => expect(libraryRemoveIfPlannedMock).toHaveBeenCalledWith(7, "movie"));
      expect(await screen.findByText("Remove this title from your library?")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

      await waitFor(() => expect(libraryRemoveMock).toHaveBeenCalledWith(7, "movie"));
    });

    it("offers only the availability alert on a cached series page, not mark-watched", async () => {
      routerState.pathname = "/series/9";
      renderPalette((client) => client.setQueryData(queryKeys.remote.seriesDetails(9), cachedSeries));
      openPalette();

      await waitFor(() => expect(screen.getByRole("option", { name: "Availability alert" })).toBeInTheDocument());
      expect(screen.queryByRole("option", { name: "Mark watched" })).not.toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Mark unwatched" })).not.toBeInTheDocument();
    });

    it("offers nothing contextual when the page's own query hasn't populated the cache yet", () => {
      routerState.pathname = "/movies/7";
      renderPalette();
      openPalette();

      expect(screen.queryByRole("option", { name: "Mark watched" })).not.toBeInTheDocument();
    });

    it("offers nothing contextual on a series page whose cache hasn't populated yet either", () => {
      routerState.pathname = "/series/9";
      renderPalette();
      openPalette();

      expect(screen.queryByRole("option", { name: "Availability alert" })).not.toBeInTheDocument();
    });

    it("falls back to the default theme, region, and provider list while preferences haven't loaded", async () => {
      preferencesDataMissing = true;
      routerState.pathname = "/movies/7";
      renderPalette((client) => client.setQueryData(queryKeys.remote.movieDetails(7), cachedMovie));
      openPalette();

      // theme falls back to "dark", so the offered switch is to light.
      expect(screen.getByRole("option", { name: /switch to light theme/i })).toBeInTheDocument();

      await waitFor(() => screen.getByRole("option", { name: "Availability alert" }));
      fireEvent.click(screen.getByRole("option", { name: "Availability alert" }));

      await waitFor(() => expect(toggleAlertMock).toHaveBeenCalledWith(cachedMovie, DEFAULT_TMDB_REGION, []));
    });

    it("marking watched runs the real toggle mutation with the cached movie", async () => {
      routerState.pathname = "/movies/7";
      renderPalette((client) => client.setQueryData(queryKeys.remote.movieDetails(7), cachedMovie));
      openPalette();

      await waitFor(() => screen.getByRole("option", { name: "Mark watched" }));
      fireEvent.click(screen.getByRole("option", { name: "Mark watched" }));

      await waitFor(() => expect(toggleMovieSeenMock).toHaveBeenCalledWith(cachedMovie, true));
      expect(screen.queryByRole("option", { name: "Mark watched" })).not.toBeInTheDocument();
    });

    it("shows mark-unwatched once the movie is already seen", async () => {
      isMovieSeenMock.mockResolvedValue(true);
      routerState.pathname = "/movies/7";
      renderPalette((client) => client.setQueryData(queryKeys.remote.movieDetails(7), cachedMovie));
      openPalette();

      await waitFor(() => expect(screen.getByRole("option", { name: "Mark unwatched" })).toBeInTheDocument());
    });

    it("requests notification permission before enabling a new alert", async () => {
      requestPermissionMock.mockResolvedValue(false);
      routerState.pathname = "/movies/7";
      renderPalette((client) => client.setQueryData(queryKeys.remote.movieDetails(7), cachedMovie));
      openPalette();

      await waitFor(() => screen.getByRole("option", { name: "Availability alert" }));
      fireEvent.click(screen.getByRole("option", { name: "Availability alert" }));

      await waitFor(() => expect(requestPermissionMock).toHaveBeenCalled());
      expect(toggleAlertMock).not.toHaveBeenCalled();
    });

    it("enables a new alert once notification permission is granted", async () => {
      routerState.pathname = "/movies/7";
      renderPalette((client) => client.setQueryData(queryKeys.remote.movieDetails(7), cachedMovie));
      openPalette();

      await waitFor(() => screen.getByRole("option", { name: "Availability alert" }));
      fireEvent.click(screen.getByRole("option", { name: "Availability alert" }));

      await waitFor(() => expect(requestPermissionMock).toHaveBeenCalled());
      await waitFor(() => expect(toggleAlertMock).toHaveBeenCalledWith(cachedMovie, "US", []));
    });

    it("offers to disable an alert that already exists, skipping the permission prompt", async () => {
      getAlertMock.mockResolvedValue({ id: "alert-1" });
      routerState.pathname = "/movies/7";
      renderPalette((client) => client.setQueryData(queryKeys.remote.movieDetails(7), cachedMovie));
      openPalette();

      await waitFor(() => expect(screen.getByRole("option", { name: "Disable alert" })).toBeInTheDocument());
      fireEvent.click(screen.getByRole("option", { name: "Disable alert" }));

      await waitFor(() => expect(toggleAlertMock).toHaveBeenCalledWith(cachedMovie, "US", []));
      expect(requestPermissionMock).not.toHaveBeenCalled();
    });
  });
});
