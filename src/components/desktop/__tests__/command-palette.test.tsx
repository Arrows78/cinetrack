import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { CommandPalette } from "../command-palette";
import type { MediaSummary } from "@/types/media";

const navigateMock = vi.fn();
vi.mock("@/app/router-config", () => ({
  router: { navigate: (options: unknown) => navigateMock(options) },
}));

const updatePreferenceMock = vi.fn();
let theme: "dark" | "light" = "dark";
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({ data: { theme }, updatePreference: updatePreferenceMock }),
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

describe("CommandPalette", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    navigateMock.mockClear();
    updatePreferenceMock.mockClear();
    useSearchMock.mockClear();
    theme = "dark";
    searchItems = [];
    searchIsLoading = false;
  });

  it("renders nothing until opened, then lists every page plus a theme action", () => {
    const { container } = render(<CommandPalette />);
    expect(container).toBeEmptyDOMElement();

    openPalette();

    expect(screen.getByRole("button", { name: /switch to light theme/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tracking" })).toBeInTheDocument();
  });

  it("offers the opposite theme depending on the current one", () => {
    theme = "light";
    render(<CommandPalette />);
    openPalette();

    expect(screen.getByRole("button", { name: /switch to dark theme/i })).toBeInTheDocument();
  });

  it("running the theme action closes the palette and flips the preference", () => {
    render(<CommandPalette />);
    openPalette();

    fireEvent.click(screen.getByRole("button", { name: /switch to light theme/i }));

    expect(updatePreferenceMock).toHaveBeenCalledWith({ key: "theme", value: "light" });
    expect(screen.queryByRole("button", { name: "Home" })).not.toBeInTheDocument();
  });

  it("filters pages by the typed query", () => {
    render(<CommandPalette />);
    openPalette();

    typeQuery("stat");

    expect(screen.getByRole("button", { name: "Stats" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Home" })).not.toBeInTheDocument();
  });

  it("searches titles once the query reaches two characters, under a Titles heading", async () => {
    searchItems = [
      movie({ id: 42, title: "Dune", year: 2021 }),
      movie({ id: 43, mediaType: "series", title: "Dune: Prophecy", year: undefined }),
    ];
    render(<CommandPalette />);
    openPalette();

    typeQuery("du");

    await waitFor(() => expect(screen.getByText("Titles")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Dune 2021/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dune: Prophecy" })).toBeInTheDocument();
  });

  it("does not search titles for a single-character query", () => {
    render(<CommandPalette />);
    openPalette();

    typeQuery("d");

    expect(screen.queryByText("Titles")).not.toBeInTheDocument();
  });

  it("navigates to a movie result's own route, not a page route", async () => {
    searchItems = [movie({ id: 42, mediaType: "movie" })];
    render(<CommandPalette />);
    openPalette();

    typeQuery("du");
    await waitFor(() => screen.getByText("Titles"));
    fireEvent.click(screen.getByRole("button", { name: /Dune 2021/ }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/movies/42" });
  });

  it("navigates to a series result's own route", async () => {
    searchItems = [movie({ id: 43, mediaType: "series", title: "Dune: Prophecy", year: undefined })];
    render(<CommandPalette />);
    openPalette();

    typeQuery("du");
    await waitFor(() => screen.getByText("Titles"));
    fireEvent.click(screen.getByRole("button", { name: "Dune: Prophecy" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/series/43" });
  });

  it("closes on Escape", () => {
    render(<CommandPalette />);
    openPalette();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();

    fireEvent.keyDown(getSearchInput(), { key: "Escape" });

    expect(screen.queryByRole("button", { name: "Home" })).not.toBeInTheDocument();
  });

  it("shows a no-results message when nothing matches and no title search is pending", async () => {
    render(<CommandPalette />);
    openPalette();

    typeQuery("zzz");

    await waitFor(() => expect(screen.getByText(/no results found/i)).toBeInTheDocument());
  });
});
