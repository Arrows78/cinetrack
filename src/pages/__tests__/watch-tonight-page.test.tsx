import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import type { Movie, Series } from "@/types/media";
import { WatchTonightPage } from "../watch-tonight-page";

// MediaGrid pulls in its own library/progress hooks (add-to-library toggle,
// seen toggle, ...) that would need a much wider invoke() mock than this
// page's own filter/query logic is about — stub it down to the titles so
// assertions can target what WatchTonightPage itself passed through.
vi.mock("@/components/media/media-grid", () => ({
  MediaGrid: ({ items }: { items: Array<{ id: number; mediaType: string; title: string }> }) => (
    <div data-testid="grid">
      {items.map((item) => (
        <div key={`${item.mediaType}-${item.id}`}>{item.title}</div>
      ))}
    </div>
  ),
}));

vi.mock("@/features/preferences/use-preferences", () => ({
  useActiveProfileId: () => "profile-1",
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

function renderPage() {
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
    pickMock.mockReset().mockResolvedValue({ movies: [], series: [] });
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

  it("renders both sections with their items on the happy path", async () => {
    pickMock.mockResolvedValue({ movies: [movie()], series: [series()] });

    renderPage();

    expect(await screen.findByText("Dune")).toBeInTheDocument();
    expect(screen.getByText("Severance")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Movies" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Series" })).toBeInTheDocument();
  });

  it("only renders the section that has items when the other array is empty", async () => {
    pickMock.mockResolvedValue({ movies: [movie()], series: [] });

    renderPage();

    expect(await screen.findByText("Dune")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Movies" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Series" })).not.toBeInTheDocument();
  });

  it("re-fetches with the selected genre's movie/series ids when the genre filter changes", async () => {
    renderPage();

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));
    expect(pickMock).toHaveBeenLastCalledWith({
      genreMovie: undefined,
      genreSeries: undefined,
      provider: undefined,
      maxRuntime: 120,
    });

    const genreSelect = screen.getByLabelText("Genre");
    fireEvent.change(genreSelect, { target: { value: "28" } }); // Action

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(2));
    expect(pickMock).toHaveBeenLastCalledWith({
      genreMovie: 28,
      genreSeries: 10759,
      provider: undefined,
      maxRuntime: 120,
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
    });
  });

  it("re-invokes pick when the retry (dices) button is clicked, even with unchanged filters", async () => {
    renderPage();

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));

    screen.getByRole("button", { name: "Pick again" }).click();

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(2));
  });
});
